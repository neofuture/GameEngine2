export const WEAPON_TUNE_ENABLED_KEY = "fps-weapon-tune-enabled";

export const WEAPON_TUNING_HIP_KEY = "fps-weapon-hip";
export const WEAPON_TUNING_ADS_KEY = "fps-weapon-ads";
export const WEAPON_TUNING_VERSION_KEY = "fps-weapon-tuning-version";
export const BODY_LOOK_UP_AMOUNT_KEY = "fps-body-look-up-amount";
export const BODY_LOOK_DOWN_AMOUNT_KEY = "fps-body-look-down-amount";
export const DEFAULT_BODY_LOOK_UP_AMOUNT = 0;
export const DEFAULT_BODY_LOOK_DOWN_AMOUNT = 0;
const WEAPON_TUNING_VERSION = 4;

/** @typedef {{ posX: number, posY: number, posZ: number, rotX: number, rotY: number, rotZ: number, scale: number }} WeaponPose */

/** @type {WeaponPose} */
export const DEFAULT_HIP_POSE = {
  posX: 0.15,
  posY: -0.17,
  posZ: -0.42,
  rotX: 0,
  rotY: -1.5416,
  rotZ: -0.0416,
  scale: 1.62,
};

/** @type {WeaponPose} */
export const DEFAULT_ADS_POSE = {
  posX: 0,
  posY: -0.117,
  posZ: -0.237,
  rotX: -0.0116,
  rotY: -1.5726,
  rotZ: -0.0187,
  scale: 1.413,
};

const POSE_FIELDS = ["posX", "posY", "posZ", "rotX", "rotY", "rotZ", "scale"];

/** @param {string} key @param {WeaponPose} fallback */
function loadPose(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...fallback };
    const parsed = JSON.parse(raw);
    const pose = { ...fallback };
    for (const field of POSE_FIELDS) {
      const v = parsed[field];
      if (typeof v === "number" && !Number.isNaN(v)) pose[field] = v;
    }
    return pose;
  } catch {
    return { ...fallback };
  }
}

export function loadWeaponTuning() {
  const storedVersion = parseInt(
    localStorage.getItem(WEAPON_TUNING_VERSION_KEY) ?? "0",
    10
  );
  if (storedVersion < WEAPON_TUNING_VERSION) {
    saveWeaponTuning(DEFAULT_HIP_POSE, DEFAULT_ADS_POSE);
    localStorage.setItem(WEAPON_TUNING_VERSION_KEY, String(WEAPON_TUNING_VERSION));
    return { hip: { ...DEFAULT_HIP_POSE }, ads: { ...DEFAULT_ADS_POSE } };
  }
  return {
    hip: loadPose(WEAPON_TUNING_HIP_KEY, DEFAULT_HIP_POSE),
    ads: loadPose(WEAPON_TUNING_ADS_KEY, DEFAULT_ADS_POSE),
  };
}

/** @param {WeaponPose} hip @param {WeaponPose} ads */
export function saveWeaponTuning(hip, ads) {
  localStorage.setItem(WEAPON_TUNING_HIP_KEY, JSON.stringify(hip));
  localStorage.setItem(WEAPON_TUNING_ADS_KEY, JSON.stringify(ads));
  localStorage.setItem(WEAPON_TUNING_VERSION_KEY, String(WEAPON_TUNING_VERSION));
}

/** @param {WeaponPose} pose */
export function formatPoseForCopy(pose) {
  const rounded = {};
  for (const field of POSE_FIELDS) {
    rounded[field] = Math.round(pose[field] * 10000) / 10000;
  }
  return JSON.stringify(rounded, null, 2);
}

export function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}

function loadBodyLookAmount(key, fallback) {
  try {
    const v = parseFloat(localStorage.getItem(key));
    if (typeof v === "number" && !Number.isNaN(v)) return v;
  } catch {
    // ignore
  }
  return fallback;
}

export function loadWeaponTuneEnabled() {
  return localStorage.getItem(WEAPON_TUNE_ENABLED_KEY) === "true";
}

export function saveWeaponTuneEnabled(enabled) {
  localStorage.setItem(WEAPON_TUNE_ENABLED_KEY, String(enabled));
}

export function loadBodyLookUpAmount() {
  return loadBodyLookAmount(
    BODY_LOOK_UP_AMOUNT_KEY,
    DEFAULT_BODY_LOOK_UP_AMOUNT
  );
}

export function loadBodyLookDownAmount() {
  return loadBodyLookAmount(
    BODY_LOOK_DOWN_AMOUNT_KEY,
    DEFAULT_BODY_LOOK_DOWN_AMOUNT
  );
}

export function saveBodyLookUpAmount(amount) {
  localStorage.setItem(BODY_LOOK_UP_AMOUNT_KEY, String(amount));
}

export function saveBodyLookDownAmount(amount) {
  localStorage.setItem(BODY_LOOK_DOWN_AMOUNT_KEY, String(amount));
}
