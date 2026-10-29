import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createGame, update } from '../src/game.js';
import { CONFIG } from '../src/entities.js';
import { canonicalize, checkInvariants, hashState, parseArgs, runStress } from '../scripts/stress-test.js';

const SCRIPT = fileURLToPath(new URL('../scripts/stress-test.js', import.meta.url));
const DT = CONFIG.DT;

// A mid-run state with bullets and enemies on screen.
function busyState() {
  const state = createGame({ seed: 4242 });
  update(state, { start: true }, DT);
  for (let i = 0; i < 200; i++) update(state, { moveX: i % 2, fire: true }, DT);
  assert.ok(state.bullets.length > 0 && state.enemies.length > 0, 'fixture needs entities');
  return state;
}

test('checkInvariants accepts a sound state', () => {
  assert.deepEqual(checkInvariants(busyState(), 0), []);
});

const CORRUPTIONS = [
  ['NaN player position', (s) => { s.player.x = NaN; }, /non-finite state\.player\.x/],
  ['Infinity bullet velocity', (s) => { s.bullets[0].vx = Infinity; }, /non-finite state\.bullets\[0\]\.vx/],
  ['unknown mode', (s) => { s.mode = 'limbo'; }, /unknown mode/],
  ['player outside the clamp', (s) => { s.player.x = -1; }, /player x out of world/],
  ['negative hp', (s) => { s.player.hp = -1; }, /player hp out of range/],
  ['hp above max', (s) => { s.player.hp = s.player.maxHp + 1; }, /player hp out of range/],
  ['negative cooldown', (s) => { s.player.cooldown = -0.1; }, /cooldown negative/],
  ['enemy past the cull margin', (s) => { s.enemies[0].y = s.world.h + CONFIG.asteroid.cullMargin + s.enemies[0].r + 1; }, /past cull margin/],
  ['enemy above the spawn line', (s) => { s.enemies[0].y = -s.enemies[0].r - 1; }, /above spawn line/],
  ['enemy with no hp', (s) => { s.enemies[0].hp = 0; }, /hp not positive/],
  ['bullet outside the world', (s) => { s.bullets[0].y = -s.bullets[0].r - 1; }, /outside world/],
  ['bullet ttl expired', (s) => { s.bullets[0].ttl = 0; }, /ttl out of range/],
  ['too many enemies', (s) => { while (s.enemies.length <= CONFIG.waves.maxEnemies) s.enemies.push({ ...s.enemies[0], id: s.nextId++ }); }, /enemy count/],
  ['too many bullets', (s) => { while (s.bullets.length <= CONFIG.bullet.maxAlive) s.bullets.push({ ...s.bullets[0], id: s.nextId++ }); }, /bullet count/],
  ['duplicate ids', (s) => { s.bullets[0].id = s.enemies[0].id; }, /duplicate entity ids/],
  ['id at or above nextId', (s) => { s.bullets[0].id = s.nextId; }, /at or above nextId/],
  ['negative score', (s) => { s.score = -1; }, /score negative/],
];

for (const [name, corrupt, expected] of CORRUPTIONS) {
  test(`checkInvariants detects: ${name}`, () => {
    const state = busyState();
    corrupt(state);
    const found = checkInvariants(state, 0);
    assert.ok(found.some((m) => expected.test(m)), `got ${JSON.stringify(found)}`);
  });
}

test('checkInvariants detects a score decrease', () => {
  const state = busyState();
  state.score = 100;
  assert.ok(checkInvariants(state, 200).some((m) => /score decreased/.test(m)));
  assert.deepEqual(checkInvariants(state, null), []);
});

test('runStress reports the seed and tick of a corrupted state', () => {
  const result = runStress({
    seed: 99,
    ticks: 300,
    mutate: (state, tick) => {
      if (tick === 120) state.player.hp = -1;
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.violation.seed, 99);
  assert.equal(result.violation.tick, 120);
  assert.match(result.violation.message, /player hp out of range/);
});

test('runStress reports a malformed state that makes a check or update throw', () => {
  const broken = runStress({
    seed: 5,
    ticks: 50,
    mutate: (state, tick) => { if (tick === 1) state.player = null; },
  });
  assert.equal(broken.ok, false);
  assert.equal(broken.violation.tick, 1);
  assert.match(broken.violation.message, /threw/);
});

test('bullet cap covers the cooldown and ttl bound', () => {
  const lifeTicks = Math.round(CONFIG.bullet.ttl / DT);
  const minGap = Math.round(CONFIG.player.fireCooldown / DT);
  const bound = Math.floor((lifeTicks - 1) / minGap) + 1;
  assert.ok(CONFIG.bullet.maxAlive >= bound, `maxAlive ${CONFIG.bullet.maxAlive} < bound ${bound}`);
});

test('holding fire from the bottom of the world stays under the bullet cap', () => {
  const state = createGame({ seed: 1 });
  update(state, { start: true }, DT);
  state.wave.spawnTimer = 1000;
  for (let i = 0; i < 600; i++) {
    update(state, { moveY: 1, fire: true }, DT);
    assert.ok(state.bullets.length <= CONFIG.bullet.maxAlive, `tick ${i}: ${state.bullets.length}`);
  }
});

test('the default run is clean and reaches the restart path', () => {
  const result = runStress({ seed: 12345, ticks: 5000 });
  assert.equal(result.ok, true);
  assert.ok(result.restarts > 0);
  assert.ok(result.peakScore > 0, `peakScore was ${result.peakScore}`);
  assert.ok(result.peakEnemies <= CONFIG.waves.maxEnemies);
});

test('same seed gives the same hash and different seeds differ', () => {
  const a = runStress({ seed: 12345, ticks: 1500 });
  const b = runStress({ seed: 12345, ticks: 1500 });
  const c = runStress({ seed: 54321, ticks: 1500 });
  assert.equal(a.hash, b.hash);
  assert.notEqual(a.hash, c.hash);
});

test('canonicalize rounds floats, folds -0, ignores key order, and marks NaN', () => {
  assert.equal(canonicalize({ a: 0.1 + 0.2 }), canonicalize({ a: 0.3 }));
  assert.equal(canonicalize({ a: -0 }), canonicalize({ a: 0 }));
  assert.equal(canonicalize({ a: 1, b: 2 }), canonicalize({ b: 2, a: 1 }));
  assert.notEqual(canonicalize({ a: NaN }), canonicalize({ a: null }));
  assert.notEqual(canonicalize({ a: 1.5 }), canonicalize({ a: 1.6 }));
  assert.equal(hashState({ a: 1 }).length, 64);
});

test('parseArgs applies defaults and accepts both flag forms', () => {
  assert.deepEqual(parseArgs([]), { seed: 12345, ticks: 5000 });
  assert.deepEqual(parseArgs(['--seed', '7', '--ticks=20']), { seed: 7, ticks: 20 });
  assert.equal(parseArgs(['--seed', '4294967295']).seed, 4294967295);
});

const BAD_ARGS = [
  ['unknown flag', ['--bogus', '1']],
  ['missing value', ['--seed']],
  ['non-numeric seed', ['--seed', 'abc']],
  ['negative seed', ['--seed', '-1']],
  ['seed above uint32', ['--seed', '4294967296']],
  ['fractional seed', ['--seed', '1.5']],
  ['zero ticks', ['--ticks', '0']],
  ['negative ticks', ['--ticks', '-5']],
  ['duplicate flag', ['--seed', '1', '--seed', '2']],
  ['stray argument', ['12345']],
];

for (const [name, args] of BAD_ARGS) {
  test(`CLI rejects ${name}`, () => {
    const run = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /^Usage: /m);
  });
}

test('CLI succeeds and prints a hash line', () => {
  const run = spawnSync(process.execPath, [SCRIPT, '--seed', '12345', '--ticks', '500'], { encoding: 'utf8' });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /^hash=[0-9a-f]{64}$/m);
});
