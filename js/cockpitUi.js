import { CONSOLE_TOP } from './cockpit.js';

function formatTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

const FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const LIFE_SLOTS = 3;
const HUD_GREEN = 'rgba(168, 255, 200, 0.98)';
const HUD_GREEN_DIM = 'rgba(120, 200, 150, 0.88)';
const HUD_STROKE = 'rgba(180, 205, 230, 0.55)';

/**
 * Reference HUD (from screenshot crop):
 * Top-center inverted trapezoid with 3 columns:
 *   LV n + 3 life rockets | SCORE / value | TIMER / value
 * Top-right: ♫ / FX mute circles
 * Bottom-center console: CAUTION beacon only
 * Top-left: MAP
 */

/**
 * Reference life rocket (vertical line art):
 * pointed nose → tapered body → 2 stacked circle windows → triangular base fins.
 * `cy` is the vertical center of the icon.
 */
function drawLifeRocket(ctx, cx, cy, scale, alpha) {
  const s = scale;
  const top = cy - s * 0.5;
  const bodyTop = cy - s * 0.22;
  const bodyBot = cy + s * 0.22;
  const base = cy + s * 0.42;
  const hw = s * 0.16;
  const finW = s * 0.28;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.15, s * 0.07);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = alpha > 0.45 ? '#f5f9ff' : 'rgba(150, 165, 180, 0.38)';

  // nose cone
  ctx.beginPath();
  ctx.moveTo(cx, top);
  ctx.lineTo(cx + hw, bodyTop);
  ctx.lineTo(cx - hw, bodyTop);
  ctx.closePath();
  ctx.stroke();

  // body tube
  ctx.beginPath();
  ctx.moveTo(cx - hw, bodyTop);
  ctx.lineTo(cx - hw, bodyBot);
  ctx.lineTo(cx + hw, bodyBot);
  ctx.lineTo(cx + hw, bodyTop);
  ctx.stroke();

  // windows (2 stacked circles)
  const wr = Math.max(1.15, s * 0.055);
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.06, wr, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy + s * 0.1, wr, 0, Math.PI * 2);
  ctx.stroke();

  // left fin
  ctx.beginPath();
  ctx.moveTo(cx - hw, bodyBot - s * 0.02);
  ctx.lineTo(cx - finW, base);
  ctx.lineTo(cx - hw * 0.35, bodyBot + s * 0.06);
  ctx.closePath();
  ctx.stroke();

  // right fin
  ctx.beginPath();
  ctx.moveTo(cx + hw, bodyBot - s * 0.02);
  ctx.lineTo(cx + finW, base);
  ctx.lineTo(cx + hw * 0.35, bodyBot + s * 0.06);
  ctx.closePath();
  ctx.stroke();

  // nozzle lip
  ctx.beginPath();
  ctx.moveTo(cx - hw * 0.55, bodyBot + s * 0.04);
  ctx.lineTo(cx + hw * 0.55, bodyBot + s * 0.04);
  ctx.stroke();

  ctx.restore();
}

function threatColors(level, frame) {
  if (level === 0) return { core: '#44ee77', glow: 'rgba(68,238,119,0.45)', ring: 'rgba(68,238,119,0.35)' };
  if (level === 1) return { core: '#ffdd44', glow: 'rgba(255,221,68,0.55)', ring: 'rgba(255,221,68,0.45)' };
  const flash = 0.55 + 0.45 * Math.abs(Math.sin(frame * 0.22));
  return {
    core: `rgba(255,${Math.floor(40 * flash)},${Math.floor(50 * flash)},1)`,
    glow: `rgba(255,40,50,${0.35 + 0.4 * flash})`,
    ring: `rgba(255,80,90,${0.3 + 0.5 * flash})`
  };
}

function measureHud(ctx, w, h, ui) {
  const vmin = Math.min(w, h);
  const labelFs = Math.max(10, vmin * 0.0165);
  const valueFs = Math.max(12, vmin * 0.021);
  const lifeScale = Math.max(18, vmin * 0.048);
  const padX = Math.max(16, vmin * 0.03);
  const padY = Math.max(7, vmin * 0.011);
  const colGap = Math.max(24, vmin * 0.055);
  const rowGap = Math.max(6, labelFs * 0.45);

  const lvLabel = `LV ${ui.level}`;
  const scoreLabel = 'SCORE';
  const scoreVal = String(ui.score).padStart(5, '0');
  const timerLabel = 'TIMER';
  const timerVal = formatTime(ui.timeLeft);

  ctx.font = `700 ${labelFs}px ${FONT}`;
  const lvW = Math.max(ctx.measureText(lvLabel).width, lifeScale * 3.4);
  ctx.font = `700 ${valueFs}px ${FONT}`;
  const scoreW = Math.max(ctx.measureText(scoreLabel).width, ctx.measureText(scoreVal).width);
  const timerW = Math.max(ctx.measureText(timerLabel).width, ctx.measureText(timerVal).width);

  const innerW = lvW + scoreW + timerW + colGap * 2;
  const topW = innerW + padX * 2;
  const bottomW = topW * 0.88;
  const secondRowH = Math.max(valueFs * 1.2, lifeScale);
  const contentH = labelFs + rowGap + secondRowH;
  const trapH = contentH + padY * 2;

  const topX = (w - topW) * 0.5;
  const topY = h * 0.028;
  const botX = (w - bottomW) * 0.5;
  const botY = topY + trapH;

  const col1X = topX + padX + lvW * 0.5;
  const col2X = topX + padX + lvW + colGap + scoreW * 0.5;
  const col3X = topX + padX + lvW + colGap + scoreW + colGap + timerW * 0.5;
  const labelY = topY + padY + labelFs;
  const valueY = labelY + rowGap + valueFs;
  // rockets sit fully below LV text
  const lifeCy = labelY + rowGap + lifeScale * 0.52;

  return {
    vmin,
    margin: Math.max(6, w * 0.01),
    radarSize: Math.min(vmin * 0.215, w * 0.24, h * 0.195),
    radarY: h * 0.1,
    topX,
    topY,
    topW,
    botX,
    botY,
    bottomW,
    trapH,
    labelFs,
    valueFs,
    lifeScale,
    col1X,
    col2X,
    col3X,
    labelY,
    valueY,
    lifeCy,
    lvLabel,
    scoreLabel,
    scoreVal,
    timerLabel,
    timerVal,
    beaconY: h * CONSOLE_TOP + (h - h * CONSOLE_TOP) * 0.4
  };
}

function drawTrapezoidPanel(ctx, L) {
  ctx.beginPath();
  ctx.moveTo(L.topX, L.topY);
  ctx.lineTo(L.topX + L.topW, L.topY);
  ctx.lineTo(L.botX + L.bottomW, L.botY);
  ctx.lineTo(L.botX, L.botY);
  ctx.closePath();
  ctx.fillStyle = 'rgba(8, 12, 22, 0.82)';
  ctx.fill();
  ctx.strokeStyle = HUD_STROKE;
  ctx.lineWidth = 1.35;
  ctx.stroke();
}

function drawTopStatusTrapezoid(ctx, L, lives) {
  drawTrapezoidPanel(ctx, L);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // column 1: LV + rockets (rockets clearly below the label)
  ctx.fillStyle = HUD_GREEN;
  ctx.font = `700 ${L.labelFs}px ${FONT}`;
  ctx.fillText(L.lvLabel, L.col1X, L.labelY);
  const gap = L.lifeScale * 1.15;
  const x0 = L.col1X - ((LIFE_SLOTS - 1) * gap) / 2;
  for (let i = 0; i < LIFE_SLOTS; i++) {
    drawLifeRocket(ctx, x0 + i * gap, L.lifeCy, L.lifeScale, i < lives ? 1 : 0.3);
  }

  // column 2: SCORE
  ctx.fillStyle = HUD_GREEN_DIM;
  ctx.font = `600 ${L.labelFs}px ${FONT}`;
  ctx.fillText(L.scoreLabel, L.col2X, L.labelY);
  ctx.fillStyle = HUD_GREEN;
  ctx.font = `700 ${L.valueFs}px ${FONT}`;
  ctx.fillText(L.scoreVal, L.col2X, L.valueY);

  // column 3: TIMER
  ctx.fillStyle = HUD_GREEN_DIM;
  ctx.font = `600 ${L.labelFs}px ${FONT}`;
  ctx.fillText(L.timerLabel, L.col3X, L.labelY);
  ctx.fillStyle = HUD_GREEN;
  ctx.font = `700 ${L.valueFs}px ${FONT}`;
  ctx.fillText(L.timerVal, L.col3X, L.valueY);
}

function drawBeacon(ctx, cx, cy, threat, frame, vmin) {
  const r = Math.min(vmin * 0.048, 34);
  const { core, glow, ring } = threatColors(threat, frame);
  const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.1);
  grd.addColorStop(0, glow);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 2.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ring;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.32, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  const labelFs = Math.max(11, vmin * 0.024);
  ctx.fillStyle = 'rgba(220, 255, 235, 0.95)';
  ctx.font = `800 ${labelFs}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const label = threat === 0 ? 'SAFE' : threat === 1 ? 'CAUTION' : 'DANGER';
  ctx.fillText(label, cx, cy + r * 1.95 + labelFs * 0.25);
}

function drawRadarSquare(ctx, x, y, size, ui) {
  const titleFs = Math.max(9, size * 0.08);
  ctx.fillStyle = 'rgba(4, 12, 10, 0.94)';
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = 'rgba(75, 220, 140, 0.55)';
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
  ctx.fillStyle = HUD_GREEN_DIM;
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

function topRightMuteButtonLayout(w, h, vmin) {
  const btnSize = Math.min(Math.max(32, vmin * 0.05), 44);
  const gap = Math.max(5, btnSize * 0.16);
  const marginR = Math.max(52, w * 0.07);
  const marginT = Math.max(8, h * 0.016);
  const left0 = w - marginR - btnSize * 2 - gap;
  return {
    musicMute: { left: left0, top: marginT, width: btnSize, height: btnSize },
    sfxMute: { left: left0 + btnSize + gap, top: marginT, width: btnSize, height: btnSize }
  };
}

export function drawCockpitInstruments(ctx, w, h, ui) {
  const L = measureHud(ctx, w, h, ui);
  drawRadarSquare(ctx, L.margin, L.radarY, L.radarSize, ui);
  drawTopStatusTrapezoid(ctx, L, ui.lives);
  drawBeacon(ctx, w * 0.5, L.beaconY, ui.threat, ui.frame, L.vmin);
}

export function cockpitControlLayout(w, h, ui) {
  const canvas = document.getElementById('game');
  const cctx = canvas?.getContext('2d');
  const vmin = Math.min(w, h);
  if (!cctx || !ui) {
    return {
      ...topRightMuteButtonLayout(w, h, vmin),
      recenter: { left: vmin * 0.01, top: h * 0.1, width: vmin * 0.12, height: vmin * 0.1 }
    };
  }
  const L = measureHud(cctx, w, h, ui);
  return {
    ...topRightMuteButtonLayout(w, h, L.vmin),
    recenter: { left: L.topX, top: L.topY, width: L.topW * 0.28, height: L.trapH }
  };
}