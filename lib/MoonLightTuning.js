import * as THREE from "three";
import {
  SUN_AZIMUTH_MAX,
  SUN_AZIMUTH_MIN,
  SUN_ELEVATION_MAX,
  SUN_ELEVATION_MIN,
  sunPositionFromAngles,
} from "./SunLightTuning.js";

// Baked-in defaults (used when no localStorage values exist).
export const MOON_AZIMUTH_DEFAULT = 210;
export const MOON_ELEVATION_DEFAULT = 24;
export const MOON_INTENSITY_DEFAULT = 0.42;
export const MOON_INTENSITY_MIN = 0;
export const MOON_INTENSITY_MAX = 2;
export const MOON_INTENSITY_STEP = 0.01;
/** Moon uses the same sky-bowl distance as the sun; shadows are softened separately. */
export const MOON_SHADOW_MAP_SIZE = 2048;
export const MOON_SHADOW_RADIUS = 8;
export const MOON_SHADOW_PADDING = 12;
export const MOON_SHADOW_BIAS = -0.00012;
export const MOON_SHADOW_NORMAL_BIAS = 0.005;

export const MOON_AZIMUTH_STORAGE_KEY = "fps-moon-azimuth";
export const MOON_ELEVATION_STORAGE_KEY = "fps-moon-elevation";
export const MOON_INTENSITY_STORAGE_KEY = "fps-moon-intensity";

function readStored(key, fallback, min, max) {
  if (typeof window === "undefined") return fallback;
  const v = parseFloat(localStorage.getItem(key));
  if (Number.isNaN(v)) return fallback;
  return THREE.MathUtils.clamp(v, min, max);
}

/** @returns {{ azimuth: number, elevation: number }} */
export function loadMoonAngles() {
  return {
    azimuth: readStored(
      MOON_AZIMUTH_STORAGE_KEY,
      MOON_AZIMUTH_DEFAULT,
      SUN_AZIMUTH_MIN,
      SUN_AZIMUTH_MAX
    ),
    elevation: readStored(
      MOON_ELEVATION_STORAGE_KEY,
      MOON_ELEVATION_DEFAULT,
      SUN_ELEVATION_MIN,
      SUN_ELEVATION_MAX
    ),
  };
}

export function loadMoonIntensity() {
  return readStored(
    MOON_INTENSITY_STORAGE_KEY,
    MOON_INTENSITY_DEFAULT,
    MOON_INTENSITY_MIN,
    MOON_INTENSITY_MAX
  );
}

/** @param {number} azimuth @param {number} elevation */
export function saveMoonAngles(azimuth, elevation) {
  if (typeof window === "undefined") return;
  localStorage.setItem(MOON_AZIMUTH_STORAGE_KEY, String(azimuth));
  localStorage.setItem(MOON_ELEVATION_STORAGE_KEY, String(elevation));
}

/** @param {number} intensity */
export function saveMoonIntensity(intensity) {
  if (typeof window === "undefined") return;
  localStorage.setItem(MOON_INTENSITY_STORAGE_KEY, String(intensity));
}

/** @param {number} azimuthDeg @param {number} elevationDeg */
export function moonPositionFromAngles(azimuthDeg, elevationDeg) {
  return sunPositionFromAngles(azimuthDeg, elevationDeg);
}

/** @param {THREE.DirectionalLight} light @param {{ x: number, y: number, z: number }} pos */
export function applyMoonLightPosition(light, pos) {
  light.position.set(pos.x, pos.y, pos.z);
  light.updateMatrixWorld(true);
}

/** Wider, blurred shadow frustum so moonlight reads softer than sun. */
export function configureMoonShadow(light) {
  light.shadow.mapSize.set(MOON_SHADOW_MAP_SIZE, MOON_SHADOW_MAP_SIZE);
  light.shadow.radius = MOON_SHADOW_RADIUS;
  light.shadow.bias = MOON_SHADOW_BIAS;
  light.shadow.normalBias = MOON_SHADOW_NORMAL_BIAS;
}

/** @param {THREE.DirectionalLight} light @param {number} azimuthDeg @param {number} elevationDeg */
export function applyMoonLightAngles(light, azimuthDeg, elevationDeg) {
  applyMoonLightPosition(light, moonPositionFromAngles(azimuthDeg, elevationDeg));
}
