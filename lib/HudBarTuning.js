export const HUD_BAR_TUNING_KEY = "fps-hud-bar-tuning";
export const HUD_BAR_TUNE_ENABLED_KEY = "fps-hud-bar-tune-enabled";

/** @typedef {{
 *   hbLivesX: number,
 *   hbLivesY: number,
 *   hbLivesSize: number,
 *   hbBarX: number,
 *   hbBarY: number,
 *   hbBarW: number,
 *   hbBarH: number,
 *   sbBarX: number,
 *   sbBarY: number,
 *   sbBarW: number,
 *   sbBarH: number,
 * }} HudBarTuning */

/** @type {HudBarTuning} */
export const DEFAULT_HUD_BAR_TUNING = {
  hbLivesX: 4.5,
  hbLivesY: 11.5,
  hbLivesSize: 1.05,
  hbBarX: 5.1,
  hbBarY: 34,
  hbBarW: 76,
  hbBarH: 33.5,
  sbBarX: 18.5,
  sbBarY: 34,
  sbBarW: 76,
  sbBarH: 33.5,
};

/** @param {Partial<HudBarTuning>} patch */
export function normalizeHudBarTuning(patch) {
  const d = DEFAULT_HUD_BAR_TUNING;
  return {
    hbLivesX: clampNum(patch.hbLivesX, 0, 20, d.hbLivesX),
    hbLivesY: clampNum(patch.hbLivesY, 0, 40, d.hbLivesY),
    hbLivesSize: clampNum(patch.hbLivesSize, 0.5, 3, d.hbLivesSize),
    hbBarX: clampNum(patch.hbBarX, 0, 40, d.hbBarX),
    hbBarY: clampNum(patch.hbBarY, 0, 70, d.hbBarY),
    hbBarW: clampNum(patch.hbBarW, 40, 90, d.hbBarW),
    hbBarH: clampNum(patch.hbBarH, 10, 50, d.hbBarH),
    sbBarX: clampNum(patch.sbBarX, 0, 40, d.sbBarX),
    sbBarY: clampNum(patch.sbBarY, 0, 70, d.sbBarY),
    sbBarW: clampNum(patch.sbBarW, 40, 90, d.sbBarW),
    sbBarH: clampNum(patch.sbBarH, 10, 50, d.sbBarH),
  };
}

function clampNum(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** @returns {HudBarTuning} */
export function loadHudBarTuning() {
  if (typeof window === "undefined") return { ...DEFAULT_HUD_BAR_TUNING };
  try {
    const raw = window.localStorage.getItem(HUD_BAR_TUNING_KEY);
    if (!raw) return { ...DEFAULT_HUD_BAR_TUNING };
    return normalizeHudBarTuning(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_HUD_BAR_TUNING };
  }
}

/** @param {HudBarTuning} tuning */
export function saveHudBarTuning(tuning) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    HUD_BAR_TUNING_KEY,
    JSON.stringify(normalizeHudBarTuning(tuning))
  );
}

export function loadHudBarTuneEnabled() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(HUD_BAR_TUNE_ENABLED_KEY) === "true";
}

export function saveHudBarTuneEnabled(enabled) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HUD_BAR_TUNE_ENABLED_KEY, String(enabled));
}
