export const BINDINGS_STORAGE_KEY = "fps-key-bindings";

/** @typedef {Record<string, string | string[]>} KeyBindingsMap */

/** @type {KeyBindingsMap} */
export const DEFAULT_BINDINGS = {
  forward: "KeyW",
  backward: "KeyS",
  strafeLeft: "KeyA",
  strafeRight: "KeyD",
  aim: "KeyZ",
  jump: "Space",
  crouch: ["ControlLeft", "ControlRight"],
  sprint: ["ShiftLeft", "ShiftRight"],
  shoot: "Enter",
  cycleFireMode: "KeyB",
  flashlight: "KeyF",
  lookUp: "ArrowUp",
  lookDown: "ArrowDown",
  lookLeft: "ArrowLeft",
  lookRight: "ArrowRight",
};

export const BINDING_ROWS = [
  { id: "forward", label: "Move forward" },
  { id: "backward", label: "Move backward" },
  { id: "strafeLeft", label: "Strafe left" },
  { id: "strafeRight", label: "Strafe right" },
  { id: "aim", label: "Aim down sights" },
  { id: "jump", label: "Jump" },
  { id: "crouch", label: "Crouch" },
  { id: "sprint", label: "Sprint" },
  { id: "shoot", label: "Shoot" },
  { id: "cycleFireMode", label: "Cycle fire mode" },
  { id: "flashlight", label: "Weapon flashlight" },
  { id: "lookUp", label: "Look up" },
  { id: "lookDown", label: "Look down" },
  { id: "lookLeft", label: "Look left" },
  { id: "lookRight", label: "Look right" },
];

const CODE_LABELS = {
  KeyW: "W",
  KeyA: "A",
  KeyS: "S",
  KeyD: "D",
  KeyZ: "Z",
  KeyQ: "Q",
  KeyE: "E",
  KeyR: "R",
  KeyB: "B",
  KeyF: "F",
  Space: "Space",
  Enter: "Enter",
  Escape: "Esc",
  ShiftLeft: "Shift",
  ShiftRight: "Shift",
  ControlLeft: "Ctrl",
  ControlRight: "Ctrl",
  AltLeft: "Alt",
  AltRight: "Alt",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Digit0: "0",
  Digit1: "1",
  Digit2: "2",
  Digit3: "3",
  Digit4: "4",
  Digit5: "5",
  Digit6: "6",
  Digit7: "7",
  Digit8: "8",
  Digit9: "9",
};

export function formatBindingCode(code) {
  if (!code) return "—";
  return CODE_LABELS[code] ?? code.replace(/^Key/, "").replace(/^Digit/, "");
}

export function formatBindingValue(value) {
  if (Array.isArray(value)) {
    const labels = [...new Set(value.map(formatBindingCode))];
    return labels.join(" / ");
  }
  if (value === "Enter") return "Enter / Mouse 1";
  return formatBindingCode(value);
}

/** @returns {KeyBindingsMap} */
export function loadBindings() {
  try {
    const raw = localStorage.getItem(BINDINGS_STORAGE_KEY);
    if (!raw) return cloneBindings(DEFAULT_BINDINGS);
    const parsed = JSON.parse(raw);
    const merged = cloneBindings(DEFAULT_BINDINGS);
    for (const row of BINDING_ROWS) {
      const v = parsed[row.id];
      if (typeof v === "string") merged[row.id] = v;
      else if (Array.isArray(v) && v.every((c) => typeof c === "string")) {
        merged[row.id] = v;
      }
    }
    // Fix earlier default swap: A = strafe left, Z = aim
    if (merged.aim === "KeyA" && merged.strafeLeft === "KeyZ") {
      merged.aim = "KeyZ";
      merged.strafeLeft = "KeyA";
      saveBindings(merged);
    }
    // Fix earlier default: F = cycle fire mode → B
    if (merged.cycleFireMode === "KeyF") {
      merged.cycleFireMode = "KeyB";
      saveBindings(merged);
    }
    if (typeof merged.flashlight !== "string") {
      merged.flashlight = DEFAULT_BINDINGS.flashlight;
    }
    return merged;
  } catch {
    return cloneBindings(DEFAULT_BINDINGS);
  }
}

/** @param {KeyBindingsMap} bindings */
export function saveBindings(bindings) {
  localStorage.setItem(BINDINGS_STORAGE_KEY, JSON.stringify(bindings));
}

export function resetBindings() {
  const next = cloneBindings(DEFAULT_BINDINGS);
  saveBindings(next);
  return next;
}

/** @param {KeyBindingsMap} bindings @param {string} action */
export function isBindingDown(input, bindings, action) {
  const code = bindings[action];
  if (!code) return false;
  if (Array.isArray(code)) return code.some((c) => input.isDown(c));
  return input.isDown(code);
}

/** @param {KeyBindingsMap} bindings @param {string} action */
export function wasBindingPressed(input, bindings, action) {
  const code = bindings[action];
  if (!code) return false;
  if (Array.isArray(code)) return code.some((c) => input.wasPressed(c));
  return input.wasPressed(code);
}

/** @param {KeyBindingsMap} bindings */
export function getShootCodes(bindings) {
  const shoot = bindings.shoot;
  return typeof shoot === "string" ? [shoot] : [];
}

function cloneBindings(source) {
  /** @type {KeyBindingsMap} */
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    out[key] = Array.isArray(value) ? [...value] : value;
  }
  return out;
}
