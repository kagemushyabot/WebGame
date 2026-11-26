import { CONSOLE_TOP } from './cockpit.js';

function formatTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

const FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

function fitLinesFont(ctx, lines, maxWidth, maxTextHeight, preferredPx) {
  let fs = preferredPx;
  while (fs >= 9) {
    ctx.font = `700 ${fs}px ${FONT}`;
    const widthOk = lines.every(l => ctx.measureText(l).width <= maxWidth);
    const heightOk = lines.length * fs * 1.22 <= maxTextHeight;
    if (widthOk && heightOk) return fs;
    fs -= 1;
  }
  return fs;
}

function drawPanel(ctx, x, y, ww, hh, title) {
  ctx.fillStyle = 'rgba(4, 12, 10, 0.94)';
  ctx.fillRect(x, y, ww, hh);
  ctx.strokeStyle = 'rgba(75, 220, 140, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, y + 0.5, ww - 1, hh - 1);
  if (!title) return;
  const titleFs = Math.min(Math.max(10, hh * 0.13), ww * 0.09);
  ctx.fillStyle = 'rgba(120, 200, 150, 0.85)';
  ctx.font = `600 ${titleFs}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title, x + ww * 0.06, y + titleFs * 1.1);
}

function drawPanelLines(ctx, x, y, ww, hh, lines, title) {
  drawPanel(ctx, x, y, ww, hh, title);
  const padX = ww * 0.06;
  const innerW = ww - padX * 2;
  const titleBand = title ? hh * 0.2 : hh * 0.1;
  const bottomPad = hh * 0.06;
  const textH = hh - titleBand - bottomPad;
  const preferred = Math.max(11, Math.min(ww, hh) * 0.12);
  const fs = fitLinesFont(ctx, lines, innerW, textH, preferred);
  ctx.fillStyle = 'rgba(170, 255, 200, 0.98)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 ${fs}px ${FONT}`;
  const gap = Math.min(fs * 1.2, textH / lines.length);
  const startY = y + titleBand + fs * 0.95;
  lines.forEach((line, i) => ctx.fillText(line, x + padX, startY + i * gap));
}

function threatColors(level, frame) {
  if (level === 0) return { core: '#44ee77', glow: 'rgba(68,238,119,0.45)', ring: 'rgba(68,238,119,0.35)' };
  if (level === 1) return { core: '#ffdd44', glow: 'rgba(255,221,68,0.5)', ring: 'rgba(255,221,68,0.4)' };
  const flash = 0.55 + 0.45 * Math.abs(Math.sin(frame * 0.22));
  return {
    core: `rgba(255,${Math.floor(40 * flash)},${Math.floor(50 * flash)},1)`,
    glow: `rgba(255,40,50,${0.35 + 0.4 * flash})`,
    ring: `rgba(255,80,90,${0.3 + 0.5 * flash})`
  };
}

function drawBeacon(ctx, cx, cy, threat, frame, vmin) {
  const r = Math.min(vmin * 0.034, 22);
  const { core, glow, ring } = threatColors(threat, frame);
  const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2);
  grd.addColorStop(0, glow);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ring;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  const labelFs = Math.max(10, vmin * 0.019);
  ctx.fillStyle = 'rgba(200,255,220,0.92)';
  ctx.font = `700 ${labelFs}px ${FONT}`;
  ctx.textAlign = 'center';
  const label = threat === 0 ? 'SAFE' : threat === 1 ? 'CAUTION' : 'DANGER';
  ctx.fillText(label, cx, cy + r * 2.35);
}

function drawRadarSquare(ctx, x, y, size, ui) {
  drawPanel(ctx, x, y, size, size, 'MAP');
  const titleBand = size * 0.14;
  const footerBand = size * 0.14;
  const mapSize = size - titleBand - footerBand - size * 0.06;
  const mx = x + (size - mapSize) / 2;
  const my = y + titleBand + size * 0.02;
  ctx.fillStyle = 'rgba(0, 20, 30, 0.88)';
  ctx.fillRect(mx, my, mapSize, mapSize);
  ctx.strokeStyle = 'rgba(80, 160, 200, 0.5)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(mx + 0.5, my + 0.5, mapSize - 1, mapSize - 1);
  const cx = mx + mapSize / 2;
  const cy = my + mapSize / 2;
  const scale = mapSize / (ui.radarRange * 2);
  const yaw = ui.shipYaw || 0;
  const cosy = Math.cos(yaw);
  const siny = Math.sin(yaw);
  ctx.strokeStyle = 'rgba(60, 140, 120, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, my);
  ctx.lineTo(cx, my + mapSize);
  ctx.moveTo(mx, cy);
  ctx.lineTo(mx + mapSize, cy);
  ctx.stroke();
  ctx.fillStyle = 'rgba(120, 220, 255, 0.95)';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 4);
  ctx.lineTo(cx - 3, cy + 3);
  ctx.lineTo(cx + 3, cy + 3);
  ctx.closePath();
  ctx.fill();
  for (const a of ui.asteroids) {
    const lx = a.x * cosy - a.z * siny;
    const lz = a.x * siny + a.z * cosy;
    const px = cx + lx * scale;
    const py = cy + lz * scale;
    if (px < mx || px > mx + mapSize || py < my || py > my + mapSize) continue;
    ctx.fillStyle = a.kind === 'chain' ? '#ff9944' : a.kind === 'balloon' ? '#ff88cc' : '#88ccaa';
    const dot = Math.max(2, 2 + a.size * 0.8);
    ctx.beginPath();
    ctx.arc(px, py, dot, 0, Math.PI * 2);
    ctx.fill();
  }
  const footFs = fitLinesFont(ctx, [`LEFT ${ui.asteroidCount}`], size * 0.88, size * 0.12, size * 0.08);
  ctx.fillStyle = 'rgba(180, 230, 255, 0.95)';
  ctx.font = `700 ${footFs}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(`LEFT ${ui.asteroidCount}`, x + size / 2, y + size - footerBand * 0.35);
}

function consoleLayout(w, h) {
  const vmin = Math.min(w, h);
  const margin = w * 0.022;
  const rowY = h * CONSOLE_TOP + h * 0.018;
  const rowH = Math.max(h * 0.102, vmin * 0.1);
  const beaconSlot = vmin * 0.17;
  const sideW = (w - margin * 2 - beaconSlot) / 2;
  const radarSize = Math.min(vmin * 0.24, w * 0.26, h * 0.22);
  const radarY = h * 0.11;
  return { margin, rowY, rowH, beaconSlot, sideW, vmin, radarSize, radarY };
}

/** Cockpit-mounted HUD: stats, timer, radar, proximity beacon. */
export function drawCockpitInstruments(ctx, w, h, ui) {
  const L = consoleLayout(w, h);

  const statusX = L.margin;
  const timerX = w - L.margin - L.sideW;
  const beaconX = w * 0.5;
  const beaconY = L.rowY + L.rowH * 0.36;

  drawPanelLines(ctx, statusX, L.rowY, L.sideW, L.rowH, [
    `SCORE ${ui.score}`,
    `LV ${ui.level}`,
    `LIVES ${ui.lives}`
  ], 'STATUS');

  drawPanelLines(ctx, timerX, L.rowY, L.sideW, L.rowH, [
    formatTime(ui.timeLeft),
    ui.muted ? 'AUDIO OFF' : 'AUDIO ON'
  ], 'TIMER');

  drawBeacon(ctx, beaconX, beaconY, ui.threat, ui.frame, L.vmin);

  drawRadarSquare(ctx, L.margin, L.radarY, L.radarSize, ui);
}

/** Normalized rects for overlaying HTML controls on console screens. */
export function cockpitControlLayout(w, h) {
  const L = consoleLayout(w, h);
  const timerX = w - L.margin - L.sideW;
  return {
    audio: { left: timerX, top: L.rowY, width: L.sideW, height: L.rowH },
    recenter: { left: L.margin, top: L.rowY, width: L.sideW, height: L.rowH }
  };
}