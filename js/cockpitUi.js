import { CONSOLE_TOP } from './cockpit.js';

function formatTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function fitLinesFont(ctx, lines, maxWidth, preferredPx) {
  let fs = preferredPx;
  const family = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  while (fs >= 10) {
    ctx.font = `700 ${fs}px ${family}`;
    const ok = lines.every(l => ctx.measureText(l).width <= maxWidth);
    if (ok) return fs;
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
  if (title) {
    const titleFs = Math.max(11, Math.min(ww, hh) * 0.11);
    ctx.fillStyle = 'rgba(120, 200, 150, 0.85)';
    ctx.font = `600 ${titleFs}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(title, x + ww * 0.07, y + titleFs * 1.15);
  }
}

function drawPanelLines(ctx, x, y, ww, hh, lines, title) {
  drawPanel(ctx, x, y, ww, hh, title);
  const padX = ww * 0.07;
  const innerW = ww - padX * 2;
  const titleBand = title ? hh * 0.22 : hh * 0.12;
  const vmin = Math.min(ww, hh);
  const preferred = Math.max(13, vmin * 0.13);
  const fs = fitLinesFont(ctx, lines, innerW, preferred);
  ctx.fillStyle = 'rgba(170, 255, 200, 0.98)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 ${fs}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  const gap = fs * 1.28;
  const startY = y + titleBand + fs;
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
  const r = vmin * 0.038;
  const { core, glow, ring } = threatColors(threat, frame);
  const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2);
  grd.addColorStop(0, glow);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ring;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.35, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  const labelFs = Math.max(11, vmin * 0.022);
  ctx.fillStyle = 'rgba(200,255,220,0.92)';
  ctx.font = `700 ${labelFs}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  const label = threat === 0 ? 'SAFE' : threat === 1 ? 'CAUTION' : 'DANGER';
  ctx.fillText(label, cx, cy + r * 2.6);
}

function drawRadarSquare(ctx, x, y, size, ui) {
  drawPanel(ctx, x, y, size, size, 'MAP');
  const pad = size * 0.08;
  const titleBand = size * 0.16;
  const footerBand = size * 0.17;
  const mapSize = size - pad * 2 - titleBand - footerBand;
  const mx = x + (size - mapSize) / 2;
  const my = y + titleBand;
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
  ctx.moveTo(cx, cy - 5);
  ctx.lineTo(cx - 4, cy + 4);
  ctx.lineTo(cx + 4, cy + 4);
  ctx.closePath();
  ctx.fill();
  for (const a of ui.asteroids) {
    const lx = a.x * cosy - a.z * siny;
    const lz = a.x * siny + a.z * cosy;
    const px = cx + lx * scale;
    const py = cy + lz * scale;
    if (px < mx || px > mx + mapSize || py < my || py > my + mapSize) continue;
    ctx.fillStyle = a.kind === 'chain' ? '#ff9944' : a.kind === 'balloon' ? '#ff88cc' : '#88ccaa';
    const dot = Math.max(2.5, 2.2 + a.size * 0.9);
    ctx.beginPath();
    ctx.arc(px, py, dot, 0, Math.PI * 2);
    ctx.fill();
  }
  const footFs = Math.max(11, size * 0.075);
  ctx.fillStyle = 'rgba(180, 230, 255, 0.95)';
  ctx.font = `700 ${footFs}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  const remain = `LEFT ${ui.asteroidCount}`;
  ctx.fillText(remain, x + size / 2, y + size - footerBand * 0.45);
}

/** Cockpit-mounted HUD: stats, timer, radar, proximity beacon. */
export function drawCockpitInstruments(ctx, w, h, ui) {
  const ct = CONSOLE_TOP;
  const vmin = Math.min(w, h);
  const deskY = h * (ct + 0.018);
  const panelW = Math.max(w * 0.21, vmin * 0.22);
  const panelH = Math.max(h * 0.1, vmin * 0.11);
  const panelH2 = Math.max(h * 0.075, vmin * 0.085);

  drawPanelLines(ctx, w * 0.04, deskY, panelW, panelH, [
    `SCORE ${ui.score}`,
    `LEVEL ${ui.level}`,
    `LIVES ${ui.lives}`
  ], 'STATUS');

  drawPanelLines(ctx, w * 0.04, deskY + panelH + h * 0.008, panelW * 0.92, panelH2, [
    formatTime(ui.timeLeft),
    ui.muted ? 'AUDIO OFF' : 'AUDIO ON'
  ], 'TIMER');

  drawBeacon(ctx, w * 0.5, h * (ct + 0.11), ui.threat, ui.frame, vmin);

  const radarSize = Math.min(w * 0.27, h * 0.3, vmin * 0.3);
  const closeReserve = Math.max(52, vmin * 0.08);
  const radarX = w - radarSize - w * 0.035;
  const radarY = h * 0.075 + closeReserve;
  drawRadarSquare(ctx, radarX, radarY, radarSize, ui);
}

/** Normalized rects for overlaying HTML controls on console screens. */
export function cockpitControlLayout(w, h) {
  const ct = CONSOLE_TOP;
  const vmin = Math.min(w, h);
  const deskY = h * (ct + 0.018);
  const panelW = Math.max(w * 0.21, vmin * 0.22);
  const panelH = Math.max(h * 0.1, vmin * 0.11);
  const panelH2 = Math.max(h * 0.075, vmin * 0.085);
  return {
    audio: { left: w * 0.04, top: deskY + panelH + h * 0.008, width: panelW * 0.92, height: panelH2 },
    recenter: { left: w * 0.04, top: deskY, width: panelW, height: panelH }
  };
}