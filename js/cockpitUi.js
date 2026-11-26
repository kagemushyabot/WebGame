import { CONSOLE_TOP } from './cockpit.js';

function formatTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

const FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

function measureTextBox(ctx, title, lines, vmin) {
  const titleFs = Math.max(9, vmin * 0.016);
  const bodyFs = Math.max(11, vmin * 0.02);
  ctx.font = `600 ${titleFs}px ${FONT}`;
  const titleW = ctx.measureText(title).width;
  ctx.font = `700 ${bodyFs}px ${FONT}`;
  let maxW = titleW;
  for (const line of lines) maxW = Math.max(maxW, ctx.measureText(line).width);
  const padX = 10;
  const padY = 6;
  const titleBand = titleFs * 1.25;
  const bodyH = lines.length * bodyFs * 1.15;
  return {
    w: maxW + padX * 2,
    h: titleBand + bodyH + padY * 2,
    bodyFs,
    titleFs,
    padX,
    padY,
    titleBand
  };
}

function drawPanelTight(ctx, x, y, ww, hh, title, titleFs) {
  ctx.fillStyle = 'rgba(4, 12, 10, 0.94)';
  ctx.fillRect(x, y, ww, hh);
  ctx.strokeStyle = 'rgba(75, 220, 140, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, y + 0.5, ww - 1, hh - 1);
  ctx.fillStyle = 'rgba(120, 200, 150, 0.85)';
  ctx.font = `600 ${titleFs}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title, x + 10, y + titleFs * 1.05);
}

function drawPanelLinesTight(ctx, x, y, box, lines, title) {
  drawPanelTight(ctx, x, y, box.w, box.h, title, box.titleFs);
  ctx.fillStyle = 'rgba(170, 255, 200, 0.98)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 ${box.bodyFs}px ${FONT}`;
  const startY = y + box.titleBand + box.bodyFs * 0.1;
  const gap = box.bodyFs * 1.15;
  lines.forEach((line, i) => ctx.fillText(line, x + box.padX, startY + gap * (i + 1)));
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
  const titleFs = Math.max(9, size * 0.08);
  ctx.fillStyle = 'rgba(4, 12, 10, 0.94)';
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = 'rgba(75, 220, 140, 0.55)';
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
  ctx.fillStyle = 'rgba(120, 200, 150, 0.85)';
  ctx.font = `600 ${titleFs}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('MAP', x + 8, y + titleFs * 1.1);
  const titleBand = titleFs * 1.25;
  const footerBand = titleFs * 1.2;
  const mapSize = size - titleBand - footerBand - 6;
  const mx = x + (size - mapSize) / 2;
  const my = y + titleBand + 2;
  ctx.fillStyle = 'rgba(0, 20, 30, 0.88)';
  ctx.fillRect(mx, my, mapSize, mapSize);
  ctx.strokeStyle = 'rgba(80, 160, 200, 0.5)';
  ctx.strokeRect(mx + 0.5, my + 0.5, mapSize - 1, mapSize - 1);
  const cx = mx + mapSize / 2;
  const cy = my + mapSize / 2;
  const scale = mapSize / (ui.radarRange * 2);
  const yaw = ui.shipYaw || 0;
  const cosy = Math.cos(yaw);
  const siny = Math.sin(yaw);
  ctx.strokeStyle = 'rgba(60, 140, 120, 0.4)';
  ctx.beginPath();
  ctx.moveTo(cx, my);
  ctx.lineTo(cx, my + mapSize);
  ctx.moveTo(mx, cy);
  ctx.lineTo(mx + mapSize, cy);
  ctx.stroke();
  for (const a of ui.asteroids) {
    const lx = a.x * cosy - a.z * siny;
    const lz = a.x * siny + a.z * cosy;
    const px = cx + lx * scale;
    const py = cy + lz * scale;
    if (px < mx || px > mx + mapSize || py < my || py > my + mapSize) continue;
    ctx.fillStyle = a.kind === 'chain' ? '#ff9944' : a.kind === 'balloon' ? '#ff88cc' : '#88ccaa';
    ctx.beginPath();
    ctx.arc(px, py, Math.max(2, 2 + a.size * 0.8), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(180, 230, 255, 0.95)';
  ctx.font = `700 ${Math.max(10, size * 0.075)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(`LEFT ${ui.asteroidCount}`, x + size / 2, y + size - footerBand * 0.4);
}

function panelLines(ui) {
  return {
    status: [`SCORE ${ui.score}`, `LV ${ui.level}`, `LIVES ${ui.lives}`],
    timer: [formatTime(ui.timeLeft), ui.muted ? 'AUDIO OFF' : 'AUDIO ON']
  };
}

function consoleLayout(ctx, w, h, ui) {
  const vmin = Math.min(w, h);
  const margin = w * 0.012;
  const lines = panelLines(ui);
  const m1 = measureTextBox(ctx, 'STATUS', lines.status, vmin);
  const m2 = measureTextBox(ctx, 'TIMER', lines.timer, vmin);
  const panelW = Math.max(m1.w, m2.w);
  const panelH = Math.max(m1.h, m2.h);
  const beaconHalf = vmin * 0.075;
  const innerGap = vmin * 0.022;
  const rowY = h * CONSOLE_TOP + h * 0.02;
  const statusX = w * 0.5 - beaconHalf - innerGap - panelW;
  const timerX = w * 0.5 + beaconHalf + innerGap;
  const radarSize = Math.min(vmin * 0.24, w * 0.26, h * 0.22);
  const radarY = h * 0.11;
  const box = { w: panelW, h: panelH, bodyFs: Math.max(m1.bodyFs, m2.bodyFs), titleFs: m1.titleFs, padX: m1.padX, padY: m1.padY, titleBand: m1.titleBand };
  return { margin, rowY, statusX, timerX, panelW, panelH, box, vmin, radarSize, radarY };
}

/** Cockpit-mounted HUD: stats, timer, radar, proximity beacon. */
export function drawCockpitInstruments(ctx, w, h, ui) {
  const L = consoleLayout(ctx, w, h, ui);
  const lines = panelLines(ui);
  const beaconX = w * 0.5;
  const beaconY = L.rowY + L.panelH * 0.42;

  drawPanelLinesTight(ctx, L.statusX, L.rowY, { ...L.box, w: L.panelW, h: L.panelH }, lines.status, 'STATUS');
  drawPanelLinesTight(ctx, L.timerX, L.rowY, { ...L.box, w: L.panelW, h: L.panelH }, lines.timer, 'TIMER');
  drawBeacon(ctx, beaconX, beaconY, ui.threat, ui.frame, L.vmin);
  drawRadarSquare(ctx, L.margin, L.radarY, L.radarSize, ui);
}

/** Normalized rects for overlaying HTML controls on console screens. */
export function cockpitControlLayout(w, h, ui) {
  const canvas = document.getElementById('game');
  const cctx = canvas?.getContext('2d');
  if (!cctx || !ui) {
    const vmin = Math.min(w, h);
    return {
      audio: { left: w * 0.58, top: h * 0.82, width: vmin * 0.14, height: vmin * 0.1 },
      recenter: { left: w * 0.28, top: h * 0.82, width: vmin * 0.14, height: vmin * 0.1 }
    };
  }
  const L = consoleLayout(cctx, w, h, ui);
  return {
    audio: { left: L.timerX, top: L.rowY, width: L.panelW, height: L.panelH },
    recenter: { left: L.statusX, top: L.rowY, width: L.panelW, height: L.panelH }
  };
}