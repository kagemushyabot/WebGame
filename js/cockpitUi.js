import { CONSOLE_TOP } from './cockpit.js';

function formatTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function drawPanel(ctx, x, y, ww, hh, title) {
  ctx.fillStyle = 'rgba(4, 12, 10, 0.92)';
  ctx.fillRect(x, y, ww, hh);
  ctx.strokeStyle = 'rgba(75, 220, 140, 0.55)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(x + 0.5, y + 0.5, ww - 1, hh - 1);
  if (title) {
    ctx.fillStyle = 'rgba(120, 200, 150, 0.75)';
    ctx.font = `600 ${Math.max(8, hh * 0.16)}px ui-monospace, monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(title, x + ww * 0.08, y + hh * 0.2);
  }
}

function drawPanelLines(ctx, x, y, ww, hh, lines, title) {
  drawPanel(ctx, x, y, ww, hh, title);
  ctx.fillStyle = 'rgba(170, 255, 200, 0.95)';
  ctx.textAlign = 'left';
  const fs = Math.max(9, Math.min(ww * 0.11, hh * 0.22));
  ctx.font = `700 ${fs}px ui-monospace, monospace`;
  const startY = y + (title ? hh * 0.42 : hh * 0.35);
  const gap = fs * 1.35;
  lines.forEach((line, i) => ctx.fillText(line, x + ww * 0.08, startY + i * gap));
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

function drawBeacon(ctx, cx, cy, threat, frame) {
  const r = Math.min(ctx.canvas.width, ctx.canvas.height) * 0.028;
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
  ctx.arc(cx, cy, r * 1.35, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(200,255,220,0.7)';
  ctx.font = `600 ${Math.max(8, r * 0.55)}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  const label = threat === 0 ? 'SAFE' : threat === 1 ? 'CAUTION' : 'DANGER';
  ctx.fillText(label, cx, cy + r * 2.8);
}

function drawRadar(ctx, x, y, ww, hh, ui) {
  drawPanel(ctx, x, y, ww, hh, 'TACTICAL MAP');
  const pad = ww * 0.1;
  const mx = x + pad;
  const my = y + hh * 0.28;
  const mw = ww - pad * 2;
  const mh = hh * 0.58;
  ctx.fillStyle = 'rgba(0, 20, 30, 0.85)';
  ctx.fillRect(mx, my, mw, mh);
  ctx.strokeStyle = 'rgba(80, 160, 200, 0.45)';
  ctx.strokeRect(mx + 0.5, my + 0.5, mw - 1, mh - 1);
  const cx = mx + mw / 2;
  const cy = my + mh / 2;
  const scale = Math.min(mw, mh) / (ui.radarRange * 2);
  const yaw = ui.shipYaw || 0;
  const cosy = Math.cos(yaw);
  const siny = Math.sin(yaw);
  ctx.strokeStyle = 'rgba(60, 140, 120, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, my);
  ctx.lineTo(cx, my + mh);
  ctx.moveTo(mx, cy);
  ctx.lineTo(mx + mw, cy);
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
    if (px < mx || px > mx + mw || py < my || py > my + mh) continue;
    ctx.fillStyle = a.kind === 'chain' ? '#ff9944' : a.kind === 'balloon' ? '#ff88cc' : '#88ccaa';
    const dot = Math.max(2, 2 + a.size * 0.8);
    ctx.beginPath();
    ctx.arc(px, py, dot, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(180, 230, 255, 0.9)';
  ctx.font = `700 ${Math.max(9, ww * 0.09)}px ui-monospace, monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(`REMAINING ${ui.asteroidCount}`, x + ww * 0.08, y + hh * 0.94);
}

/** Cockpit-mounted HUD: stats, timer, radar, proximity beacon. */
export function drawCockpitInstruments(ctx, w, h, ui) {
  const ct = CONSOLE_TOP;
  const deskY = h * (ct + 0.032);
  const deskH = h * 0.08;
  const lw = w * 0.14;

  drawPanelLines(ctx, w * 0.06, deskY, lw, deskH * 1.05, [
    `SCORE ${ui.score}`,
    `LEVEL ${ui.level}`,
    `LIVES ${ui.lives}`
  ], 'STATUS');

  drawPanelLines(ctx, w * 0.06, deskY + deskH * 1.12, lw * 0.95, deskH * 0.82, [
    formatTime(ui.timeLeft),
    ui.muted ? 'AUDIO OFF' : 'AUDIO ON'
  ], 'TIMER');

  drawBeacon(ctx, w * 0.5, h * (ct + 0.108), ui.threat, ui.frame);

  const rw = w * 0.22;
  const rh = h * 0.17;
  drawRadar(ctx, w - rw - w * 0.04, h * 0.1, rw, rh, ui);
}

/** Normalized rects for overlaying HTML controls on console screens. */
export function cockpitControlLayout(w, h) {
  const ct = CONSOLE_TOP;
  const deskY = h * (ct + 0.032);
  const deskH = h * 0.08;
  return {
    audio: { left: w * 0.06, top: deskY + deskH * 1.12, width: w * 0.133, height: deskH * 0.82 },
    recenter: { left: w * 0.06, top: deskY, width: w * 0.14, height: deskH * 1.05 },
    quit: { left: w * 0.78, top: h * 0.10, width: w * 0.16, height: h * 0.06 }
  };
}