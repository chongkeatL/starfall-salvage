import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, update, restart } from '../src/game.js';
import { CONFIG } from '../src/entities.js';
import { hashState } from '../scripts/stress-test.js';

const SEED = 12345;
const DT = CONFIG.DT;

const tick = (state, input = {}) => update(state, input, DT);
const types = (events) => events.map((e) => e.type);

function playingGame() {
  const state = createGame({ seed: SEED });
  tick(state, { start: true });
  state.enemies = [];
  state.wave.spawnTimer = 1000; // keep random spawns out of staged scenarios
  return state;
}

function asteroidAt(x, y, overrides = {}) {
  return { id: 900, kind: 'asteroid', x, y, vx: 0, vy: 0, r: 10, hp: 1, size: 1, ...overrides };
}

test('fire cooldown limits shots to one per cooldown', () => {
  const state = playingGame();
  const shotTicks = [];
  for (let i = 0; i < 60; i++) {
    if (types(tick(state, { fire: true })).includes('shot')) shotTicks.push(i);
  }
  assert.equal(shotTicks[0], 0);
  assert.ok(shotTicks.length >= 4 && shotTicks.length <= 5);
  for (let i = 1; i < shotTicks.length; i++) {
    const gap = shotTicks[i] - shotTicks[i - 1];
    assert.ok(gap >= 12 && gap <= 13, `gap was ${gap}`);
  }
});

test('a bullet kills an asteroid and scores once', () => {
  const state = playingGame();
  state.enemies = [asteroidAt(480, 200)];
  state.bullets = [{ id: 901, x: 480, y: 210, vx: 0, vy: 0, r: 3, ttl: 1 }];

  const events = tick(state);
  assert.deepEqual(types(events), ['enemyHit', 'enemyKilled']);
  assert.equal(state.score, CONFIG.score.asteroidKill);
  assert.equal(state.enemies.length, 0);
  assert.equal(state.bullets.length, 0);

  for (let i = 0; i < 10; i++) tick(state);
  assert.equal(state.score, CONFIG.score.asteroidKill);
});

test('a bullet that does not kill only emits enemyHit', () => {
  const state = playingGame();
  state.enemies = [asteroidAt(480, 200, { hp: 2 })];
  state.bullets = [{ id: 901, x: 480, y: 210, vx: 0, vy: 0, r: 3, ttl: 1 }];

  assert.deepEqual(types(tick(state)), ['enemyHit']);
  assert.equal(state.score, 0);
  assert.equal(state.enemies[0].hp, 1);
});

test('player hit then invulnerability', () => {
  const state = playingGame();
  const { x, y } = state.player;
  state.enemies = [asteroidAt(x, y)];

  const events = tick(state);
  assert.deepEqual(types(events), ['playerHit']);
  assert.equal(state.player.hp, CONFIG.player.maxHp - 1);
  assert.ok(state.player.invuln > 0);
  assert.equal(state.enemies.length, 0);
  assert.equal(state.score, 0);

  state.enemies = [asteroidAt(x, y)];
  tick(state);
  assert.equal(state.player.hp, CONFIG.player.maxHp - 1);
  assert.equal(state.enemies.length, 1);
});

test('hp 0 gives gameover with a gameOver event', () => {
  const state = playingGame();
  state.player.hp = 1;
  state.score = 300;
  state.enemies = [asteroidAt(state.player.x, state.player.y)];

  const events = tick(state);
  assert.equal(state.mode, 'gameover');
  assert.deepEqual(types(events), ['playerHit', 'gameOver']);
  assert.deepEqual(events[1], { type: 'gameOver', score: 300, wave: 1 });

  const frozenTime = state.time;
  tick(state);
  assert.equal(state.time, frozenTime);
});

test('ready stays frozen until start', () => {
  const state = createGame({ seed: SEED });
  for (let i = 0; i < 120; i++) tick(state, { moveX: 1, fire: true });
  assert.equal(state.mode, 'ready');
  assert.equal(state.time, 0);
  assert.deepEqual(state, createGame({ seed: SEED }));

  const events = tick(state, { start: true });
  assert.deepEqual(types(events).slice(0, 1), ['started']);
  assert.equal(state.mode, 'playing');
  assert.ok(state.time > 0);
});

test('pause freezes time and resume continues', () => {
  const state = playingGame();
  for (let i = 0; i < 5; i++) tick(state);

  assert.deepEqual(types(tick(state, { pause: true })), ['paused']);
  const frozen = state.time;
  for (let i = 0; i < 10; i++) tick(state, { moveX: 1, fire: true });
  assert.equal(state.mode, 'paused');
  assert.equal(state.time, frozen);

  assert.deepEqual(types(tick(state, { pause: true })).slice(0, 1), ['resumed']);
  assert.equal(state.mode, 'playing');
  assert.ok(state.time > frozen);
});

test('transitions outside the contract table are ignored', () => {
  const state = playingGame();
  assert.ok(!types(tick(state, { start: true })).includes('started'));
  assert.equal(state.mode, 'playing');

  const ready = createGame({ seed: SEED });
  assert.deepEqual(tick(ready, { pause: true }), []);
  assert.equal(ready.mode, 'ready');

  const over = playingGame();
  over.player.hp = 1;
  over.enemies = [asteroidAt(over.player.x, over.player.y)];
  tick(over);
  assert.equal(over.mode, 'gameover');
  assert.deepEqual(tick(over, { pause: true }), []);
  assert.deepEqual(tick(over, { start: true }), []);
  assert.equal(over.mode, 'gameover');
});

function stateInMode(mode) {
  const state = createGame({ seed: SEED });
  if (mode === 'ready') {
    tick(state);
    return state;
  }
  tick(state, { start: true });
  for (let i = 0; i < 90; i++) tick(state, { moveX: 1, fire: true });
  if (mode === 'paused') tick(state, { pause: true });
  if (mode === 'gameover') {
    state.player.hp = 1;
    state.player.invuln = 0;
    state.enemies = [asteroidAt(state.player.x, state.player.y)];
    tick(state);
  }
  return state;
}

for (const mode of ['ready', 'playing', 'paused', 'gameover']) {
  test(`restart from ${mode} deep-equals a fresh game`, () => {
    const state = stateInMode(mode);
    assert.equal(state.mode, mode);
    restart(state);
    assert.deepEqual(state, createGame({ seed: SEED }));
  });
}

test('restart with a new seed deep-equals a fresh game with that seed', () => {
  const state = stateInMode('playing');
  restart(state, 777);
  assert.deepEqual(state, createGame({ seed: 777 }));
});

test('input.restart resets through update and emits reset', () => {
  const state = stateInMode('playing');
  const events = tick(state, { restart: true });
  assert.deepEqual(events, [{ type: 'reset' }]);
  assert.equal(state.mode, 'ready');
  assert.equal(state.time, 0);
  assert.equal(state.score, 0);
});

test('same seed and inputs replay to an identical state', () => {
  const run = () => {
    const state = createGame({ seed: SEED });
    tick(state, { start: true });
    for (let i = 0; i < 600; i++) {
      tick(state, { moveX: Math.sin(i / 20), moveY: Math.cos(i / 35), fire: i % 3 !== 0 });
    }
    return state;
  };
  assert.deepEqual(run(), run());
});

test('diagonal movement is not faster than axis movement', () => {
  const axis = playingGame();
  const diagonal = playingGame();
  const from = { x: axis.player.x, y: axis.player.y };
  for (let i = 0; i < 10; i++) {
    tick(axis, { moveX: 1 });
    tick(diagonal, { moveX: 1, moveY: -1 });
  }
  const axisDist = Math.hypot(axis.player.x - from.x, axis.player.y - from.y);
  const diagDist = Math.hypot(diagonal.player.x - from.x, diagonal.player.y - from.y);
  assert.ok(axisDist > 0);
  assert.ok(Math.abs(axisDist - diagDist) < 1e-9, `axis ${axisDist} vs diagonal ${diagDist}`);
  assert.ok(Math.abs(Math.hypot(diagonal.player.vx, diagonal.player.vy) - CONFIG.player.speed) < 1e-9);
});

test('over-range and invalid movement input never exceeds top speed', () => {
  const inputs = [{ moveX: 5, moveY: 5 }, { moveX: -9, moveY: 3 }, { moveX: NaN, moveY: 1 }, { moveX: Infinity, moveY: -Infinity }];
  for (const input of inputs) {
    const state = playingGame();
    tick(state, input);
    const speed = Math.hypot(state.player.vx, state.player.vy);
    assert.ok(speed <= CONFIG.player.speed + 1e-9, `${JSON.stringify(input)} gave ${speed}`);
  }
});

function replay(state, ticks = 600) {
  const log = [];
  log.push(...tick(state, { start: true }));
  for (let i = 0; i < ticks; i++) {
    log.push(...tick(state, { moveX: Math.sin(i / 20), moveY: Math.cos(i / 35), fire: i % 3 !== 0 }));
  }
  return log;
}

test('replay yields identical event streams and hashes', () => {
  const a = createGame({ seed: SEED });
  const b = createGame({ seed: SEED });
  assert.deepEqual(replay(a), replay(b));
  assert.equal(hashState(a), hashState(b));
});

test('a different seed diverges', () => {
  const a = createGame({ seed: SEED });
  const b = createGame({ seed: SEED + 1 });
  replay(a);
  replay(b);
  assert.notEqual(hashState(a), hashState(b));
});

test('an in-place restart replays like a fresh game', () => {
  const reused = createGame({ seed: SEED });
  replay(reused, 200);
  restart(reused);
  const fresh = createGame({ seed: SEED });
  assert.deepEqual(replay(reused), replay(fresh));
  assert.equal(hashState(reused), hashState(fresh));
});

// Golden value: a characterization of the engine at the time this test was written.
// An engine rule change that moves it must say why in the PR.
test('snapshot hash of a fixed seeded run', () => {
  const state = createGame({ seed: SEED });
  replay(state);
  assert.equal(hashState(state), '585a4117a3eed22b0fd122cbdfc9bc3a75b12ba6cd40032386ca08bb7cb160d9');
});
