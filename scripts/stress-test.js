// Seeded stress harness: a bot drives the engine and every tick is checked against the
// invariants below. Usage: node scripts/stress-test.js [--seed N] [--ticks N]
// Note: `node --test` auto-discovers *-test.js, so `npm test` also runs this file
// with default arguments.
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { CONFIG } from '../src/entities.js';
import { createGame, update } from '../src/game.js';
import { makeRngState, nextFloat, nextInt } from '../src/rng.js';

const USAGE = 'Usage: node scripts/stress-test.js [--seed N] [--ticks N]';
const DEFAULTS = { seed: 12345, ticks: 5000 };
const MAX_SEED = 0xffffffff;
const MAX_TICKS = 10_000_000;
const MODES = ['ready', 'playing', 'paused', 'gameover'];
const HASH_DECIMALS = 1e6;

export function parseArgs(argv) {
  const out = { ...DEFAULTS };
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.indexOf('=');
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    const value = eq === -1 ? argv[++i] : arg.slice(eq + 1);
    if ((flag !== '--seed' && flag !== '--ticks') || seen.has(flag)) throw new Error(USAGE);
    if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error(USAGE);
    const n = Number(value);
    if (flag === '--seed' && n > MAX_SEED) throw new Error(USAGE);
    if (flag === '--ticks' && (n < 1 || n > MAX_TICKS)) throw new Error(USAGE);
    seen.add(flag);
    out[flag.slice(2)] = n;
  }
  return out;
}

// Stable text form of a state: sorted keys, floats rounded, -0 folded to 0.
export function canonicalize(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) > 1e15) return String(value);
    const rounded = Math.round(value * HASH_DECIMALS) / HASH_DECIMALS;
    return String(rounded === 0 ? 0 : rounded);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    const body = Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`);
    return `{${body.join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashState(state) {
  return createHash('sha256').update(canonicalize(state)).digest('hex');
}

function forEachNumber(value, path, visit) {
  if (typeof value === 'number') visit(path, value);
  else if (Array.isArray(value)) value.forEach((v, i) => forEachNumber(v, `${path}[${i}]`, visit));
  else if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) forEachNumber(value[k], `${path}.${k}`, visit);
  }
}

// Returns a list of violation messages; empty means the state is sound.
// prevScore is the score after the previous tick of the same run, or null after a reset.
export function checkInvariants(state, prevScore = null) {
  const bad = [];
  // Written as `ensure(!(bad))` style so NaN fails every comparison.
  const ensure = (ok, message) => {
    if (!ok) bad.push(message);
  };

  forEachNumber(state, 'state', (path, n) => ensure(Number.isFinite(n), `non-finite ${path}`));
  ensure(MODES.includes(state.mode), `unknown mode ${state.mode}`);

  const { w, h } = state.world;
  const p = state.player;
  ensure(p.x >= p.r && p.x <= w - p.r, `player x out of world: ${p.x}`);
  ensure(p.y >= p.r && p.y <= h - p.r, `player y out of world: ${p.y}`);
  ensure(p.hp >= 0 && p.hp <= p.maxHp, `player hp out of range: ${p.hp}`);
  ensure(p.cooldown >= 0, `player cooldown negative: ${p.cooldown}`);
  ensure(p.invuln >= 0 && p.invuln <= CONFIG.player.invuln, `player invuln out of range: ${p.invuln}`);

  const m = CONFIG.asteroid.cullMargin;
  for (const e of state.enemies) {
    ensure(e.y - e.r <= h + m && e.x + e.r >= -m && e.x - e.r <= w + m, `enemy ${e.id} past cull margin`);
    ensure(e.y >= -e.r, `enemy ${e.id} above spawn line: y=${e.y}`);
    ensure(e.hp > 0, `enemy ${e.id} hp not positive: ${e.hp}`);
  }
  for (const b of state.bullets) {
    ensure(b.x + b.r >= 0 && b.x - b.r <= w && b.y + b.r >= 0 && b.y - b.r <= h, `bullet ${b.id} outside world`);
    ensure(b.ttl > 0 && b.ttl <= CONFIG.bullet.ttl, `bullet ${b.id} ttl out of range: ${b.ttl}`);
  }

  ensure(state.enemies.length <= CONFIG.waves.maxEnemies, `enemy count ${state.enemies.length} over cap`);
  ensure(state.bullets.length <= CONFIG.bullet.maxAlive, `bullet count ${state.bullets.length} over cap`);
  ensure(Array.isArray(state.salvage), 'salvage is not an array');

  const ids = [...state.bullets, ...state.enemies].map((e) => e.id);
  ensure(new Set(ids).size === ids.length, 'duplicate entity ids');
  ensure(ids.every((id) => id < state.nextId), 'entity id at or above nextId');

  ensure(state.score >= 0, `score negative: ${state.score}`);
  if (prevScore !== null) ensure(state.score >= prevScore, `score decreased: ${prevScore} -> ${state.score}`);
  return bad;
}

// Uses its own RNG so the engine's stream is never touched.
function createBot(seed) {
  const rng = makeRngState((seed ^ 0x9e3779b9) >>> 0);
  let hold = 0;
  let held = { moveX: 0, moveY: 0, fire: false };
  return {
    next(state) {
      if (state.mode === 'ready') return { start: true };
      if (state.mode === 'gameover') return { restart: true };
      if (hold <= 0) {
        held = { moveX: nextInt(rng, -1, 1), moveY: nextInt(rng, -1, 1), fire: nextFloat(rng) < 0.8 };
        hold = nextInt(rng, 5, 30);
      }
      hold--;
      return { ...held };
    },
  };
}

// mutate(state, tick) is a test seam: it runs after update and before the checks.
export function runStress({ seed = DEFAULTS.seed, ticks = DEFAULTS.ticks, mutate } = {}) {
  const state = createGame({ seed });
  const bot = createBot(seed);
  const stats = { restarts: 0, peakEnemies: 0, peakBullets: 0, peakScore: 0 };
  let prevScore = null;

  const violation = (tick, message) => ({ ok: false, violation: { seed, tick, message } });

  for (let tick = 1; tick <= ticks; tick++) {
    const input = bot.next(state);
    if (input.restart) stats.restarts++;
    let events;
    try {
      events = update(state, input, CONFIG.DT);
    } catch (err) {
      return violation(tick, `update threw: ${err.message}`);
    }
    if (mutate) mutate(state, tick);
    if (events.some((e) => e.type === 'reset')) prevScore = null;

    let found;
    try {
      found = checkInvariants(state, prevScore);
    } catch (err) {
      return violation(tick, `invariant check threw: ${err.message}`);
    }
    if (found.length > 0) return violation(tick, found.join('; '));
    prevScore = state.score;
    stats.peakEnemies = Math.max(stats.peakEnemies, state.enemies.length);
    stats.peakBullets = Math.max(stats.peakBullets, state.bullets.length);
    stats.peakScore = Math.max(stats.peakScore, state.score);
  }

  return {
    ok: true,
    seed,
    ticks,
    ...stats,
    mode: state.mode,
    score: state.score,
    hash: hashState(state),
  };
}

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 2;
    return;
  }

  const result = runStress(args);
  if (!result.ok) {
    const { seed, tick, message } = result.violation;
    console.error(`VIOLATION seed=${seed} tick=${tick}: ${message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`seed=${result.seed}`);
  console.log(`ticks=${result.ticks}`);
  console.log(`restarts=${result.restarts}`);
  console.log(`final=${result.mode} score=${result.score} peakScore=${result.peakScore}`);
  console.log(`peak enemies=${result.peakEnemies} bullets=${result.peakBullets}`);
  console.log(`hash=${result.hash}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
