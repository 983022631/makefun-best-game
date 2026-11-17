// Keyboard and pointer input. Held keys steer; the mouse aims and fires; one-shot
// presses (start, restart, pause, upgrade picks, dash) are queued as bit flags
// and taken once by the loop, so a press between two frames is never lost and
// never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_DASH = 4;
export const ACTION_MUTE = 8;
export const ACTION_PICK_1 = 16;
export const ACTION_PICK_2 = 32;
export const ACTION_PICK_3 = 64;

const MOVE = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};
const CONFIRM = new Set(['Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const DASH = new Set(['ShiftLeft', 'ShiftRight', 'Space']);
const MUTE = new Set(['KeyM']);
const PICK = { Digit1: ACTION_PICK_1, Digit2: ACTION_PICK_2, Digit3: ACTION_PICK_3, Numpad1: ACTION_PICK_1, Numpad2: ACTION_PICK_2, Numpad3: ACTION_PICK_3 };

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  let mouseX = 640;
  let mouseY = 300;
  let firing = false;

  window.addEventListener('keydown', (event) => {
    if (MOVE[event.code]) { held.add(event.code); event.preventDefault(); return; }
    if (CONFIRM.has(event.code)) { if (!event.repeat) actions |= ACTION_CONFIRM; event.preventDefault(); return; }
    if (PAUSE.has(event.code)) { if (!event.repeat) actions |= ACTION_PAUSE; return; }
    if (DASH.has(event.code)) { if (!event.repeat) actions |= ACTION_DASH; event.preventDefault(); return; }
    if (MUTE.has(event.code)) { if (!event.repeat) actions |= ACTION_MUTE; return; }
    if (PICK[event.code]) { if (!event.repeat) actions |= PICK[event.code]; return; }
  });
  window.addEventListener('keyup', (event) => { held.delete(event.code); });
  window.addEventListener('blur', () => { held.clear(); firing = false; });

  target.addEventListener('pointermove', (event) => {
    const rect = target.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });
  target.addEventListener('pointerdown', (event) => {
    const rect = target.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    firing = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => { firing = false; });

  return {
    move() {
      let x = 0; let y = 0;
      for (const code of held) { const d = MOVE[code]; if (d) { x += d[0]; y += d[1]; } }
      if (x !== 0 && y !== 0) { const inv = 1 / Math.hypot(x, y); x *= inv; y *= inv; }
      return { x, y };
    },
    aim() { return { x: mouseX, y: mouseY }; },
    get firing() { return firing; },
    takeActions() { const taken = actions; actions = 0; return taken; },
  };
}
