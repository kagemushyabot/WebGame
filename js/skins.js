/**
 * Seasonal visual skins. Classic rock meshes stay available; skins only swap visuals.
 *
 * Active window (local date):
 *   thanksgiving — Nov 15 … Dec 7
 *   christmas    — Dec 8 … Jan 6
 * Override: ?skin=classic|thanksgiving|christmas
 */

import { rand } from './math3d.js';
import { WORLD } from './world.js';

const MS = WORLD.modelScale;

export const SKIN_IDS = ['classic', 'thanksgiving', 'christmas'];

function ymdLocal(d = new Date()) {
  return { y: d.getFullYear(), m: d.getMonth() + 1, day: d.getDate() };
}

function inThanksgiving(m, day) {
  return (m === 11 && day >= 15) || (m === 12 && day <= 7);
}

function inChristmas(m, day) {
  return (m === 12 && day >= 8) || (m === 1 && day <= 6);
}

export function resolveSeasonalSkin(now = new Date()) {
  try {
    const q = new URLSearchParams(window.location.search).get('skin');
    if (q && SKIN_IDS.includes(q)) return q;
  } catch { /* no window */ }
  const { m, day } = ymdLocal(now);
  if (inThanksgiving(m, day)) return 'thanksgiving';
  if (inChristmas(m, day)) return 'christmas';
  return 'classic';
}

let activeSkin = resolveSeasonalSkin();

export function getActiveSkin() {
  return activeSkin;
}

export function setActiveSkin(id) {
  if (SKIN_IDS.includes(id)) activeSkin = id;
  return activeSkin;
}

function addEdge(edgeSet, a, b) {
  if (a === b) return;
  const key = a < b ? `${a},${b}` : `${b},${a}`;
  edgeSet.add(key);
}

function finalizeWire(verts, edgeSet) {
  const edges = [...edgeSet].map(k => k.split(',').map(Number));
  let maxR = 0;
  for (const v of verts) {
    maxR = Math.max(maxR, Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z));
  }
  return { verts, edges, boundsR: maxR };
}

/** Wire pumpkin: squat ellipsoid + longitude ribs + stem. */
export function makePumpkinWire(baseR) {
  const verts = [];
  const edgeSet = new Set();
  const rings = 6;
  const segs = 10;
  const sy = 0.78 + rand(0, 0.08);
  const sx = 1.05 + rand(0, 0.12);
  const sz = 1.05 + rand(0, 0.12);

  for (let i = 0; i <= rings; i++) {
    const v = i / rings;
    const lat = Math.PI * (v - 0.5);
    const cy = Math.sin(lat) * baseR * sy;
    const cr = Math.cos(lat) * baseR;
    for (let j = 0; j < segs; j++) {
      const a = (2 * Math.PI * j) / segs;
      const rib = 0.92 + 0.1 * Math.cos(a * 5);
      verts.push({
        x: Math.cos(a) * cr * sx * rib,
        y: cy,
        z: Math.sin(a) * cr * sz * rib
      });
    }
  }

  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * segs + j;
      const b = i * segs + ((j + 1) % segs);
      const c = (i + 1) * segs + j;
      const d = (i + 1) * segs + ((j + 1) % segs);
      addEdge(edgeSet, a, b);
      addEdge(edgeSet, a, c);
      addEdge(edgeSet, c, d);
    }
  }

  const stemBase = verts.length;
  const stemR = baseR * 0.12;
  const stemH = baseR * 0.28;
  const topY = baseR * sy * 0.95;
  for (let j = 0; j < 4; j++) {
    const a = (Math.PI / 2) * j;
    verts.push({ x: Math.cos(a) * stemR, y: topY, z: Math.sin(a) * stemR });
    verts.push({ x: Math.cos(a) * stemR * 0.7, y: topY + stemH, z: Math.sin(a) * stemR * 0.7 });
  }
  for (let j = 0; j < 4; j++) {
    const i0 = stemBase + j * 2;
    const i1 = stemBase + ((j + 1) % 4) * 2;
    addEdge(edgeSet, i0, i1);
    addEdge(edgeSet, i0 + 1, i1 + 1);
    addEdge(edgeSet, i0, i0 + 1);
  }

  return finalizeWire(verts, edgeSet);
}

/** Gift box cube + cross ribbon. */
export function makePresentWire(baseR) {
  const verts = [];
  const edgeSet = new Set();
  const s = baseR * 0.72;
  const h = baseR * 0.62;
  const corners = [
    [-s, -h, -s], [s, -h, -s], [s, -h, s], [-s, -h, s],
    [-s, h, -s], [s, h, -s], [s, h, s], [-s, h, s]
  ];
  for (const [x, y, z] of corners) verts.push({ x, y, z });
  const boxEdges = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7]
  ];
  for (const [a, b] of boxEdges) addEdge(edgeSet, a, b);

  // Vertical ribbon belt
  const br = s * 0.12;
  const ribbon = [
    [-br, -h, -s], [br, -h, -s], [br, h, -s], [-br, h, -s],
    [-br, -h, s], [br, -h, s], [br, h, s], [-br, h, s],
    [-s, -h, -br], [-s, -h, br], [-s, h, br], [-s, h, -br],
    [s, -h, -br], [s, -h, br], [s, h, br], [s, h, -br]
  ];
  const r0 = verts.length;
  for (const [x, y, z] of ribbon) verts.push({ x, y, z });
  for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4],
    [8, 9], [9, 10], [10, 11], [11, 8], [12, 13], [13, 14], [14, 15], [15, 12]]) {
    addEdge(edgeSet, r0 + a, r0 + b);
  }

  // Bow on top
  const bowY = h + baseR * 0.08;
  const bow = [
    [0, bowY, 0],
    [-s * 0.35, bowY + baseR * 0.18, 0],
    [s * 0.35, bowY + baseR * 0.18, 0],
    [0, bowY + baseR * 0.22, -s * 0.25],
    [0, bowY + baseR * 0.22, s * 0.25]
  ];
  const b0 = verts.length;
  for (const [x, y, z] of bow) verts.push({ x, y, z });
  for (const [a, b] of [[0, 1], [0, 2], [0, 3], [0, 4], [1, 3], [2, 4]]) {
    addEdge(edgeSet, b0 + a, b0 + b);
  }

  return finalizeWire(verts, edgeSet);
}

export function makeSeasonalAsteroidWire(baseR, skin = activeSkin) {
  if (skin === 'thanksgiving') return makePumpkinWire(baseR);
  if (skin === 'christmas') return makePresentWire(baseR);
  return null;
}

export function seasonalAsteroidTint(kindRgb, skin = activeSkin) {
  if (skin === 'thanksgiving') {
    return [
      Math.min(255, Math.floor(kindRgb[0] * 0.35 + 220)),
      Math.min(255, Math.floor(kindRgb[1] * 0.4 + 110)),
      Math.min(255, Math.floor(kindRgb[2] * 0.25 + 35))
    ];
  }
  if (skin === 'christmas') {
    return [
      Math.min(255, Math.floor(kindRgb[0] * 0.25 + 210)),
      Math.min(255, Math.floor(kindRgb[1] * 0.35 + 55)),
      Math.min(255, Math.floor(kindRgb[2] * 0.35 + 55))
    ];
  }
  return kindRgb;
}

/** Santa on reindeer sleigh — decorative, non-hostile. */
export function makeSantaSleighWire() {
  const verts = [];
  const edgeSet = new Set();
  const push = (x, y, z) => {
    verts.push({ x: x * MS, y: y * MS, z: z * MS });
    return verts.length - 1;
  };

  // Sled runners + deck
  const deck = [
    push(-10, 0, -8), push(14, 0, -8), push(14, 0, 8), push(-10, 0, 8),
    push(-10, 4, -8), push(14, 4, -8), push(14, 4, 8), push(-10, 4, 8)
  ];
  for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) {
    addEdge(edgeSet, deck[a], deck[b]);
  }
  // Runners
  const runL = [push(-12, -3, -9), push(16, -3, -9), push(-12, 0, -9), push(16, 0, -9)];
  const runR = [push(-12, -3, 9), push(16, -3, 9), push(-12, 0, 9), push(16, 0, 9)];
  for (const r of [runL, runR]) {
    addEdge(edgeSet, r[0], r[1]);
    addEdge(edgeSet, r[0], r[2]);
    addEdge(edgeSet, r[1], r[3]);
  }

  // Santa (simple seated figure)
  const torso = push(2, 10, 0);
  const head = push(2, 16, 0);
  const hat = push(2, 20, 0);
  const armL = push(-2, 11, -5);
  const armR = push(-2, 11, 5);
  addEdge(edgeSet, deck[4], torso);
  addEdge(edgeSet, torso, head);
  addEdge(edgeSet, head, hat);
  addEdge(edgeSet, torso, armL);
  addEdge(edgeSet, torso, armR);

  // Reindeer ahead of sled (−X)
  const neck = push(-22, 8, 0);
  const headR = push(-28, 10, 0);
  const antL = push(-30, 16, -3);
  const antR = push(-30, 16, 3);
  const bodyF = push(-18, 4, 0);
  const leg1 = push(-16, -2, -3);
  const leg2 = push(-16, -2, 3);
  const leg3 = push(-22, -2, -3);
  const leg4 = push(-22, -2, 3);
  addEdge(edgeSet, deck[0], bodyF);
  addEdge(edgeSet, bodyF, neck);
  addEdge(edgeSet, neck, headR);
  addEdge(edgeSet, headR, antL);
  addEdge(edgeSet, headR, antR);
  addEdge(edgeSet, bodyF, leg1);
  addEdge(edgeSet, bodyF, leg2);
  addEdge(edgeSet, neck, leg3);
  addEdge(edgeSet, neck, leg4);

  return finalizeWire(verts, edgeSet);
}

export function spawnSantaSleigh() {
  const wire = makeSantaSleighWire();
  const ang = rand(0, Math.PI * 2);
  const dist = WORLD.spawnDist * 0.55;
  return {
    type: 'santa',
    x: Math.cos(ang) * dist,
    y: rand(-12, 18),
    z: Math.sin(ang) * dist,
    vx: rand(-0.55, 0.55),
    vy: rand(-0.04, 0.04),
    vz: rand(-0.55, 0.55),
    yaw: ang + Math.PI,
    wire,
    radius: wire.boundsR,
    shieldUntil: 0,
    t: 0
  };
}

export function santaActiveForSkin(skin = activeSkin) {
  return skin === 'christmas';
}
