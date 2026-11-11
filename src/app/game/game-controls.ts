export type ControlAction = 'up' | 'down' | 'left' | 'right' | 'shoot' | 'ultimate' | 'dash' | 'slowmo';

export const CONTROL_ACTIONS: ControlAction[] = ['up', 'down', 'left', 'right', 'shoot', 'ultimate', 'dash', 'slowmo'];

export const DEFAULT_BINDINGS: Record<ControlAction, string> = {
  up: 'w',
  down: 's',
  left: 'a',
  right: 'd',
  shoot: ' ',
  ultimate: 'q',
  dash: 'shift',
  slowmo: 'e'
};

export const ACTION_LABELS: Record<ControlAction, { hu: string; en: string }> = {
  up: { hu: 'Fel', en: 'Up' },
  down: { hu: 'Le', en: 'Down' },
  left: { hu: 'Balra', en: 'Left' },
  right: { hu: 'Jobbra', en: 'Right' },
  shoot: { hu: 'Lövés', en: 'Shoot' },
  ultimate: { hu: 'Ultimate', en: 'Ultimate' },
  dash: { hu: 'Dash', en: 'Dash' },
  slowmo: { hu: 'Slow Motion', en: 'Slow Motion' }
};

// Escape pauses and M mutes, so they can't be bound to a game action
export const RESERVED_KEYS = ['escape', 'm'];

// Arrow keys always work as an alternative for movement
export const ARROW_ALTERNATIVES: Partial<Record<ControlAction, string>> = {
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright'
};

const STORAGE_KEY = 'keyBindings';

export function loadBindings(): Record<ControlAction, string> {
  const bindings = { ...DEFAULT_BINDINGS };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      for (const action of CONTROL_ACTIONS) {
        if (typeof saved[action] === 'string' && saved[action].length > 0) {
          bindings[action] = saved[action];
        }
      }
    }
  } catch { /* ignore corrupt settings */ }
  return bindings;
}

export function saveBindings(bindings: Record<ControlAction, string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
}

export function keyLabel(key: string): string {
  switch (key) {
    case ' ': return 'SPACE';
    case 'arrowup': return '↑';
    case 'arrowdown': return '↓';
    case 'arrowleft': return '←';
    case 'arrowright': return '→';
    case 'shift': return 'SHIFT';
    case 'control': return 'CTRL';
    case 'alt': return 'ALT';
    case 'tab': return 'TAB';
    case 'enter': return 'ENTER';
    default: return key.toUpperCase();
  }
}
