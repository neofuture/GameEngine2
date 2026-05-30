/** Simulate catwalk walk from stuck position. node scripts/catwalk-move-sim.mjs */
import * as THREE from "three";
import { readFileSync } from "node:fs";
import { createPlayerController } from "../lib/PlayerController.js";
import { buildStairFlight, getStairCeilingCutout } from "../lib/LevelStairs.js";
import { buildAttachedRoom } from "../lib/LevelRoom.js";
import { getDefaultStairPlacement, getArenaCatwalkDeckY } from "../lib/StairTuning.js";
import { getArenaAttachWall, getDoorwaysOnWall } from "../lib/DoorwayWall.js";
import { pushCollider } from "../lib/Collision.js";
import { DEFAULT_BINDINGS } from "../lib/KeyBindings.js";

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

function arenaCatwalkEdgeStandoff(westOpenRatio, wallStandoff) {
  const open = THREE.MathUtils.clamp(westOpenRatio, 0, 0.95);
  return {
    west: open > 0 ? 0 : wallStandoff,
    east: wallStandoff,
    north: wallStandoff,
    south: wallStandoff,
  };
}

function buildLevelColliders(raw) {
  const ARENA_SIZE = raw.size;
  const WALL_HEIGHT = raw.wallHeight;
  const WALL_THICKNESS = raw.wallThickness;
  const CEILING_THICKNESS = raw.ceilingThickness ?? 0.35;
  const CEILING_PAD = 0.25;
  const half = ARENA_SIZE / 2;
  const wallStandoff = raw.wallStandoff ?? 0.5;
  const innerHalf = half - wallStandoff;
  const westOpen =
    raw.ceilingWestOpenRatio ??
    ((raw.westWallHeightRatio ?? 1) < 1 ? 0.5 : 0);
  const ceilingBottomY = WALL_HEIGHT;
  const catwalkDeckY = ceilingBottomY + CEILING_THICKNESS;
  const edgeStandoff = arenaCatwalkEdgeStandoff(westOpen, wallStandoff);
  const attachWall = getArenaAttachWall(raw);

  const colliders = [];
  const groundSurfaces = [];
  const stairColliders = [];
  const ceilingColliders = [];

  for (const p of raw.pillars ?? []) {
    const pillarHalf = (raw.pillarSize ?? 1.2) / 2;
    colliders.push({
      x: p.x,
      z: p.z,
      halfX: pillarHalf,
      halfZ: pillarHalf,
      bottomY: 0,
      topY: WALL_HEIGHT,
      kind: "pillar",
    });
  }

  const northZ = -half - WALL_THICKNESS / 2;
  const spanHalfX = (ARENA_SIZE + WALL_THICKNESS) / 2;
  pushCollider(colliders, {
    x: 0,
    z: northZ,
    halfX: spanHalfX,
    halfZ: WALL_THICKNESS / 2,
    bottomY: 0,
    topY: WALL_HEIGHT,
    kind: "wall",
  });
  pushCollider(colliders, {
    x: 0,
    z: half + WALL_THICKNESS / 2,
    halfX: spanHalfX,
    halfZ: WALL_THICKNESS / 2,
    bottomY: 0,
    topY: WALL_HEIGHT,
    kind: "wall",
  });
  pushCollider(colliders, {
    x: half + WALL_THICKNESS / 2,
    z: 0,
    halfX: WALL_THICKNESS / 2,
    halfZ: spanHalfX,
    bottomY: 0,
    topY: WALL_HEIGHT,
    kind: "wall",
  });
  pushCollider(colliders, {
    x: -half - WALL_THICKNESS / 2,
    z: 0,
    halfX: WALL_THICKNESS / 2,
    halfZ: spanHalfX,
    bottomY: 0,
    topY: WALL_HEIGHT * (raw.westWallHeightRatio ?? 0.5),
    kind: "wall",
  });

  const mat = new THREE.MeshStandardMaterial();
  const built = buildStairFlight(new THREE.Group(), raw.stairs, mat, mat, {
    catwalkDeckY,
    catwalkEdgeStandoff: edgeStandoff,
  });
  groundSurfaces.push(...built.groundSurfaces);
  stairColliders.push(...built.colliders);

  const ceilingFullWidth = ARENA_SIZE + 2 * WALL_THICKNESS + 2 * CEILING_PAD;
  const open = THREE.MathUtils.clamp(westOpen, 0, 0.95);
  let fullMinX;
  let fullMaxX;
  if (open <= 0) {
    fullMinX = -ceilingFullWidth / 2;
    fullMaxX = ceilingFullWidth / 2;
  } else {
    const coveredWidth = ceilingFullWidth * (1 - open);
    const centerX = (open * ceilingFullWidth) / 2;
    fullMinX = centerX - coveredWidth / 2;
    fullMaxX = centerX + coveredWidth / 2;
  }
  const cutout = getStairCeilingCutout(raw.stairs);
  for (const piece of deckRectPieces(
    fullMinX,
    fullMaxX,
    -ceilingFullWidth / 2,
    ceilingFullWidth / 2,
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
    groundSurfaces.push({
      ...piece,
      y: catwalkDeckY,
      edgeStandoff,
      arenaCatwalkDeck: true,
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

  for (const c of colliders) {
    if (c.kind !== "wall" && c.kind !== "pillar") continue;
    if (!Number.isFinite(c.topY)) continue;
    groundSurfaces.push({
      minX: c.x - c.halfX,
      maxX: c.x + c.halfX,
      minZ: c.z - c.halfZ,
      maxZ: c.z + c.halfZ,
      y: c.topY,
    });
  }

  return {
    allColliders: [...colliders, ...stairColliders, ...ceilingColliders],
    groundSurfaces,
    bounds: {
      minX: -innerHalf,
      maxX: innerHalf,
      minZ: -innerHalf,
      maxZ: innerHalf,
    },
    arenaBounds: {
      minX: -innerHalf,
      maxX: innerHalf,
      minZ: -innerHalf,
      maxZ: innerHalf,
    },
    attachWall,
    catwalkDeckY,
  };
}

function makeInput(keys) {
  const down = new Set(keys);
  return {
    isLocked: () => true,
    getMouseDelta: () => ({ dx: 0, dy: 0 }),
    isDown: (code) => down.has(code),
    wasPressed: () => false,
  };
}

function runSim(label, raw, keys, seconds = 3, start = null) {
  const level = buildLevelColliders(raw);
  const camera = new THREE.PerspectiveCamera();
  const startX = start?.x ?? 7.191;
  const startZ = start?.z ?? -1.2;
  const startYaw = start?.yawDeg != null
    ? THREE.MathUtils.degToRad(start.yawDeg)
    : Math.PI;
  const player = createPlayerController(camera, level.bounds, 0, {
    getColliders: () => level.allColliders,
    getGroundSurfaces: () => level.groundSurfaces,
    arenaBounds: level.arenaBounds,
    getAttachWall: () => level.attachWall,
    getIsInRoom: () => false,
    getStandEyeHeight: () => 1.65,
    getBindings: () => DEFAULT_BINDINGS,
    initialPosition: {
      x: startX,
      y: level.catwalkDeckY + 1.65,
      z: startZ,
    },
    initialYaw: startYaw,
  });

  const input = makeInput(keys);
  const dt = 1 / 60;
  let last = { x: player.getX(), z: player.getZ() };
  console.log(`\n=== ${label} keys=[${keys.join(",")}] ===`);
  console.log("start", {
    x: last.x.toFixed(3),
    z: last.z.toFixed(3),
    foot: player.getFootY().toFixed(3),
  });

  for (let i = 0; i < seconds * 60; i++) {
    player.update(input, dt);
    if (i === 0) {
      console.log("  frame0", {
        spd: player.getHorizontalSpeed().toFixed(3),
        y: player.getY().toFixed(3),
        foot: player.getFootY().toFixed(3),
      });
    }
    const x = player.getX();
    const z = player.getZ();
    if (Math.hypot(x - last.x, z - last.z) > 0.02) {
      console.log(
        `  t=${(i * dt).toFixed(2)}s x=${x.toFixed(3)} z=${z.toFixed(3)} foot=${player.getFootY().toFixed(3)} spd=${player.getHorizontalSpeed().toFixed(2)}`
      );
      last = { x, z };
    }
  }
  console.log("end", {
    x: player.getX().toFixed(3),
    z: player.getZ().toFixed(3),
    foot: player.getFootY().toFixed(3),
    moved: Math.hypot(player.getX() - startX, player.getZ() - startZ).toFixed(3),
  });
}

const raw = JSON.parse(
  readFileSync(new URL("../public/levels/level1.json", import.meta.url), "utf8")
);
raw.stairs = getDefaultStairPlacement();

runSim("South (+Z)", raw, ["KeyW"], 4);
runSim("East (+X)", raw, ["KeyD"], 4);
runSim("West (-X)", raw, ["KeyA"], 4);
runSim("North (-Z)", raw, ["KeyS"], 4);

runSim(
  "User report W",
  raw,
  ["KeyW"],
  4,
  { x: 10.146, z: 4.454, yawDeg: -175.4 }
);
runSim(
  "User report A",
  raw,
  ["KeyA"],
  4,
  { x: 10.146, z: 4.454, yawDeg: -175.4 }
);
