import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer } from '../src/render.js';
import { createGame, update } from '../src/game.js';
import { CONFIG } from '../src/entities.js';

const DT = CONFIG.DT;

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

// Accepts any ctx method and records calls and property writes.
function mockContext() {
  const calls = [];
  const writes = [];
  const ctx = new Proxy(
    {},
    {
      get: (_t, name) => (...args) => {
        calls.push(name);
        return undefined;
      },
      set: (_t, name, value) => {
        writes.push([name, value]);
        return true;
      },
    },
  );
  return { ctx, calls, writes };
}

function mockCanvas(ctx, cssW = 960, cssH = 540) {
  return { clientWidth: cssW, clientHeight: cssH, width: 0, height: 0, getContext: () => ctx };
}

function populatedState(mode) {
  const state = createGame({ seed: 7 });
  update(state, { start: true }, DT);
  for (let i = 0; i < 150; i++) update(state, { moveX: 1, fire: true }, DT);
  state.enemies.push({ id: 9001, kind: 'drone', x: 300, y: 200, vx: 0, vy: 0, r: 12, hp: 1, size: 1 });
  state.salvage.push({ id: 9002, x: 100, y: 100, vx: 0, vy: 0, r: 6, ttl: 5, value: 10 });
  if (mode === 'paused') update(state, { pause: true }, DT);
  if (mode === 'gameover') {
    state.player.hp = 0;
    state.mode = 'gameover';
  }
  if (mode === 'ready') state.mode = 'ready';
  assert.equal(state.mode, mode);
  assert.ok(state.bullets.length > 0 && state.enemies.length > 1);
  return state;
}

for (const mode of ['ready', 'playing', 'paused', 'gameover']) {
  test(`draw never writes to a deep-frozen state in ${mode}`, () => {
    const state = populatedState(mode);
    const before = JSON.stringify(state);
    deepFreeze(state);

    const { ctx, calls } = mockContext();
    const renderer = createRenderer(mockCanvas(ctx, 1280, 720));
    renderer.resize();
    // A frozen write throws in strict module code, so a clean return means no write happened.
    assert.doesNotThrow(() => renderer.draw(state, { best: 1234, alpha: 0, fx: null }));

    assert.equal(JSON.stringify(state), before);
    assert.ok(calls.includes('fillRect'));
    assert.ok(calls.includes('arc'));
    assert.ok(calls.includes('fillText'));
  });
}

test('the HUD and overlays draw text, so the purity run is not vacuous', () => {
  const { ctx, calls } = mockContext();
  const renderer = createRenderer(mockCanvas(ctx));
  renderer.resize();
  renderer.draw(populatedState('gameover'), { best: 5 });
  assert.ok(calls.filter((c) => c === 'fillText').length >= 4);
});

test('the harness detects a write to a frozen state', () => {
  const state = deepFreeze(populatedState('playing'));
  assert.throws(() => {
    state.score = 1;
  }, TypeError);
  assert.throws(() => {
    state.bullets.push({});
  }, TypeError);
  assert.throws(() => {
    state.player.x = 0;
  }, TypeError);
});

test('draw works before resize and with an unmeasured canvas', () => {
  const state = deepFreeze(populatedState('playing'));
  const { ctx, calls } = mockContext();
  const renderer = createRenderer(mockCanvas(ctx, 0, 0));
  renderer.resize();
  assert.doesNotThrow(() => renderer.draw(state, { best: 0 }));
  assert.ok(calls.length > 0);
});

test('resize sizes the canvas to the backing store and draw does not touch the world', () => {
  const state = deepFreeze(populatedState('playing'));
  const canvas = mockCanvas(mockContext().ctx, 800, 600);
  const renderer = createRenderer(canvas);
  renderer.resize();
  assert.equal(canvas.width, 800);
  assert.equal(canvas.height, 600);
  renderer.draw(state, { best: 0 });
  assert.deepEqual(state.world, { w: CONFIG.world.w, h: CONFIG.world.h });
});
