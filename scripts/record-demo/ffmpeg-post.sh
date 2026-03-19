#!/usr/bin/env bash
#
# FFmpeg post-processing for 2K demo recordings.
#
# Input:  <base>-raw.webm + <base>-events.json
# Output: <base>.mp4  (2560x1440 H.264, zoom-at-click)
#         <base>.gif  (1280px wide, 15fps, optimized)
#
# Usage: ./ffmpeg-post.sh assets/demos/blog-reader

set -euo pipefail

BASE="$1"
NAME="$(basename "$BASE")"
RAW="${BASE}-raw.webm"
EVENTS="${BASE}-events.json"
BASELINE="${BASE}-baseline.mp4"
FINAL="${BASE}.mp4"
GIF="${BASE}.gif"
W=2560
H=1440

if [ ! -f "$RAW" ]; then
  echo "Error: Raw video not found: $RAW" >&2
  exit 1
fi

echo "Post-processing: $NAME"

# ============================================================================
# Phase 1: WebM → high-quality MP4
# ============================================================================
echo "  Phase 1: WebM → MP4 (H.264, CRF 18)"
ffmpeg -y -loglevel error -i "$RAW" \
  -c:v libx264 -preset slow -crf 18 \
  -vf "fps=30" \
  -pix_fmt yuv420p -movflags +faststart \
  "$BASELINE"

# ============================================================================
# Phase 2: Zoom-at-click effects (crop + scale)
# ============================================================================
if [ -f "$EVENTS" ] && command -v jq >/dev/null 2>&1; then
  CLICKS=$(jq -r '.[] | select(.type == "click") | "\(.t) \(.x) \(.y)"' "$EVENTS" 2>/dev/null || echo "")

  if [ -n "$CLICKS" ]; then
    echo "  Phase 2: Zoom-at-click effects"

    # Build nested FFmpeg expressions for zoom, pan-x, pan-y
    ZOOM="1"
    PX="0"
    PY="0"

    while IFS=' ' read -r T CX CY; do
      # Each click: 0.25s zoom-in → 0.7s hold → 0.25s zoom-out
      TS=$(echo "$T - 0.15" | bc -l)
      T1=$(echo "$TS + 0.25" | bc -l)
      T2=$(echo "$T1 + 0.70" | bc -l)
      TE=$(echo "$T2 + 0.25" | bc -l)
      Z="1.35"

      ZOOM="if(between(t,$TS,$T1),1+($Z-1)*(t-$TS)/0.25,if(between(t,$T1,$T2),$Z,if(between(t,$T2,$TE),$Z-($Z-1)*(t-$T2)/0.25,$ZOOM)))"

      # Pan: center on click, clamped to viewport
      PAN_X="clip($CX-$W/2/$Z,0,$W-$W/$Z)"
      PAN_Y="clip($CY-$H/2/$Z,0,$H-$H/$Z)"
      PX="if(between(t,$TS,$TE),$PAN_X,$PX)"
      PY="if(between(t,$TS,$TE),$PAN_Y,$PY)"
    done <<< "$CLICKS"

    FILTER="crop=w='$W/($ZOOM)':h='$H/($ZOOM)':x='$PX':y='$PY',scale=${W}:${H}:flags=lanczos"

    ffmpeg -y -loglevel error -i "$BASELINE" \
      -vf "$FILTER" \
      -c:v libx264 -preset slow -crf 18 \
      -pix_fmt yuv420p -movflags +faststart \
      "$FINAL"
  else
    echo "  Phase 2: No clicks found, skipping zoom"
    mv "$BASELINE" "$FINAL"
  fi
else
  echo "  Phase 2: Skipped (no events or jq missing)"
  mv "$BASELINE" "$FINAL"
fi

# Clean up baseline if it still exists (wasn't moved)
[ -f "$BASELINE" ] && rm -f "$BASELINE"

# ============================================================================
# Phase 3: GIF (960px wide, 10fps — keeps file under 10MB for README)
# ============================================================================
echo "  Phase 3: GIF export"

if command -v gifski >/dev/null 2>&1; then
  FRAMES=$(mktemp -d)
  ffmpeg -y -loglevel error -i "$FINAL" \
    -vf "fps=10,scale=960:-1:flags=lanczos" \
    "${FRAMES}/f_%04d.png"
  gifski --fps 15 --width 960 --quality 85 -o "$GIF" "${FRAMES}"/f_*.png 2>/dev/null
  rm -rf "$FRAMES"
else
  ffmpeg -y -loglevel error -i "$FINAL" \
    -filter_complex "fps=10,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" \
    "$GIF"
fi

# Clean up raw
rm -f "$RAW"

# Report
MP4_SIZE=$(du -h "$FINAL" | cut -f1)
GIF_SIZE=$(du -h "$GIF" | cut -f1)
echo "  Output: ${MP4_SIZE} ${FINAL}"
echo "  Output: ${GIF_SIZE} ${GIF}"
