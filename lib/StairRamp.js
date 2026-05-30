import * as THREE from "three";
import {
  STAIRS_EFFECTIVE_TOTAL_RISE,
  STAIRS_TOTAL_RUN,
} from "./LevelStairs.js";

/**
 * Build ramp metadata for a stair flight. Movement uses a continuous slope;
 * tread meshes are visual only.
 *
 * @param {number} halfWidth Half-width of the walkable tread area (m)
 * @param {number} [topWalkLocalY] Walk surface height at the top (local Y)
 * @param {number} [landingHalfZ] Flat run beyond the slope for the top landing
 */
export function createStairRampConfig(
  halfWidth,
  topWalkLocalY = STAIRS_EFFECTIVE_TOTAL_RISE,
  landingHalfZ = 0.45
) {
  return {
    halfWidth,
    zMin: -0.2,
    zMax: STAIRS_TOTAL_RUN + landingHalfZ,
    runEnd: STAIRS_TOTAL_RUN,
    risePerRun: topWalkLocalY / STAIRS_TOTAL_RUN,
    topY: topWalkLocalY,
  };
}

/**
 * World foot Y on the stair ramp at (worldX, worldZ), or null if outside.
 *
 * @param {import("./LevelStairs.js").StairFlightRuntime} stairFlight
 * @param {number} worldX
 * @param {number} worldZ
 * @param {THREE.Vector3} scratch
 * @param {number | null} [footYWorld] Player foot height — prevents portal snaps
 * @param {number} [maxStepUp=0.42] Max step-up onto the ramp from current foot height
 * @param {boolean} [onRamp=false] Already on the ramp this frame — follow slope freely
 * @returns {number | null}
 */
export function sampleStairRampFootY(
  stairFlight,
  worldX,
  worldZ,
  scratch,
  footYWorld = null,
  maxStepUp = 0.42,
  onRamp = false
) {
  const ramp = stairFlight.ramp;
  if (!ramp?.halfWidth || !stairFlight.inverseMatrix || !stairFlight.matrixWorld) {
    return null;
  }

  scratch.set(worldX, 0, worldZ);
  scratch.applyMatrix4(stairFlight.inverseMatrix);
  const localX = scratch.x;
  const localZ = scratch.z;

  if (Math.abs(localX) > ramp.halfWidth + 0.06) return null;
  if (localZ < ramp.zMin || localZ > ramp.zMax) return null;

  const localY =
    localZ <= ramp.runEnd
      ? Math.max(0, localZ * ramp.risePerRun)
      : ramp.topY;

  scratch.set(localX, Math.min(localY, ramp.topY), localZ);
  scratch.applyMatrix4(stairFlight.matrixWorld);
  const worldRampY = scratch.y;

  if (footYWorld != null && !onRamp) {
    const stepUpReach = maxStepUp + 0.12;
    const dy = footYWorld - worldRampY;
    // Step onto the ramp from slightly below, or settle from just above — not from
    // catwalk height down onto a distant point on the slope below.
    if (dy >= -stepUpReach && dy <= 0.08) {
      return worldRampY;
    }
    return null;
  }

  return worldRampY;
}

/**
 * Ramp height with no foot gate — for debug / collision context only.
 *
 * @param {import("./LevelStairs.js").StairFlightRuntime} stairFlight
 * @param {number} worldX
 * @param {number} worldZ
 * @param {THREE.Vector3} scratch
 */
export function sampleStairRampFootYRaw(stairFlight, worldX, worldZ, scratch) {
  return sampleStairRampFootY(stairFlight, worldX, worldZ, scratch, null);
}

/**
 * @param {import("./LevelStairs.js").StairFlightRuntime} stairFlight
 * @param {number} worldX
 * @param {number} worldZ
 * @param {THREE.Vector3} scratch
 */
export function isOnStairRamp(stairFlight, worldX, worldZ, scratch) {
  return sampleStairRampFootY(stairFlight, worldX, worldZ, scratch, null) != null;
}
