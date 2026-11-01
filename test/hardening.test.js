import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, update, restart } from '../src/game.js';
import { CONFIG } from '../src/entities.js';

const SEED = 12345;
const DT = CONFIG.DT;
const tick = (state, input = {}) => update(state, input, DT);
const types = (events) => events.map((e) => e.type);

function playingGame() {
  const state = createGame({ seed: SEED });
  tick(state, { start: true });
  state.enemies = [];
  state.wave.spawnTimer = 1000; // no random spawns in staged scenarios
  return state;
}

const rock = (x, y, overrides = {}) => ({ id: 900, kind: 'asteroid', x, y, vx: 0, vy: 0, r: 10, hp: 1, size: 1, ...overrides });
const slug = (id, x, y) => ({ id, x, y, vx: 0, vy: 0, r: 3, ttl: 1 });

// Collision boundaries: touching counts, a hair beyond does not.
test('bullet touching an enemy edge hits; a hair beyond misses', () => {
  const touching = playingGame();
  touching.enemies = [rock(480, 200)];
  touching.bullets = [slug(901, 480 + 13, 200)];
  assert.ok(types(tick(touching)).includes('enemyKilled'));

  const apart = playingGame();
  apart.enemies = [rock(480, 200)];
  apart.bullets = [slug(901, 480 + 13.001, 200)];
  assert.deepEqual(types(tick(apart)), []);
  assert.equal(apart.bullets.length, 1);
});

test('player touching an enemy edge is hit; a hair beyond is not', () => {
  const reach = CONFIG.player.radius + 10;
  const touching = playingGame();
  touching.enemies = [rock(touching.player.x + reach, touching.player.y)];
  assert.deepEqual(types(tick(touching)), ['playerHit']);

  const apart = playingGame();
  apart.enemies = [rock(apart.player.x + reach + 0.001, apart.player.y)];
  assert.deepEqual(types(tick(apart)), []);
  assert.equal(apart.player.hp, CONFIG.player.maxHp);
});

test('a bullet whose edge is exactly on the world edge is kept; beyond it is culled', () => {
  const state = playingGame();
  state.bullets = [slug(901, -3, 100), slug(902, -3.001, 100), slug(903, 960 + 3, 100), slug(904, 960 + 3.001, 100)];
  tick(state);
  assert.deepEqual(state.bullets.map((b) => b.id), [901, 903]);
});

test('one bullet over two stacked enemies kills only one', () => {
  const state = playingGame();
  state.enemies = [rock(480, 200, { id: 900 }), rock(480, 200, { id: 901 })];
  state.bullets = [slug(902, 480, 200)];
  tick(state);
  assert.equal(state.score, CONFIG.score.asteroidKill);
  assert.equal(state.enemies.length, 1);
  assert.equal(state.bullets.length, 0);
});

test('two bullets on a one-hp enemy score once and the second bullet survives', () => {
  const state = playingGame();
  state.enemies = [rock(480, 200)];
  state.bullets = [slug(901, 480, 200), slug(902, 480, 200)];
  tick(state);
  assert.equal(state.score, CONFIG.score.asteroidKill);
  assert.equal(state.bullets.length, 1);
});

// Mode edges that arrive together in one update.
test('start and pause together in ready start the game and ignore the pause', () => {
  const state = createGame({ seed: SEED });
  const events = tick(state, { start: true, pause: true });
  assert.equal(state.mode, 'playing');
  assert.equal(types(events)[0], 'started');
  assert.ok(!types(events).includes('paused'));
});

for (const mode of ['ready', 'playing', 'paused', 'gameover']) {
  test(`restart wins over pause and start arriving in the same update (from ${mode})`, () => {
    const state = createGame({ seed: SEED });
    if (mode !== 'ready') tick(state, { start: true });
    if (mode === 'paused') tick(state, { pause: true });
    if (mode === 'gameover') {
      state.player.hp = 1;
      state.enemies = [rock(state.player.x, state.player.y)];
      tick(state);
    }
    assert.equal(state.mode, mode);
    const events = tick(state, { restart: true, pause: true, start: true });
    assert.deepEqual(events, [{ type: 'reset' }]);
    assert.deepEqual({ ...state, events: [] }, createGame({ seed: SEED }));
  });
}

// Restart bookkeeping.
test('restart keeps the object identity, clears ids and wave, and keeps a new seed', () => {
  const state = playingGame();
  for (let i = 0; i < 100; i++) tick(state, { fire: true });
  const same = state;
  restart(state, 777);
  assert.equal(same, state);
  assert.equal(state.nextId, 1);
  assert.deepEqual(state.wave, createGame({ seed: 777 }).wave);

  tick(state, { start: true });
  tick(state, { restart: true });
  assert.deepEqual({ ...state, events: [] }, createGame({ seed: 777 }));
});

test('pause does not advance the fire cooldown or invulnerability timers', () => {
  const state = playingGame();
  tick(state, { fire: true });
  state.player.invuln = 1;
  const { cooldown, invuln } = state.player;
  tick(state, { pause: true });
  for (let i = 0; i < 30; i++) tick(state, { fire: true });
  assert.equal(state.player.cooldown, cooldown);
  assert.equal(state.player.invuln, invuln);
  assert.equal(state.bullets.length, 1);
});
