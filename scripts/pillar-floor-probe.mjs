/**
 * Probe ground support at a world position. Run: node scripts/pillar-floor-probe.mjs
 */
import * as THREE from "three";
import { readFileSync } from "node:fs";
import { createPlayerController } from "../lib/PlayerController.js";
import { buildStairFlight, getStairCeilingCutout } from "../lib/LevelStairs.js";
import { buildAttachedRoom } from "../lib/LevelRoom.js";
import { getDefaultStairPlacement } from "../lib/StairTuning.js";
import { getArenaAttachWall, getDoorwaysOnWall } from "../lib/DoorwayWall.js";
import {
  resolvePillarColliderHalf,
  resolvePillarShape,
} from "../lib/PillarGeometry.js";
import { sampleStairRampFootYRaw } from "../lib/StairRamp.js";
import { pointInFloorHole } from "../lib/Collision.js";
import { DEFAULT_BINDINGS } from "../lib/KeyBindings.js";

const FLOOR_WALL_OVERLAP = 0.08;

function deckRectPieces(fullMinX, fullMaxX, fullMinZ, fullMaxZ, hole) {
  if (!hole)
    return [{ minX: fullMinX, maxX: fullMaxX, minZ: fullMinZ, maxZ: fullMaxZ }];
  const { minX: hx0, maxX: hx1, minZ: hz0, maxZ: hz1 } = hole;
  const pieces = [];
  const gap = 0.01;
  if (fullMinZ < hz0 - gap)
    pieces.push({
      minX: fullMinX,
      maxX: fullMaxX,
      minZ: fullMinZ,
      maxZ: Math.min(fullMaxZ, hz0),
    });
  const zMid0 = Math.max(fullMinZ, hz0);
  const zMid1 = Math.min(fullMaxZ, hz1);
  const eastMinX = Math.max(fullMinX, hx1);
  if (eastMinX + gap < fullMaxX && zMid0 < fullMaxZ - gap)
    pieces.push({
      minX: eastMinX,
      maxX: fullMaxX,
      minZ: zMid0,
      maxZ: fullMaxZ,
    });
  if (hz1 + gap < fullMaxZ) {
    const southMaxX = eastMinX + gap < fullMaxX ? eastMinX : fullMaxX;
    if (southMaxX - fullMinX > gap)
      pieces.push({
        minX: fullMinX,
        maxX: southMaxX,
        minZ: Math.max(fullMinZ, hz1),
        maxZ: fullMaxZ,
      });
  }
  if (zMid1 > zMid0 + gap && fullMinX < hx0 - gap)
    pieces.push({
      minX: fullMinX,
      maxX: Math.min(fullMaxX, hx0),
      minZ: zMid0,
      maxZ: zMid1,
    });
  return pieces;
}

function buildLevel(raw) {
  const ARENA_SIZE = raw.size;
  const WALL_HEIGHT = raw.wallHeight;
  const WALL_THICKNESS = raw.wallThickness;
  const CEILING_THICKNESS = raw.ceilingThickness ?? 0.35;
  const CEILING_PAD = 0.25;
  const half = ARENA_SIZE / 2;
  const wallStandoff = raw.wallStandoff ?? 0.5;
  const innerHalf = half - wallStandoff;
  const ceilingBottomY = WALL_HEIGHT;
  const catwalkDeckY = ceilingBottomY + CEILING_THICKNESS;
  const attachWall = getArenaAttachWall(raw);
  const colliders = [];
  const groundSurfaces = [];
  const stairColliders = [];
  const ceilingColliders = [];

  for (const p of raw.pillars ?? []) {
    const { halfX, halfZ } = resolvePillarColliderHalf(p, raw);
    const { shape, cornerRadius } = resolvePillarShape(p, raw);
    colliders.push({
      x: p.x,
      z: p.z,
      halfX,
      halfZ,
      bottomY: 0,
      topY: WALL_HEIGHT,
      kind: "pillar",
      cornerRadius: shape === "rounded" ? cornerRadius : 0,
    });
  }

  const span = half + WALL_THICKNESS;
  const pad = FLOOR_WALL_OVERLAP;
  const northZ = -half - WALL_THICKNESS / 2;
  const southZ = half + WALL_THICKNESS / 2;
  const eastX = half + WALL_THICKNESS / 2;
  const westX = -half - WALL_THICKNESS / 2;
  const halfT = WALL_THICKNESS / 2;
  const pushFlat = (minX, maxX, minZ, maxZ, y = 0) => {
    if (maxX - minX < 0.05 || maxZ - minZ < 0.05) return;
    groundSurfaces.push({ minX, maxX, minZ, maxZ, y });
  };
  pushFlat(-span, span, northZ - halfT - pad, northZ + halfT, 0);
  pushFlat(-span, span, southZ - halfT, southZ + halfT + pad, 0);
  pushFlat(eastX - halfT, eastX + halfT + pad, -span, span, 0);
  pushFlat(westX - halfT - pad, westX + halfT, -span, span, 0);
  pushFlat(-span - pad, span + pad, -span, span, 0);

  const mat = new THREE.MeshStandardMaterial();
  const built = buildStairFlight(new THREE.Group(), raw.stairs, mat, mat, {
    catwalkDeckY,
  });
  groundSurfaces.push(...built.groundSurfaces);
  stairColliders.push(...built.colliders);

  const cw = ARENA_SIZE + 2 * WALL_THICKNESS + 2 * CEILING_PAD;
  const westOpen =
    raw.ceilingWestOpenRatio ??
    ((raw.westWallHeightRatio ?? 1) < 1 ? 0.5 : 0);
  const open = THREE.MathUtils.clamp(westOpen, 0, 0.95);
  let fullMinX;
  let fullMaxX;
  if (open <= 0) {
    fullMinX = -cw / 2;
    fullMaxX = cw / 2;
  } else {
    const coveredWidth = cw * (1 - open);
    const centerX = (open * cw) / 2;
    fullMinX = centerX - coveredWidth / 2;
    fullMaxX = centerX + coveredWidth / 2;
  }
  const cutout = getStairCeilingCutout(raw.stairs);
  for (const piece of deckRectPieces(
    fullMinX,
    fullMaxX,
    -cw / 2,
    cw / 2,
    cutout
  )) {
    ceilingColliders.push({
      x: (piece.minX + piece.maxX) / 2,
      z: (piece.minZ + piece.maxZ) / 2,
      halfX: (piece.maxX - piece.minX) / 2,
      halfZ: (piece.maxZ - piece.minZ) / 2,
      bottomY: ceilingBottomY,
      topY: catwalkDeckY,
      kind: "deck",
    });
    groundSurfaces.push({ ...piece, y: catwalkDeckY, arenaCatwalkDeck: true });
  }

  for (const c of colliders) {
    if (c.kind !== "wall" && c.kind !== "pillar") continue;
    groundSurfaces.push({
      minX: c.x - c.halfX,
      maxX: c.x + c.halfX,
      minZ: c.z - c.halfZ,
      maxZ: c.z + c.halfZ,
      y: c.topY,
    });
  }

  const group = new THREE.Group();
  const roomMat = new THREE.MeshStandardMaterial();
  for (const room of raw.rooms ?? []) {
    buildAttachedRoom(
      group,
      room,
      null,
      half,
      WALL_HEIGHT,
      colliders,
      attachWall,
      WALL_THICKNESS,
      CEILING_THICKNESS,
      getDoorwaysOnWall(raw, attachWall),
      groundSurfaces,
      {
        arenaCeilingBottomY: ceilingBottomY,
        catwalkDeckY,
        exteriorDeckMat: roomMat,
        deckPad: CEILING_PAD,
        wallStandoff,
      }
    );
  }

  const floorSpan = half + WALL_THICKNESS + FLOOR_WALL_OVERLAP;
  return {
    allColliders: [...colliders, ...stairColliders, ...ceilingColliders],
    groundSurfaces,
    bounds: {
      minX: -innerHalf,
      maxX: innerHalf,
      minZ: -innerHalf,
      maxZ: innerHalf,
    },
    floorBounds: {
      minX: -floorSpan,
      maxX: floorSpan,
      minZ: -floorSpan,
      maxZ: floorSpan,
    },
    floorHoles: raw.floorHoles ?? [],
    attachWall,
  };
}

const raw = JSON.parse(
  readFileSync(new URL("../public/levels/level1.json", import.meta.url), "utf8")
);
raw.stairs = getDefaultStairPlacement();
const level = buildLevel(raw);

const px = 8.95;
const pz = 8.598;
const eyeY = 0.85;
const scratch = new THREE.Vector3();

console.log("hole", pointInFloorHole(px, pz, level.floorHoles, 0.35));
for (const surf of level.groundSurfaces) {
  if (surf.stairRamp && surf.stairFlight) {
    const y = sampleStairRampFootYRaw(surf.stairFlight, px, pz, scratch);
    if (y != null) console.log("rampY", y);
  }
}

const camera = new THREE.PerspectiveCamera();
let player = createPlayerController(camera, level.bounds, 0, {
  getColliders: () => level.allColliders,
  getGroundSurfaces: () => level.groundSurfaces,
  getFloorHoles: () => level.floorHoles,
  getFloorBounds: () => level.floorBounds,
  arenaBounds: level.bounds,
  getAttachWall: () => level.attachWall,
  getIsInRoom: () => false,
  getStandEyeHeight: () => 1.65,
  getBindings: () => DEFAULT_BINDINGS,
  initialPosition: { x: px, y: eyeY, z: pz },
  initialYaw: THREE.MathUtils.degToRad(443.7),
});

const idle = {
  isLocked: () => true,
  getMouseDelta: () => ({ dx: 0, dy: 0 }),
  isDown: () => false,
  wasPressed: () => false,
};

console.log("frame0", {
  foot: player.getFootY(),
  y: player.getY(),
  eyeH: eyeY - player.getFootY(),
});
for (let i = 0; i < 120; i++) player.update(idle, 1 / 60);
const snap = player.getMovementDebugSnapshot();
console.log("after 2s idle", {
  foot: player.getFootY(),
  y: player.getY(),
  x: player.getX(),
  z: player.getZ(),
  blocking: snap.blockingColliders?.map((c) => c.kind),
});

for (let i = 0; i < 120; i++) {
  player.update({ ...idle, isDown: (c) => c === "KeyA" }, 1 / 60);
}
console.log("walk west into pillar E face", {
  foot: player.getFootY(),
  y: player.getY(),
  x: player.getX().toFixed(3),
  z: player.getZ().toFixed(3),
});
let minFoot = 0;
player = createPlayerController(camera, level.bounds, 0, {
  getColliders: () => level.allColliders,
  getGroundSurfaces: () => level.groundSurfaces,
  getFloorHoles: () => level.floorHoles,
  getFloorBounds: () => level.floorBounds,
  arenaBounds: level.bounds,
  getAttachWall: () => level.attachWall,
  getIsInRoom: () => false,
  getStandEyeHeight: () => 1.65,
  getBindings: () => DEFAULT_BINDINGS,
  initialPosition: { x: px, y: 1.65, z: pz },
  initialYaw: Math.PI,
});
for (let i = 0; i < 180; i++) {
  player.update({ ...idle, isDown: (c) => c === "KeyS" }, 1 / 60);
  minFoot = Math.min(minFoot, player.getFootY());
}
console.log("walk south into NE corner", {
  foot: player.getFootY(),
  minFoot,
  x: player.getX().toFixed(3),
  z: player.getZ().toFixed(3),
});
