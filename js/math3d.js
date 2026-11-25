export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
export function rand(min, max) { return Math.random() * (max - min) + min; }
export function dist3(x1, y1, z1, x2, y2, z2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2);
}
export function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function normalize(v) {
  const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
export function getForward(yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  return [sy * cp, -sp, -cy * cp];
}
export function rotatePoint(x, y, z, yaw, pitch, ox, oy, oz) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  let x1 = x * cy + z * sy;
  let z1 = -x * sy + z * cy;
  let y1 = y;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const y2 = y1 * cp - z1 * sp;
  const z2 = y1 * sp + z1 * cp;
  return { x: x1 + ox, y: y2 + oy, z: z2 + oz };
}
export function rotateAsteroidPoint(x, y, z, ay, ax, cx, cy, cz) {
  const cy2 = Math.cos(ay), sy2 = Math.sin(ay);
  let x1 = x * cy2 + z * sy2;
  let z1 = -x * sy2 + z * cy2;
  let y1 = y;
  const cx2 = Math.cos(ax), sx2 = Math.sin(ax);
  const y2 = y1 * cx2 - z1 * sx2;
  const z2 = y1 * sx2 + z1 * cx2;
  return { x: x1 + cx, y: y2 + cy, z: z2 + cz };
}