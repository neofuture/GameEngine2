import * as THREE from "three";

export const WALK_BOB_TUNE_ENABLED_KEY = "fps-walk-bob-tune-enabled";
export const WALK_BOB_TUNING_KEY = "fps-walk-bob-tuning";
export const WALK_BOB_TUNING_VERSION = 3;

/** User-facing knobs saved in localStorage. */
export const AMPLITUDE_CM_MIN = 0;
export const AMPLITUDE_CM_MAX = 20;
export const AMPLITUDE_CM_STEP = 0.1;
export const AMPLITUDE_CM_NUDGE = 0.1;

export const DURATION_SEC_MIN = 0.25;
export const DURATION_SEC_MAX = 1.2;
export const DURATION_SEC_STEP = 0.01;
export const DURATION_SEC_NUDGE = 0.01;

export const WALK_SPEED_MIN = 2;
export const WALK_SPEED_MAX = 10;
export const WALK_SPEED_STEP = 0.1;
export const WALK_SPEED_NUDGE = 0.25;
export const WALK_SPEED_DEFAULT = 4;

export const SPRINT_SPEED_MIN = 4;
export const SPRINT_SPEED_MAX = 16;
export const SPRINT_SPEED_STEP = 0.1;
export const SPRINT_SPEED_NUDGE = 0.25;
export const SPRINT_SPEED_DEFAULT = 8;

export const PITCH_SCALE_MIN = 0;
export const PITCH_SCALE_MAX = 3;
export const PITCH_SCALE_STEP = 0.05;
export const PITCH_SCALE_NUDGE = 0.1;

export const ROLL_SCALE_MIN = 0;
export const ROLL_SCALE_MAX = 3;
export const ROLL_SCALE_STEP = 0.05;
export const ROLL_SCALE_NUDGE = 0.1;

export const WEAPON_BOB_SCALE_MIN = 0;
export const WEAPON_BOB_SCALE_MAX = 2.5;
export const WEAPON_BOB_SCALE_STEP = 0.05;
export const WEAPON_BOB_SCALE_NUDGE = 0.1;

/** @typedef {{
 *   amplitudeCm: number,
 *   durationSec: number,
 *   walkSpeed: number,
 *   sprintSpeed: number,
 *   pitchScale: number,
 *   rollScale: number,
 *   weaponBobScale: number,
 * }} WalkBobSimpleTuning */

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
 *   walkSpeed: number,
 *   sprintSpeed: number,
 *   weaponBobScale: number,
 * }} WalkBobTuning */

/** @type {WalkBobSimpleTuning} */
export const DEFAULT_WALK_BOB_SIMPLE = {
  amplitudeCm: 14.5,
  durationSec: 0.47,
  walkSpeed: 4,
  sprintSpeed: 8,
  pitchScale: 0.6,
  rollScale: 0.75,
  weaponBobScale: 1,
};

const PITCH_PER_AMP = 0.008 / 0.034;
const ROLL_PER_AMP = 0.004 / 0.034;
const STAIRS_AMP_MULT = 0.04 / 0.034;

function clampNumber(value, fallback, min, max) {
  return THREE.MathUtils.clamp(
    typeof value === "number" && !Number.isNaN(value) ? value : fallback,
    min,
    max
  );
}

/** @param {WalkBobSimpleTuning} simple @returns {WalkBobTuning} */
export function resolveWalkBobTuning(simple) {
  const amplitudeCm = clampNumber(
    simple.amplitudeCm,
    DEFAULT_WALK_BOB_SIMPLE.amplitudeCm,
    AMPLITUDE_CM_MIN,
    AMPLITUDE_CM_MAX
  );
  const durationSec = clampNumber(
    simple.durationSec,
    DEFAULT_WALK_BOB_SIMPLE.durationSec,
    DURATION_SEC_MIN,
    DURATION_SEC_MAX
  );
  const walkSpeed = clampNumber(
    simple.walkSpeed,
    DEFAULT_WALK_BOB_SIMPLE.walkSpeed,
    WALK_SPEED_MIN,
    WALK_SPEED_MAX
  );
  const sprintSpeed = clampNumber(
    simple.sprintSpeed,
    DEFAULT_WALK_BOB_SIMPLE.sprintSpeed,
    Math.max(SPRINT_SPEED_MIN, walkSpeed + 0.5),
    SPRINT_SPEED_MAX
  );
  const pitchScale = clampNumber(
    simple.pitchScale,
    DEFAULT_WALK_BOB_SIMPLE.pitchScale,
    PITCH_SCALE_MIN,
    PITCH_SCALE_MAX
  );
  const rollScale = clampNumber(
    simple.rollScale,
    DEFAULT_WALK_BOB_SIMPLE.rollScale,
    ROLL_SCALE_MIN,
    ROLL_SCALE_MAX
  );
  const weaponBobScale = clampNumber(
    simple.weaponBobScale,
    DEFAULT_WALK_BOB_SIMPLE.weaponBobScale,
    WEAPON_BOB_SCALE_MIN,
    WEAPON_BOB_SCALE_MAX
  );

  const walkAmp = amplitudeCm / 100;
  const ampNorm = walkAmp / (AMPLITUDE_CM_MAX / 100);
  const cycleHz = 1 / durationSec;
  const freqShare =
    1.85 / (1.85 + 0.38 * Math.max(walkSpeed, 0.1));
  const walkFreqBase = cycleHz * freqShare;
  const walkFreqPerSpeed = (cycleHz * (1 - freqShare)) / walkSpeed;
  const durationT =
    (durationSec - DURATION_SEC_MIN) / (DURATION_SEC_MAX - DURATION_SEC_MIN);

  return {
    walkAmp,
    walkAmpStairs: walkAmp * STAIRS_AMP_MULT,
    walkPitch: walkAmp * PITCH_PER_AMP * pitchScale,
    walkRoll: walkAmp * ROLL_PER_AMP * rollScale,
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
    walkSpeed,
    sprintSpeed,
    weaponBobScale,
  };
}

/** @param {Partial<WalkBobSimpleTuning>} [overrides] @returns {WalkBobSimpleTuning} */
export function normalizeWalkBobSimple(overrides = {}) {
  const walkSpeed = clampNumber(
    overrides.walkSpeed,
    DEFAULT_WALK_BOB_SIMPLE.walkSpeed,
    WALK_SPEED_MIN,
    WALK_SPEED_MAX
  );
  return {
    amplitudeCm: clampNumber(
      overrides.amplitudeCm,
      DEFAULT_WALK_BOB_SIMPLE.amplitudeCm,
      AMPLITUDE_CM_MIN,
      AMPLITUDE_CM_MAX
    ),
    durationSec: clampNumber(
      overrides.durationSec,
      DEFAULT_WALK_BOB_SIMPLE.durationSec,
      DURATION_SEC_MIN,
      DURATION_SEC_MAX
    ),
    walkSpeed,
    sprintSpeed: clampNumber(
      overrides.sprintSpeed,
      DEFAULT_WALK_BOB_SIMPLE.sprintSpeed,
      Math.max(SPRINT_SPEED_MIN, walkSpeed + 0.5),
      SPRINT_SPEED_MAX
    ),
    pitchScale: clampNumber(
      overrides.pitchScale,
      DEFAULT_WALK_BOB_SIMPLE.pitchScale,
      PITCH_SCALE_MIN,
      PITCH_SCALE_MAX
    ),
    rollScale: clampNumber(
      overrides.rollScale,
      DEFAULT_WALK_BOB_SIMPLE.rollScale,
      ROLL_SCALE_MIN,
      ROLL_SCALE_MAX
    ),
    weaponBobScale: clampNumber(
      overrides.weaponBobScale,
      DEFAULT_WALK_BOB_SIMPLE.weaponBobScale,
      WEAPON_BOB_SCALE_MIN,
      WEAPON_BOB_SCALE_MAX
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
