/**
 * Cubic bezier cursor path generation for human-like mouse movement.
 *
 * Produces curved paths with ease-in-out timing, perpendicular jitter,
 * and optional overshoot for long distances.
 */

/**
 * Evaluate a cubic bezier at parameter t.
 */
function cubicBezier(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return {
    x: mt ** 3 * p0.x + 3 * mt ** 2 * t * p1.x + 3 * mt * t ** 2 * p2.x + t ** 3 * p3.x,
    y: mt ** 3 * p0.y + 3 * mt ** 2 * t * p1.y + 3 * mt * t ** 2 * p2.y + t ** 3 * p3.y,
  };
}

/**
 * Generate a human-like bezier path between two points.
 *
 * @param {Object} start - {x, y}
 * @param {Object} end - {x, y}
 * @param {number} steps - Number of intermediate points (default 60 for ~1s at 60fps)
 * @returns {Array<{x: number, y: number}>}
 */
export function bezierPath(start, end, steps = 60) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 1) return [start];

  // Perpendicular unit vector
  const perpX = -dy / dist;
  const perpY = dx / dist;

  // Control points: offset perpendicular to the straight line
  // Both on the same side to avoid S-curves (more human)
  const side = Math.random() > 0.5 ? 1 : -1;
  const spread = dist * 0.15 + Math.random() * dist * 0.25;

  const cp1 = {
    x: start.x + dx * 0.25 + perpX * spread * side * (0.5 + Math.random() * 0.5),
    y: start.y + dy * 0.25 + perpY * spread * side * (0.5 + Math.random() * 0.5),
  };
  const cp2 = {
    x: start.x + dx * 0.75 + perpX * spread * side * (0.2 + Math.random() * 0.3),
    y: start.y + dy * 0.75 + perpY * spread * side * (0.2 + Math.random() * 0.3),
  };

  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Ease-in-out (quadratic)
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const p = cubicBezier(start, cp1, cp2, end, ease);
    // Micro-jitter (±1px) for organic feel
    points.push({
      x: Math.round(p.x + (Math.random() - 0.5) * 2),
      y: Math.round(p.y + (Math.random() - 0.5) * 2),
    });
  }

  // Snap last point exactly to target
  points[points.length - 1] = { x: Math.round(end.x), y: Math.round(end.y) };
  return points;
}

/**
 * Calculate duration in ms based on Fitts's Law approximation.
 * Longer distances and smaller targets = slower movement.
 */
export function fittsDuration(distance, targetSize = 40) {
  const a = 200; // base time ms
  const b = 150; // scaling factor
  if (distance < 10) return a;
  return Math.round(a + b * Math.log2(distance / targetSize + 1));
}
