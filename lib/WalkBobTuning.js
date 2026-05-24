import * as THREE from "three";

export const WALK_BOB_TUNE_ENABLED_KEY = "fps-walk-bob-tune-enabled";
export const WALK_BOB_TUNING_KEY = "fps-walk-bob-tuning";
export const WALK_BOB_TUNING_VERSION = 2;

/** User-facing knobs saved in localStorage. */
export const AMPLITUDE_CM_MIN = 0;
export const AMPLITUDE_CM_MAX = 12;
export const AMPLITUDE_CM_STEP = 0.1;
export const AMPLITUDE_CM_NUDGE = 0.1;

export const DURATION_SEC_MIN = 0.25;
export const DURATION_SEC_MAX = 1.2;
export const DURATION_SEC_STEP = 0.01;
export const DURATION_SEC_NUDGE = 0.01;

/** @typedef {{ amplitudeCm: number, durationSec: number }} WalkBobSimpleTuning */

/** @typedef {{
 *   walkAmp: number,
 *   walkAmpStairs: number,
 *   walkPitch: number,
 *   walkRoll: number,
 *   walkFreqBase: number,
 *   walkFreqPerSpeed: number,
 *   walkSmooth: number,
 *   walkFade: number,
 *   stepDip: number,
 *   stepKick: number,
 *   stepUpSmooth: number,
 *   stepStiffness: number,
 *   stepDamping: number,
 *   weaponStairBobY: number,
 *   weaponStairBobX: number,
 * }} WalkBobTuning */

/** @type {WalkBobSimpleTuning} */
export const DEFAULT_WALK_BOB_SIMPLE = {
  amplitudeCm: 8,
  durationSec: 0.32,
};

const REF_WALK_SPEED = 5;
const PITCH_PER_AMP = 0.008 / 0.034;
const ROLL_PER_AMP = 0.004 / 0.034;
const STAIRS_AMP_MULT = 0.04 / 0.034;
const BASE_FREQ_SHARE =
  1.85 / (1.85 + 0.38 * REF_WALK_SPEED);

/** @param {WalkBobSimpleTuning} simple @returns {WalkBobTuning} */
export function resolveWalkBobTuning(simple) {
  const amplitudeCm = THREE.MathUtils.clamp(
    simple.amplitudeCm,
    AMPLITUDE_CM_MIN,
    AMPLITUDE_CM_MAX
  );
  const durationSec = THREE.MathUtils.clamp(
    simple.durationSec,
    DURATION_SEC_MIN,
    DURATION_SEC_MAX
  );

  const walkAmp = amplitudeCm / 100;
  const ampNorm = walkAmp / (AMPLITUDE_CM_MAX / 100);
  const cycleHz = 1 / durationSec;
  const walkFreqBase = cycleHz * BASE_FREQ_SHARE;
  const walkFreqPerSpeed =
    (cycleHz * (1 - BASE_FREQ_SHARE)) / REF_WALK_SPEED;
  const durationT =
    (durationSec - DURATION_SEC_MIN) / (DURATION_SEC_MAX - DURATION_SEC_MIN);

  return {
    walkAmp,
    walkAmpStairs: walkAmp * STAIRS_AMP_MULT,
    walkPitch: walkAmp * PITCH_PER_AMP,
    walkRoll: walkAmp * ROLL_PER_AMP,
    walkFreqBase,
    walkFreqPerSpeed,
    walkSmooth: THREE.MathUtils.lerp(5, 12, durationT),
    walkFade: THREE.MathUtils.lerp(4, 6, durationT),
    stepDip: walkAmp * 1.03,
    stepKick: ampNorm * 6,
    stepUpSmooth: THREE.MathUtils.lerp(18, 30, durationT),
    stepStiffness: THREE.MathUtils.lerp(200, 160, durationT),
    stepDamping: THREE.MathUtils.lerp(12, 16, durationT),
    weaponStairBobY: THREE.MathUtils.lerp(1.1, 1.8, ampNorm),
    weaponStairBobX: THREE.MathUtils.lerp(1, 1.35, ampNorm),
  };
}

/** @param {Partial<WalkBobSimpleTuning>} [overrides] @returns {WalkBobSimpleTuning} */
export function normalizeWalkBobSimple(overrides = {}) {
  return {
    amplitudeCm: THREE.MathUtils.clamp(
      typeof overrides.amplitudeCm === "number" && !Number.isNaN(overrides.amplitudeCm)
        ? overrides.amplitudeCm
        : DEFAULT_WALK_BOB_SIMPLE.amplitudeCm,
      AMPLITUDE_CM_MIN,
      AMPLITUDE_CM_MAX
    ),
    durationSec: THREE.MathUtils.clamp(
      typeof overrides.durationSec === "number" && !Number.isNaN(overrides.durationSec)
        ? overrides.durationSec
        : DEFAULT_WALK_BOB_SIMPLE.durationSec,
      DURATION_SEC_MIN,
      DURATION_SEC_MAX
    ),
  };
}

/** @param {Record<string, unknown>} parsed @returns {WalkBobSimpleTuning} */
function migrateStoredTuning(parsed) {
  if (
    typeof parsed.amplitudeCm === "number" &&
    typeof parsed.durationSec === "number"
  ) {
    return normalizeWalkBobSimple(parsed);
  }

  if (typeof parsed.walkAmp === "number") {
    return normalizeWalkBobSimple({
      amplitudeCm: parsed.walkAmp * 100,
      durationSec:
        typeof parsed.walkFreqBase === "number" && parsed.walkFreqBase > 0
          ? 1 / parsed.walkFreqBase
          : DEFAULT_WALK_BOB_SIMPLE.durationSec,
    });
  }

  return { ...DEFAULT_WALK_BOB_SIMPLE };
}

/** @returns {WalkBobSimpleTuning} */
export function loadWalkBobTuning() {
  if (typeof window === "undefined") return { ...DEFAULT_WALK_BOB_SIMPLE };
  try {
    const raw = localStorage.getItem(WALK_BOB_TUNING_KEY);
    if (!raw) return { ...DEFAULT_WALK_BOB_SIMPLE };
    const parsed = JSON.parse(raw);
    return migrateStoredTuning(parsed);
  } catch {
    return { ...DEFAULT_WALK_BOB_SIMPLE };
  }
}

/** @param {WalkBobSimpleTuning} tuning */
export function saveWalkBobTuning(tuning) {
  if (typeof window === "undefined") return;
  const simple = normalizeWalkBobSimple(tuning);
  localStorage.setItem(
    WALK_BOB_TUNING_KEY,
    JSON.stringify({ ...simple, version: WALK_BOB_TUNING_VERSION })
  );
}

export function loadWalkBobTuneEnabled() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(WALK_BOB_TUNE_ENABLED_KEY) === "true";
}

/** @param {boolean} enabled */
export function saveWalkBobTuneEnabled(enabled) {
  if (typeof window === "undefined") return;
  localStorage.setItem(WALK_BOB_TUNE_ENABLED_KEY, String(enabled));
}

/** @deprecated Use DEFAULT_WALK_BOB_SIMPLE + resolveWalkBobTuning */
export const DEFAULT_WALK_BOB_TUNING = resolveWalkBobTuning(
  DEFAULT_WALK_BOB_SIMPLE
);

/** @deprecated Use normalizeWalkBobSimple */
export function normalizeWalkBobTuning(overrides = {}) {
  return resolveWalkBobTuning(normalizeWalkBobSimple(overrides));
}
