import { nextFloat } from './rng.js';

export const CONFIG = Object.freeze({
  DT: 1 / 60,
  world: Object.freeze({ w: 960, h: 540 }),
  player: Object.freeze({
    radius: 14,
    speed: 260,
    maxHp: 3,
    invuln: 1.5,
    fireCooldown: 0.2,
    spawn: Object.freeze({ x: 0.5, y: 0.8 }), // fractions of the world
  }),
  bullet: Object.freeze({ speed: 600, radius: 3, ttl: 1.2, damage: 1 }),
  asteroid: Object.freeze({
    radiusPerSize: 12,
    hpPerSize: 1,
    speedMin: 60,
    speedMax: 120,
    driftMax: 40,
    cullMargin: 60,
    spawnSize: 2,
  }),
  waves: Object.freeze({ spawnInterval: 1.2, maxEnemies: 8 }),
  score: Object.freeze({ asteroidKill: 100 }),
});

export function createPlayer(world) {
  const { radius, maxHp, spawn } = CONFIG.player;
  return {
    x: world.w * spawn.x,
    y: world.h * spawn.y,
    vx: 0,
    vy: 0,
    r: radius,
    hp: maxHp,
    maxHp,
    cooldown: 0,
    invuln: 0,
  };
}

export function createBullet(id, from, angle) {
  const { speed, radius, ttl } = CONFIG.bullet;
  return {
    id,
    x: from.x,
    y: from.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: radius,
    ttl,
  };
}

// Spawns just above the top edge, drifting down.
export function createAsteroid(id, rng, world, size) {
  const c = CONFIG.asteroid;
  const r = c.radiusPerSize * size;
  return {
    id,
    kind: 'asteroid',
    x: nextFloat(rng) * world.w,
    y: -r,
    vx: (nextFloat(rng) * 2 - 1) * c.driftMax,
    vy: c.speedMin + nextFloat(rng) * (c.speedMax - c.speedMin),
    r,
    hp: c.hpPerSize * size,
    size,
  };
}
