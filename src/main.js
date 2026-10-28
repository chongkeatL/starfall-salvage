import { CONFIG } from './entities.js';
import { createGame, update } from './game.js';
import { createInput } from './input.js';
import { loadBest, saveBest } from './storage.js';
import { createRenderer } from './render.js';

const MAX_FRAME_DT = 0.25;
const MAX_SEED = 0xffffffff;

function parseSeed(search) {
  const raw = new URLSearchParams(search).get('seed');
  if (raw !== null && /^\d{1,10}$/.test(raw) && Number(raw) <= MAX_SEED) return Number(raw);
  return Date.now() >>> 0;
}

const canvas = document.getElementById('game');
const state = createGame({ seed: parseSeed(globalThis.location.search) });
const input = createInput(window);
const renderer = createRenderer(canvas);

let best = loadBest();
let pendingPause = false;
let acc = 0;
let last = null;

renderer.resize();
window.addEventListener('resize', () => renderer.resize());

// Pause is a toggle in the engine, so this is merged into a step only while playing.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.mode === 'playing') pendingPause = true;
});

function step() {
  const actions = input.poll();
  if (pendingPause) {
    pendingPause = false;
    if (state.mode === 'playing') actions.pause = true;
  }
  for (const ev of update(state, actions, CONFIG.DT)) {
    if (ev.type === 'gameOver') {
      best = Math.max(best, ev.score);
      saveBest(ev.score);
    }
  }
}

function frame(now) {
  const frameDt = last === null ? 0 : (now - last) / 1000;
  last = now;
  acc += Math.min(frameDt, MAX_FRAME_DT);
  while (acc >= CONFIG.DT) {
    step();
    acc -= CONFIG.DT;
  }
  renderer.draw(state, { best, alpha: 0, fx: null });
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
