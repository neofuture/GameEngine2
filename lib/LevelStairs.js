import * as THREE from "three";
import { WALL_STANDOFF } from "./LevelConstants.js";
import { pushCollider } from "./Collision.js";
import { getPillarGeometry } from "./PillarGeometry.js";
import { applyContinuousBoxWorldUVs, applyMeshTopWorldUVs } from "./WallBoxUV.js";
import { TEXTURE_TILE_SIZES } from "./LevelTextures.js";
import { createStairRampConfig } from "./StairRamp.js";

const TREAD_THICKNESS = 0.16;
/** Exported for collision — tread underside in world space. */
export const STAIR_TREAD_THICKNESS = TREAD_THICKNESS;

/** Fixed flight dimensions (not tunable in UI). */
export const STAIRS_WIDTH = 3.5;
export const STAIRS_STEP_COUNT = 18;
/** ~+0.2 m total flight vs 0.23 — reads ~20px taller at gameplay distance. */
export const STAIRS_STEP_RISE = 0.241;
export const STAIRS_STEP_RUN = 0.3;
export const STAIRS_TOTAL_RISE = STAIRS_STEP_COUNT * STAIRS_STEP_RISE;
export const STAIRS_TOTAL_RUN = STAIRS_STEP_COUNT * STAIRS_STEP_RUN;
/** Extra rise above the last tread so the flight meets the catwalk deck. */
export const STAIR_EXTRA_RISE = 0.012;
export const STAIRS_EFFECTIVE_TOTAL_RISE = STAIRS_TOTAL_RISE + STAIR_EXTRA_RISE;

const _corner = new THREE.Vector3();

/** Cross-section width (X) — half of arena pillarSize. */
export const STAIR_STRINGER_WIDTH = 0.6;
/** Half-thickness of side-wall face colliders (inner / outer panels). */
export const STAIR_SIDE_PANEL_HALF_THICK = 0.05;
/** @deprecated Use {@link STAIR_STRINGER_WIDTH}. */
export const STAIR_STRINGER_THICKNESS = STAIR_STRINGER_WIDTH;
/** Extra run beyond first/last tread so stringers read as one long beam. */
export const STAIR_STRINGER_DEPTH_OVERHANG = STAIRS_STEP_RUN * 0.75;
/** Deck lip past the ramp flat landing so the catwalk mesh meets the stair top. */
export const STAIR_TOP_DECK_BRIDGE = 0.6;

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
  const wallStandoff = arena.wallStandoff ?? WALL_STANDOFF;
  const CEILING_PAD = 0.25;
  const fullWidth = arena.size + 2 * wallThickness + 2 * CEILING_PAD;
  const fullDepth = fullWidth;
  const open = THREE.MathUtils.clamp(westOpenRatio, 0, 0.95);
  const edgeStandoff = {
    west: open > 0 ? 0 : wallStandoff,
    east: wallStandoff,
    north: wallStandoff,
    south: wallStandoff,
  };

  if (open <= 0) {
    const halfW = fullWidth / 2;
    const halfD = fullDepth / 2;
    return {
      minX: -halfW,
      maxX: halfW,
      minZ: -halfD,
      maxZ: halfD,
      y: ceilingTopY,
      edgeStandoff,
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
    edgeStandoff,
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

  // Match the flight's physical top-down footprint — treads span STAIRS_WIDTH
  // and stringers add STAIR_STRINGER_WIDTH to each side, with front/back
  // overhang at the stringer ends. Collider walk-through at the lip is handled
  // in Collision.js (deck skip near catwalk height); do not enlarge this hole
  // or the deck mesh pulls back and exposes the landing/stringers.
  const halfW = STAIRS_WIDTH / 2 + STAIR_STRINGER_WIDTH;
  const rearZ = -STAIR_STRINGER_DEPTH_OVERHANG;
  const frontZ = STAIRS_TOTAL_RUN + STAIR_STRINGER_DEPTH_OVERHANG;

  return localFootprintWorldBounds(flight, 0, (rearZ + frontZ) / 2, halfW, (frontZ - rearZ) / 2);
}

/**
 * Small deck pad at the stair top — fills the gap between the ramp landing
 * and the east catwalk column where the ceiling cutout removes the mesh.
 * @param {StairPlacement | null | undefined} placement
 * @param {number} [bridgeDepth=STAIR_TOP_DECK_BRIDGE]
 * @returns {{ minX: number, maxX: number, minZ: number, maxZ: number } | null}
 */
export function getStairTopDeckBridgeFootprint(
  placement,
  bridgeDepth = STAIR_TOP_DECK_BRIDGE
) {
  if (!placement?.position || bridgeDepth <= 0) return null;

  const flight = new THREE.Group();
  flight.position.set(
    placement.position.x,
    placement.position.y,
    placement.position.z
  );
  flight.rotation.y = THREE.MathUtils.degToRad(placement.rotationY);
  flight.updateMatrixWorld(true);

  const halfW = STAIRS_WIDTH / 2 + STAIR_STRINGER_WIDTH;
  const landingPad = 0.45;
  const topLocalZ = STAIRS_TOTAL_RUN;
  const landingFrontLocalZ = topLocalZ + landingPad * 1.5;
  const bridgeRearZ = topLocalZ - 0.12;
  const bridgeFrontZ = landingFrontLocalZ + bridgeDepth;

  return localFootprintWorldBounds(
    flight,
    0,
    (bridgeRearZ + bridgeFrontZ) / 2,
    halfW,
    (bridgeFrontZ - bridgeRearZ) / 2
  );
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
  const { catwalkDeckY = null, treadTileSize = null, catwalkEdgeStandoff = null, ...pureStringerOptions } =
    stringerOptions;
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

  /** @type {THREE.Mesh[]} */
  const treadMeshes = [];
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
    treadMeshes.push(tread);
    flight.add(tread);
  }

  /** @type {THREE.Mesh | null} */
  let topRamp = null;

  flight.updateMatrixWorld(true);

  if (treadTileSize) {
    for (const tread of treadMeshes) {
      applyMeshTopWorldUVs(tread.geometry, tread.matrixWorld, treadTileSize);
    }
  }

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

  // Stair top support comes from the ramp surface above — do not add a flat
  // catwalkWalk rectangle matching the ceiling cutout. That hole has no deck
  // mesh; invisible support there traps the player (e.g. east catwalk x≈10).
  const stringerHalfDepth = stringerDepth / 2;
  const stringerBottomY = localToWorldY(flight, 0, 0, stringerLocalZ);
  const defaultStringerTopY = localToWorldY(
    flight,
    0,
    STAIRS_EFFECTIVE_TOTAL_RISE + 0.05,
    stringerLocalZ
  );
  const stringerTopY =
    catwalkDeckY == null
      ? defaultStringerTopY
      : Math.max(defaultStringerTopY, catwalkDeckY);
  const innerFaceLocalX = STAIRS_WIDTH / 2;
  const outerFaceLocalX = STAIRS_WIDTH / 2 + STAIR_STRINGER_WIDTH;
  const panelHalfThick = STAIR_SIDE_PANEL_HALF_THICK;
  const stringerHalfWidth = STAIR_STRINGER_WIDTH / 2;
  const capHalfThick = panelHalfThick;

  for (const side of [-1, 1]) {
    const innerLocalX =
      innerFaceLocalX * side + panelHalfThick * side;
    const outerLocalX =
      outerFaceLocalX * side - panelHalfThick * side;
    const innerCenter = localCenterToWorldXZ(flight, innerLocalX, stringerLocalZ);
    const outerCenter = localCenterToWorldXZ(flight, outerLocalX, stringerLocalZ);

    pushCollider(colliders, {
      x: innerCenter.x,
      z: innerCenter.z,
      halfX: panelHalfThick,
      halfZ: stringerHalfDepth,
      rotationY: yawRad,
      bottomY: stringerBottomY,
      topY: stringerTopY,
      kind: "stairSideInner",
      stringerSide: side,
      stairFlight,
    });
    pushCollider(colliders, {
      x: outerCenter.x,
      z: outerCenter.z,
      halfX: panelHalfThick,
      halfZ: stringerHalfDepth,
      rotationY: yawRad,
      bottomY: stringerBottomY,
      topY: stringerTopY,
      kind: "stairSideOuter",
      stringerSide: side,
      stairFlight,
    });

    const topCenterLocalX = (innerFaceLocalX + outerFaceLocalX) / 2 * side;
    const topCenter = localCenterToWorldXZ(flight, topCenterLocalX, stringerLocalZ);
    pushCollider(colliders, {
      x: topCenter.x,
      z: topCenter.z,
      halfX: stringerHalfWidth,
      halfZ: stringerHalfDepth,
      rotationY: yawRad,
      bottomY: stringerTopY - capHalfThick,
      topY: stringerTopY + capHalfThick,
      kind: "stairSideTop",
      stringerSide: side,
      stairFlight,
    });

    const sideWalkTopY = defaultStringerTopY;
    const topBounds = localFootprintWorldBounds(
      flight,
      topCenterLocalX,
      stringerLocalZ,
      STAIR_STRINGER_WIDTH / 2,
      stringerHalfDepth
    );
    groundSurfaces.push({
      minX: topBounds.minX,
      maxX: topBounds.maxX,
      minZ: topBounds.minZ,
      maxZ: topBounds.maxZ,
      y: sideWalkTopY,
      stairSideWalk: true,
      stringerSide: side,
    });
  }

  const treadHalfWidth = STAIRS_WIDTH / 2 + STAIR_STRINGER_WIDTH;
  const rearCurtainForwardZ = -0.02;
  const rearCurtainBackZ = -STAIR_STRINGER_DEPTH_OVERHANG * 0.95;
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

  for (let i = 0; i < STAIRS_STEP_COUNT; i++) {
    let sliceBackLocalZ = i * STAIRS_STEP_RUN;
    if (i === 0) sliceBackLocalZ = rearCurtainBackZ;
    const sliceForwardLocalZ = (i + 1) * STAIRS_STEP_RUN;
    const sliceCenterZ = (sliceBackLocalZ + sliceForwardLocalZ) / 2;
    const sliceCenter = localCenterToWorldXZ(flight, 0, sliceCenterZ);
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
      bottomY: stringerBottomY,
      topY: sliceTopY,
      kind: "stairBackSlice",
      sliceForwardLocalZ,
      sliceBackLocalZ,
      stairFlight,
    });
  }

  if (STAIR_EXTRA_RISE > 0.001) {
    topRamp = new THREE.Mesh(
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
    flight.updateMatrixWorld(true);
    if (treadTileSize) {
      applyMeshTopWorldUVs(topRamp.geometry, topRamp.matrixWorld, treadTileSize);
    }
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
