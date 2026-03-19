#!/usr/bin/env bash
#
# FFmpeg post-processing for demo recordings.
#
# Takes a raw WebM + events JSON and produces:
#   - <name>.mp4  (H.264, zoom-at-click effects)
#   - <name>.gif  (960px wide, 15fps, optimized)
#
# Usage: ./ffmpeg-post.sh <base-path>
#   e.g. ./ffmpeg-post.sh assets/demos/blog-reader
#   expects: blog-reader-raw.webm and blog-reader-events.json

set -euo pipefail

BASE="$1"
NAME="$(basename "$BASE")"
DIR="$(dirname "$BASE")"
RAW="${BASE}-raw.webm"
EVENTS="${BASE}-events.json"
BASELINE="${BASE}-baseline.mp4"
FINAL="${BASE}.mp4"
GIF="${BASE}.gif"

if [ ! -f "$RAW" ]; then
  echo "Error: Raw video not found: $RAW" >&2
  exit 1
fi

echo "Post-processing: $NAME"

# ============================================================================
# Phase 1: WebM → baseline MP4 (H.264, high quality)
# ============================================================================
echo "  Phase 1: Converting WebM to MP4..."
ffmpeg -y -i "$RAW" \
  -c:v libx264 -preset slow -crf 20 \
  -vf "fps=30" \
  -pix_fmt yuv420p -movflags +faststart \
  "$BASELINE" 2>/dev/null

# ============================================================================
# Phase 2: Zoom-at-click effects
# ============================================================================
# Read click events from JSON and build FFmpeg zoom filter.
# Each click triggers: 0.3s zoom-in → 0.8s hold → 0.3s zoom-out (1.4s total)

if [ -f "$EVENTS" ] && command -v jq >/dev/null 2>&1; then
  echo "  Phase 2: Applying zoom-at-click effects..."

  # Extract click events: time, x, y
  CLICKS=$(jq -r '.[] | select(.type == "click") | "\(.t) \(.x) \(.y)"' "$EVENTS")

  if [ -n "$CLICKS" ]; then
    # Get video dimensions
    W=1920
    H=1080

    # Build crop filter with zoom keyframes.
    # Strategy: for each click, zoom to 1.4x centered on click point.
    # Use crop+scale rather than zoompan (more predictable with video input).
    ZOOM_EXPR="1"
    X_EXPR="0"
    Y_EXPR="0"

    while IFS=' ' read -r T CX CY; do
      # Zoom window: T-0.2 to T+1.2 (1.4s total)
      T_START=$(echo "$T - 0.2" | bc -l)
      T_ZOOM_IN=$(echo "$T_START + 0.3" | bc -l)
      T_HOLD_END=$(echo "$T_ZOOM_IN + 0.8" | bc -l)
      T_END=$(echo "$T_HOLD_END + 0.3" | bc -l)
      ZOOM_LEVEL="1.4"

      # Nested if() for zoom: ramp up → hold → ramp down
      RAMP_IN="1+(${ZOOM_LEVEL}-1)*(t-${T_START})/0.3"
      RAMP_OUT="${ZOOM_LEVEL}-(${ZOOM_LEVEL}-1)*(t-${T_HOLD_END})/0.3"

      ZOOM_EXPR="if(between(t,${T_START},${T_ZOOM_IN}),${RAMP_IN},if(between(t,${T_ZOOM_IN},${T_HOLD_END}),${ZOOM_LEVEL},if(between(t,${T_HOLD_END},${T_END}),${RAMP_OUT},${ZOOM_EXPR})))"

      # Pan to center on click point (clamped to viewport)
      # crop x = cx - (W/2/zoom), clamped to [0, W - W/zoom]
      PAN_X="clip(${CX}-${W}/2/${ZOOM_LEVEL},0,${W}-${W}/${ZOOM_LEVEL})"
      PAN_Y="clip(${CY}-${H}/2/${ZOOM_LEVEL},0,${H}-${H}/${ZOOM_LEVEL})"

      X_EXPR="if(between(t,${T_START},${T_END}),${PAN_X},${X_EXPR})"
      Y_EXPR="if(between(t,${T_START},${T_END}),${PAN_Y},${Y_EXPR})"
    done <<< "$CLICKS"

    # Apply crop+scale filter
    FILTER="crop=w='${W}/(${ZOOM_EXPR})':h='${H}/(${ZOOM_EXPR})':x='${X_EXPR}':y='${Y_EXPR}',scale=${W}:${H}:flags=lanczos"

    ffmpeg -y -i "$BASELINE" \
      -vf "$FILTER" \
      -c:v libx264 -preset slow -crf 20 \
      -pix_fmt yuv420p -movflags +faststart \
      "$FINAL" 2>/dev/null
  else
    echo "  No click events found, skipping zoom effects"
    cp "$BASELINE" "$FINAL"
  fi
else
  echo "  Skipping zoom (no events file or jq not installed)"
  cp "$BASELINE" "$FINAL"
fi

# ============================================================================
# Phase 3: GIF export (960px wide, 15fps)
# ============================================================================
echo "  Phase 3: Generating GIF..."

if command -v gifski >/dev/null 2>&1; then
  # gifski produces better quality at smaller file size
  FRAME_DIR=$(mktemp -d)
  ffmpeg -y -i "$FINAL" -vf "fps=15,scale=960:-1:flags=lanczos" \
    "${FRAME_DIR}/frame_%04d.png" 2>/dev/null
  gifski --fps 15 --width 960 --quality 80 -o "$GIF" "${FRAME_DIR}"/frame_*.png 2>/dev/null
  rm -rf "$FRAME_DIR"
else
  # FFmpeg palettegen fallback
  ffmpeg -y -i "$FINAL" \
    -filter_complex "fps=15,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" \
    "$GIF" 2>/dev/null
fi

# ============================================================================
# Cleanup
# ============================================================================
rm -f "$BASELINE"
rm -f "$RAW"

echo "  Output:"
echo "    MP4: $(du -h "$FINAL" | cut -f1) $FINAL"
echo "    GIF: $(du -h "$GIF" | cut -f1) $GIF"
