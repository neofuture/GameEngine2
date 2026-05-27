import * as THREE from "three";

/** Shared with sky dome placement in SceneEnvironment.js */
export const SKY_MESH_RADIUS = 180;

/** Light sits on the inner surface of the sky bowl, like a sun on the dome. */
export const SUN_BOWL_INSET = 20;
export const SUN_BOWL_RADIUS = SKY_MESH_RADIUS - SUN_BOWL_INSET;

// Baked-in defaults (used when no localStorage values exist).
export const SUN_AZIMUTH_DEFAULT = 284;
export const SUN_ELEVATION_DEFAULT = 34;
export const SUN_AZIMUTH_MIN = 0;
export const SUN_AZIMUTH_MAX = 360;
export const SUN_ELEVATION_MIN = 0;
export const SUN_ELEVATION_MAX = 89;

export const SUN_AZIMUTH_STORAGE_KEY = "fps-sun-azimuth";
export const SUN_ELEVATION_STORAGE_KEY = "fps-sun-elevation";
export const SUN_DAY_MODE_STORAGE_KEY = "fps-sun-day";
export const SUN_DAY_DEFAULT = true;

function readStoredAngle(key, fallback, min, max) {
  if (typeof window === "undefined") return fallback;
  const v = parseFloat(localStorage.getItem(key));
  if (Number.isNaN(v)) return fallback;
  return THREE.MathUtils.clamp(v, min, max);
}

/** @returns {{ azimuth: number, elevation: number }} */
export function loadSunAngles() {
  return {
    azimuth: readStoredAngle(
      SUN_AZIMUTH_STORAGE_KEY,
      SUN_AZIMUTH_DEFAULT,
      SUN_AZIMUTH_MIN,
      SUN_AZIMUTH_MAX
    ),
    elevation: readStoredAngle(
      SUN_ELEVATION_STORAGE_KEY,
      SUN_ELEVATION_DEFAULT,
      SUN_ELEVATION_MIN,
      SUN_ELEVATION_MAX
    ),
  };
}

/** @param {number} azimuth @param {number} elevation */
export function saveSunAngles(azimuth, elevation) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SUN_AZIMUTH_STORAGE_KEY, String(azimuth));
  localStorage.setItem(SUN_ELEVATION_STORAGE_KEY, String(elevation));
}

export function loadSunDayMode() {
  if (typeof window === "undefined") return SUN_DAY_DEFAULT;
  const v = localStorage.getItem(SUN_DAY_MODE_STORAGE_KEY);
  if (v === null) return SUN_DAY_DEFAULT;
  return v !== "0" && v !== "false";
}

/** @param {boolean} isDay */
export function saveSunDayMode(isDay) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SUN_DAY_MODE_STORAGE_KEY, isDay ? "1" : "0");
}

/**
 * Spherical coords on the sky bowl: azimuth 0–360° around Y, elevation 0° = horizon ring.
 * @param {number} azimuthDeg
 * @param {number} elevationDeg
 * @returns {{ x: number, y: number, z: number }}
 */
export function sunPositionFromAngles(azimuthDeg, elevationDeg) {
  const az = THREE.MathUtils.degToRad(azimuthDeg);
  const el = THREE.MathUtils.degToRad(
    THREE.MathUtils.clamp(elevationDeg, SUN_ELEVATION_MIN, SUN_ELEVATION_MAX)
  );
  const r = SUN_BOWL_RADIUS;
  return {
    x: r * Math.cos(el) * Math.sin(az),
    y: r * Math.sin(el),
    z: r * Math.cos(el) * Math.cos(az),
  };
}

/** @returns {{ azimuth: number, elevation: number }} */
export function createDefaultSunAngles() {
  return {
    azimuth: SUN_AZIMUTH_DEFAULT,
    elevation: SUN_ELEVATION_DEFAULT,
  };
}

/** @returns {{ x: number, y: number, z: number }} */
export function createDefaultSunPosition() {
  return sunPositionFromAngles(SUN_AZIMUTH_DEFAULT, SUN_ELEVATION_DEFAULT);
}

/** @param {THREE.DirectionalLight} light @param {{ x: number, y: number, z: number }} pos */
export function applySunLightPosition(light, pos) {
  light.position.set(pos.x, pos.y, pos.z);
  light.updateMatrixWorld(true);
}

/** @param {THREE.DirectionalLight} light @param {number} azimuthDeg @param {number} elevationDeg */
export function applySunLightAngles(light, azimuthDeg, elevationDeg) {
  applySunLightPosition(light, sunPositionFromAngles(azimuthDeg, elevationDeg));
}
