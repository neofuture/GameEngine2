/**
 * Simulates walking down the default stair flight and reports collider blocks.
 * Run: node scripts/stair-exit-test.mjs
 */
import * as THREE from "three";
import { buildStairFlight, clearStairGroup } from "../lib/LevelStairs.js";
import { shouldSkipCollider, rotatedBoxOverlapsCircle } from "../lib/Collision.js";
import { sampleStairRampFootYRaw } from "../lib/StairRamp.js";
import { getDefaultStairPlacement } from "../lib/StairTuning.js";

const PLAYER_RADIUS = 0.35;
const EYE_HEIGHT = 1.65;
const STEP_UP_MAX = 0.42;
const floorY = 0;

const placement = getDefaultStairPlacement();
const group = new THREE.Group();
const colliders = [];
const groundSurfaces = [];

const treadMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
clearStairGroup(group);
const built = buildStairFlight(group, placement, treadMat, treadMat, {
  catwalkDeckY: 4.35,
});
colliders.push(...built.colliders);
groundSurfaces.push(...built.groundSurfaces);

const stairFlight = groundSurfaces.find((s) => s.stairFlight)?.stairFlight;
if (!stairFlight) {
  console.error("No stair flight");
  process.exit(1);
}

const scratch = new THREE.Vector3();
const yaw = stairFlight.rotationY;

function worldToLocal(x, z) {
  scratch.set(x, 0, z);
  scratch.applyMatrix4(stairFlight.inverseMatrix);
  return { localX: scratch.x, localZ: scratch.z };
}

function localToWorld(localX, localZ) {
  scratch.set(localX, 0, localZ);
  scratch.applyMatrix4(stairFlight.matrixWorld);
  return { x: scratch.x, z: scratch.z };
}

function sampleRampY(x, z) {
  return sampleStairRampFootYRaw(stairFlight, x, z, scratch);
}

function getSupportY(x, z, footY, climbLocalMotion) {
  const rampY = sampleRampY(x, z);
  if (rampY != null) {
    const { localZ } = worldToLocal(x, z);
    if (
      localZ <= 0.2 &&
      localZ >= -0.45 &&
      rampY <= floorY + 0.12 &&
      climbLocalMotion <= 0.12 &&
      footY <= floorY + 0.1
    ) {
      return floorY;
    }
    return rampY;
  }
  return floorY;
}

function wouldBlock(x, z, footY, vx, vz, supportY, followingRamp) {
  const speed = Math.hypot(vx, vz) || 1;
  const climbLocalMotion =
    (vx * Math.sin(yaw) + vz * Math.cos(yaw)) / speed;
  const bodyTop = footY + EYE_HEIGHT;
  const rampFootY = sampleRampY(x, z);
  const stairLocal = worldToLocal(x, z);

  for (const box of colliders) {
    if (!rotatedBoxOverlapsCircle(box, x, z, PLAYER_RADIUS)) continue;
    if (
      !shouldSkipCollider(
        box,
        footY,
        bodyTop,
        STEP_UP_MAX,
        supportY,
        stairLocal,
        climbLocalMotion,
        rampFootY,
        followingRamp
      )
    ) {
      return box.kind;
    }
  }
  return null;
}

console.log("Stair placement:", placement);
console.log("Ramp zMin:", stairFlight.ramp.zMin, "runEnd:", stairFlight.ramp.runEnd);

// Walk down center line from top toward bottom (-localZ = down = -world X)
const startLocalZ = 4.5;
const endLocalZ = -0.8;
const steps = 60;

let blocked = [];
for (let i = 0; i <= steps; i++) {
  const t = i / steps;
  const localZ = startLocalZ + (endLocalZ - startLocalZ) * t;
  const { x, z } = localToWorld(0, localZ);
  const rampY = sampleRampY(x, z);
  const footY = rampY != null ? rampY : floorY;
  const vx = -Math.sin(yaw) * 3;
  const vz = -Math.cos(yaw) * 3;
  const speed = 3;
  const climbLocalMotion =
    (vx * Math.sin(yaw) + vz * Math.cos(yaw)) / speed;
  const supportY = getSupportY(x, z, footY, climbLocalMotion);
  const followingRamp = supportY > floorY + 0.02;
  const block = wouldBlock(x, z, footY, vx, vz, supportY, followingRamp);
  if (block) {
    blocked.push({ localZ: localZ.toFixed(3), localX: worldToLocal(x, z).localX.toFixed(3), x: x.toFixed(3), z: z.toFixed(3), footY: footY.toFixed(3), kind: block, climb: climbLocalMotion.toFixed(2) });
  }
}

// Also test back-slice blocks at lip with moderate descent speed
const lipTests = [-0.25, -0.2, -0.15, -0.1, 0, 0.1];
console.log("\nLip slice blocks (climb=-0.2):");
for (const localZ of lipTests) {
  const { x, z } = localToWorld(0, localZ);
  const footY = sampleRampY(x, z) ?? floorY;
  const vx = -Math.sin(yaw) * 2;
  const vz = -Math.cos(yaw) * 2;
  const supportY = floorY;
  const block = wouldBlock(x, z, footY, vx, vz, supportY, false);
  console.log(`  localZ=${localZ.toFixed(2)} ramp=${sampleRampY(x,z)?.toFixed(3) ?? 'null'} block=${block ?? 'none'}`);
}

console.log("\nFast descent blocks:");
if (blocked.length === 0) {
  console.log("  OK: none");
} else {
  for (const b of blocked) console.log(" ", b);
}

console.log("\nWalk-through from behind (perpendicular, climb~0):");
for (const localZ of [-0.9, -0.6, -0.3]) {
  const { x, z } = localToWorld(0, localZ);
  const footY = floorY;
  const vx = 0;
  const vz = 3;
  const block = wouldBlock(x, z, footY, vx, vz, floorY, false);
  console.log(`  localZ=${localZ.toFixed(2)} block=${block ?? 'none'}`);
}
