import { makeRngState } from './rng.js';
import { circlesOverlap, findCollisions, clampToWorld } from './collision.js';
import { CONFIG, createPlayer, createBullet, createAsteroid } from './entities.js';

function createInitialState(seed, world) {
  const copy = { w: world.w, h: world.h };
  return {
    seed,
    rng: makeRngState(seed),
    time: 0,
    mode: 'ready',
    world: copy,
    player: createPlayer(copy),
    bullets: [],
    enemies: [],
    salvage: [],
    score: 0,
    salvaged: 0,
    wave: { n: 1, toSpawn: 0, spawnTimer: 0, clearTimer: 0 },
    nextId: 1,
    events: [],
  };
}

export function createGame({ seed, world = CONFIG.world } = {}) {
  return createInitialState(seed, world);
}

// Resets in place so callers holding the state object see the fresh game.
export function restart(state, seed = state.seed) {
  Object.assign(state, createInitialState(seed, state.world));
}

function clampAxis(v) {
  return Math.min(Math.max(v || 0, -1), 1);
}

function normalizeInput(input = {}) {
  return {
    moveX: clampAxis(input.moveX),
    moveY: clampAxis(input.moveY),
    fire: Boolean(input.fire),
    start: Boolean(input.start),
    pause: Boolean(input.pause),
    restart: Boolean(input.restart),
  };
}

export function stepPlayer(state, input, dt) {
  const actions = normalizeInput(input);
  const p = state.player;

  let mx = actions.moveX;
  let my = actions.moveY;
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  p.vx = mx * CONFIG.player.speed;
  p.vy = my * CONFIG.player.speed;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  clampToWorld(p, state.world, p.r);

  p.cooldown = Math.max(0, p.cooldown - dt);
  p.invuln = Math.max(0, p.invuln - dt);

  if (actions.fire && p.cooldown <= 0) {
    state.bullets.push(createBullet(state.nextId++, p, -Math.PI / 2));
    p.cooldown = CONFIG.player.fireCooldown;
    state.events.push({ type: 'shot' });
  }
}

export function stepBullets(state, dt) {
  const { w, h } = state.world;
  for (const b of state.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.ttl -= dt;
  }
  state.bullets = state.bullets.filter(
    (b) => b.ttl > 0 && b.x + b.r >= 0 && b.x - b.r <= w && b.y + b.r >= 0 && b.y - b.r <= h,
  );
}

export function stepEnemies(state, dt) {
  const { w, h } = state.world;
  const m = CONFIG.asteroid.cullMargin;
  for (const e of state.enemies) {
    e.x += e.vx * dt;
    e.y += e.vy * dt;
  }
  state.enemies = state.enemies.filter(
    (e) => e.y - e.r <= h + m && e.x + e.r >= -m && e.x - e.r <= w + m,
  );
}

export function resolveCollisions(state) {
  const spentBullets = new Set();
  const deadEnemies = new Set();

  for (const [bullet, enemy] of findCollisions(state.bullets, state.enemies)) {
    if (spentBullets.has(bullet) || deadEnemies.has(enemy)) continue;
    spentBullets.add(bullet);
    enemy.hp -= CONFIG.bullet.damage;
    state.events.push({ type: 'enemyHit', id: enemy.id });
    if (enemy.hp <= 0) {
      deadEnemies.add(enemy);
      state.score += CONFIG.score.asteroidKill;
      state.events.push({ type: 'enemyKilled', id: enemy.id, kind: enemy.kind, x: enemy.x, y: enemy.y });
    }
  }
  state.bullets = state.bullets.filter((b) => !spentBullets.has(b));
  state.enemies = state.enemies.filter((e) => !deadEnemies.has(e));

  const p = state.player;
  if (p.invuln <= 0) {
    const rammer = state.enemies.find((e) => circlesOverlap(p, e));
    if (rammer) {
      state.enemies = state.enemies.filter((e) => e !== rammer);
      p.hp = Math.max(0, p.hp - 1);
      p.invuln = CONFIG.player.invuln;
      state.events.push({ type: 'playerHit', hp: p.hp });
    }
  }
}

// Salvage drops arrive in a later slice.
export function stepSalvage() {}

export function stepWaves(state, dt) {
  const wave = state.wave;
  wave.spawnTimer -= dt;
  if (wave.spawnTimer <= 0 && state.enemies.length < CONFIG.waves.maxEnemies) {
    state.enemies.push(
      createAsteroid(state.nextId++, state.rng, state.world, CONFIG.asteroid.spawnSize),
    );
    wave.spawnTimer = CONFIG.waves.spawnInterval;
  }
}

export function checkGameOver(state) {
  if (state.mode === 'playing' && state.player.hp <= 0) {
    state.mode = 'gameover';
    state.events.push({ type: 'gameOver', score: state.score, wave: state.wave.n });
  }
}

function applyModeEdges(state, actions) {
  if (actions.start && state.mode === 'ready') {
    state.mode = 'playing';
    state.events.push({ type: 'started' });
  } else if (actions.pause && state.mode === 'playing') {
    state.mode = 'paused';
    state.events.push({ type: 'paused' });
  } else if (actions.pause && state.mode === 'paused') {
    state.mode = 'playing';
    state.events.push({ type: 'resumed' });
  }
}

export function update(state, input, dt) {
  state.events = [];
  const actions = normalizeInput(input);

  if (actions.restart) {
    restart(state);
    state.events.push({ type: 'reset' });
    return state.events;
  }

  applyModeEdges(state, actions);
  if (state.mode !== 'playing') return state.events;

  state.time += dt;
  stepPlayer(state, actions, dt);
  stepBullets(state, dt);
  stepEnemies(state, dt);
  resolveCollisions(state);
  stepSalvage(state, dt);
  stepWaves(state, dt);
  checkGameOver(state);
  return state.events;
}
