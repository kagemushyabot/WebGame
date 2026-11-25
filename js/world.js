/** Shared world scale, speeds, and 3D viewport tuning (not arcade-style). */
export const WORLD = {
  modelScale: 0.55,
  bound: 280,
  yBound: 72,
  spawnDist: 290,
  spawnSpread: 240,
  minSpawnFromShip: 165,
  camDist: 82,
  focal: 480,
  bulletSpeed: 3.6,
  bulletLife: 100,
  fireCooldown: 20,
  astRadiusPerSize: 7.5,
  astDrift: 0.14,
  enemyBulletSpeed: 2.8
};

export const DIFFICULTY = {
  easy: { speedMul: 0.7, baseCount: 4, maxSpeed: 3.8, hazardChance: 0.05, acc: 0.1 },
  normal: { speedMul: 0.85, baseCount: 6, maxSpeed: 3.2, hazardChance: 0.12, acc: 0.09 },
  hard: { speedMul: 1, baseCount: 7, maxSpeed: 2.8, hazardChance: 0.2, acc: 0.08 }
};