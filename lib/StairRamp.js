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
 * @param {number | null} [footYWorld] Player foot height — rejects snap when far below ramp
 * @param {number} [maxStepUp=0.42] Max step-up onto the ramp from current foot height
 * @param {boolean} [onRamp=false] Already climbing — skip under-slope rejection
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

  if (footYWorld != null) {
    const stepUpReach = maxStepUp + 0.08;
    if (!onRamp) {
      // On the lip or mid-flight: allow snapping onto the slope within step-up reach.
      if (footYWorld >= worldRampY - stepUpReach) {
        return worldRampY;
      }
      // Floor well below the slope — blocks under-stair teleport, not front climbs.
      if (footYWorld < worldRampY - 0.2) return null;
      // Bottom approach from far ahead of the lip when still out of step-up range.
      const belowRamp = footYWorld < worldRampY - maxStepUp - 0.06;
      if (belowRamp && localZ > (maxStepUp + 0.12) / ramp.risePerRun) {
        return null;
      }
    }
    if (footYWorld > worldRampY + 0.35) return null;
  }

  return worldRampY;
}

/**
 * Ramp walk surface height at (worldX, worldZ) — no foot-height gate.
 * Used by collision to tell ramp followers from floor-level walk-through.
 *
 * @param {import("./LevelStairs.js").StairFlightRuntime} stairFlight
 * @param {number} worldX
 * @param {number} worldZ
 * @param {THREE.Vector3} scratch
 * @returns {number | null}
 */
export function sampleStairRampFootYRaw(
  stairFlight,
  worldX,
  worldZ,
  scratch
) {
  return sampleStairRampFootY(stairFlight, worldX, worldZ, scratch, null);
}
