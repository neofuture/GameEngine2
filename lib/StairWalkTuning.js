import * as THREE from "three";

export const STAIR_WALK_TUNE_ENABLED_KEY = "fps-stair-walk-tune-enabled";
export const STAIR_WALK_TUNING_KEY = "fps-stair-walk-tuning";
export const STAIR_WALK_TUNING_VERSION = 2;

export const WEAPON_BOB_SCALE_MIN = 0;
export const WEAPON_BOB_SCALE_MAX = 1.5;
export const WEAPON_BOB_SCALE_STEP = 0.01;
export const WEAPON_BOB_SCALE_NUDGE = 0.05;
/** Baked from stair walk tuning wizard. */
export const WEAPON_BOB_SCALE_DEFAULT = 1.5;

export const WEAPON_AXIS_MULT_MIN = 0;
export const WEAPON_AXIS_MULT_MAX = 2;
export const WEAPON_AXIS_MULT_STEP = 0.01;
export const WEAPON_AXIS_MULT_NUDGE = 0.05;
export const WEAPON_BOB_Y_DEFAULT = 0.85;
export const WEAPON_BOB_X_DEFAULT = 1.01;
export const WEAPON_BOB_ROLL_DEFAULT = 1.49;

export const BOB_FREQ_MIN_MIN = 0.4;
export const BOB_FREQ_MIN_MAX = 5;
export const BOB_FREQ_MIN_STEP = 0.05;
export const BOB_FREQ_MIN_NUDGE = 0.1;
export const BOB_FREQ_MIN_DEFAULT = 2.15;

export const BOB_FREQ_SPEED_SCALE_MIN = 0;
export const BOB_FREQ_SPEED_SCALE_MAX = 1.5;
export const BOB_FREQ_SPEED_SCALE_STEP = 0.01;
export const BOB_FREQ_SPEED_SCALE_NUDGE = 0.05;
export const BOB_FREQ_SPEED_SCALE_DEFAULT = 0.27;

export const CAMERA_BOB_SCALE_MIN = 0;
export const CAMERA_BOB_SCALE_MAX = 1.5;
export const CAMERA_BOB_SCALE_STEP = 0.01;
export const CAMERA_BOB_SCALE_NUDGE = 0.05;
export const CAMERA_BOB_SCALE_DEFAULT = 0.52;

export const CAMERA_AXIS_MULT_MIN = 0;
export const CAMERA_AXIS_MULT_MAX = 2;
export const CAMERA_AXIS_MULT_STEP = 0.01;
export const CAMERA_AXIS_MULT_NUDGE = 0.05;
export const CAMERA_BOB_PITCH_SCALE_DEFAULT = 0.9;
export const CAMERA_BOB_ROLL_SCALE_DEFAULT = 0.85;

export const FOOTSTEP_STRIDE_SCALE_MIN = 0.5;
export const FOOTSTEP_STRIDE_SCALE_MAX = 2.5;
export const FOOTSTEP_STRIDE_SCALE_STEP = 0.01;
export const FOOTSTEP_STRIDE_SCALE_NUDGE = 0.05;
export const FOOTSTEP_STRIDE_SCALE_DEFAULT = 1.49;

export const FOOTSTEP_VOLUME_SCALE_MIN = 0;
export const FOOTSTEP_VOLUME_SCALE_MAX = 1.5;
export const FOOTSTEP_VOLUME_SCALE_STEP = 0.01;
export const FOOTSTEP_VOLUME_SCALE_NUDGE = 0.05;
export const FOOTSTEP_VOLUME_SCALE_DEFAULT = 0.6;

/** @typedef {{
 *   weaponBobScale: number,
 *   weaponBobY: number,
 *   weaponBobX: number,
 *   weaponBobRoll: number,
 *   bobFreqMin: number,
 *   bobFreqSpeedScale: number,
 *   cameraBobScale: number,
 *   cameraBobPitchScale: number,
 *   cameraBobRollScale: number,
 *   footstepStrideScale: number,
 *   footstepVolumeScale: number,
 * }} StairWalkTuning */

/** @type {StairWalkTuning} */
export const DEFAULT_STAIR_WALK_TUNING = {
  weaponBobScale: WEAPON_BOB_SCALE_DEFAULT,
  weaponBobY: WEAPON_BOB_Y_DEFAULT,
  weaponBobX: WEAPON_BOB_X_DEFAULT,
  weaponBobRoll: WEAPON_BOB_ROLL_DEFAULT,
  bobFreqMin: BOB_FREQ_MIN_DEFAULT,
  bobFreqSpeedScale: BOB_FREQ_SPEED_SCALE_DEFAULT,
  cameraBobScale: CAMERA_BOB_SCALE_DEFAULT,
  cameraBobPitchScale: CAMERA_BOB_PITCH_SCALE_DEFAULT,
  cameraBobRollScale: CAMERA_BOB_ROLL_SCALE_DEFAULT,
  footstepStrideScale: FOOTSTEP_STRIDE_SCALE_DEFAULT,
  footstepVolumeScale: FOOTSTEP_VOLUME_SCALE_DEFAULT,
};

function clampNumber(value, fallback, min, max) {
  return THREE.MathUtils.clamp(
    typeof value === "number" && !Number.isNaN(value) ? value : fallback,
    min,
    max
  );
}

/** @param {Partial<StairWalkTuning>} [overrides] @returns {StairWalkTuning} */
export function normalizeStairWalkTuning(overrides = {}) {
  return {
    weaponBobScale: clampNumber(
      overrides.weaponBobScale,
      DEFAULT_STAIR_WALK_TUNING.weaponBobScale,
      WEAPON_BOB_SCALE_MIN,
      WEAPON_BOB_SCALE_MAX
    ),
    weaponBobY: clampNumber(
      overrides.weaponBobY,
      DEFAULT_STAIR_WALK_TUNING.weaponBobY,
      WEAPON_AXIS_MULT_MIN,
      WEAPON_AXIS_MULT_MAX
    ),
    weaponBobX: clampNumber(
      overrides.weaponBobX,
      DEFAULT_STAIR_WALK_TUNING.weaponBobX,
      WEAPON_AXIS_MULT_MIN,
      WEAPON_AXIS_MULT_MAX
    ),
    weaponBobRoll: clampNumber(
      overrides.weaponBobRoll,
      DEFAULT_STAIR_WALK_TUNING.weaponBobRoll,
      WEAPON_AXIS_MULT_MIN,
      WEAPON_AXIS_MULT_MAX
    ),
    bobFreqMin: clampNumber(
      overrides.bobFreqMin,
      DEFAULT_STAIR_WALK_TUNING.bobFreqMin,
      BOB_FREQ_MIN_MIN,
      BOB_FREQ_MIN_MAX
    ),
    bobFreqSpeedScale: clampNumber(
      overrides.bobFreqSpeedScale,
      DEFAULT_STAIR_WALK_TUNING.bobFreqSpeedScale,
      BOB_FREQ_SPEED_SCALE_MIN,
      BOB_FREQ_SPEED_SCALE_MAX
    ),
    cameraBobScale: clampNumber(
      overrides.cameraBobScale,
      DEFAULT_STAIR_WALK_TUNING.cameraBobScale,
      CAMERA_BOB_SCALE_MIN,
      CAMERA_BOB_SCALE_MAX
    ),
    cameraBobPitchScale: clampNumber(
      overrides.cameraBobPitchScale,
      DEFAULT_STAIR_WALK_TUNING.cameraBobPitchScale,
      CAMERA_AXIS_MULT_MIN,
      CAMERA_AXIS_MULT_MAX
    ),
    cameraBobRollScale: clampNumber(
      overrides.cameraBobRollScale,
      DEFAULT_STAIR_WALK_TUNING.cameraBobRollScale,
      CAMERA_AXIS_MULT_MIN,
      CAMERA_AXIS_MULT_MAX
    ),
    footstepStrideScale: clampNumber(
      overrides.footstepStrideScale,
      DEFAULT_STAIR_WALK_TUNING.footstepStrideScale,
      FOOTSTEP_STRIDE_SCALE_MIN,
      FOOTSTEP_STRIDE_SCALE_MAX
    ),
    footstepVolumeScale: clampNumber(
      overrides.footstepVolumeScale,
      DEFAULT_STAIR_WALK_TUNING.footstepVolumeScale,
      FOOTSTEP_VOLUME_SCALE_MIN,
      FOOTSTEP_VOLUME_SCALE_MAX
    ),
  };
}

/** @returns {StairWalkTuning} */
export function loadStairWalkTuning() {
  if (typeof window === "undefined") return { ...DEFAULT_STAIR_WALK_TUNING };
  try {
    const raw = localStorage.getItem(STAIR_WALK_TUNING_KEY);
    if (!raw) return { ...DEFAULT_STAIR_WALK_TUNING };
    const parsed = JSON.parse(raw);
    if (parsed.version !== STAIR_WALK_TUNING_VERSION) {
      return normalizeStairWalkTuning(DEFAULT_STAIR_WALK_TUNING);
    }
    return normalizeStairWalkTuning(parsed);
  } catch {
    return { ...DEFAULT_STAIR_WALK_TUNING };
  }
}

/** @param {StairWalkTuning} tuning */
export function saveStairWalkTuning(tuning) {
  if (typeof window === "undefined") return;
  const normalized = normalizeStairWalkTuning(tuning);
  localStorage.setItem(
    STAIR_WALK_TUNING_KEY,
    JSON.stringify({ ...normalized, version: STAIR_WALK_TUNING_VERSION })
  );
}

export function loadStairWalkTuneEnabled() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STAIR_WALK_TUNE_ENABLED_KEY) === "true";
}

/** @param {boolean} enabled */
export function saveStairWalkTuneEnabled(enabled) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STAIR_WALK_TUNE_ENABLED_KEY, String(enabled));
}
