import { rand, dist3 } from './math3d.js';
import { WORLD, DIFFICULTY } from './world.js';
import { makeSeasonalAsteroidWire } from './skins.js';

export { DIFFICULTY };

const MS = WORLD.modelScale;

/** Faceted rocket — designed for rear-view (nose −Z, tail +Z toward camera). */
const SHIP_RAW = [
  { x: 0, y: 22, z: -22 },
  { x: -5, y: 14, z: -19 },
  { x: 5, y: 14, z: -19 },
  { x: -10, y: 4, z: -14 },
  { x: 10, y: 4, z: -14 },
  { x: 0, y: 8, z: -16 },
  { x: -12, y: -3, z: -6 },
  { x: 12, y: -3, z: -6 },
  { x: 0, y: 2, z: -8 },
  { x: -16, y: 2, z: 10 },
  { x: 16, y: 2, z: 10 },
  { x: 0, y: 14, z: 9 },
  { x: 0, y: -8, z: 13 },
  { x: -19, y: -9, z: 7 },
  { x: 19, y: -9, z: 7 },
  { x: -14, y: -16, z: 13 },
  { x: 14, y: -16, z: 13 },
  { x: -8, y: -13, z: 12 },
  { x: 8, y: -13, z: 12 },
  { x: -6, y: 6, z: 11 },
  { x: 6, y: 6, z: 11 },
  { x: 0, y: 0, z: 6 }
];

export const SHIP_MODEL = SHIP_RAW.map(v => ({
  x: v.x * MS, y: v.y * MS, z: v.z * MS
}));

/** Minimal rear-outline wire (cockpit HUD accent, not full mesh). */
export const SHIP_EDGES = [
  [0, 1], [0, 2], [1, 3], [2, 4], [3, 6], [4, 7], [6, 9], [7, 10],
  [9, 11], [10, 11], [9, 13], [10, 14], [13, 15], [14, 16], [12, 18], [12, 19]
];

/** Wireframe UFO: flat saucer */
export const UFO_VERTS = [];
export const UFO_EDGES = [];
(function buildUfoWire() {
  const segs = 6;
  const r1 = 13 * MS, r2 = 8 * MS, h = 3.5 * MS;
  for (let i = 0; i < segs; i++) {
    const a = (2 * Math.PI * i) / segs;
    UFO_VERTS.push({ x: Math.cos(a) * r1, y: 0, z: Math.sin(a) * r1 });
    UFO_VERTS.push({ x: Math.cos(a) * r2, y: h, z: Math.sin(a) * r2 });
  }
  for (let i = 0; i < segs; i++) {
    const i0 = i * 2, i1 = ((i + 1) % segs) * 2;
    UFO_EDGES.push([i0, i1], [i0 + 1, i1 + 1], [i0, i0 + 1]);
  }
})();

export function newShip() {
  return { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, speed: 0, radius: 8 * MS, dead: false };
}

const ICO_BASE = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  const verts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
  ];
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
  ];
  return { verts, faces };
})();

const ROCK_SHAPES = [
  { sx: 1, sy: 1, sz: 1, bump: 0.92 },
  { sx: 1.45, sy: 0.55, sz: 1.1, bump: 0.88 },
  { sx: 0.75, sy: 1.5, sz: 0.8, bump: 0.9 },
  { sx: 1.15, sy: 1.15, sz: 1.15, bump: 0.75 }
];

function addEdge(edgeSet, a, b) {
  const key = a < b ? `${a},${b}` : `${b},${a}`;
  edgeSet.add(key);
}

/** Irregular triangulated rock wireframe (icosahedron + noise), reference-style. */
export function makeRockWire(baseR) {
  const shape = ROCK_SHAPES[Math.floor(rand(0, ROCK_SHAPES.length))];
  const verts = ICO_BASE.verts.map(([x, y, z]) => {
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    const bump = shape.bump + rand(0, 0.35);
    return {
      x: (x / len) * baseR * bump * shape.sx,
      y: (y / len) * baseR * bump * shape.sy,
      z: (z / len) * baseR * bump * shape.sz
    };
  });

  const edgeSet = new Set();
  for (const [a, b, c] of ICO_BASE.faces) {
    addEdge(edgeSet, a, b);
    addEdge(edgeSet, b, c);
    addEdge(edgeSet, c, a);
  }

  const edges = [...edgeSet].map(k => k.split(',').map(Number));
  let maxR = 0;
  for (const v of verts) {
    maxR = Math.max(maxR, Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z));
  }
  return { verts, edges, boundsR: maxR };
}

/** Classic rock, or seasonal skin mesh when a holiday skin is active. */
export function makeAsteroidWire(baseR) {
  return makeSeasonalAsteroidWire(baseR) || makeRockWire(baseR);
}

/** Visual + behavior ids (logic in game.js). */
export const ASTEROID_KINDS = {
  rock: { color: [120, 195, 105], score: { 1: 100, 2: 50, 3: 20 } },
  chain: { color: [255, 145, 75], score: { 1: 120, 2: 80, 3: 35 } },
  rubber: { color: [90, 215, 255], score: { 1: 110, 2: 60, 3: 25 } },
  balloon: { color: [255, 130, 210], score: { 1: 150, 2: 90, 3: 40 } },
  comet: { color: [175, 210, 255], score: { 1: 130, 2: 70, 3: 30 } },
  magnet: { color: [180, 120, 255], score: { 1: 140, 2: 75, 3: 32 } }
};

const KIND_WEIGHTS = [
  { kind: 'rock', w: 38 },
  { kind: 'chain', w: 14 },
  { kind: 'rubber', w: 14 },
  { kind: 'balloon', w: 12 },
  { kind: 'comet', w: 11 },
  { kind: 'magnet', w: 11 }
];

export function pickAsteroidKind(size) {
  if (size <= 1) return 'rock';
  let t = rand(0, 100);
  for (const { kind, w } of KIND_WEIGHTS) {
    t -= w;
    if (t <= 0) return kind;
  }
  return 'rock';
}

export function asteroidScore(kind, size) {
  const k = ASTEROID_KINDS[kind] || ASTEROID_KINDS.rock;
  return k.score[size] ?? k.score[3] ?? 20;
}

export function spawnAsteroid(size, speedMul, ox, oy, oz, vx, vy, vz, kindHint) {
  let x, y, z;
  if (ox !== undefined) { x = ox; y = oy; z = oz; }
  else {
    const side = Math.floor(rand(0, 6));
    const p = rand(-WORLD.spawnSpread, WORLD.spawnSpread);
    const D = WORLD.spawnDist;
    if (side === 0) { x = -D; y = 0; z = p; }
    else if (side === 1) { x = D; y = 0; z = p; }
    else if (side === 2) { x = p; y = 0; z = -D; }
    else if (side === 3) { x = p; y = 0; z = D; }
    else if (side === 4) { x = p; y = rand(-40, 40); z = rand(-WORLD.spawnSpread, WORLD.spawnSpread); }
    else { x = rand(-WORLD.spawnSpread, WORLD.spawnSpread); y = rand(-40, 40); z = rand(-WORLD.spawnSpread, WORLD.spawnSpread); }
  }
  const drift = WORLD.astDrift * speedMul;
  if (vx === undefined) vx = rand(-1, 1) * (0.12 + size * 0.06) * drift;
  if (vy === undefined) vy = rand(-0.2, 0.2) * size * drift;
  if (vz === undefined) vz = rand(-1, 1) * (0.12 + size * 0.06) * drift;
  if (ox === undefined) {
    const d = dist3(x, y, z, 0, 0, 0) || 1;
    const pull = 0.035 * speedMul;
    vx += (-x / d) * pull;
    vy += (-y / d) * pull * 0.4;
    vz += (-z / d) * pull;
  }
  const kind = kindHint || pickAsteroidKind(size);
  const baseR = size * WORLD.astRadiusPerSize * (kind === 'balloon' ? 0.92 : 1);
  const wire = makeAsteroidWire(baseR);
  let ivx = vx, ivy = vy, ivz = vz;
  if (kind === 'comet') {
    const sp = Math.sqrt(ivx * ivx + ivy * ivy + ivz * ivz) || 0.1;
    const mul = 1.55 / sp;
    ivx *= mul;
    ivy *= mul;
    ivz *= mul;
  }
  const ast = {
    x, y, z,
    vx: ivx, vy: ivy, vz: ivz,
    size,
    kind,
    wire,
    swell: 1,
    hits: 0,
    angleY: rand(0, Math.PI * 2),
    angleX: rand(0, Math.PI * 2),
    angleVelY: rand(-1, 1) * (kind === 'balloon' ? 0.002 : 0.0035),
    angleVelX: rand(-1, 1) * 0.0025,
    angleVelZ: rand(-1, 1) * 0.002,
    radius: wire.boundsR
  };
  return ast;
}

export function splitAsteroid(ast, speedMul) {
  if (ast.size <= 1) return [];
  const s2 = ast.size - 1;
  const childKind = ast.kind === 'comet' ? 'comet' : 'rock';
  return [
    spawnAsteroid(s2, speedMul, ast.x, ast.y, ast.z, ast.vx * 1.15 + rand(-1, 1) * 0.06, ast.vy, ast.vz * 1.15 + rand(-1, 1) * 0.06, childKind),
    spawnAsteroid(s2, speedMul, ast.x, ast.y, ast.z, ast.vx * 1.15 - rand(-1, 1) * 0.06, ast.vy, ast.vz * 1.15 - rand(-1, 1) * 0.06, childKind)
  ];
}

/** Comet shatters into three fast pebbles. */
export function splitComet(ast, speedMul) {
  if (ast.size <= 1) return [];
  const s2 = Math.max(1, ast.size - 1);
  const out = [];
  for (let i = 0; i < 3; i++) {
    const a = rand(0, Math.PI * 2);
    const sp = 0.22 * speedMul;
    out.push(spawnAsteroid(
      s2, speedMul, ast.x, ast.y, ast.z,
      ast.vx + Math.cos(a) * sp, ast.vy + rand(-0.08, 0.08),
      ast.vz + Math.sin(a) * sp, 'comet'
    ));
  }
  return out;
}

export function spawnUfo(speedMul) {
  let x, y, z, tries = 0;
  do {
    x = rand(-WORLD.spawnSpread, WORLD.spawnSpread);
    y = rand(-35, 35);
    z = rand(-WORLD.spawnSpread, WORLD.spawnSpread);
    tries++;
  } while (dist3(x, y, z, 0, 0, 0) < WORLD.minSpawnFromShip && tries < 30);
  return {
    x, y, z,
    vx: rand(-1, 1) * 0.35 * speedMul,
    vy: rand(-0.08, 0.08),
    vz: rand(-1, 1) * 0.35 * speedMul,
    radius: 13 * MS,
    shootCd: rand(40, 120),
    t: 0
  };
}