/**
 * Cockpit layout from reference art: canopy, main + side windows, A-pillars, console.
 */

/** Console band = bottom ~1/5 of the screen. */
const CONSOLE_TOP = 0.8;
const VIEW_BOTTOM = 0.798;
const MAIN_TOP = 0.118;
const MAIN_LEFT = 0.055;
const MAIN_RIGHT = 0.945;
const MAIN_BOT_LEFT = 0.16;
const MAIN_BOT_RIGHT = 0.84;

function P(w, h, nx, ny) {
  return { x: nx * w, y: ny * h };
}

const WINDOWS_N = {
  topCanopy: [
    [0.37, 0.015], [0.63, 0.015], [0.575, 0.082], [0.425, 0.082]
  ],
  mainForward: [
    [MAIN_LEFT, MAIN_TOP], [MAIN_RIGHT, MAIN_TOP],
    [MAIN_BOT_RIGHT, VIEW_BOTTOM], [MAIN_BOT_LEFT, VIEW_BOTTOM]
  ],
  sideLeft: [
    [0.008, 0.19], [0.115, MAIN_TOP], [MAIN_BOT_LEFT, VIEW_BOTTOM - 0.01],
    [0.018, VIEW_BOTTOM - 0.05]
  ],
  sideRight: [
    [0.992, 0.19], [0.885, MAIN_TOP], [MAIN_BOT_RIGHT, VIEW_BOTTOM - 0.01],
    [0.982, VIEW_BOTTOM - 0.05]
  ]
};

function polygonSegments(poly) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    out.push([poly[i], poly[(i + 1) % poly.length]]);
  }
  return out;
}

function buildWireSegments() {
  const glass = [];
  for (const poly of Object.values(WINDOWS_N)) {
    glass.push(...polygonSegments(poly));
  }
  const structure = [
    [[0, 0.088], [1, 0.088]],
    [[0.34, 0.088], [0.34, 0.015]],
    [[0.34, 0.015], [0.66, 0.015]],
    [[0.66, 0.015], [0.66, 0.088]],
    [[0, 1], [0.27, CONSOLE_TOP]],
    [[0.27, CONSOLE_TOP], [MAIN_LEFT, MAIN_TOP]],
    [[1, 1], [0.73, CONSOLE_TOP]],
    [[0.73, CONSOLE_TOP], [MAIN_RIGHT, MAIN_TOP]],
    [[0, 1], [0, CONSOLE_TOP]],
    [[0, CONSOLE_TOP], [0.27, CONSOLE_TOP]],
    [[1, 1], [1, CONSOLE_TOP]],
    [[1, CONSOLE_TOP], [0.73, CONSOLE_TOP]],
    [[MAIN_LEFT, MAIN_TOP], [0.028, CONSOLE_TOP - 0.02]],
    [[MAIN_RIGHT, MAIN_TOP], [0.972, CONSOLE_TOP - 0.02]],
    [[0.048, 0.088], [0.048, VIEW_BOTTOM - 0.04]],
    [[0.952, 0.088], [0.952, VIEW_BOTTOM - 0.04]],
    [[0.5, MAIN_TOP], [0.5, VIEW_BOTTOM]],
    [[0, 1], [0.28, 1]],
    [[0.28, 1], [0.26, CONSOLE_TOP]],
    [[0.26, CONSOLE_TOP], [0.02, CONSOLE_TOP - 0.02]],
    [[0.02, CONSOLE_TOP - 0.02], [0, 1]],
    [[1, 1], [0.72, 1]],
    [[0.72, 1], [0.74, CONSOLE_TOP]],
    [[0.74, CONSOLE_TOP], [0.98, CONSOLE_TOP - 0.02]],
    [[0.98, CONSOLE_TOP - 0.02], [1, 1]],
    [[0.36, 1], [0.64, 1]],
    [[0.64, 1], [0.58, CONSOLE_TOP]],
    [[0.58, CONSOLE_TOP], [0.42, CONSOLE_TOP]],
    [[0.42, CONSOLE_TOP], [0.36, 1]],
    [[0.44, 0.56], [0.56, 0.56]],
    [[0.56, 0.56], [0.545, CONSOLE_TOP - 0.05]],
    [[0.545, CONSOLE_TOP - 0.05], [0.455, CONSOLE_TOP - 0.05]],
    [[0.455, CONSOLE_TOP - 0.05], [0.44, 0.56]],
    [[0.5, 0.93], [0.5, 0.865]],
    [[0.485, 0.865], [0.515, 0.865]],
    [[0.515, 0.865], [0.5, 0.842]],
    [[0.5, 0.842], [0.485, 0.865]]
  ];
  return { glass, structure };
}

const WIRE = buildWireSegments();

function polysFromWindows(w, h) {
  return Object.values(WINDOWS_N).map(pts =>
    pts.map(([nx, ny]) => P(w, h, nx, ny))
  );
}

export function windscreenPolygons(w, h) {
  return polysFromWindows(w, h);
}

export function applyWindshieldClip(ctx, w, h) {
  const polys = windscreenPolygons(w, h);
  ctx.beginPath();
  for (const poly of polys) {
    ctx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
    ctx.closePath();
  }
  ctx.clip();
}

function fillPoly(ctx, poly, style) {
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
  ctx.closePath();
  ctx.fillStyle = style;
  ctx.fill();
}

function strokeSegs(ctx, w, h, segs, stroke, lw) {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [a, b] of segs) {
    ctx.beginPath();
    ctx.moveTo(a[0] * w, a[1] * h);
    ctx.lineTo(b[0] * w, b[1] * h);
    ctx.stroke();
  }
}

function drawHudScreen(ctx, x, y, ww, hh) {
  ctx.strokeStyle = 'rgba(75, 230, 130, 0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, ww, hh);
  const cx = x + ww / 2, cy = y + hh / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.min(ww, hh) * 0.2, 0, Math.PI * 2);
  ctx.stroke();
}

/** Pillar / side frame blocking the view (cool gray-blue). */
const COLOR_FRAME_BLOCK = '#1c2433';
/** Overhead strip above the canopy. */
const COLOR_OVERHEAD = '#161d29';
/** Dashboard deck. */
const COLOR_CONSOLE = '#0a0e15';

export function drawCockpitOverlay(ctx, w, h) {
  const glassPolys = polysFromWindows(w, h);
  const ct = CONSOLE_TOP;

  ctx.beginPath();
  ctx.rect(-4, -4, w + 8, h + 8);
  for (const poly of glassPolys) {
    ctx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
    ctx.closePath();
  }
  ctx.fillStyle = COLOR_FRAME_BLOCK;
  ctx.fill('evenodd');

  fillPoly(ctx, [
    P(w, h, 0, 0), P(w, h, 1, 0), P(w, h, 1, 0.088), P(w, h, 0, 0.088)
  ], COLOR_OVERHEAD);

  const leftConsole = [P(w, h, 0, 1), P(w, h, 0.28, 1), P(w, h, 0.26, ct), P(w, h, 0.02, ct - 0.02)];
  const rightConsole = [P(w, h, 1, 1), P(w, h, 0.72, 1), P(w, h, 0.74, ct), P(w, h, 0.98, ct - 0.02)];
  const centerConsole = [P(w, h, 0.36, 1), P(w, h, 0.64, 1), P(w, h, 0.58, ct), P(w, h, 0.42, ct)];
  for (const poly of [leftConsole, rightConsole, centerConsole]) {
    fillPoly(ctx, poly, COLOR_CONSOLE);
  }

  strokeSegs(ctx, w, h, WIRE.glass, 'rgba(160, 205, 245, 0.78)', 1.65);
  strokeSegs(ctx, w, h, WIRE.structure, 'rgba(118, 145, 188, 0.58)', 1.3);

  const deskY = h * (ct + 0.035);
  const deskH = h * 0.075;
  drawHudScreen(ctx, w * 0.07, deskY, w * 0.13, deskH);
  drawHudScreen(ctx, w * 0.8, deskY, w * 0.13, deskH);
  drawHudScreen(ctx, w * 0.42, deskY + h * 0.005, w * 0.16, deskH + h * 0.01);
}