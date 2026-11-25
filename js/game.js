import { audio } from './audio.js';
import {
  clamp, rand, dist3, cross, normalize, getForward, rotatePoint, rotateAsteroidPoint
} from './math3d.js';
import {
  DIFFICULTY, SHIP_MODEL, SHIP_EDGES, UFO_VERTS, UFO_EDGES,
  newShip, spawnAsteroid, splitAsteroid, spawnUfo
} from './entities.js';
import { WORLD } from './world.js';

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
const btnThrust = document.getElementById('btnThrust');
const btnHyperspace = document.getElementById('btnHyperspace');
const levelFlash = document.getElementById('levelFlash');

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

let mouseYaw = 0, mousePitch = 0;
window.addEventListener('mousemove', e => {
  if (state !== 'PLAYING') return;
  const mx = (e.clientX / window.innerWidth - 0.5) * 2;
  const my = (e.clientY / window.innerHeight - 0.5) * 2;
  mouseYaw = mx * 0.8;
  mousePitch = -my * 0.6;
});

let ship = newShip();
let camX = 0, camY = 0, camZ = 0;
let camRight = [1, 0, 0], camUp = [0, 1, 0], camForward = [0, 0, -1];

function updateCamera() {
  const yaw = ship.yaw + mouseYaw;
  const pitch = clamp(ship.pitch + mousePitch, -1.2, 1.2);
  const f = getForward(yaw, pitch);
  const dist = WORLD.camDist;
  camX = -f[0] * dist;
  camY = -f[1] * dist + 12 * WORLD.modelScale;
  camZ = -f[2] * dist;
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
let thrustKeyDown = false;
let thrustTouchDown = false;
let starsDrawOrder = [];
let starsSortFrame = -999;

function isThrusting() {
  return thrustKeyDown || thrustTouchDown || keys['KeyW'] || keys['ArrowUp'];
}

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
  if (state === 'START' && (e.code === 'Enter' || e.code === 'Space')) { startGame(); return; }
  if (state === 'GAMEOVER' && e.code === 'Enter') { resetGame(); return; }
  if (e.code === 'KeyW' || e.code === 'ArrowUp') thrustKeyDown = true;
  if (state === 'PLAYING' && (e.code === 'KeyH' || e.code === 'ShiftLeft' || e.code === 'ShiftRight')) {
    tryHyperspace();
  }
}
function keyup(e) {
  keys[e.code] = false;
  if (e.code === 'KeyW' || e.code === 'ArrowUp') thrustKeyDown = false;
}
window.addEventListener('keydown', keydown);
window.addEventListener('keyup', keyup);

function handlePointerDown(e) {
  if (state !== 'PLAYING') return;
  if (e.target.closest('button')) return;
  shoot();
}
canvas.addEventListener('touchstart', e => { e.preventDefault(); handlePointerDown(e); }, { passive: false });
canvas.addEventListener('mousedown', handlePointerDown);

function bindHoldButton(btn, onDown, onUp) {
  if (!btn) return;
  const down = e => { e.preventDefault(); onDown(); btn.classList.add('active'); };
  const up = () => { onUp(); btn.classList.remove('active'); };
  btn.addEventListener('pointerdown', down);
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointerleave', up);
  btn.addEventListener('pointercancel', up);
}
bindHoldButton(btnThrust, () => { thrustTouchDown = true; }, () => { thrustTouchDown = false; });
btnHyperspace?.addEventListener('click', e => {
  e.preventDefault();
  tryHyperspace();
});

btnRecenter.addEventListener('click', () => {
  if (gyroActive) { baseBeta = beta; baseGamma = gamma; baselineCaptured = true; }
  mouseYaw = 0;
  mousePitch = 0;
});
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
  gameOver.classList.add('hidden');
  gyroActive = false;
  baseBeta = 0;
  baseGamma = 0;
  baselineCaptured = false;
  mouseYaw = 0;
  mousePitch = 0;
  requestIOS();
  initLevel(false);
  frame = 0;
  loop();
}

function gameOverScreen() {
  state = 'GAMEOVER';
  saveHiScore();
  goScoreEl.textContent = score;
  goHiScoreEl.textContent = Math.max(score, getHiScore());
  gameOver.classList.remove('hidden');
}
function resetGame() { startGame(); }

function shoot() {
  if (fireCooldown > 0 || ship.dead) return;
  const f = getForward(ship.yaw, ship.pitch);
  const spd = WORLD.bulletSpeed;
  const m = ship.radius + 3 * WORLD.modelScale;
  bullets.push({
    x: f[0] * m, y: f[1] * m, z: f[2] * m,
    vx: f[0] * spd, vy: f[1] * spd, vz: f[2] * spd,
    life: WORLD.bulletLife,
    px: f[0] * m, py: f[1] * m, pz: f[2] * m
  });
  fireCooldown = WORLD.fireCooldown;
  audio.playFire();
}

function tryHyperspace() {
  if (state !== 'PLAYING' || ship.dead || hyperspaceCooldown > 0) return;
  hyperspaceCooldown = 180;
  if (btnHyperspace) btnHyperspace.disabled = true;
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
  ship.speed = 0;
  invulnUntil = Date.now() + 1600;
  addParticle(0, 0, 0, '#3c78ff', 24, 6);
  audio.playHyperspace();
}

function updateShip() {
  const diff = getDiff();
  const acc = diff.acc, friction = 0.982, maxSpeed = diff.maxSpeed;
  if (isThrusting()) {
    ship.speed = Math.min(ship.speed + acc, maxSpeed);
    audio.playThrustStart();
  } else {
    ship.speed = Math.max(ship.speed - acc * 1.5, 0);
    audio.playThrustStop();
  }
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
  const f = getForward(ship.yaw, ship.pitch);
  const mv = ship.speed;
  updateUfos();
  for (const a of asteroids) {
    a.x -= f[0] * mv + a.vx;
    a.y -= f[1] * mv + a.vy;
    a.z -= f[2] * mv + a.vz;
    a.angleY += a.angleVelY;
    a.angleX += a.angleVelX;
    if (a.angleVelZ) a.angleZ = (a.angleZ || 0) + a.angleVelZ;
    wrapObj(a);
  }
  for (const u of ufos) {
    u.x -= f[0] * mv + u.vx;
    u.y -= f[1] * mv + u.vy;
    u.z -= f[2] * mv + u.vz;
    wrapObj(u);
  }
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.px = b.x; b.py = b.y; b.pz = b.z;
    b.x -= f[0] * mv + b.vx;
    b.y -= f[1] * mv + b.vy;
    b.z -= f[2] * mv + b.vz;
    b.life--;
    wrapObj(b);
    if (b.life <= 0) bullets.splice(i, 1);
  }
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    b.px = b.x; b.py = b.y; b.pz = b.z;
    b.x -= f[0] * mv + b.vx;
    b.y -= f[1] * mv + b.vy;
    b.z -= f[2] * mv + b.vz;
    b.life--;
    wrapObj(b);
    if (b.life <= 0) enemyBullets.splice(i, 1);
  }
  for (const p of particles) {
    p.x -= f[0] * mv + p.vx;
    p.y -= f[1] * mv + p.vy;
    p.z -= f[2] * mv + p.vz;
    p.life -= 0.04;
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    if (particles[i].life <= 0) particles.splice(i, 1);
  }
    const sb = 520;
  for (const s of stars) {
    s.x -= f[0] * mv * 0.6;
    s.y -= f[1] * mv * 0.6;
    s.z -= f[2] * mv * 0.6;
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

function drawVolumeHint(projected, rgbaCore, rgbaEdge) {
  const pts = projected.filter(Boolean);
  if (!pts.length) return;
  let sx = 0, sy = 0, sc = 0;
  for (const p of pts) { sx += p.sx; sy += p.sy; sc += p.scale; }
  const n = pts.length;
  sx /= n; sy /= n;
  const r = 6 + 5 * (sc / n);
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
  g.addColorStop(0, rgbaCore);
  g.addColorStop(1, rgbaEdge);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();
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
  ctx.strokeStyle = 'rgba(140,175,220,0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.moveTo(x - 16, y); ctx.lineTo(x - 7, y);
  ctx.moveTo(x + 7, y); ctx.lineTo(x + 16, y);
  ctx.moveTo(x, y - 16); ctx.lineTo(x, y - 7);
  ctx.moveTo(x, y + 7); ctx.lineTo(x, y + 16);
  ctx.stroke();
}

function drawShip() {
  if (!ship || ship.dead) return;
  if (Date.now() < invulnUntil && Math.floor(Date.now() / 80) % 2 === 0) return;

  const projected = [];
  for (const v of SHIP_MODEL) {
    const rp = rotatePoint(v.x, v.y, v.z, ship.yaw, ship.pitch, 0, 0, 0);
    projected.push(project(rp.x, rp.y, rp.z));
  }
  if (projected.every(p => !p)) return;

  drawVolumeHint(projected, 'rgba(70,100,160,0.22)', 'rgba(20,30,50,0)');
  drawWireModel3D(projected, SHIP_EDGES, [180, 210, 255]);

  if (isThrusting() && ship.speed > 0.15) {
    const ms = WORLD.modelScale;
    const fl = (8 + Math.random() * 6) * ms;
    const nz = (7 + fl);
    const f1 = rotatePoint(0, -7 * ms, nz, ship.yaw, ship.pitch, 0, 0, 0);
    const f2 = rotatePoint(-8 * ms, -10 * ms, nz - 2 * ms, ship.yaw, ship.pitch, 0, 0, 0);
    const f3 = rotatePoint(8 * ms, -10 * ms, nz - 2 * ms, ship.yaw, ship.pitch, 0, 0, 0);
    const pf1 = project(f1.x, f1.y, f1.z);
    const pf2 = project(f2.x, f2.y, f2.z);
    const pf3 = project(f3.x, f3.y, f3.z);
    if (pf1 && pf2 && pf3) {
      const grad = ctx.createLinearGradient(0, 0, pf1.sx, pf1.sy);
      grad.addColorStop(0, 'rgba(255,90,20,0.9)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(pf2.sx, pf2.sy);
      ctx.lineTo(pf1.sx, pf1.sy);
      ctx.lineTo(pf3.sx, pf3.sy);
      ctx.fill();
    }
  }
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

function drawAsteroid(a) {
  const projected = [];
  const az = a.angleZ || 0;
  for (const v of a.wire.verts) {
    const lr = rotateRockLocal(v.x, v.y, v.z, a.angleY, a.angleX, az);
    const rp = { x: lr.x + a.x, y: lr.y + a.y, z: lr.z + a.z };
    projected.push(project(rp.x, rp.y, rp.z));
  }
  drawVolumeHint(projected, 'rgba(45,60,40,0.35)', 'rgba(10,15,10,0)');
  drawWireModel3D(projected, a.wire.edges, [120, 195, 105]);
}

function drawUfo(u) {
  const projected = UFO_VERTS.map(v => project(v.x + u.x, v.y + u.y, v.z + u.z));
  drawVolumeHint(projected, 'rgba(60,90,50,0.25)', 'rgba(0,0,0,0)');
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
  drawStarfield();
  for (const a of asteroids) drawAsteroid(a);
  for (const u of ufos) drawUfo(u);
  drawShip();
  for (const b of bullets) drawMissile(b, false);
  for (const b of enemyBullets) drawMissile(b, true);
  drawParticles();
  if (state === 'PLAYING') drawViewportHud();
}

function loop() {
  if (state !== 'PLAYING') return;
  frame++;
  if (fireCooldown > 0) fireCooldown--;
  if (hyperspaceCooldown > 0) {
    hyperspaceCooldown--;
    if (hyperspaceCooldown === 0 && btnHyperspace) btnHyperspace.disabled = false;
  }
  applyGyroToShip();
  updateShip();
  moveEnvironment();
  checkCollisions();
  nextLevelIfClear();
  draw();
  requestAnimationFrame(loop);
}

function initStars() {
  stars = [];
  for (let i = 0; i < 110; i++) {
    stars.push({ x: rand(-520, 520), y: rand(-90, 90), z: rand(-520, 520) });
  }
}
initStars();

goHiScoreEl.textContent = getHiScore();