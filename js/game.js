import { audio } from './audio.js';
import {
  clamp, rand, dist3, cross, normalize, getForward, rotateAsteroidPoint
} from './math3d.js';
import {
  DIFFICULTY, UFO_VERTS, UFO_EDGES,
  newShip, spawnAsteroid, splitAsteroid, spawnUfo
} from './entities.js';
import { WORLD } from './world.js';
import { applyWindshieldClip, drawCockpitOverlay } from './cockpit.js';
import {
  isPortraitBlocked,
  isGameplayOrientationBlocked,
  setupOrientationGate,
  requestGameFullscreen,
  exitGameFullscreen
} from './mobile.js';

const HI_SCORE_KEY = 'asteroids3d_hi';

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
const btnMute = document.getElementById('btnMute');
const btnQuit = document.getElementById('btnQuit');
const padLook = document.getElementById('padLook');
const padFire = document.getElementById('padFire');
const levelFlash = document.getElementById('levelFlash');
const pauseHint = document.getElementById('pauseHint');
const gameContainer = document.getElementById('game-container');
const orientationLock = document.getElementById('orientationLock');

setupOrientationGate(orientationLock);

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
window.addEventListener('resize', resize);
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

function beginLook(clientX, clientY, pointerId) {
  if (state !== 'PLAYING') return;
  lookPtr = {
    id: pointerId,
    sx: clientX,
    sy: clientY,
    yaw0: ship.yaw,
    pitch0: ship.pitch,
    moved: false,
    t0: Date.now()
  };
  padLook.classList.add('active');
}

function moveLook(clientX, clientY, pointerId) {
  if (!lookPtr || lookPtr.id !== pointerId || state !== 'PLAYING') return;
  const dx = clientX - lookPtr.sx;
  const dy = clientY - lookPtr.sy;
  if (Math.abs(dx) + Math.abs(dy) > 8) lookPtr.moved = true;
  ship.yaw = lookPtr.yaw0 + dx * 0.005;
  ship.pitch = clamp(lookPtr.pitch0 + dy * 0.004, -1.2, 1.2);
}

function endLook(pointerId) {
  if (!lookPtr || lookPtr.id !== pointerId) return;
  if (!lookPtr.moved && Date.now() - lookPtr.t0 < 320) tryHyperspace();
  lookPtr = null;
  padLook.classList.remove('active');
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
btnQuit?.addEventListener('click', () => exitToMenu());
btnMute.addEventListener('click', () => {
  audio.setMute(!audio.muted);
  btnMute.textContent = audio.muted ? '🔇' : '🔊';
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

function initLevel(clearFlash = false) {
  ship = newShip();
  bullets = [];
  enemyBullets = [];
  asteroids = [];
  particles = [];
  invulnUntil = 0;
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
  requestGameFullscreen(gameContainer);
  readDifficulty();
  audio.init();
  audio.resume();
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
  loop();
}

function gameOverScreen() {
  state = 'GAMEOVER';
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

function moveEnvironment() {
  updateUfos();
  for (const a of asteroids) {
    a.x += a.vx;
    a.y += a.vy;
    a.z += a.vz;
    a.angleY += a.angleVelY;
    a.angleX += a.angleVelX;
    if (a.angleVelZ) a.angleZ = (a.angleZ || 0) + a.angleVelZ;
    wrapObj(a);
  }
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
      if (dist3(b.x, b.y, b.z, a.x, a.y, a.z) < a.radius + 4) {
        hit = true;
        audio.playExplosion(a.size);
        addScore(a.size === 1 ? 100 : a.size === 2 ? 50 : 20);
        const diff = getDiff();
        const children = splitAsteroid(a, diff.speedMul);
        asteroids.splice(ai, 1);
        asteroids.push(...children);
        addParticle(a.x, a.y, a.z, '#fff', a.size === 1 ? 6 : a.size === 2 ? 12 : 18, a.size === 1 ? 2 : a.size === 2 ? 3 : 4);
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
      if (dist3(0, 0, 0, a.x, a.y, a.z) < ship.radius + a.radius * 0.85) {
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
  ctx.strokeStyle = 'rgba(140,175,220,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.moveTo(x - 14, y); ctx.lineTo(x - 6, y);
  ctx.moveTo(x + 6, y); ctx.lineTo(x + 14, y);
  ctx.moveTo(x, y - 14); ctx.lineTo(x, y - 6);
  ctx.moveTo(x, y + 6); ctx.lineTo(x, y + 14);
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
  for (const v of a.wire.verts) {
    const lr = rotateRockLocal(v.x, v.y, v.z, a.angleY, a.angleX, az);
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
  drawWireModel3D(projected, a.wire.edges, [120, 195, 105]);
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
  frame++;
  if (fireCooldown > 0) fireCooldown--;
  if (hyperspaceCooldown > 0) {
    hyperspaceCooldown--;
    if (hyperspaceCooldown === 0 && padLook) padLook.classList.remove('warp-cool');
  }
  moveEnvironment();
  checkCollisions();
  nextLevelIfClear();
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