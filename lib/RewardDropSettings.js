/** Max spare magazines the player can hold — upper bound for the drop threshold slider. */
export const AMMO_DROP_SPARE_THRESHOLD_MAX = 4;

export const AMMO_DROP_SPARE_THRESHOLD_KEY = "fps-ammo-drop-spare-threshold";
export const DEFAULT_AMMO_DROP_SPARE_THRESHOLD = 1;

export function loadAmmoDropSpareThreshold() {
  if (typeof window === "undefined") return DEFAULT_AMMO_DROP_SPARE_THRESHOLD;
  const raw = parseInt(window.localStorage.getItem(AMMO_DROP_SPARE_THRESHOLD_KEY), 10);
  if (Number.isNaN(raw)) return DEFAULT_AMMO_DROP_SPARE_THRESHOLD;
  return Math.min(AMMO_DROP_SPARE_THRESHOLD_MAX, Math.max(0, raw));
}

/** @param {number} value */
export function saveAmmoDropSpareThreshold(value) {
  if (typeof window === "undefined") return;
  const clamped = Math.min(
    AMMO_DROP_SPARE_THRESHOLD_MAX,
    Math.max(0, Math.round(value)),
  );
  window.localStorage.setItem(AMMO_DROP_SPARE_THRESHOLD_KEY, String(clamped));
}

/** @param {number} spareMags @param {number} [threshold] */
export function shouldDropAmmoCrate(spareMags, threshold = loadAmmoDropSpareThreshold()) {
  return spareMags <= threshold;
}
