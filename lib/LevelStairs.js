import * as THREE from "three";
import { pushCollider } from "./Collision.js";
import { getPillarGeometry } from "./PillarGeometry.js";
import { applyContinuousBoxWorldUVs } from "./WallBoxUV.js";
import { TEXTURE_TILE_SIZES } from "./LevelTextures.js";
import { createStairRampConfig } from "./StairRamp.js";

const TREAD_THICKNESS = 0.16;
/** Exported for collision — tread underside in world space. */
export const STAIR_TREAD_THICKNESS = TREAD_THICKNESS;

/** Fixed flight dimensions (not tunable in UI). */
export const STAIRS_WIDTH = 3.5;
export const STAIRS_STEP_COUNT = 18;
export const STAIRS_STEP_RISE = 0.23;
export const STAIRS_STEP_RUN = 0.3;
export const STAIRS_TOTAL_RISE = STAIRS_STEP_COUNT * STAIRS_STEP_RISE;
export const STAIRS_TOTAL_RUN = STAIRS_STEP_COUNT * STAIRS_STEP_RUN;
/** Extra rise above the last tread so the flight meets the catwalk deck. */
export const STAIR_EXTRA_RISE = 0.16;
export const STAIRS_EFFECTIVE_TOTAL_RISE = STAIRS_TOTAL_RISE + STAIR_EXTRA_RISE;

const _corner = new THREE.Vector3();

/** Cross-section width (X) — half of arena pillarSize. */
export const STAIR_STRINGER_WIDTH = 0.6;
/** @deprecated Use {@link STAIR_STRINGER_WIDTH}. */
export const STAIR_STRINGER_THICKNESS = STAIR_STRINGER_WIDTH;
/** Extra run beyond first/last tread so stringers read as one long beam. */
export const STAIR_STRINGER_DEPTH_OVERHANG = STAIRS_STEP_RUN * 0.75;

/**
 * @typedef {Object} StairFlightRuntime
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {number} rotationY
 * @property {number} walkHalfWidth
 * @property {THREE.Matrix4} inverseMatrix
 * @property {THREE.Matrix4} matrixWorld
 * @property {ReturnType<typeof createStairRampConfig>} ramp
 */

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
 * @param {{ shape?: "box" | "rounded", cornerRadius?: number, cornerSegments?: number }} [options]
 */
function createStairStringerGeometry(options = {}) {
  const stringerHeight = STAIRS_EFFECTIVE_TOTAL_RISE + 0.05;
  const stringerDepth = STAIRS_TOTAL_RUN + STAIR_STRINGER_DEPTH_OVERHANG * 2;
  const shape = options.shape === "box" ? "box" : "rounded";
  const cornerRadius =
    options.cornerRadius ?? STAIR_STRINGER_WIDTH * 0.1;
  const cornerSegments = options.cornerSegments ?? 4;
  const tileSize =
    TEXTURE_TILE_SIZES.decal_hazard_stripes_worn ?? 2;

  const geo = getPillarGeometry(
    shape,
    STAIR_STRINGER_WIDTH,
    stringerHeight,
    stringerDepth,
    { cornerRadius, cornerSegments }
  );
  applyContinuousBoxWorldUVs(geo, stringerHeight, tileSize);
  return geo;
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
  // STAIRS_WIDTH and stringers add STAIR_STRINGER_WIDTH to each side, with
  // a small front/back overhang at the stringer ends. No extra slop.
  const halfW = STAIRS_WIDTH / 2 + STAIR_STRINGER_WIDTH;
  const rearZ = -STAIR_STRINGER_DEPTH_OVERHANG;
  const frontZ = STAIRS_TOTAL_RUN + STAIR_STRINGER_DEPTH_OVERHANG;

  return localFootprintWorldBounds(flight, 0, (rearZ + frontZ) / 2, halfW, (frontZ - rearZ) / 2);
}

/**
 * @param {THREE.Group} group
 * @param {StairPlacement} placement
 * @param {THREE.Material} treadMat
 * @param {THREE.Material} [stringerMat]
 * @param {{ shape?: "box" | "rounded", cornerRadius?: number, cornerSegments?: number }} [stringerOptions]
 */
export function buildStairFlight(
  group,
  placement,
  treadMat,
  stringerMat = treadMat,
  stringerOptions = {}
) {
  const { catwalkDeckY = null, ...pureStringerOptions } = stringerOptions;
  const { position, rotationY } = placement;
  const yawRad = THREE.MathUtils.degToRad(rotationY);

  const flight = new THREE.Group();
  flight.name = "stair_flight";
  flight.position.set(position.x, position.y, position.z);
  flight.rotation.y = yawRad;
  group.add(flight);

  const groundSurfaces = [];
  const colliders = [];
  const stringerThick = STAIR_STRINGER_WIDTH;
  const stringerHeight = STAIRS_EFFECTIVE_TOTAL_RISE + 0.05;
  const stringerDepth = STAIRS_TOTAL_RUN + STAIR_STRINGER_DEPTH_OVERHANG * 2;
  const stringerLocalZ = STAIRS_TOTAL_RUN / 2;
  const stringerGeo = createStairStringerGeometry(pureStringerOptions);

  for (const side of [-1, 1]) {
    const localX = (STAIRS_WIDTH / 2 + stringerThick / 2) * side;
    const stringer = new THREE.Mesh(stringerGeo, stringerMat);
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

  const landingPad = 0.45;
  const topLocalZ = STAIRS_TOTAL_RUN;
  const landingFrontLocalZ = topLocalZ + landingPad * 1.5;
  const defaultTopWalkY = localToWorldY(
    flight,
    0,
    STAIRS_EFFECTIVE_TOTAL_RISE,
    topLocalZ
  );
  const topWalkWorldY =
    catwalkDeckY == null ? defaultTopWalkY : Math.max(defaultTopWalkY, catwalkDeckY);
  const topWalkLocalY = topWalkWorldY - position.y;

  /** @type {StairFlightRuntime} */
  const stairFlight = {
    x: position.x,
    y: position.y,
    z: position.z,
    rotationY: yawRad,
    walkHalfWidth: STAIRS_WIDTH / 2,
    inverseMatrix: new THREE.Matrix4().copy(flight.matrixWorld).invert(),
    matrixWorld: new THREE.Matrix4().copy(flight.matrixWorld),
    ramp: createStairRampConfig(
      STAIRS_WIDTH / 2,
      topWalkLocalY,
      landingFrontLocalZ - topLocalZ
    ),
  };

  // Continuous ramp for movement — tread meshes above are visual only.
  groundSurfaces.push({
    stairFlight,
    stairRamp: true,
  });
  const topLanding = localFootprintWorldBounds(
    flight,
    0,
    topLocalZ + landingPad * 0.5,
    STAIRS_WIDTH / 2,
    landingPad
  );
  groundSurfaces.push({
    minX: topLanding.minX,
    maxX: topLanding.maxX,
    minZ: topLanding.minZ,
    maxZ: topLanding.maxZ,
    y: topWalkWorldY,
  });

  const stringerHalfDepth = stringerDepth / 2;
  const stringerBottomY = localToWorldY(flight, 0, 0, stringerLocalZ);
  const stringerTopY = localToWorldY(
    flight,
    0,
    STAIRS_EFFECTIVE_TOTAL_RISE + 0.05,
    stringerLocalZ
  );
  for (const side of [-1, 1]) {
    const stringerLocalX = (STAIRS_WIDTH / 2 + STAIR_STRINGER_WIDTH / 2) * side;
    const stringerCenter = localCenterToWorldXZ(flight, stringerLocalX, stringerLocalZ);
    pushCollider(colliders, {
      x: stringerCenter.x,
      z: stringerCenter.z,
      halfX: STAIR_STRINGER_WIDTH / 2,
      halfZ: stringerHalfDepth,
      rotationY: yawRad,
      bottomY: stringerBottomY,
      topY: stringerTopY,
      kind: "stairStringer",
      stairFlight,
    });
  }

  const treadHalfWidth = STAIRS_WIDTH / 2 + STAIR_STRINGER_WIDTH;

  // Low lip curtain — blocks floor-level walk-through at the bottom tread only.
  const rearCurtainForwardZ = -0.02;
  const rearCurtainBackZ = -STAIR_STRINGER_DEPTH_OVERHANG * 0.95;

  // Continuous rear shell — fills the cavity behind the slope (no gap to walk through).
  const rearBarrierBackZ = -STAIR_STRINGER_DEPTH_OVERHANG - 1.15;
  const rearBarrierForwardZ = rearCurtainBackZ;
  const rearBarrierCenterZ = (rearBarrierBackZ + rearBarrierForwardZ) / 2;
  const rearBarrierHalfZ = (rearBarrierForwardZ - rearBarrierBackZ) / 2;
  const rearBarrierCenter = localCenterToWorldXZ(flight, 0, rearBarrierCenterZ);
  pushCollider(colliders, {
    x: rearBarrierCenter.x,
    z: rearBarrierCenter.z,
    halfX: treadHalfWidth,
    halfZ: rearBarrierHalfZ,
    rotationY: yawRad,
    bottomY: stringerBottomY,
    topY: stringerTopY,
    kind: "stairBack",
    sliceBackLocalZ: rearBarrierBackZ,
    sliceForwardLocalZ: rearBarrierForwardZ,
    stairFlight,
  });
  const rearCurtainCenterZ = (rearCurtainForwardZ + rearCurtainBackZ) / 2;
  const rearCurtainHalfZ = (rearCurtainForwardZ - rearCurtainBackZ) / 2;
  const rearCurtainCenter = localCenterToWorldXZ(flight, 0, rearCurtainCenterZ);
  pushCollider(colliders, {
    x: rearCurtainCenter.x,
    z: rearCurtainCenter.z,
    halfX: STAIRS_WIDTH / 2,
    halfZ: rearCurtainHalfZ,
    rotationY: yawRad,
    bottomY: stringerBottomY,
    topY: localToWorldY(flight, 0, STAIRS_STEP_RISE, rearCurtainCenterZ),
    kind: "stairRearCurtain",
    sliceBackLocalZ: rearCurtainBackZ,
    sliceForwardLocalZ: rearCurtainForwardZ,
    stairFlight,
  });

  // Full tread under-slope slices — no gaps between steps at floor height.
  for (let i = 0; i < STAIRS_STEP_COUNT; i++) {
    let sliceBackLocalZ = i * STAIRS_STEP_RUN;
    if (i === 0) sliceBackLocalZ = rearCurtainBackZ;
    const sliceForwardLocalZ = (i + 1) * STAIRS_STEP_RUN;
    const sliceCenterZ = (sliceBackLocalZ + sliceForwardLocalZ) / 2;
    const sliceCenter = localCenterToWorldXZ(flight, 0, sliceCenterZ);
    const sliceBottomY = localToWorldY(flight, 0, STAIRS_STEP_RISE * i, sliceCenterZ);
    const sliceTopY = localToWorldY(
      flight,
      0,
      STAIRS_STEP_RISE * (i + 1),
      sliceCenterZ
    );
    pushCollider(colliders, {
      x: sliceCenter.x,
      z: sliceCenter.z,
      halfX: STAIRS_WIDTH / 2,
      halfZ: (sliceForwardLocalZ - sliceBackLocalZ) / 2,
      rotationY: yawRad,
      bottomY: sliceBottomY,
      topY: sliceTopY,
      kind: "stairBackSlice",
      sliceForwardLocalZ,
      sliceBackLocalZ,
      stairFlight,
    });
  }

  if (STAIR_EXTRA_RISE > 0.001) {
    const topRamp = new THREE.Mesh(
      new THREE.BoxGeometry(STAIRS_WIDTH, STAIR_EXTRA_RISE, landingPad * 2),
      treadMat
    );
    topRamp.position.set(
      0,
      STAIRS_TOTAL_RISE + STAIR_EXTRA_RISE / 2,
      topLocalZ
    );
    topRamp.castShadow = true;
    topRamp.receiveShadow = true;
    flight.add(topRamp);
  }

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
