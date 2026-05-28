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
 * @returns {number | null}
 */
export function sampleStairRampFootY(stairFlight, worldX, worldZ, scratch) {
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
  return scratch.y;
}

/**
 * @param {import("./LevelStairs.js").StairFlightRuntime} stairFlight
 * @param {number} worldX
 * @param {number} worldZ
 * @param {THREE.Vector3} scratch
 */
export function isOnStairRamp(stairFlight, worldX, worldZ, scratch) {
  return sampleStairRampFootY(stairFlight, worldX, worldZ, scratch) != null;
}
