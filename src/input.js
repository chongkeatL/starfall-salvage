// Keyboard to actions. Held keys are polled; start/pause/restart are one-shot edges
// that stay set until the next poll() so a frame with no update step never loses one.

const LEFT = ['ArrowLeft', 'KeyA'];
const RIGHT = ['ArrowRight', 'KeyD'];
const UP = ['ArrowUp', 'KeyW'];
const DOWN = ['ArrowDown', 'KeyS'];
const PREVENT_DEFAULT = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

// touchEl is accepted for the contract; Exercise 2 will use it for touch controls.
export function createInput(target, touchEl) {
  const held = new Set();
  let start = false;
  let pause = false;
  let restart = false;

  const anyHeld = (codes) => codes.some((c) => held.has(c));

  function onKeyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (PREVENT_DEFAULT.has(event.code)) event.preventDefault();
    held.add(event.code);
    if (event.repeat) return;

    if (event.code === 'Space' || event.code === 'Enter') start = true;
    else if (event.code === 'KeyP' || event.code === 'Escape') pause = true;
    else if (event.code === 'KeyR') restart = true;
  }

  function onKeyUp(event) {
    held.delete(event.code);
  }

  function onBlur() {
    held.clear();
  }

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);

  return {
    poll() {
      const actions = {
        moveX: (anyHeld(RIGHT) ? 1 : 0) - (anyHeld(LEFT) ? 1 : 0),
        moveY: (anyHeld(DOWN) ? 1 : 0) - (anyHeld(UP) ? 1 : 0),
        fire: held.has('Space'),
        start,
        pause,
        restart,
      };
      start = false;
      pause = false;
      restart = false;
      return actions;
    },
    dispose() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
      held.clear();
      start = false;
      pause = false;
      restart = false;
    },
  };
}
