import * as THREE from "three";
import { pushCollider } from "./Collision.js";

const TREAD_THICKNESS = 0.16;
/** Exported for collision — tread underside in world space. */
export const STAIR_TREAD_THICKNESS = TREAD_THICKNESS;

/** Fixed flight dimensions (not tunable in UI). */
export const STAIRS_WIDTH = 1.75;
export const STAIRS_STEP_COUNT = 18;
export const STAIRS_STEP_RISE = 0.23;
export const STAIRS_STEP_RUN = 0.3;
export const STAIRS_TOTAL_RISE = STAIRS_STEP_COUNT * STAIRS_STEP_RISE;
export const STAIRS_TOTAL_RUN = STAIRS_STEP_COUNT * STAIRS_STEP_RUN;

const _corner = new THREE.Vector3();

/** Side rails — exported so the ceiling cutout can match the flight's outer width. */
export const STAIR_STRINGER_THICKNESS = 0.12;
/** Stringer is slightly longer than the run so it doesn't truncate at the first/last tread. */
export const STAIR_STRINGER_DEPTH_OVERHANG = STAIRS_STEP_RUN * 0.25;

/**
 * @typedef {Object} StairPlacement
 * @property {{ x: number, y: number, z: number }} position Bottom-center of lowest tread (world)
 * @property {number} rotationY Facing in degrees (0° = flight climbs toward +Z)
 */

/**
 * Walkable footprint of the arena ceiling deck (east side when clerestory is open).
 * @param {import("./loadArena.js").ArenaConfig} arena
 * @param {number} ceilingTopY
 * @param {number} westOpenRatio
 */
export function getArenaDeckWalkSurface(arena, ceilingTopY, westOpenRatio) {
  const wallThickness = arena.wallThickness ?? 0.5;
  const CEILING_PAD = 0.25;
  const fullWidth = arena.size + 2 * wallThickness + 2 * CEILING_PAD;
  const fullDepth = fullWidth;
  const open = THREE.MathUtils.clamp(westOpenRatio, 0, 0.95);

  if (open <= 0) {
    const halfW = fullWidth / 2;
    const halfD = fullDepth / 2;
    return {
      minX: -halfW,
      maxX: halfW,
      minZ: -halfD,
      maxZ: halfD,
      y: ceilingTopY,
    };
  }

  const coveredWidth = fullWidth * (1 - open);
  const centerX = (open * fullWidth) / 2;
  const halfW = coveredWidth / 2;
  const halfD = fullDepth / 2;
  return {
    minX: centerX - halfW,
    maxX: centerX + halfW,
    minZ: -halfD,
    maxZ: halfD,
    y: ceilingTopY,
  };
}

function localCenterToWorldXZ(flight, localX, localZ) {
  _corner.set(localX, 0, localZ);
  _corner.applyMatrix4(flight.matrixWorld);
  return { x: _corner.x, z: _corner.z };
}

/**
 * @param {THREE.Group} flight
 * @param {number} localX
 * @param {number} localZ
 * @param {number} halfW
 * @param {number} halfRun
 */
function localFootprintWorldBounds(flight, localX, localZ, halfW, halfRun) {
  const offsets = [
    [-halfW, -halfRun],
    [halfW, -halfRun],
    [-halfW, halfRun],
    [halfW, halfRun],
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const [dx, dz] of offsets) {
    _corner.set(localX + dx, 0, localZ + dz);
    _corner.applyMatrix4(flight.matrixWorld);
    minX = Math.min(minX, _corner.x);
    maxX = Math.max(maxX, _corner.x);
    minZ = Math.min(minZ, _corner.z);
    maxZ = Math.max(maxZ, _corner.z);
  }

  return { minX, maxX, minZ, maxZ };
}

/**
 * @param {THREE.Group} flight
 * @param {number} localX
 * @param {number} localY
 * @param {number} localZ
 */
function localToWorldY(flight, localX, localY, localZ) {
  _corner.set(localX, localY, localZ);
  _corner.applyMatrix4(flight.matrixWorld);
  return _corner.y;
}

/**
 * Axis-aligned hole for the arena catwalk / ceiling deck above this flight.
 * @param {StairPlacement | null | undefined} placement
 * @returns {{ minX: number, maxX: number, minZ: number, maxZ: number } | null}
 */
export function getStairCeilingCutout(placement) {
  if (!placement?.position) return null;

  const flight = new THREE.Group();
  flight.position.set(
    placement.position.x,
    placement.position.y,
    placement.position.z
  );
  flight.rotation.y = THREE.MathUtils.degToRad(placement.rotationY);
  flight.updateMatrixWorld(true);

  // Match the flight's physical top-down footprint exactly — treads span
  // STAIRS_WIDTH and stringers add STAIR_STRINGER_THICKNESS to each side, with
  // a small front/back overhang at the stringer ends. No extra slop.
  const halfW = STAIRS_WIDTH / 2 + STAIR_STRINGER_THICKNESS;
  const rearZ = -STAIR_STRINGER_DEPTH_OVERHANG;
  const frontZ = STAIRS_TOTAL_RUN + STAIR_STRINGER_DEPTH_OVERHANG;

  return localFootprintWorldBounds(flight, 0, (rearZ + frontZ) / 2, halfW, (frontZ - rearZ) / 2);
}

/**
 * @param {THREE.Group} group
 * @param {StairPlacement} placement
 * @param {THREE.Material} treadMat
 * @param {THREE.Material} [stringerMat]
 */
export function buildStairFlight(
  group,
  placement,
  treadMat,
  stringerMat = treadMat
) {
  const { position, rotationY } = placement;
  const yawRad = THREE.MathUtils.degToRad(rotationY);

  const flight = new THREE.Group();
  flight.name = "stair_flight";
  flight.position.set(position.x, position.y, position.z);
  flight.rotation.y = yawRad;
  group.add(flight);

  const groundSurfaces = [];
  const colliders = [];
  const halfRun = STAIRS_STEP_RUN / 2 + 0.03;
  const stringerThick = STAIR_STRINGER_THICKNESS;
  const stringerHeight = STAIRS_TOTAL_RISE + 0.05;
  const stringerDepth = STAIRS_TOTAL_RUN + STAIR_STRINGER_DEPTH_OVERHANG * 2;
  const stringerLocalZ = STAIRS_TOTAL_RUN / 2;

  for (const side of [-1, 1]) {
    const localX = (STAIRS_WIDTH / 2 + stringerThick / 2) * side;
    const stringer = new THREE.Mesh(
      new THREE.BoxGeometry(stringerThick, stringerHeight, stringerDepth),
      stringerMat
    );
    stringer.position.set(localX, stringerHeight / 2, stringerLocalZ);
    stringer.castShadow = true;
    stringer.receiveShadow = true;
    flight.add(stringer);
  }

  for (let i = 0; i < STAIRS_STEP_COUNT; i++) {
    const localZ = STAIRS_STEP_RUN * (i + 0.5);
    const stepTopY = STAIRS_STEP_RISE * (i + 1);

    const tread = new THREE.Mesh(
      new THREE.BoxGeometry(
        STAIRS_WIDTH,
        TREAD_THICKNESS,
        STAIRS_STEP_RUN + 0.06
      ),
      treadMat
    );
    tread.position.set(0, stepTopY - TREAD_THICKNESS / 2, localZ);
    tread.castShadow = true;
    tread.receiveShadow = true;
    flight.add(tread);
  }

  flight.updateMatrixWorld(true);

  const stairFlight = {
    x: position.x,
    z: position.z,
    rotationY: yawRad,
    walkHalfWidth: STAIRS_WIDTH / 2,
    inverseMatrix: new THREE.Matrix4().copy(flight.matrixWorld).invert(),
  };

  for (let i = 0; i < STAIRS_STEP_COUNT; i++) {
    const localZ = STAIRS_STEP_RUN * (i + 0.5);
    const stepTopY = STAIRS_STEP_RISE * (i + 1);
    const walkY = localToWorldY(flight, 0, stepTopY, localZ);

    groundSurfaces.push({
      stairFlight,
      localX: 0,
      localZ,
      halfX: STAIRS_WIDTH / 2,
      halfZ: halfRun,
      y: walkY,
      treadLocalZ: localZ,
    });

    // Each step is a single solid box stretching from the previous step's
    // top up to this tread's walking surface. That makes every step behave
    // like a regular wall+floor combo — block from the front, walk on top,
    // hide under once the body fits below the box bottom.
    const treadCenter = localCenterToWorldXZ(flight, 0, localZ);
    const stepFloorLocalY = i === 0 ? 0 : stepTopY - STAIRS_STEP_RISE;
    const treadBottomY = localToWorldY(flight, 0, stepFloorLocalY, localZ);
    colliders.push({
      x: treadCenter.x,
      z: treadCenter.z,
      halfX: STAIRS_WIDTH / 2 + 0.04,
      halfZ: halfRun,
      rotationY: yawRad,
      bottomY: treadBottomY,
      topY: walkY,
      kind: "stairTread",
      stairFlight,
      treadLocalZ: localZ,
    });
  }

  const stringerHalfDepth = stringerDepth / 2;
  const stringerBottomY = localToWorldY(flight, 0, 0, stringerLocalZ);
  const stringerTopY = localToWorldY(flight, 0, STAIRS_TOTAL_RISE + 0.05, stringerLocalZ);
  for (const side of [-1, 1]) {
    const stringerLocalX = (STAIRS_WIDTH / 2 + STAIR_STRINGER_THICKNESS / 2) * side;
    const stringerCenter = localCenterToWorldXZ(flight, stringerLocalX, stringerLocalZ);
    pushCollider(colliders, {
      x: stringerCenter.x,
      z: stringerCenter.z,
      halfX: STAIR_STRINGER_THICKNESS / 2,
      halfZ: stringerHalfDepth,
      rotationY: yawRad,
      bottomY: stringerBottomY,
      topY: stringerTopY,
      kind: "stairStringer",
      stairFlight,
    });
  }

  const landingPad = 0.45;
  const topLocalZ = STAIRS_TOTAL_RUN;
  const topWalkY = localToWorldY(flight, 0, STAIRS_TOTAL_RISE, topLocalZ);
  groundSurfaces.push({
    stairFlight,
    localX: 0,
    localZ: topLocalZ,
    halfX: STAIRS_WIDTH / 2 + landingPad,
    halfZ: landingPad,
    y: topWalkY,
  });

  return { groundSurfaces, colliders };
}

/** Remove stair meshes from a group without disposing shared materials. */
export function clearStairGroup(group) {
  const geometries = new Set();
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    child.traverse((obj) => {
      if (obj.geometry && !geometries.has(obj.geometry)) {
        geometries.add(obj.geometry);
        obj.geometry.dispose();
      }
    });
  }
}
