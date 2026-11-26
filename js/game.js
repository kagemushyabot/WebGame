import { audio } from './audio.js';
import {
  clamp, rand, dist3, cross, normalize, getForward, rotateAsteroidPoint
} from './math3d.js';
import {
  DIFFICULTY, UFO_VERTS, UFO_EDGES,
  newShip, spawnAsteroid, splitAsteroid, splitComet, spawnUfo,
  ASTEROID_KINDS, asteroidScore
} from './entities.js';
import { WORLD } from './world.js';
import { applyWindshieldClip, drawCockpitOverlay } from './cockpit.js';
import { drawCockpitInstruments, cockpitControlLayout } from './cockpitUi.js';
import {
  isPortraitBlocked,
  isGameplayOrientationBlocked,
  setupOrientationGate,
  requestGameFullscreen,
  exitGameFullscreen,
  setPlaySessionActive,
  bindFullscreenMaintenance,
  syncViewportSize,
  scheduleLayoutRefresh,
  setLayoutRefreshHandler
} from './mobile.js';

const HI_SCORE_KEY = 'asteroids3d_hi';
const LEVEL_DURATION_MS = 60 * 1000;
const ASTEROID_TIME_PENALTY = 75;
let levelDeadline = 0;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const livesEl = document.getElementById('lives');
const startScreen = document.getElementById('startScreen');
const gameOver = document.getElementById('gameOver');
const goScoreEl = document.getElementById('goScore');
const goHiScoreEl = document.getElementById('goHiScore');
const btnStart = document.getElementById('btnStart');
const btnRestart = document.getElementById('btnRestart');
const btnRecenter = document.getElementById('btnRecenter');
const btnMuteMusic = document.getElementById('btnMuteMusic');
const btnMuteSfx = document.getElementById('btnMuteSfx');
const btnClose = document.getElementById('btnClose');
const padLook = document.getElementById('padLook');
const padFire = document.getElementById('padFire');
const levelFlash = document.getElementById('levelFlash');
const pauseHint = document.getElementById('pauseHint');
const gameContainer = document.getElementById('game-container');
const orientationLock = document.getElementById('orientationLock');

setLayoutRefreshHandler(() => {
  resize();
  layoutCockpitControls();
  if (state === 'PLAYING' && !isGameplayOrientationBlocked()) draw();
});
syncViewportSize();
setupOrientationGate(orientationLock);
bindFullscreenMaintenance(gameContainer);

let width, height, dpr;
let cxCanvas, cyCanvas;
function resize() {
  const rect = canvas.getBoundingClientRect();
  dpr = window.devicePixelRatio || 1;
  width = Math.floor(rect.width * dpr);
  height = Math.floor(rect.height * dpr);
  canvas.width = width;
  canvas.height = height;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cxCanvas = width / (dpr * 2);
  cyCanvas = height / (dpr * 2);
}
function layoutCockpitControls() {
  if (!canvas || state !== 'PLAYING') return;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  const L = cockpitControlLayout(w, h, {
    score,
    level,
    lives,
    timeLeft: getLevelTimeLeftSec(),
    musicMuted: audio.musicMuted,
    sfxMuted: audio.sfxMuted
  });
  const apply = (el, box) => {
    if (!el || !box) return;
    el.style.left = `${box.left}px`;
    el.style.top = `${box.top}px`;
    el.style.width = `${box.width}px`;
    el.style.height = `${box.height}px`;
    el.style.right = 'auto';
  };
  const applyRound = (el, box) => {
    apply(el, box);
    if (!el || !box) return;
    el.style.fontSize = `${Math.max(10, box.width * 0.36)}px`;
  };
  apply(btnRecenter, L.recenter);
  applyRound(btnMuteMusic, L.musicMute);
  applyRound(btnMuteSfx, L.sfxMute);
}

function updateMuteButtons() {
  if (btnMuteMusic) {
    btnMuteMusic.textContent = audio.musicMuted ? 'M×' : '♫';
    btnMuteMusic.classList.toggle('is-off', audio.musicMuted);
    btnMuteMusic.title = audio.musicMuted ? 'Music off' : 'Music on';
  }
  if (btnMuteSfx) {
    btnMuteSfx.textContent = audio.sfxMuted ? 'FX×' : 'FX';
    btnMuteSfx.classList.toggle('is-off', audio.sfxMuted);
    btnMuteSfx.title = audio.sfxMuted ? 'Effects off' : 'Effects on';
  }
}
updateMuteButtons();
window.addEventListener('resize', () => scheduleLayoutRefresh());
resize();

let beta = 0, gamma = 0;
let gyroActive = false;
let baseBeta = 0, baseGamma = 0;
let baselineCaptured = false;
function onDeviceOrientation(e) {
  if (e.beta == null || e.gamma == null) return;
  let b = e.beta, g = e.gamma;
  if (Math.abs(b) > 90) b = b > 0 ? 180 - b : -180 - b;
  beta = b;
  gamma = g;
  if (gyroActive && !baselineCaptured) { baseBeta = b; baseGamma = g; baselineCaptured = true; }
}
function requestIOS() {
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then(r => {
      if (r === 'granted') { window.addEventListener('deviceorientation', onDeviceOrientation); gyroActive = true; }
    }).catch(() => {});
  } else {
    window.addEventListener('deviceorientation', onDeviceOrientation);
    gyroActive = true;
  }
}
window.addEventListener('deviceorientation', e => { if (e.beta != null) onDeviceOrientation(e); });

let lookPtr = null;
let lastLoopAt = 0;
/** Virtual joystick: deflection → angular velocity (rad/s at full tilt). */
const LOOK_JOY_MAX_YAW = 0.95;
const LOOK_JOY_MAX_PITCH = 0.68;
const LOOK_JOY_DEAD = 10;
let warpFx = { t: 0, duration: 48 };

let ship = newShip();
let camX = 0, camY = 0, camZ = 0;
let camRight = [1, 0, 0], camUp = [0, 1, 0], camForward = [0, 0, -1];

function updateCamera() {
  const pitch = clamp(ship.pitch, -1.2, 1.2);
  const f = getForward(ship.yaw, pitch);
  camX = 0;
  camY = 0;
  camZ = 0;
  camForward = f;
  const worldUp = [0, 1, 0];
  camRight = normalize(cross(camForward, worldUp));
  camUp = normalize(cross(camRight, camForward));
}

function project(x, y, z) {
  const dx = x - camX, dy = y - camY, dz = z - camZ;
  const cx = dx * camRight[0] + dy * camRight[1] + dz * camRight[2];
  const cy = dx * camUp[0] + dy * camUp[1] + dz * camUp[2];
  const cz = dx * camForward[0] + dy * camForward[1] + dz * camForward[2];
  if (cz <= 0.1) return null;
  const f = WORLD.focal;
  const scale = f / cz;
  return { sx: cx * scale + cxCanvas, sy: cy * scale + cyCanvas, scale, z: cz };
}

let state = 'START';
let score = 0, lives = 3, level = 1, scoreForLife = 10000;
let difficulty = 'normal';
let bullets = [], enemyBullets = [], asteroids = [], ufos = [], particles = [], stars = [];
let keys = {};
let frame = 0;
let invulnUntil = 0;
let fireCooldown = 0;
let hyperspaceCooldown = 0;
let starsDrawOrder = [];
let starsSortFrame = -999;

function getDiff() {
  return DIFFICULTY[difficulty] || DIFFICULTY.normal;
}

function readDifficulty() {
  const el = document.querySelector('input[name="diff"]:checked');
  difficulty = el ? el.value : 'normal';
}

function getHiScore() {
  const v = parseInt(localStorage.getItem(HI_SCORE_KEY) || '0', 10);
  return Number.isFinite(v) ? v : 0;
}
function saveHiScore() {
  const hi = getHiScore();
  if (score > hi) localStorage.setItem(HI_SCORE_KEY, String(score));
}

function keydown(e) {
  keys[e.code] = true;
  if (e.code === 'Escape') {
    if (state === 'PLAYING') exitToMenu();
    return;
  }
  if (state === 'START' && (e.code === 'Enter' || e.code === 'Space')) { startGame(); return; }
  if (state === 'GAMEOVER' && e.code === 'Enter') { resetGame(); return; }
  if (state === 'PLAYING' && e.code === 'Space') shoot();
  if (state === 'PLAYING' && (e.code === 'KeyH' || e.code === 'ShiftLeft' || e.code === 'ShiftRight')) {
    tryHyperspace();
  }
}
function keyup(e) {
  keys[e.code] = false;
}
window.addEventListener('keydown', keydown);
window.addEventListener('keyup', keyup);

function lookPadMetrics() {
  if (!padLook) return { cx: 0, cy: 0, radius: 48 };
  const r = padLook.getBoundingClientRect();
  const radius = Math.min(r.width, r.height) * 0.42;
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, radius: Math.max(24, radius) };
}

function updateLookJoystick(clientX, clientY) {
  const { cx, cy, radius } = lookPadMetrics();
  let ox = clientX - cx;
  let oy = clientY - cy;
  const dist = Math.hypot(ox, oy);
  if (dist > radius) {
    ox = (ox / dist) * radius;
    oy = (oy / dist) * radius;
  }
  if (dist > LOOK_JOY_DEAD) lookPtr.moved = true;
  lookPtr.yawRate = (ox / radius) * LOOK_JOY_MAX_YAW;
  lookPtr.pitchRate = (oy / radius) * LOOK_JOY_MAX_PITCH;
  lookPtr.knobX = ox;
  lookPtr.knobY = oy;
  const ring = padLook.querySelector('.touch-pad__ring');
  if (ring) ring.style.transform = `translate(${ox}px, ${oy}px)`;
}

function resetLookPadVisual() {
  const ring = padLook?.querySelector('.touch-pad__ring');
  if (ring) ring.style.transform = '';
}

function beginLook(clientX, clientY, pointerId) {
  if (state !== 'PLAYING') return;
  lookPtr = {
    id: pointerId,
    yawRate: 0,
    pitchRate: 0,
    moved: false,
    t0: Date.now()
  };
  padLook.classList.add('active');
  updateLookJoystick(clientX, clientY);
}

function moveLook(clientX, clientY, pointerId) {
  if (!lookPtr || lookPtr.id !== pointerId || state !== 'PLAYING') return;
  updateLookJoystick(clientX, clientY);
}

function endLook(pointerId) {
  if (!lookPtr || lookPtr.id !== pointerId) return;
  if (!lookPtr.moved && Date.now() - lookPtr.t0 < 320) tryHyperspace();
  lookPtr = null;
  padLook.classList.remove('active');
  resetLookPadVisual();
}

function applyLookJoystick(dt) {
  if (!lookPtr || state !== 'PLAYING') return;
  ship.yaw += lookPtr.yawRate * dt;
  ship.pitch = clamp(ship.pitch + lookPtr.pitchRate * dt, -1.2, 1.2);
}

function setupTouchPads() {
  if (!padLook) return;
  padLook.addEventListener('pointerdown', e => {
    if (state !== 'PLAYING') return;
    e.preventDefault();
    padLook.setPointerCapture(e.pointerId);
    beginLook(e.clientX, e.clientY, e.pointerId);
  });
  padLook.addEventListener('pointermove', e => {
    if (!lookPtr || lookPtr.id !== e.pointerId) return;
    e.preventDefault();
    moveLook(e.clientX, e.clientY, e.pointerId);
  });
  padLook.addEventListener('lostpointercapture', e => {
    if (lookPtr && lookPtr.id === e.pointerId) endLook(e.pointerId);
  });
  const endLookPointer = e => {
    endLook(e.pointerId);
    try { padLook.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };
  padLook.addEventListener('pointerup', endLookPointer);
  padLook.addEventListener('pointercancel', endLookPointer);

  if (typeof window.PointerEvent !== 'function') {
    padLook.addEventListener('touchstart', e => {
      if (state !== 'PLAYING' || e.touches.length !== 1) return;
      const t = e.touches[0];
      e.preventDefault();
      beginLook(t.clientX, t.clientY, t.identifier);
    }, { passive: false });
    padLook.addEventListener('touchmove', e => {
      if (!lookPtr || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (t.identifier !== lookPtr.id) return;
      e.preventDefault();
      moveLook(t.clientX, t.clientY, t.identifier);
    }, { passive: false });
    padLook.addEventListener('touchend', e => {
      if (!lookPtr) return;
      for (const t of e.changedTouches) {
        if (t.identifier === lookPtr.id) endLook(t.identifier);
      }
    });
    padLook.addEventListener('touchcancel', e => {
      for (const t of e.changedTouches) endLook(t.identifier);
    });
  }
}

function setupFirePad() {
  if (!padFire) return;
  const fire = e => {
    if (state !== 'PLAYING') return;
    e.preventDefault();
    shoot();
    padFire.classList.add('active');
    setTimeout(() => padFire.classList.remove('active'), 80);
  };
  padFire.addEventListener('pointerdown', fire);
  padFire.addEventListener('click', e => e.preventDefault());
}
setupTouchPads();
setupFirePad();

function exitToMenu() {
  if (state !== 'PLAYING') return;
  state = 'START';
  setPlaySessionActive(false);
  audio.stopBgm();
  document.documentElement.classList.remove('cockpit-ui');
  exitGameFullscreen();
  audio.playThrustStop();
  pauseHint?.classList.remove('hidden');
  setTimeout(() => pauseHint?.classList.add('hidden'), 1400);
  startScreen.classList.add('open');
}

btnRecenter.addEventListener('click', () => {
  if (gyroActive) { baseBeta = beta; baseGamma = gamma; baselineCaptured = true; }
  ship.yaw = 0;
  ship.pitch = 0;
});
btnClose?.addEventListener('click', () => exitToMenu());
btnMuteMusic?.addEventListener('click', () => {
  audio.setMusicMute(!audio.musicMuted);
  updateMuteButtons();
});
btnMuteSfx?.addEventListener('click', () => {
  audio.setSfxMute(!audio.sfxMuted);
  updateMuteButtons();
});
btnStart.addEventListener('click', startGame);
btnRestart.addEventListener('click', resetGame);

function addParticle(x, y, z, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    const e = rand(0, Math.PI * 2);
    const s = rand(0, speed);
    particles.push({
      x, y, z,
      vx: Math.cos(a) * Math.sin(e) * s,
      vy: Math.sin(a) * Math.sin(e) * s,
      vz: Math.cos(e) * s,
      life: rand(0.4, 1.0),
      maxLife: 1.0,
      color
    });
  }
}

function showLevelFlash() {
  if (!levelFlash) return;
  levelFlash.textContent = `LEVEL ${level}`;
  levelFlash.classList.remove('hidden');
  levelFlash.classList.add('show');
  setTimeout(() => {
    levelFlash.classList.remove('show');
    setTimeout(() => levelFlash.classList.add('hidden'), 400);
  }, 1200);
}

function getLevelTimeLeftSec() {
  return Math.max(0, (levelDeadline - performance.now()) / 1000);
}

function computeThreatLevel() {
  let minD = Infinity;
  for (const a of asteroids) {
    const d = dist3(0, 0, 0, a.x, a.y, a.z) - asteroidRadius(a);
    minD = Math.min(minD, d);
  }
  if (!Number.isFinite(minD)) return 0;
  if (minD > 165) return 0;
  if (minD > 100) return 1;
  return 2;
}

function finishLevelByTimer() {
  if (state !== 'PLAYING') return;
  const remaining = asteroids.length;
  if (remaining > 0) {
    const penalty = remaining * ASTEROID_TIME_PENALTY;
    score = Math.max(0, score - penalty);
    if (levelFlash) {
      levelFlash.textContent = `TIME UP — −${penalty} (${remaining} left)`;
      levelFlash.classList.remove('hidden');
      levelFlash.classList.add('show');
      setTimeout(() => {
        levelFlash.classList.remove('show');
        setTimeout(() => levelFlash.classList.add('hidden'), 400);
      }, 1800);
    }
  }
  scoreEl.textContent = score;
  levelDeadline = performance.now() + 1e9;
  level++;
  initLevel(true);
}

function initLevel(clearFlash = false) {
  ship = newShip();
  bullets = [];
  enemyBullets = [];
  asteroids = [];
  particles = [];
  invulnUntil = 0;
  levelDeadline = performance.now() + LEVEL_DURATION_MS;
  const diff = getDiff();
  const count = diff.baseCount + (level - 1);
  for (let i = 0; i < count; i++) {
    let ast, tries = 0;
    do { ast = spawnAsteroid(3, diff.speedMul); tries++; } while (dist3(ast.x, ast.y, ast.z, 0, 0, 0) < WORLD.minSpawnFromShip && tries < 40);
    asteroids.push(ast);
  }
  ufos = [];
  if (level >= 2) {
    const ufoCount = Math.min(1 + Math.floor((level - 2) / 2), 3);
    for (let i = 0; i < ufoCount; i++) ufos.push(spawnUfo(diff.speedMul));
  }
  levelEl.textContent = level;
  audio.playLevelStart();
  if (clearFlash) showLevelFlash();
}

function startGame() {
  if (isPortraitBlocked()) return;
  setPlaySessionActive(true);
  requestGameFullscreen(gameContainer);
  readDifficulty();
  audio.init();
  audio.resume();
  audio.startBgm();
  state = 'PLAYING';
  score = 0;
  lives = 3;
  level = 1;
  scoreForLife = 10000;
  hyperspaceCooldown = 0;
  scoreEl.textContent = score;
  livesEl.textContent = lives;
  levelEl.textContent = level;
  startScreen.classList.remove('open');
  gameOver.classList.remove('open');
  gyroActive = false;
  baseBeta = 0;
  baseGamma = 0;
  baselineCaptured = false;
  ship.yaw = 0;
  ship.pitch = 0;
  pauseHint?.classList.add('hidden');
  initLevel(false);
  frame = 0;
  document.documentElement.classList.add('cockpit-ui');
  layoutCockpitControls();
  loop();
}

function gameOverScreen() {
  state = 'GAMEOVER';
  setPlaySessionActive(false);
  audio.stopBgm();
  document.documentElement.classList.remove('cockpit-ui');
  saveHiScore();
  goScoreEl.textContent = score;
  goHiScoreEl.textContent = Math.max(score, getHiScore());
  gameOver.classList.add('open');
}
function resetGame() { startGame(); }

function shoot() {
  if (fireCooldown > 0 || ship.dead) return;
  updateCamera();
  const f = camForward;
  const up = camUp;
  const spd = WORLD.bulletSpeed;
  const ms = WORLD.modelScale;
  const fwd = 5 * ms;
  const belowWin = 26 * ms;
  const sx = f[0] * fwd + up[0] * belowWin;
  const sy = f[1] * fwd + up[1] * belowWin;
  const sz = f[2] * fwd + up[2] * belowWin;
  bullets.push({
    x: sx, y: sy, z: sz,
    vx: f[0] * spd, vy: f[1] * spd, vz: f[2] * spd,
    life: WORLD.bulletLife,
    px: sx, py: sy, pz: sz
  });
  fireCooldown = WORLD.fireCooldown;
  audio.playFire();
}

function tryHyperspace() {
  if (state !== 'PLAYING' || ship.dead || hyperspaceCooldown > 0) return;
  hyperspaceCooldown = 180;
  if (padLook) padLook.classList.add('warp-cool');
  triggerWarpFx();
  const diff = getDiff();
  if (Math.random() < diff.hazardChance) {
    audio.playHyperspace();
    dieShip();
    return;
  }
  let shifted = false;
  for (let t = 0; t < 25; t++) {
    const ox = rand(-220, 220), oy = rand(-35, 35), oz = rand(-220, 220);
    const safeAst = asteroids.every(a => dist3(-ox, -oy, -oz, a.x, a.y, a.z) > 155);
    const safeUfo = ufos.every(u => dist3(-ox, -oy, -oz, u.x, u.y, u.z) > 115);
    if (safeAst && safeUfo) {
      for (const a of asteroids) { a.x += ox; a.y += oy; a.z += oz; }
      for (const u of ufos) { u.x += ox; u.y += oy; u.z += oz; }
      for (const b of bullets) { b.x += ox; b.y += oy; b.z += oz; }
      for (const b of enemyBullets) { b.x += ox; b.y += oy; b.z += oz; }
      shifted = true;
      break;
    }
  }
  if (!shifted) {
    const ox = rand(-140, 140), oy = rand(-25, 25), oz = rand(-140, 140);
    for (const a of asteroids) { a.x += ox; a.y += oy; a.z += oz; }
    for (const u of ufos) { u.x += ox; u.y += oy; u.z += oz; }
  }
  invulnUntil = Date.now() + 1600;
  addParticle(0, 0, 0, '#3c78ff', 24, 6);
  addParticle(0, 0, 0, '#aaddff', 36, 9);
  audio.playHyperspace();
}

function triggerWarpFx() {
  warpFx.t = warpFx.duration;
}

function applyGyroToShip() {
  if (!gyroActive) return;
  let b = beta - baseBeta;
  let g = gamma - baseGamma;
  if (Math.abs(b) > 90) b = b > 0 ? 180 - b : -180 - b;
  ship.pitch = clamp((b / 90) * 1.3, -1.1, 1.1);
  ship.yaw = (g / 90) * 1.6;
}

function wrapObj(o) {
  const bound = WORLD.bound;
  const yb = WORLD.yBound;
  if (o.x > bound) o.x = -bound;
  if (o.x < -bound) o.x = bound;
  if (o.z > bound) o.z = -bound;
  if (o.z < -bound) o.z = bound;
  if (o.y > yb) o.y = yb;
  if (o.y < -yb) o.y = -yb;
}

function updateUfos() {
  for (const u of ufos) {
    u.t++;
    u.x += Math.sin(u.t * 0.03) * 0.04;
    u.shootCd--;
    if (u.shootCd <= 0 && !ship.dead) {
      const d = dist3(u.x, u.y, u.z, 0, 0, 0) || 1;
      const spd = WORLD.enemyBulletSpeed;
      enemyBullets.push({
        x: u.x, y: u.y, z: u.z,
        vx: (-u.x / d) * spd, vy: (-u.y / d) * spd * 0.5, vz: (-u.z / d) * spd,
        life: 90,
        px: u.x, py: u.y, pz: u.z
      });
      u.shootCd = rand(70, 140);
    }
  }
}

function asteroidRadius(a) {
  return a.wire.boundsR * (a.swell || 1);
}

function syncAsteroidRadius(a) {
  a.radius = asteroidRadius(a);
}

function kindColor(a) {
  return (ASTEROID_KINDS[a.kind] || ASTEROID_KINDS.rock).color;
}

function resolveAsteroidCollisions() {
  for (let i = 0; i < asteroids.length; i++) {
    for (let j = i + 1; j < asteroids.length; j++) {
      const a = asteroids[i];
      const b = asteroids[j];
      const ra = asteroidRadius(a);
      const rb = asteroidRadius(b);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const minD = ra + rb;
      if (d >= minD || d < 0.01) continue;
      const nx = dx / d;
      const ny = dy / d;
      const nz = dz / d;
      const overlap = (minD - d) * 0.5;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      a.z -= nz * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;
      b.z += nz * overlap;
      const bounce = a.kind === 'rubber' || b.kind === 'rubber';
      if (!bounce) continue;
      const rvx = b.vx - a.vx;
      const rvy = b.vy - a.vy;
      const rvz = b.vz - a.vz;
      const vn = rvx * nx + rvy * ny + rvz * nz;
      if (vn >= 0) continue;
      const rest = 0.88;
      const imp = -(1 + rest) * vn * 0.5;
      a.vx -= imp * nx;
      a.vy -= imp * ny;
      a.vz -= imp * nz;
      b.vx += imp * nx;
      b.vy += imp * ny;
      b.vz += imp * nz;
    }
  }
}

function applyBlastToAsteroid(o, cx, cy, cz, diff, depth) {
  const d = dist3(cx, cy, cz, o.x, o.y, o.z) || 1;
  const falloff = clamp(1.2 - d / 130, 0.2, 1);
  o.vx += ((o.x - cx) / d) * 0.38 * falloff;
  o.vy += ((o.y - cy) / d) * 0.18 * falloff;
  o.vz += ((o.z - cz) / d) * 0.38 * falloff;
  if (o.kind === 'balloon') {
    o.hits++;
    o.swell = (o.swell || 1) + 0.22 * falloff;
    syncAsteroidRadius(o);
    if (o.swell >= 2.05 || o.hits >= 4) popBalloonAt(o, diff, true);
    return;
  }
  if (o.kind === 'chain' && depth < 3 && Math.random() < 0.5 * falloff) {
    const idx = asteroids.indexOf(o);
    if (idx >= 0) {
      explodeChainAt(o, diff, depth);
      asteroids.splice(idx, 1);
    }
    return;
  }
  if (o.size <= 1 && Math.random() < 0.6 * falloff) {
    addScore(asteroidScore(o.kind, o.size));
    addParticle(o.x, o.y, o.z, '#ffffff', 8, 2.5);
    const idx = asteroids.indexOf(o);
    if (idx >= 0) asteroids.splice(idx, 1);
  }
}

function explodeChainAt(ast, diff, depth = 0) {
  addScore(asteroidScore(ast.kind, ast.size));
  audio.playExplosion(ast.size);
  addParticle(ast.x, ast.y, ast.z, '#ffaa55', ast.size === 1 ? 16 : 26, ast.size === 1 ? 3.5 : 5);
  addParticle(ast.x, ast.y, ast.z, '#ff6622', 10, 4);
  const R = 78 + ast.size * 30;
  const { x: cx, y: cy, z: cz } = ast;
  for (const o of [...asteroids]) {
    if (o === ast) continue;
    if (dist3(cx, cy, cz, o.x, o.y, o.z) < R + asteroidRadius(o)) {
      applyBlastToAsteroid(o, cx, cy, cz, diff, depth + 1);
    }
  }
}

function popBalloonAt(ast, diff, awardScore = true) {
  if (awardScore) {
    addScore(asteroidScore(ast.kind, ast.size));
    audio.playExplosion(ast.size);
  }
  addParticle(ast.x, ast.y, ast.z, '#ff88cc', 30, 6);
  addParticle(ast.x, ast.y, ast.z, '#ffffff', 14, 3);
  const idx = asteroids.indexOf(ast);
  if (idx >= 0) asteroids.splice(idx, 1);
  for (const o of asteroids) {
    const d = dist3(ast.x, ast.y, ast.z, o.x, o.y, o.z);
    if (d < 65 + asteroidRadius(o)) {
      const inv = 1 / (d || 1);
      o.vx += (o.x - ast.x) * inv * 0.28;
      o.vy += (o.y - ast.y) * inv * 0.12;
      o.vz += (o.z - ast.z) * inv * 0.28;
    }
  }
}

function destroyAsteroidStandard(a, ai, diff) {
  addScore(asteroidScore(a.kind, a.size));
  audio.playExplosion(a.size);
  let children = [];
  if (a.kind === 'comet') children = splitComet(a, diff.speedMul);
  else children = splitAsteroid(a, diff.speedMul);
  addParticle(a.x, a.y, a.z, '#ffffff', a.size === 1 ? 6 : a.size === 2 ? 12 : 18, a.size === 1 ? 2 : 3);
  asteroids.splice(ai, 1);
  asteroids.push(...children);
}

function magnetPulse(ax, ay, az) {
  for (const o of asteroids) {
    const d = dist3(ax, ay, az, o.x, o.y, o.z);
    if (d > 150 || d < 1) continue;
    const pull = 0.22 / d;
    o.vx -= o.x * pull * 0.15;
    o.vy -= o.y * pull * 0.08;
    o.vz -= o.z * pull * 0.15;
  }
}

function handleBulletAsteroidHit(a, ai, diff) {
  if (a.kind === 'balloon') {
    a.hits++;
    a.swell = (a.swell || 1) + 0.13;
    syncAsteroidRadius(a);
    addParticle(a.x, a.y, a.z, '#ffaadd', 5, 1.2);
    if (a.swell >= 2.08 || a.hits >= 6) popBalloonAt(a, diff);
    return;
  }
  if (a.kind === 'chain') {
    explodeChainAt(a, diff);
    asteroids.splice(ai, 1);
    return;
  }
  if (a.kind === 'rubber') {
    addScore(asteroidScore(a.kind, a.size));
    audio.playExplosion(a.size);
    addParticle(a.x, a.y, a.z, '#aaf0ff', 12, 3);
    const children = splitAsteroid(a, diff.speedMul);
    for (const c of children) {
      c.kind = 'rubber';
      c.vx *= 1.3;
      c.vz *= 1.3;
    }
    asteroids.splice(ai, 1);
    asteroids.push(...children);
    return;
  }
  if (a.kind === 'magnet') {
    addScore(asteroidScore(a.kind, a.size));
    audio.playExplosion(a.size);
    addParticle(a.x, a.y, a.z, '#c9a0ff', 18, 4);
    const children = splitAsteroid(a, diff.speedMul);
    asteroids.splice(ai, 1);
    asteroids.push(...children);
    magnetPulse(a.x, a.y, a.z);
    return;
  }
  destroyAsteroidStandard(a, ai, diff);
}

function moveEnvironment() {
  updateUfos();
  for (const a of asteroids) {
    if (a.kind === 'magnet') {
      const d = dist3(a.x, a.y, a.z, 0, 0, 0) || 1;
      if (d < 240) {
        a.vx -= (a.x / d) * 0.007;
        a.vy -= (a.y / d) * 0.0035;
        a.vz -= (a.z / d) * 0.007;
      }
    }
    a.x += a.vx;
    a.y += a.vy;
    a.z += a.vz;
    a.angleY += a.angleVelY;
    a.angleX += a.angleVelX;
    if (a.angleVelZ) a.angleZ = (a.angleZ || 0) + a.angleVelZ;
    wrapObj(a);
  }
  resolveAsteroidCollisions();
  for (const u of ufos) {
    u.x += u.vx;
    u.y += u.vy;
    u.z += u.vz;
    wrapObj(u);
  }
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.px = b.x; b.py = b.y; b.pz = b.z;
    b.x += b.vx;
    b.y += b.vy;
    b.z += b.vz;
    b.life--;
    wrapObj(b);
    if (b.life <= 0) bullets.splice(i, 1);
  }
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    b.px = b.x; b.py = b.y; b.pz = b.z;
    b.x += b.vx;
    b.y += b.vy;
    b.z += b.vz;
    b.life--;
    wrapObj(b);
    if (b.life <= 0) enemyBullets.splice(i, 1);
  }
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.z += p.vz;
    p.life -= 0.04;
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    if (particles[i].life <= 0) particles.splice(i, 1);
  }
  for (const s of stars) {
    s.x += s.vx || 0;
    s.y += s.vy || 0;
    s.z += s.vz || 0;
    const sb = 520;
    if (s.x < -sb) s.x += sb * 2;
    if (s.x > sb) s.x -= sb * 2;
    if (s.y < -sb) s.y += sb * 2;
    if (s.y > sb) s.y -= sb * 2;
    if (s.z < -sb) s.z += sb * 2;
    if (s.z > sb) s.z -= sb * 2;
  }
}

function addScore(points) {
  score += points;
  if (score >= scoreForLife) {
    lives++;
    scoreForLife += 10000;
    livesEl.textContent = lives;
    audio.playExtraLife();
  }
  scoreEl.textContent = score;
}

function checkCollisions() {
  if (!ship || ship.dead) return;
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b = bullets[bi];
    let hit = false;
    for (let ai = asteroids.length - 1; ai >= 0; ai--) {
      const a = asteroids[ai];
      if (dist3(b.x, b.y, b.z, a.x, a.y, a.z) < asteroidRadius(a) + 4) {
        hit = true;
        const diff = getDiff();
        handleBulletAsteroidHit(a, ai, diff);
        bullets.splice(bi, 1);
        break;
      }
    }
    if (hit) continue;
    for (let ui = ufos.length - 1; ui >= 0; ui--) {
      const u = ufos[ui];
      if (dist3(b.x, b.y, b.z, u.x, u.y, u.z) < u.radius + 4) {
        audio.playUfoHit();
        addScore(200);
        addParticle(u.x, u.y, u.z, '#aaff66', 20, 5);
        ufos.splice(ui, 1);
        bullets.splice(bi, 1);
        break;
      }
    }
  }
  if (Date.now() >= invulnUntil) {
    for (const a of asteroids) {
      if (dist3(0, 0, 0, a.x, a.y, a.z) < ship.radius + asteroidRadius(a) * 0.85) {
        dieShip();
        return;
      }
    }
    for (const u of ufos) {
      if (dist3(0, 0, 0, u.x, u.y, u.z) < ship.radius + u.radius * 0.75) {
        dieShip();
        return;
      }
    }
    for (const eb of enemyBullets) {
      if (dist3(0, 0, 0, eb.x, eb.y, eb.z) < ship.radius + 6) {
        dieShip();
        return;
      }
    }
  }
}

function dieShip() {
  ship.dead = true;
  lives--;
  audio.playShipDie();
  audio.playThrustStop();
  addParticle(0, 0, 0, '#fff', 24, 7);
  addParticle(0, 0, 0, '#ff4444', 16, 6);
  scoreEl.textContent = score;
  livesEl.textContent = lives;
  if (lives <= 0) {
    setTimeout(gameOverScreen, 700);
  } else {
    invulnUntil = Date.now() + 2200;
    setTimeout(() => { ship = newShip(); ship.dead = false; }, 1500);
  }
}

function nextLevelIfClear() {
  if (asteroids.length === 0 && ufos.length === 0) {
    level++;
    initLevel(true);
  }
}

function drawStarfield() {
  const w = width / dpr, h = height / dpr;
  const bg = ctx.createRadialGradient(cxCanvas, cyCanvas, w * 0.05, cxCanvas, cyCanvas, w * 0.75);
  bg.addColorStop(0, '#12182a');
  bg.addColorStop(0.55, '#090c14');
  bg.addColorStop(1, '#05070c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  if (frame - starsSortFrame > 24) {
    starsDrawOrder = stars.slice().sort((a, b) => b.z - a.z);
    starsSortFrame = frame;
  }
  for (const s of starsDrawOrder) {
    const p = project(s.x, s.y, s.z);
    if (!p) continue;
    const alpha = 0.2 + 0.55 * (1 - clamp(p.z / 700, 0, 1));
    ctx.fillStyle = `rgba(190,210,245,${alpha})`;
    const sz = 0.7 * p.scale;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, sz, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWireModel3D(projected, edges, rgb) {
  if (projected.every(p => !p)) return;
  ctx.lineCap = 'round';
  for (const [i, j] of edges) {
    const pi = projected[i], pj = projected[j];
    if (!pi || !pj) continue;
    const depth = (pi.z + pj.z) * 0.5;
    const lum = clamp(1.05 - depth / 380, 0.38, 1);
    const lw = Math.max(0.9, (1.1 + lum * 0.9) * ((pi.scale + pj.scale) * 0.45));
    ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.35 + lum * 0.55})`;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(pi.sx, pi.sy);
    ctx.lineTo(pj.sx, pj.sy);
    ctx.stroke();
  }
}

function drawViewportHud() {
  const x = cxCanvas, y = cyCanvas;
  const viewW = width / dpr;
  const viewH = height / dpr;
  const scale = Math.min(viewW, viewH);
  const gap = scale * 0.007;
  const arm = scale * 0.032;
  const r = scale * 0.013;
  const lw = Math.max(2.2, scale * 0.0026);
  ctx.strokeStyle = 'rgba(195, 225, 255, 0.82)';
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.moveTo(x - arm, y);
  ctx.lineTo(x - gap, y);
  ctx.moveTo(x + gap, y);
  ctx.lineTo(x + arm, y);
  ctx.moveTo(x, y - arm);
  ctx.lineTo(x, y - gap);
  ctx.moveTo(x, y + gap);
  ctx.lineTo(x, y + arm);
  ctx.stroke();
}

function drawWarpEffect() {
  if (warpFx.t <= 0) return;
  const w = width / dpr, h = height / dpr;
  const a = warpFx.t / warpFx.duration;
  ctx.fillStyle = `rgba(160, 210, 255, ${0.32 * a})`;
  ctx.fillRect(0, 0, w, h);
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 28; i++) {
    const ang = (i / 28) * Math.PI * 2 + frame * 0.15;
    const len = Math.max(w, h) * (1.1 - a * 0.3);
    ctx.strokeStyle = `rgba(100, 190, 255, ${0.55 * a})`;
    ctx.beginPath();
    ctx.moveTo(cxCanvas, cyCanvas);
    ctx.lineTo(cxCanvas + Math.cos(ang) * len, cyCanvas + Math.sin(ang) * len);
    ctx.stroke();
  }
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.7 * a})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cxCanvas, cyCanvas, 30 + (1 - a) * 120, 0, Math.PI * 2);
  ctx.stroke();
  warpFx.t--;
}

function rotateRockLocal(x, y, z, ay, ax, az) {
  let x1 = x, y1 = y, z1 = z;
  if (az) {
    const cz = Math.cos(az), sz = Math.sin(az);
    const nx = x1 * cz - y1 * sz;
    const ny = x1 * sz + y1 * cz;
    x1 = nx;
    y1 = ny;
  }
  return rotateAsteroidPoint(x1, y1, z1, ay, ax, 0, 0, 0);
}

function projectAsteroid(a) {
  const projected = [];
  const az = a.angleZ || 0;
  const sc = a.swell || 1;
  for (const v of a.wire.verts) {
    const lr = rotateRockLocal(v.x * sc, v.y * sc, v.z * sc, a.angleY, a.angleX, az);
    const wp = { x: lr.x + a.x, y: lr.y + a.y, z: lr.z + a.z };
    projected.push(project(wp.x, wp.y, wp.z));
  }
  return projected;
}

function asteroidViewDepth(a) {
  const p = project(a.x, a.y, a.z);
  return p ? p.z : 0;
}

/** 2D convex hull for screen-space occlusion (Andrew's monotone chain). */
function convexHull2D(projected) {
  const pts = projected.filter(Boolean).map(p => ({ x: p.sx, y: p.sy }));
  if (pts.length < 3) return pts;
  pts.sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, p, q) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function fillAsteroidOcclusion(projected) {
  const vis = projected.filter(Boolean);
  if (vis.length < 3) return;
  const hull = convexHull2D(projected);
  if (hull.length < 3) return;
  const avgZ = vis.reduce((s, p) => s + p.z, 0) / vis.length;
  const t = clamp(1 - avgZ / 480, 0.45, 1);
  const r = Math.floor(11 + 8 * t);
  const g = Math.floor(15 + 10 * t);
  const b = Math.floor(22 + 12 * t);
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.97)`;
  ctx.beginPath();
  ctx.moveTo(hull[0].x, hull[0].y);
  for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i].x, hull[i].y);
  ctx.closePath();
  ctx.fill();
}

function drawAsteroid(a) {
  const projected = projectAsteroid(a);
  if (projected.every(p => !p)) return;
  fillAsteroidOcclusion(projected);
  const rgb = kindColor(a);
  const drawRgb = a.kind === 'balloon'
    ? rgb.map(c => Math.min(255, Math.floor(c * (0.88 + 0.12 * Math.sin(frame * 0.09 + a.hits)))))
    : rgb;
  drawWireModel3D(projected, a.wire.edges, drawRgb);
}

function drawAsteroidsBackToFront() {
  const sorted = asteroids.slice().sort((a, b) => asteroidViewDepth(b) - asteroidViewDepth(a));
  for (const a of sorted) drawAsteroid(a);
}

function drawUfo(u) {
  const projected = UFO_VERTS.map(v => project(v.x + u.x, v.y + u.y, v.z + u.z));
  drawWireModel3D(projected, UFO_EDGES, [150, 230, 130]);
}

function drawMissile(b, enemy = false) {
  const p = project(b.x, b.y, b.z);
  if (!p) return;
  if (b.px !== undefined) {
    const pp = project(b.px, b.py, b.pz);
    if (pp) {
      const g = ctx.createLinearGradient(pp.sx, pp.sy, p.sx, p.sy);
      if (enemy) {
        g.addColorStop(0, 'rgba(255,80,80,0)');
        g.addColorStop(0.5, 'rgba(255,120,100,0.45)');
        g.addColorStop(1, 'rgba(255,180,160,0.9)');
      } else {
        g.addColorStop(0, 'rgba(255,180,60,0)');
        g.addColorStop(0.45, 'rgba(255,210,110,0.55)');
        g.addColorStop(1, 'rgba(255,250,220,0.95)');
      }
      ctx.strokeStyle = g;
      ctx.lineWidth = Math.max(1.5, 3 * p.scale);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pp.sx, pp.sy);
      ctx.lineTo(p.sx, p.sy);
      ctx.stroke();
    }
  }
  ctx.fillStyle = enemy ? 'rgba(255,140,120,0.9)' : 'rgba(255,240,180,0.95)';
  ctx.beginPath();
  ctx.arc(p.sx, p.sy, Math.max(1.8, 2.4 * p.scale), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = enemy ? 'rgba(255,220,210,0.85)' : 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(p.sx, p.sy, Math.max(0.7, 1 * p.scale), 0, Math.PI * 2);
  ctx.fill();
}

function drawParticles() {
  for (const p of particles) {
    const pp = project(p.x, p.y, p.z);
    if (!pp) continue;
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    const r = 1.5 * pp.scale;
    ctx.beginPath();
    ctx.arc(pp.sx, pp.sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  updateCamera();
  const w = width / dpr, h = height / dpr;
  const cockpitOn = state === 'PLAYING';

  if (cockpitOn) {
    ctx.fillStyle = '#04060a';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    applyWindshieldClip(ctx, w, h);
    drawStarfield();
    drawAsteroidsBackToFront();
    for (const u of ufos) drawUfo(u);
    for (const b of bullets) drawMissile(b, false);
    for (const b of enemyBullets) drawMissile(b, true);
    drawParticles();
    drawWarpEffect();
    ctx.restore();
    drawCockpitOverlay(ctx, w, h);
    drawCockpitInstruments(ctx, w, h, {
      score,
      level,
      lives,
      timeLeft: getLevelTimeLeftSec(),
      asteroidCount: asteroids.length,
      asteroids,
      shipYaw: ship.yaw,
      threat: computeThreatLevel(),
      frame,
      musicMuted: audio.musicMuted,
      sfxMuted: audio.sfxMuted,
      radarRange: WORLD.bound * 0.92
    });
    drawViewportHud();
  } else {
    drawStarfield();
    drawAsteroidsBackToFront();
    for (const u of ufos) drawUfo(u);
    for (const b of bullets) drawMissile(b, false);
    for (const b of enemyBullets) drawMissile(b, true);
    drawParticles();
  }
}

function loop() {
  if (state !== 'PLAYING') return;
  if (isGameplayOrientationBlocked()) {
    requestAnimationFrame(loop);
    return;
  }
  const now = performance.now();
  const dt = lastLoopAt ? Math.min(0.05, (now - lastLoopAt) / 1000) : 1 / 60;
  lastLoopAt = now;
  applyLookJoystick(dt);
  frame++;
  if (fireCooldown > 0) fireCooldown--;
  if (hyperspaceCooldown > 0) {
    hyperspaceCooldown--;
    if (hyperspaceCooldown === 0 && padLook) padLook.classList.remove('warp-cool');
  }
  moveEnvironment();
  checkCollisions();
  if (getLevelTimeLeftSec() <= 0) finishLevelByTimer();
  else nextLevelIfClear();
  draw();
  requestAnimationFrame(loop);
}

function initStars() {
  stars = [];
  for (let i = 0; i < 110; i++) {
    stars.push({
      x: rand(-520, 520),
      y: rand(-90, 90),
      z: rand(-520, 520),
      vx: 0, vy: 0,
      vz: rand(-0.08, -0.02)
    });
  }
}
initStars();

goHiScoreEl.textContent = getHiScore();