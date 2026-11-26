// Keyboard input as a per-frame action snapshot: gameplay reads actions,
// never raw events, so the autopilot can feed the same shape.
// Controls: Up/W climb, Down/S descend, Left/A bank left, Right/D bank right,
// Shift throttle up, Control throttle down, G gear, F drop / flaps, P pause,
// R restart, Enter/Space confirm, M mute.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_GEAR = 8;
export const ACTION_FLAPS = 16;
export const ACTION_DROP = 32;
export const ACTION_MUTE = 64;

export function createInput(target) {
  const keys = new Set();
  let actions = 0;

  function onKeyDown(e) {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Enter' || e.code === 'Space') actions |= ACTION_CONFIRM;
    if (e.code === 'KeyP' || e.code === 'Escape') actions |= ACTION_PAUSE;
    if (e.code === 'KeyR') actions |= ACTION_RESTART;
    if (e.code === 'KeyG') actions |= ACTION_GEAR;
    if (e.code === 'KeyF') actions |= ACTION_DROP;
    if (e.code === 'KeyM') actions |= ACTION_MUTE;
    if (e.code === 'KeyL') actions |= ACTION_FLAPS;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }
  function onBlur() {
    keys.clear();
  }

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);

  // Read the held axes for this frame (-1..1 each).
  function axes() {
    const pitch =
      (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0) - (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0);
    const roll =
      (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
    const throttle =
      (keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('Equal') ? 1 : 0) -
      (keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('Minus') ? 1 : 0);
    return { pitch, roll, throttleDelta: throttle };
  }

  function takeActions() {
    const a = actions;
    actions = 0;
    return a;
  }

  function dispose() {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
    target.removeEventListener('blur', onBlur);
  }

  return { axes, takeActions, dispose };
}
