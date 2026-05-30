/**
 * Side-wall collision probe — inner/outer faces block, ramp climb stays clear.
 * Run: node scripts/stair-side-wall-probe.mjs
 */
import * as THREE from "three";
import { buildStairFlight } from "../lib/LevelStairs.js";
import { shouldSkipCollider, rotatedBoxOverlapsCircle } from "../lib/Collision.js";
import { sampleStairRampFootYRaw } from "../lib/StairRamp.js";
import { getDefaultStairPlacement } from "../lib/StairTuning.js";

const PLAYER_RADIUS = 0.35;
const EYE_HEIGHT = 1.65;
const STEP_UP_MAX = 0.42;

const placement = getDefaultStairPlacement();
const group = new THREE.Group();
const mat = new THREE.MeshStandardMaterial({ color: 0x888888 });
const { colliders, groundSurfaces } = buildStairFlight(group, placement, mat, mat, {
  catwalkDeckY: 4.35,
});
const stairFlight = groundSurfaces.find((s) => s.stairFlight)?.stairFlight;
if (!stairFlight) {
  console.error("No stair flight");
  process.exit(1);
}

const scratch = new THREE.Vector3();

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

function blockingKinds(x, z, footY, climbLocalMotion, followingRamp) {
  const bodyTop = footY + EYE_HEIGHT;
  const rampFootY = sampleStairRampFootYRaw(stairFlight, x, z, scratch);
  const stairLocal = worldToLocal(x, z);
  const hits = [];
  for (const box of colliders) {
    if (!rotatedBoxOverlapsCircle(box, x, z, PLAYER_RADIUS)) continue;
    if (
      !shouldSkipCollider(
        box,
        footY,
        bodyTop,
        STEP_UP_MAX,
        footY,
        stairLocal,
        climbLocalMotion,
        rampFootY,
        followingRamp
      )
    ) {
      hits.push(box.kind);
    }
  }
  return hits;
}

function expectSideBlock(label, localX, localZ, footY) {
  const { x, z } = localToWorld(localX, localZ);
  const hits = blockingKinds(x, z, footY, 0, false);
  const side = hits.filter((k) => k.startsWith("stairSide"));
  if (!side.length) {
    console.error(`FAIL ${label}: expected side wall block, got ${hits.join(", ") || "none"}`);
    return false;
  }
  return true;
}

function expectInnerBlock(label, localX, localZ, footY, climb = 0.3) {
  const { x, z } = localToWorld(localX, localZ);
  const ramp = sampleStairRampFootYRaw(stairFlight, x, z, scratch);
  const hits = blockingKinds(x, z, footY ?? ramp ?? 0, climb, ramp != null);
  if (!hits.includes("stairSideInner")) {
    console.error(`FAIL ${label}: inner face not blocking (${hits.join(", ") || "none"})`);
    return false;
  }
  return true;
}

function expectClear(label, localX, localZ, climb) {
  const { x, z } = localToWorld(localX, localZ);
  const ramp = sampleStairRampFootYRaw(stairFlight, x, z, scratch);
  const footY = ramp ?? 0;
  const hits = blockingKinds(x, z, footY, climb, ramp != null);
  const side = hits.filter((k) => k.startsWith("stairSide"));
  if (side.length) {
    console.error(`FAIL ${label}: side wall blocked climb at localZ=${localZ}: ${side.join(", ")}`);
    return false;
  }
  return true;
}

function expectStepOverLedge(label, localX, localZ, footY) {
  const { x, z } = localToWorld(localX, localZ);
  const hits = blockingKinds(x, z, footY, 0.3, false);
  const side = hits.filter((k) => k.startsWith("stairSide"));
  if (side.length) {
    console.error(`FAIL ${label}: should step over ledge, blocked by ${side.join(", ")}`);
    return false;
  }
  return true;
}

let ok = 0;
let fail = 0;

for (const localX of [2.5, 2.65]) {
  for (const localZ of [0, 2.5, 5]) {
    if (expectSideBlock(`outer x=${localX} z=${localZ}`, localX, localZ, 0)) ok++;
    else fail++;
  }
}

for (const localZ of [4, 5]) {
  if (expectStepOverLedge(`catwalk step x=2 z=${localZ}`, 2, localZ, 4.35)) ok++;
  else fail++;
}

for (const localX of [1.5, 1.65, 1.7]) {
  if (expectInnerBlock(`inner ramp x=${localX} z=0`, localX, 0, 0)) ok++;
  else fail++;
  if (expectInnerBlock(`inner ramp x=${localX} z=2.5`, localX, 2.5, null)) ok++;
  else fail++;
}

for (const localX of [2.0, 2.05]) {
  if (expectStepOverLedge(`top lip x=${localX} z=5`, localX, 5, 4.35)) ok++;
  else fail++;
}

for (let localZ = -0.15; localZ <= 5.2; localZ += 0.2) {
  if (expectClear(`climb up z=${localZ.toFixed(2)}`, 0, localZ, 0.5)) ok++;
  else fail++;
  if (expectClear(`climb down z=${localZ.toFixed(2)}`, 0, localZ, -0.5)) ok++;
  else fail++;
}

console.log(`Side-wall probe: ${ok} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
