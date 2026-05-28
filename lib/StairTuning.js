import * as THREE from "three";
import {
  STAIRS_STEP_COUNT,
  STAIRS_STEP_RISE,
  STAIRS_STEP_RUN,
  STAIRS_TOTAL_RISE,
  STAIRS_TOTAL_RUN,
  STAIR_EXTRA_RISE,
  STAIRS_EFFECTIVE_TOTAL_RISE,
  STAIRS_WIDTH,
} from "./LevelStairs.js";

export {
  STAIRS_WIDTH,
  STAIRS_STEP_COUNT,
  STAIRS_STEP_RISE,
  STAIRS_STEP_RUN,
  STAIRS_TOTAL_RISE,
  STAIRS_TOTAL_RUN,
  STAIR_EXTRA_RISE,
  STAIRS_EFFECTIVE_TOTAL_RISE,
};

// Baked-in defaults (single source of truth — level JSON does not author placement).
export const STAIR_X_DEFAULT = 1.12;
export const STAIR_Y_DEFAULT = 0;
export const STAIR_Z_DEFAULT = -8.33;
export const STAIR_ROTATION_DEFAULT = 90;

/** @type {Readonly<import("./LevelStairs.js").StairPlacement>} */
export const DEFAULT_STAIR_PLACEMENT = Object.freeze({
  position: Object.freeze({
    x: STAIR_X_DEFAULT,
    y: STAIR_Y_DEFAULT,
    z: STAIR_Z_DEFAULT,
  }),
  rotationY: STAIR_ROTATION_DEFAULT,
});

/** @returns {import("./LevelStairs.js").StairPlacement} */
export function getDefaultStairPlacement() {
  return {
    position: { ...DEFAULT_STAIR_PLACEMENT.position },
    rotationY: DEFAULT_STAIR_PLACEMENT.rotationY,
  };
}

export const STAIR_POS_MIN = -12;
export const STAIR_POS_MAX = 12;
export const STAIR_Y_MIN = -0.5;
/** Catwalk deck is ~4.1 m on the default arena — keep headroom above it. */
export const STAIR_Y_MAX = 8;
export const STAIR_ROTATION_MIN = 0;
export const STAIR_ROTATION_MAX = 360;
/** Range slider resolution (metres / degrees). */
export const STAIR_SLIDER_STEP = 0.001;
export const STAIR_ROTATION_STEP = 0.1;
/** ± button step — same as slider for predictable nudging. */
export const STAIR_NUDGE_STEP = 0.001;
export const STAIR_ROTATION_NUDGE = 0.1;

export const STAIR_X_KEY = "fps-stair-x";
export const STAIR_Y_KEY = "fps-stair-y";
export const STAIR_Z_KEY = "fps-stair-z";
export const STAIR_ROTATION_KEY = "fps-stair-rotation-y";

function readStored(key, fallback, min, max) {
  if (typeof window === "undefined") return fallback;
  const v = parseFloat(localStorage.getItem(key));
  if (Number.isNaN(v)) return fallback;
  return THREE.MathUtils.clamp(v, min, max);
}

/** @typedef {import("./LevelStairs.js").StairPlacement} StairPlacement */

const CEILING_OVERLAP = 0;

/** Walkable top of the main arena floor (matches Level.js floor slab). */
export function getArenaFloorDeckY() {
  return 0;
}

/** Top of the arena catwalk / ceiling deck (upper landing walk surface). */
export function getArenaCatwalkDeckY(arena) {
  const wallHeight = arena?.wallHeight ?? 4;
  const ceilingThickness = arena?.ceilingThickness ?? 0.35;
  const ceilingBottomY = wallHeight - CEILING_OVERLAP;
  return ceilingBottomY + ceilingThickness;
}

/**
 * @param {Record<string, unknown> | null | undefined} arenaStairs
 * @param {number} [floorDeckY]
 * @returns {StairPlacement}
 */
export function normalizeArenaStairs(arenaStairs, floorDeckY = STAIR_Y_DEFAULT) {
  if (arenaStairs?.position && typeof arenaStairs.rotationY === "number") {
    const p = arenaStairs.position;
    const y =
      p.y == null || p.y === 0 ? floorDeckY : p.y;
    const catwalkDeckY = getArenaCatwalkDeckY();
    const resolvedY =
      Math.abs(y - catwalkDeckY) < 0.05 ? floorDeckY : y;
    return {
      position: {
        x: p.x ?? STAIR_X_DEFAULT,
        y: resolvedY,
        z: p.z ?? STAIR_Z_DEFAULT,
      },
      rotationY: arenaStairs.rotationY,
    };
  }

  const legacy = arenaStairs;
  if (legacy?.start && legacy?.end) {
    const dx = legacy.end.x - legacy.start.x;
    const dz = legacy.end.z - legacy.start.z;
    return {
      position: {
        x: legacy.start.x ?? STAIR_X_DEFAULT,
        y: 0,
        z: legacy.start.z ?? STAIR_Z_DEFAULT,
      },
      rotationY: THREE.MathUtils.radToDeg(Math.atan2(dx, dz)),
    };
  }

  return getDefaultStairPlacement();
}

/**
 * @param {Record<string, unknown> | null | undefined} arenaStairs
 * @param {import("./loadArena.js").ArenaConfig | null | undefined} [arena]
 * @returns {StairPlacement}
 */
export function loadStairTuning(arenaStairs, arena = null) {
  const floorDeckY = getArenaFloorDeckY();
  const base = normalizeArenaStairs(arenaStairs, floorDeckY);
  const catwalkDeckY = getArenaCatwalkDeckY(arena);

  let storedY = readStored(STAIR_Y_KEY, base.position.y, STAIR_Y_MIN, STAIR_Y_MAX);
  // Older arenas placed the flight base at catwalk height — stairs must start on the floor.
  if (Math.abs(storedY - catwalkDeckY) < 0.05) {
    storedY = floorDeckY;
  }

  return {
    position: {
      x: readStored(
        STAIR_X_KEY,
        base.position.x,
        STAIR_POS_MIN,
        STAIR_POS_MAX
      ),
      y: storedY,
      z: readStored(
        STAIR_Z_KEY,
        base.position.z,
        STAIR_POS_MIN,
        STAIR_POS_MAX
      ),
    },
    rotationY: readStored(
      STAIR_ROTATION_KEY,
      base.rotationY,
      STAIR_ROTATION_MIN,
      STAIR_ROTATION_MAX
    ),
  };
}

/** @param {StairPlacement} params */
export function saveStairTuning(params) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STAIR_X_KEY, String(params.position.x));
  localStorage.setItem(STAIR_Y_KEY, String(params.position.y));
  localStorage.setItem(STAIR_Z_KEY, String(params.position.z));
  localStorage.setItem(STAIR_ROTATION_KEY, String(params.rotationY));
}
