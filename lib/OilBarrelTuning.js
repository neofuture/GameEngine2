export const OIL_BARREL_TUNING_KEY = "fps-oil-barrel-tuning";
export const OIL_BARREL_TUNE_ENABLED_KEY = "fps-oil-barrel-tune-enabled";

/** @typedef {{
 *   topCap: boolean,
 *   bodyBrightness: number,
 *   capBrightness: number,
 *   warmth: number,
 *   blueTint: number,
 *   roughness: number,
 *   emissiveIntensity: number,
 *   normalScale: number,
 *   capContrast: number,
 *   capNormalScale: number,
 *   interiorTextureRotation: number,
 * }} OilBarrelTuning */

/** @type {OilBarrelTuning} */
export const DEFAULT_OIL_BARREL_TUNING = {
  topCap: true,
  bodyBrightness: 1.75,
  capBrightness: 0.7,
  warmth: 1.3,
  blueTint: 1.73,
  roughness: 1,
  emissiveIntensity: 17.2,
  normalScale: 4.6,
  capContrast: 1.7,
  capNormalScale: 3.5,
  interiorTextureRotation: 0,
};

/** Slider / clamp bounds — keep panel ranges in sync with normalize. */
export const OIL_BARREL_TUNING_LIMITS = {
  bodyBrightness: { min: 0.1, max: 12, step: 0.05, nudge: 0.05 },
  capBrightness: { min: 0.1, max: 12, step: 0.05, nudge: 0.05 },
  warmth: { min: 0.5, max: 2, step: 0.01, nudge: 0.01 },
  blueTint: { min: 0.2, max: 2, step: 0.01, nudge: 0.01 },
  roughness: { min: 0, max: 1, step: 0.01, nudge: 0.01 },
  emissiveIntensity: { min: 0, max: 24, step: 0.1, nudge: 0.5 },
  normalScale: { min: 0, max: 8, step: 0.05, nudge: 0.1 },
  capContrast: { min: 0.5, max: 3, step: 0.05, nudge: 0.05 },
  capNormalScale: { min: 0, max: 12, step: 0.05, nudge: 0.1 },
  interiorTextureRotation: { min: 0, max: 360, step: 1, nudge: 5 },
};

function clampNum(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** @param {Partial<OilBarrelTuning>} patch */
export function normalizeOilBarrelTuning(patch) {
  const d = DEFAULT_OIL_BARREL_TUNING;
  const L = OIL_BARREL_TUNING_LIMITS;
  return {
    topCap:
      patch.topCap === false
        ? false
        : patch.topCap === true
          ? true
          : d.topCap !== false,
    bodyBrightness: clampNum(
      patch.bodyBrightness,
      L.bodyBrightness.min,
      L.bodyBrightness.max,
      d.bodyBrightness
    ),
    capBrightness: clampNum(
      patch.capBrightness,
      L.capBrightness.min,
      L.capBrightness.max,
      d.capBrightness
    ),
    warmth: clampNum(patch.warmth, L.warmth.min, L.warmth.max, d.warmth),
    blueTint: clampNum(patch.blueTint, L.blueTint.min, L.blueTint.max, d.blueTint),
    roughness: clampNum(
      patch.roughness,
      L.roughness.min,
      L.roughness.max,
      d.roughness
    ),
    emissiveIntensity: clampNum(
      patch.emissiveIntensity,
      L.emissiveIntensity.min,
      L.emissiveIntensity.max,
      d.emissiveIntensity
    ),
    normalScale: clampNum(
      patch.normalScale,
      L.normalScale.min,
      L.normalScale.max,
      d.normalScale
    ),
    capContrast: clampNum(
      patch.capContrast,
      L.capContrast.min,
      L.capContrast.max,
      d.capContrast
    ),
    capNormalScale: clampNum(
      patch.capNormalScale,
      L.capNormalScale.min,
      L.capNormalScale.max,
      d.capNormalScale
    ),
    interiorTextureRotation: clampNum(
      patch.interiorTextureRotation ?? patch.textureRotation,
      L.interiorTextureRotation.min,
      L.interiorTextureRotation.max,
      d.interiorTextureRotation
    ),
  };
}

/** @returns {OilBarrelTuning} */
export function loadOilBarrelTuning() {
  if (typeof window === "undefined") return { ...DEFAULT_OIL_BARREL_TUNING };
  try {
    const raw = window.localStorage.getItem(OIL_BARREL_TUNING_KEY);
    if (!raw) return { ...DEFAULT_OIL_BARREL_TUNING };
    return normalizeOilBarrelTuning(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_OIL_BARREL_TUNING };
  }
}

/** @param {OilBarrelTuning} tuning */
export function saveOilBarrelTuning(tuning) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    OIL_BARREL_TUNING_KEY,
    JSON.stringify(normalizeOilBarrelTuning(tuning))
  );
}

export function loadOilBarrelTuneEnabled() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(OIL_BARREL_TUNE_ENABLED_KEY) === "true";
}

export function saveOilBarrelTuneEnabled(enabled) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(OIL_BARREL_TUNE_ENABLED_KEY, String(enabled));
}
