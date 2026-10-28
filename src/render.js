// Drawing only. Reads state, never writes it.
import { CONFIG } from './entities.js';
import { makeRngState, nextFloat } from './rng.js';

const STAR_SEED = 0x5747a11;
const STAR_COUNT = 90;

const COLORS = {
  bars: '#000000',
  background: '#05060f',
  star: '#cfd8ff',
  player: '#7fe8ff',
  bullet: '#ffe66d',
  asteroidFill: '#4a4f66',
  asteroidStroke: '#9aa3c7',
  otherFill: '#6b3f5e',
  otherStroke: '#d98ab8',
  text: '#e8ecff',
  dim: '#9aa3c7',
  shade: 'rgba(5, 6, 15, 0.72)',
};

const FONT = 'sans-serif';

function makeStars() {
  const rng = makeRngState(STAR_SEED);
  const { w, h } = CONFIG.world;
  const stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: nextFloat(rng) * w,
      y: nextFloat(rng) * h,
      r: 0.5 + nextFloat(rng) * 1.2,
      a: 0.3 + nextFloat(rng) * 0.7,
    });
  }
  return stars;
}

function circle(ctx, x, y, r, fill, stroke) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function centeredText(ctx, text, x, y, size, color, weight = 'normal') {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const stars = makeStars();
  const view = { dpr: 1, scale: 1, offX: 0, offY: 0, cssW: 0, cssH: 0 };

  function resize() {
    const dpr = globalThis.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (!cssW || !cssH) return;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const { w, h } = CONFIG.world;
    const scale = Math.min(cssW / w, cssH / h);
    view.dpr = dpr;
    view.scale = scale;
    view.offX = (cssW - w * scale) / 2;
    view.offY = (cssH - h * scale) / 2;
    view.cssW = cssW;
    view.cssH = cssH;
  }

  function drawStars() {
    ctx.fillStyle = COLORS.star;
    for (const s of stars) {
      ctx.globalAlpha = s.a;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawBullets(state) {
    ctx.fillStyle = COLORS.bullet;
    for (const b of state.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawEnemies(state) {
    for (const e of state.enemies) {
      if (e.kind === 'asteroid') {
        circle(ctx, e.x, e.y, e.r, COLORS.asteroidFill, COLORS.asteroidStroke);
      } else {
        circle(ctx, e.x, e.y, e.r, COLORS.otherFill, COLORS.otherStroke);
      }
    }
  }

  // Nose points up, matching the direction the engine fires.
  function drawPlayer(state) {
    const { x, y, r } = state.player;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.8, y + r * 0.8);
    ctx.lineTo(x, y + r * 0.4);
    ctx.lineTo(x - r * 0.8, y + r * 0.8);
    ctx.closePath();
    ctx.fillStyle = COLORS.player;
    ctx.fill();
  }

  function drawHud(state, best) {
    const { w } = state.world;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    centeredText(ctx, `Score ${state.score}`, 16, 12, 20, COLORS.text);
    ctx.textAlign = 'center';
    centeredText(ctx, `HP ${state.player.hp}/${state.player.maxHp}`, w / 2, 12, 20, COLORS.text);
    ctx.textAlign = 'right';
    centeredText(ctx, `Best ${best}`, w - 16, 12, 20, COLORS.dim);
  }

  function drawOverlay(state, best) {
    const { w, h } = state.world;
    const mode = state.mode;
    if (mode === 'playing') return;

    ctx.fillStyle = COLORS.shade;
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = w / 2;
    const cy = h / 2;

    if (mode === 'ready') {
      centeredText(ctx, 'STARFALL SALVAGE', cx, cy - 60, 54, COLORS.text, 'bold');
      centeredText(ctx, 'Press Space or Enter to start', cx, cy + 4, 24, COLORS.player);
      centeredText(ctx, 'Arrows / WASD move   Space fire   P / Esc pause   R restart', cx, cy + 50, 18, COLORS.dim);
    } else if (mode === 'paused') {
      centeredText(ctx, 'PAUSED', cx, cy - 20, 54, COLORS.text, 'bold');
      centeredText(ctx, 'Press P or Esc to resume', cx, cy + 30, 22, COLORS.dim);
    } else if (mode === 'gameover') {
      centeredText(ctx, 'GAME OVER', cx, cy - 60, 54, COLORS.text, 'bold');
      centeredText(ctx, `Score ${state.score}`, cx, cy, 28, COLORS.player);
      centeredText(ctx, `Best ${best}`, cx, cy + 36, 24, COLORS.dim);
      centeredText(ctx, 'Press R to restart', cx, cy + 80, 20, COLORS.dim);
    }
  }

  // alpha and fx are accepted for the contract; interpolation and effects come later.
  function draw(state, { best }) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.bars;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const k = view.dpr * view.scale;
    ctx.setTransform(k, 0, 0, k, view.dpr * view.offX, view.dpr * view.offY);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, state.world.w, state.world.h);
    ctx.clip();
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, state.world.w, state.world.h);

    drawStars();
    drawBullets(state);
    drawEnemies(state);
    drawPlayer(state);
    drawHud(state, best);
    drawOverlay(state, best);
    ctx.restore();
  }

  return { resize, draw };
}
