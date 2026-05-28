import * as THREE from "three";

const HEMI_DAY_KEY = "fps-hemi-day";
const HEMI_NIGHT_KEY = "fps-hemi-night";

export const HEMI_TEMPERATURE_MIN = 0;
export const HEMI_TEMPERATURE_MAX = 50000;
export const HEMI_TEMPERATURE_STEP = 100;
/** Past this Kelvin we leave the physical Planckian locus and start saturating toward pure blue. */
const HEMI_BLUE_SATURATION_START = 12000;
const HEMI_BLUE_SATURATION_END = 25000;
export const HEMI_INTENSITY_MIN = 0;
export const HEMI_INTENSITY_MAX = 1.5;
export const HEMI_INTENSITY_STEP = 0.01;

/** Cool overcast daylight — moderate under the arena roof. */
export const DEFAULT_HEMI_DAY = Object.freeze({
  temperature: 9700,
  intensity: 0.52,
});

/** Deep blue night fill — dark but even on horizontal and vertical surfaces indoors. */
export const DEFAULT_HEMI_NIGHT = Object.freeze({
  temperature: 18000,
  intensity: 0.1,
});

function sanitize(value, fallback) {
  return {
    temperature:
      typeof value?.temperature === "number" && Number.isFinite(value.temperature)
        ? THREE.MathUtils.clamp(
            value.temperature,
            HEMI_TEMPERATURE_MIN,
            HEMI_TEMPERATURE_MAX
          )
        : fallback.temperature,
    intensity:
      typeof value?.intensity === "number" && Number.isFinite(value.intensity)
        ? THREE.MathUtils.clamp(value.intensity, HEMI_INTENSITY_MIN, HEMI_INTENSITY_MAX)
        : fallback.intensity,
  };
}

function loadHemi(key, fallback) {
  if (typeof window === "undefined") return { ...fallback };
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...fallback };
    return sanitize(JSON.parse(raw), fallback);
  } catch {
    return { ...fallback };
  }
}

export function loadHemiDay() {
  return loadHemi(HEMI_DAY_KEY, DEFAULT_HEMI_DAY);
}

export function loadHemiNight() {
  return loadHemi(HEMI_NIGHT_KEY, DEFAULT_HEMI_NIGHT);
}

export function saveHemiDay(settings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(HEMI_DAY_KEY, JSON.stringify(sanitize(settings, DEFAULT_HEMI_DAY)));
}

export function saveHemiNight(settings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(HEMI_NIGHT_KEY, JSON.stringify(sanitize(settings, DEFAULT_HEMI_NIGHT)));
}

/**
 * Tanner Helland blackbody approximation across the physical range, with an
 * artistic blue-saturation ramp past 12000K so the slider can actually reach a
 * "late night, almost pure blue" tone (the physical Planckian locus never gets
 * past a desaturated cool white-blue no matter how high you push it).
 *
 * @param {number} kelvin
 * @returns {{ r: number, g: number, b: number }} 0..1 RGB
 */
export function kelvinToRgb(kelvin) {
  const k = kelvin / 100;
  let r;
  let g;
  let b;
  if (k <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(k) - 161.1195681661;
    b = k <= 19 ? 0 : 138.5177312231 * Math.log(k - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(k - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(k - 60, -0.0755148492);
    b = 255;
  }

  if (kelvin > HEMI_BLUE_SATURATION_START) {
    const t = THREE.MathUtils.clamp(
      (kelvin - HEMI_BLUE_SATURATION_START) /
        (HEMI_BLUE_SATURATION_END - HEMI_BLUE_SATURATION_START),
      0,
      1
    );
    const ease = t * t;
    r *= 1 - ease * 0.88;
    g *= 1 - ease * 0.6;
  }

  return {
    r: THREE.MathUtils.clamp(r, 0, 255) / 255,
    g: THREE.MathUtils.clamp(g, 0, 255) / 255,
    b: THREE.MathUtils.clamp(b, 0, 255) / 255,
  };
}

/**
 * Set hemi sky/ground from a single (temperature, intensity) pair. Ground stays
 * coupled to sky as a darker, slightly desaturated bounce so the user only
 * needs one color knob per mode.
 *
 * @param {THREE.HemisphereLight | null | undefined} hemi
 * @param {{ temperature: number, intensity: number }} settings
 * @param {{ indoor?: boolean }} [options]
 */
export function applyHemisphereSettings(hemi, settings, options = {}) {
  if (!hemi?.isHemisphereLight) return;
  const rgb = kelvinToRgb(settings.temperature);
  hemi.color.setRGB(rgb.r, rgb.g, rgb.b);
  // Outdoors: darker desaturated bounce. Indoors: tighter sky/ground coupling so
  // ceiling undersides (-Y) and vertical walls read at a similar level.
  const lum = options.indoor ? 0.82 : 0.42;
  const grey = options.indoor ? 0.18 : 0.3;
  const gr = rgb.r * lum;
  const gg = rgb.g * lum;
  const gb = rgb.b * lum;
  const avg = (gr + gg + gb) / 3;
  hemi.groundColor.setRGB(
    gr * (1 - grey) + avg * grey,
    gg * (1 - grey) + avg * grey,
    gb * (1 - grey) + avg * grey
  );
  hemi.intensity = settings.intensity;
}
