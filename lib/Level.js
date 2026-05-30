import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { buildAttachedRoom } from "./LevelRoom.js";
import { getPillarGeometry, resolvePillarShape } from "./PillarGeometry.js";
import { addPillarPoster, addWallPoster } from "./PillarPoster.js";
import { resolveTargetConfig, spawnTargets } from "./Targets.js";
import { assignWorldLayers } from "./LightingLayers.js";
import { enableShadowsOn } from "./SceneEnvironment.js";
import { createArenaWallBoxGeometry, applyDeckPieceWorldUVs } from "./WallBoxUV.js";
import {
  getArenaDoorInnerZ,
} from "./RoomPlacement.js";
import {
  buildStairFlight,
  clearStairGroup,
  getStairCeilingCutout,
  getStairTopDeckBridgeFootprint,
  STAIRS_TOTAL_RISE,
  STAIRS_TOTAL_RUN,
  STAIR_STRINGER_DEPTH_OVERHANG,
} from "./LevelStairs.js";
import { pushCollider } from "./Collision.js";
import {
  getArenaAttachWall,
  buildDoorwayPassages,
  getDoorwaysOnWall,
  openingsToExclusions,
  pushDoorColliders,
  resolveDoorOpening,
  subtractXIntervals,
} from "./DoorwayWall.js";

import {
  FLOOR_THICKNESS,
  FLOOR_WALL_OVERLAP,
  FLOOR_Y,
  WALL_FLOOR_EMBED,
  WALL_STANDOFF,
  wallCenterY,
  WALL_VISUAL_FLOOR_EMBED,
} from "./LevelConstants.js";

/** Walk support rectangles that match visible arena catwalk deck pieces (not one full slab). */
/** @param {{ minX: number, maxX: number, minZ: number, maxZ: number, y: number, edgeStandoff?: object, arenaCatwalkDeck?: boolean }[]} groundSurfaces */
function removeArenaCatwalkDeckSurfaces(groundSurfaces) {
  for (let i = groundSurfaces.length - 1; i >= 0; i--) {
    if (groundSurfaces[i].arenaCatwalkDeck) {
      groundSurfaces.splice(i, 1);
    }
  }
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

/** @param {{ minX: number, maxX: number, minZ: number, maxZ: number, y: number }[]} groundSurfaces */
function pushFlatGroundSurface(groundSurfaces, minX, maxX, minZ, maxZ, y = 0) {
  if (maxX - minX < 0.05 || maxZ - minZ < 0.05) return;
  groundSurfaces.push({ minX, maxX, minZ, maxZ, y });
}

/** Walk support for perimeter strips under arena walls (avoids edge gaps at wall bases). */
function registerArenaPerimeterFloorSupport(groundSurfaces, half, wallThickness) {
  const span = half + wallThickness;
  const y = 0;
  const pad = FLOOR_WALL_OVERLAP;
  const northZ = -half - wallThickness / 2;
  const southZ = half + wallThickness / 2;
  const eastX = half + wallThickness / 2;
  const westX = -half - wallThickness / 2;
  const halfT = wallThickness / 2;

  pushFlatGroundSurface(
    groundSurfaces,
    -span,
    span,
    northZ - halfT - pad,
    northZ + halfT,
    y
  );
  pushFlatGroundSurface(
    groundSurfaces,
    -span,
    span,
    southZ - halfT,
    southZ + halfT + pad,
    y
  );
  pushFlatGroundSurface(
    groundSurfaces,
    eastX - halfT,
    eastX + halfT + pad,
    -span,
    span,
    y
  );
  pushFlatGroundSurface(
    groundSurfaces,
    westX - halfT - pad,
    westX + halfT,
    -span,
    span,
    y
  );
}

/** Full arena deck at y=0 — one continuous walk surface (room interiors included). */
function registerFullArenaDeckSupport(groundSurfaces, half, wallThickness) {
  const span = half + wallThickness + FLOOR_WALL_OVERLAP;
  pushFlatGroundSurface(groundSurfaces, -span, span, -span, span, 0);
}

/** Threshold plate in each doorway — fills the wall-thickness band the deck can miss at openings. */
function addDoorwayFloorBridge(
  group,
  bridgeMat,
  doorway,
  arenaHalf,
  attachWall,
  arenaWallThickness,
  roomFloorSouthZ,
  groundSurfaces
) {
  const doorW = doorway.width ?? 1.1;
  const doorX = doorway.centerX ?? 0;
  const arenaInnerZ = getArenaDoorInnerZ(attachWall, arenaHalf, arenaWallThickness);
  const bridgeDepth = Math.abs(roomFloorSouthZ - arenaInnerZ);
  if (bridgeDepth < 0.02) return;

  const mat = floorMaterial(bridgeMat, 2);
  const bridge = new THREE.Mesh(
    new THREE.BoxGeometry(doorW, FLOOR_THICKNESS, bridgeDepth),
    mat
  );
  bridge.position.set(
    doorX,
    FLOOR_Y,
    (arenaInnerZ + roomFloorSouthZ) / 2
  );
  bridge.receiveShadow = true;
  bridge.renderOrder = 1;
  group.add(bridge);

  const minZ = Math.min(arenaInnerZ, roomFloorSouthZ);
  const maxZ = Math.max(arenaInnerZ, roomFloorSouthZ);
  const pad = FLOOR_WALL_OVERLAP;
  pushFlatGroundSurface(
    groundSurfaces,
    doorX - doorW / 2 - pad,
    doorX + doorW / 2 + pad,
    minZ - pad,
    maxZ + pad,
    0
  );
}

/**
 * Custom UV generator for `ExtrudeGeometry` that emits world-coord UVs
 * directly. Paired with a material whose texture `repeat = 1/tileSize`,
 * this gives continuous tiling across the whole floor (including the
 * edges of any cut-out holes) instead of stretching one tile across the
 * extruded shape.
 *
 * Top face: each vertex's shape-space (x, y) is also its world-space
 * (x, z) — the geometry is rotated `Math.PI / 2` around X after construction
 * so shape +Y becomes world +Z.
 *
 * Side walls: the inner cylinder around each hole; we map U around the
 * arc and V along the extrude depth so the wall texture doesn't stretch.
 *
 * @type {import("three").UVGenerator}
 */
const FLOOR_WORLD_UV_GENERATOR = {
  generateTopUV(geometry, vertices, indexA, indexB, indexC) {
    return [
      new THREE.Vector2(vertices[indexA * 3], vertices[indexA * 3 + 1]),
      new THREE.Vector2(vertices[indexB * 3], vertices[indexB * 3 + 1]),
      new THREE.Vector2(vertices[indexC * 3], vertices[indexC * 3 + 1]),
    ];
  },
  generateSideWallUV(geometry, vertices, indexA, indexB, indexC, indexD) {
    // Side wall quad spans two shape vertices and two depth steps. Use the
    // dominant in-plane axis as U so the texture isn't squished, and the
    // raw Z (extrude depth) as V.
    const ax = vertices[indexA * 3];
    const ay = vertices[indexA * 3 + 1];
    const az = vertices[indexA * 3 + 2];
    const bx = vertices[indexB * 3];
    const by = vertices[indexB * 3 + 1];
    const bz = vertices[indexB * 3 + 2];
    const cx = vertices[indexC * 3];
    const cy = vertices[indexC * 3 + 1];
    const cz = vertices[indexC * 3 + 2];
    const dx = vertices[indexD * 3];
    const dy = vertices[indexD * 3 + 1];
    const dz = vertices[indexD * 3 + 2];
    if (Math.abs(ay - by) < Math.abs(ax - bx)) {
      return [
        new THREE.Vector2(ax, az),
        new THREE.Vector2(bx, bz),
        new THREE.Vector2(cx, cz),
        new THREE.Vector2(dx, dz),
      ];
    }
    return [
      new THREE.Vector2(ay, az),
      new THREE.Vector2(by, bz),
      new THREE.Vector2(cy, cz),
      new THREE.Vector2(dy, dz),
    ];
  },
};

/**
 * Build the arena floor geometry — a square slab of `arenaSize × arenaSize`
 * with the listed circular holes punched through. Returns a geometry whose
 * top face is at `y = 0` and bottom at `y = -thickness`.
 *
 * @param {number} arenaSize
 * @param {number} thickness
 * @param {{ x: number, z: number, radius: number }[]} holes
 * @returns {THREE.BufferGeometry}
 */
function buildArenaFloorGeometry(arenaSize, thickness, holes) {
  const half = arenaSize / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-half, -half);
  shape.lineTo(half, -half);
  shape.lineTo(half, half);
  shape.lineTo(-half, half);
  shape.closePath();

  for (const hole of holes) {
    if (!Number.isFinite(hole?.x) || !Number.isFinite(hole?.z)) continue;
    const r = Math.max(0.1, hole.radius ?? 1);
    const path = new THREE.Path();
    // Clockwise winding (last arg = true) opposite to the outer shape so
    // the triangulator carves out the disc instead of filling it.
    path.absarc(hole.x, hole.z, r, 0, Math.PI * 2, true);
    shape.holes.push(path);
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 48,
    UVGenerator: FLOOR_WORLD_UV_GENERATOR,
  });
  // Lay the floor flat. After rotateX(+π/2): shape X → world X, shape Y →
  // world Z, extrude depth (+Z) → world -Y (slab thickness hangs below).
  geo.rotateX(Math.PI / 2);
  return geo;
}

function floorMaterial(mat, offsetFactor = -4) {
  if (!mat?.clone) return mat;
  const m = mat.clone();
  m.polygonOffset = true;
  m.polygonOffsetFactor = offsetFactor;
  m.polygonOffsetUnits = offsetFactor;
  return m;
}

/** Main arena deck — no polygon offset (offset breaks receiving baked shadows). */
function arenaDeckMaterial(mat) {
  return mat?.clone ? mat.clone() : mat;
}

/** Shared PBR setup — walls, ceiling, and pillars use identical surface response. */
function finalizeArenaSurfaceMaterial(mat) {
  if (!mat) return mat;
  mat.roughness = 1;
  mat.metalness = 0;
  mat.depthWrite = true;
  mat.depthTest = true;
  mat.polygonOffset = false;
  return mat;
}

/** @deprecated Ceilings no longer get special darkening — kept for export stability. */
export const ARENA_CEILING_DAY_EMISSIVE = 0;
export const ARENA_CEILING_NIGHT_EMISSIVE = 0;

/** West clerestory: share of deck width (negative X side) left open to the sky. */
const ARENA_CEILING_WEST_OPEN_RATIO = 0.5;

/**
 * @param {number} fullMinX
 * @param {number} fullMaxX
 * @param {number} fullMinZ
 * @param {number} fullMaxZ
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number } | null} hole
 * @returns {{ minX: number, maxX: number, minZ: number, maxZ: number }[]}
 */
function deckRectPieces(fullMinX, fullMaxX, fullMinZ, fullMaxZ, hole) {
  if (!hole) {
    return [{ minX: fullMinX, maxX: fullMaxX, minZ: fullMinZ, maxZ: fullMaxZ }];
  }

  const { minX: hx0, maxX: hx1, minZ: hz0, maxZ: hz1 } = hole;
  if (hx1 <= fullMinX || hx0 >= fullMaxX || hz1 <= fullMinZ || hz0 >= fullMaxZ) {
    return [{ minX: fullMinX, maxX: fullMaxX, minZ: fullMinZ, maxZ: fullMaxZ }];
  }

  const pieces = [];
  const gap = 0.01;

  if (fullMinZ < hz0 - gap) {
    pieces.push({
      minX: fullMinX,
      maxX: fullMaxX,
      minZ: fullMinZ,
      maxZ: Math.min(fullMaxZ, hz0),
    });
  }
  const zMid0 = Math.max(fullMinZ, hz0);
  const zMid1 = Math.min(fullMaxZ, hz1);
  const eastMinX = Math.max(fullMinX, hx1);

  // East catwalk column — one continuous surface beside the stair cutout (no seam
  // between the east wing and south arm when the cutout moves with stair tuning).
  if (eastMinX + gap < fullMaxX && zMid0 < fullMaxZ - gap) {
    pieces.push({
      minX: eastMinX,
      maxX: fullMaxX,
      minZ: zMid0,
      maxZ: fullMaxZ,
    });
  }

  // South/west band — south of the cutout, west of the east column.
  if (hz1 + gap < fullMaxZ) {
    const southMaxX = eastMinX + gap < fullMaxX ? eastMinX : fullMaxX;
    if (southMaxX - fullMinX > gap) {
      pieces.push({
        minX: fullMinX,
        maxX: southMaxX,
        minZ: Math.max(fullMinZ, hz1),
        maxZ: fullMaxZ,
      });
    }
  }

  if (zMid1 > zMid0 + gap && fullMinX < hx0 - gap) {
    pieces.push({
      minX: fullMinX,
      maxX: Math.min(fullMaxX, hx0),
      minZ: zMid0,
      maxZ: zMid1,
    });
  }

  return pieces;
}

function addArenaCeilingDeckPiece(
  group,
  minX,
  maxX,
  minZ,
  maxZ,
  thickness,
  ceilingBottomY,
  ceilingMat,
  tileSize
) {
  const width = maxX - minX;
  const depth = maxZ - minZ;
  if (width < 0.05 || depth < 0.05) return;

  const geometry = new THREE.BoxGeometry(width, thickness, depth);
  if (tileSize) {
    applyDeckPieceWorldUVs(geometry, minX, maxX, minZ, maxZ, thickness, tileSize);
  }

  const ceiling = new THREE.Mesh(geometry, ceilingMat);
  ceiling.position.set(
    (minX + maxX) / 2,
    ceilingBottomY + thickness / 2,
    (minZ + maxZ) / 2
  );
  ceiling.userData.arenaCeiling = true;
  ceiling.userData.shadowCast = true;
  ceiling.userData.shadowReceive = true;
  group.add(ceiling);
}

function clearArenaCeilingGroup(group) {
  const geometries = new Set();
  const meshes = group.children.filter((c) => c.isMesh);
  for (const mesh of meshes) {
    group.remove(mesh);
    if (mesh.geometry && !geometries.has(mesh.geometry)) {
      geometries.add(mesh.geometry);
      mesh.geometry.dispose();
    }
    // Per-piece material clones own their texture clones — dispose both.
    // The shared base ceilingMat is untagged and stays alive.
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (!mat?.userData?.deckPieceOwned) continue;
      for (const key of ["map", "normalMap", "roughnessMap"]) {
        mat[key]?.dispose();
      }
      mat.dispose();
    }
  }
}

/**
 * Clone deck material for a ceiling piece. UVs are baked in world space on
 * the geometry — texture repeat/offset stay at (1, 0) so cutout moves never
 * drag the pattern with them.
 */
function makeDeckPieceMaterial(baseMat, tileSize) {
  if (!baseMat?.map || !tileSize) return baseMat;
  const mat = baseMat.clone();
  for (const key of ["map", "normalMap", "roughnessMap"]) {
    const tex = mat[key];
    if (!tex) continue;
    const cloned = tex.clone();
    cloned.wrapS = THREE.RepeatWrapping;
    cloned.wrapT = THREE.RepeatWrapping;
    cloned.repeat.set(1, 1);
    cloned.offset.set(0, 0);
    cloned.needsUpdate = true;
    mat[key] = cloned;
  }
  // Flag for clearArenaCeilingGroup: this clone owns its texture clones too
  // and must be disposed when the deck is rebuilt (stair re-tune, HMR).
  mat.userData = { ...(mat.userData ?? {}), deckPieceOwned: true };
  return mat;
}

function addArenaCeilingDeck(
  group,
  colliders,
  groundSurfaces,
  fullWidth,
  fullDepth,
  thickness,
  ceilingBottomY,
  ceilingMat,
  westOpenRatio,
  stairCutout = null,
  ceilingTile = null,
  edgeStandoff = null,
  stairTopBridge = null
) {
  const topY = ceilingBottomY + thickness;
  const open = THREE.MathUtils.clamp(westOpenRatio, 0, 0.95);
  let fullMinX;
  let fullMaxX;

  if (open <= 0) {
    fullMinX = -fullWidth / 2;
    fullMaxX = fullWidth / 2;
  } else {
    const coveredWidth = fullWidth * (1 - open);
    const centerX = (open * fullWidth) / 2;
    fullMinX = centerX - coveredWidth / 2;
    fullMaxX = centerX + coveredWidth / 2;
  }

  const fullMinZ = -fullDepth / 2;
  const fullMaxZ = fullDepth / 2;
  const pieces = deckRectPieces(
    fullMinX,
    fullMaxX,
    fullMinZ,
    fullMaxZ,
    stairCutout
  );

  if (stairTopBridge) {
    pieces.push({
      minX: Math.max(fullMinX, stairTopBridge.minX),
      maxX: Math.min(fullMaxX, stairTopBridge.maxX),
      minZ: Math.max(fullMinZ, stairTopBridge.minZ),
      maxZ: Math.min(fullMaxZ, stairTopBridge.maxZ),
    });
  }

  for (const piece of pieces) {
    const pieceMat = makeDeckPieceMaterial(ceilingMat, ceilingTile);
    addArenaCeilingDeckPiece(
      group,
      piece.minX,
      piece.maxX,
      piece.minZ,
      piece.maxZ,
      thickness,
      ceilingBottomY,
      pieceMat,
      ceilingTile
    );
    const centerX = (piece.minX + piece.maxX) / 2;
    const centerZ = (piece.minZ + piece.maxZ) / 2;
    const halfX = (piece.maxX - piece.minX) / 2;
    const halfZ = (piece.maxZ - piece.minZ) / 2;
    if (colliders) {
      pushCollider(colliders, {
        x: centerX,
        z: centerZ,
        halfX,
        halfZ,
        bottomY: ceilingBottomY,
        topY,
        kind: "deck",
      });
    }
    if (groundSurfaces) {
      groundSurfaces.push({
        minX: piece.minX,
        maxX: piece.maxX,
        minZ: piece.minZ,
        maxZ: piece.maxZ,
        y: topY,
        edgeStandoff,
        arenaCatwalkDeck: true,
      });
    }
  }
}

/** Dim the arena deck underside emissive boost when the sun is off. */
export { applyArenaCeilingDayNight } from "./ArenaCeilingDayNight.js";

function wallMaterialDoorway(mat) {
  return finalizeArenaSurfaceMaterial(mat?.clone ? mat.clone() : mat);
}

function addWallBox(group, geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addSolidWallCollider(
  colliders,
  x,
  z,
  halfX,
  halfZ,
  bottomY,
  topY,
  kind = "wall"
) {
  pushCollider(colliders, {
    x,
    z,
    halfX,
    halfZ,
    bottomY,
    topY,
    kind,
  });
}

/**
 * Match doorway wall mesh spans with solid colliders (gaps left open for doors).
 */
function addDoorwayWallColliders(
  colliders,
  doorways,
  half,
  wallHeight,
  wallThickness,
  side
) {
  const openings = doorways.map(resolveDoorOpening);
  const exclusions = openingsToExclusions(openings);
  const z =
    side === "south"
      ? half + wallThickness / 2
      : -half - wallThickness / 2;

  const pushSpan = (x0, x1, bottomY, topY) => {
    const w = x1 - x0;
    if (w < 0.15) return;
    addSolidWallCollider(
      colliders,
      (x0 + x1) / 2,
      z,
      w / 2,
      wallThickness / 2,
      bottomY,
      topY
    );
  };

  for (const [x0, x1] of subtractXIntervals(-half, half, exclusions)) {
    pushSpan(x0, x1, -WALL_FLOOR_EMBED, wallHeight);
  }

  for (const opening of openings) {
    pushDoorColliders(pushSpan, opening, wallHeight);
  }
}

function addArenaPerimeterWallColliders(
  colliders,
  half,
  arenaSize,
  wallHeight,
  wallThickness,
  westWallHeight,
  arena
) {
  const northZ = -half - wallThickness / 2;
  const southZ = half + wallThickness / 2;
  const eastX = half + wallThickness / 2;
  const westX = -half - wallThickness / 2;
  const spanHalfX = (arenaSize + wallThickness) / 2;
  const spanHalfZ = (arenaSize + wallThickness) / 2;
  const northDoors = getDoorwaysOnWall(arena, "north");
  const southDoors = getDoorwaysOnWall(arena, "south");

  if (northDoors.length) {
    addDoorwayWallColliders(
      colliders,
      northDoors,
      half,
      wallHeight,
      wallThickness,
      "north"
    );
  } else {
    addSolidWallCollider(
      colliders,
      0,
      northZ,
      spanHalfX,
      wallThickness / 2,
      -WALL_FLOOR_EMBED,
      wallHeight
    );
  }

  if (southDoors.length) {
    addDoorwayWallColliders(
      colliders,
      southDoors,
      half,
      wallHeight,
      wallThickness,
      "south"
    );
  } else {
    addSolidWallCollider(
      colliders,
      0,
      southZ,
      spanHalfX,
      wallThickness / 2,
      -WALL_FLOOR_EMBED,
      wallHeight
    );
  }

  addSolidWallCollider(
    colliders,
    eastX,
    0,
    wallThickness / 2,
    spanHalfZ,
    -WALL_FLOOR_EMBED,
    wallHeight
  );
  addSolidWallCollider(
    colliders,
    westX,
    0,
    wallThickness / 2,
    spanHalfZ,
    -WALL_FLOOR_EMBED,
    westWallHeight
  );
}

/**
 * UV generator for doorway walls built via ExtrudeGeometry.
 * Shape lives in XY (X = horizontal, Y = up); extrude depth = wall thickness
 * along +Z.  After construction the geometry is translated so Z is centred on
 * the wall and the mesh is placed at the correct world Z.
 */
function makeDoorwayWallUVGenerator(arenaHalf, arenaSize, wallHeight, wallThickness) {
  return {
    generateTopUV(_geo, verts, iA, iB, iC) {
      const u = (i) => (verts[i * 3] + arenaHalf) / arenaSize;
      const v = (i) => verts[i * 3 + 1] / wallHeight;
      return [
        new THREE.Vector2(u(iA), v(iA)),
        new THREE.Vector2(u(iB), v(iB)),
        new THREE.Vector2(u(iC), v(iC)),
      ];
    },
    generateSideWallUV(_geo, verts, iA, iB, iC, iD) {
      const ax = verts[iA * 3], ay = verts[iA * 3 + 1], az = verts[iA * 3 + 2];
      const bx = verts[iB * 3], by = verts[iB * 3 + 1];
      const cx = verts[iC * 3], cy = verts[iC * 3 + 1], cz = verts[iC * 3 + 2];
      const dx = Math.abs(bx - ax), dy = Math.abs(by - ay);
      if (dx > dy) {
        const uA = (ax + arenaHalf) / arenaSize;
        const uB = (bx + arenaHalf) / arenaSize;
        const vFront = az / wallThickness;
        const vBack = cz / wallThickness;
        return [
          new THREE.Vector2(uA, vFront),
          new THREE.Vector2(uB, vFront),
          new THREE.Vector2(uB, vBack),
          new THREE.Vector2(uA, vBack),
        ];
      }
      const vA = ay / wallHeight;
      const vB = by / wallHeight;
      const uFront = az / wallThickness;
      const uBack = cz / wallThickness;
      return [
        new THREE.Vector2(uFront, vA),
        new THREE.Vector2(uFront, vB),
        new THREE.Vector2(uBack, vB),
        new THREE.Vector2(uBack, vA),
      ];
    },
  };
}

const ARCH_CURVE_SEGMENTS = 32;

function appendDoorwayHoles(shape, openings, spanLeft, spanRight, floorLine) {
  for (const op of openings) {
    if (op.right <= spanLeft + 0.01 || op.left >= spanRight - 0.01) continue;
    const hole = new THREE.Path();
    if (op.arch) {
      hole.moveTo(op.left, floorLine);
      hole.lineTo(op.left, op.rectTop);
      hole.absarc(op.centerX, op.rectTop, op.radius, Math.PI, 0, true);
      hole.lineTo(op.right, floorLine);
      hole.closePath();
    } else {
      hole.moveTo(op.left, floorLine);
      hole.lineTo(op.left, op.height);
      hole.lineTo(op.right, op.height);
      hole.lineTo(op.right, floorLine);
      hole.closePath();
    }
    shape.holes.push(hole);
  }
}

function extrudeDoorwayWallSpan(
  group,
  wallMat,
  spanLeft,
  spanRight,
  openings,
  half,
  arenaSize,
  wallHeight,
  wallThickness,
  z,
  floorLine
) {
  if (spanRight - spanLeft < 0.05) return;

  const shape = new THREE.Shape();
  shape.moveTo(spanLeft, floorLine);
  shape.lineTo(spanRight, floorLine);
  shape.lineTo(spanRight, wallHeight);
  shape.lineTo(spanLeft, wallHeight);
  shape.closePath();
  appendDoorwayHoles(shape, openings, spanLeft, spanRight, floorLine);

  const uvGen = makeDoorwayWallUVGenerator(half, arenaSize, wallHeight, wallThickness);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: wallThickness,
    bevelEnabled: false,
    steps: 1,
    curveSegments: ARCH_CURVE_SEGMENTS,
    UVGenerator: uvGen,
  });
  geo.translate(0, 0, z - wallThickness / 2);

  const mesh = new THREE.Mesh(geo, wallMaterialDoorway(wallMat));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.renderOrder = 0;
  group.add(mesh);
}

/**
 * Door gaps on the north or south perimeter — outdoor (world) layer only.
 * Uses Shape + ExtrudeGeometry so arched tops are smooth curves (same
 * approach as the floor hole cutouts).
 */
function addDoorwayWall(
  group,
  wallMat,
  doorways,
  half,
  arenaSize,
  wallHeight,
  wallThickness,
  side
) {
  const openings = doorways.map(resolveDoorOpening);
  const floorLine = -WALL_VISUAL_FLOOR_EMBED;
  const z =
    side === "south"
      ? half + wallThickness / 2
      : -half - wallThickness / 2;

  extrudeDoorwayWallSpan(
    group,
    wallMat,
    -half,
    half,
    openings,
    half,
    arenaSize,
    wallHeight,
    wallThickness,
    z,
    floorLine
  );
}

/**
 * @param {THREE.Scene} scene
 * @param {import("./loadArena.js").ArenaConfig} arena
 * @param {Awaited<ReturnType<import("./LevelTextures.js").loadLevelTextureLibrary>>} [textureLibrary]
 */
export function createLevelFromArena(scene, arena, textureLibrary = null) {
  const {
    size: ARENA_SIZE,
    wallHeight: WALL_HEIGHT,
    wallThickness: WALL_THICKNESS,
    ceilingThickness: CEILING_THICKNESS = 0.35,
    catwalkClearance: CATWALK_CLEARANCE = 2.2,
    westWallHeightRatio: WEST_WALL_HEIGHT_RATIO = 0.5,
    pillarSize: PILLAR_SIZE,
    playerBoundsInset,
    wallStandoff: wallStandoffConfig,
    textures,
    pillars,
    rooms = [],
    stairs: stairConfig = null,
  } = arena;

  const half = ARENA_SIZE / 2;
  /** Distance from inner wall face (±half) to the player's body edge. */
  const wallStandoff =
    wallStandoffConfig ??
    (playerBoundsInset != null
      ? WALL_THICKNESS + playerBoundsInset
      : WALL_STANDOFF);
  const innerHalf = half - wallStandoff;
  const group = new THREE.Group();
  const pickupsGroup = new THREE.Group();
  pickupsGroup.name = "level_pickups";
  group.add(pickupsGroup);

  const floorTile = textureLibrary?.tileSize(textures.floor) ?? 4;
  const wallTile = textureLibrary?.tileSize(textures.wall) ?? 4;
  const defaultPillarTile = textureLibrary?.tileSize(textures.pillar) ?? 3;

  const floorDeckSpan = ARENA_SIZE + 2 * WALL_THICKNESS;

  let floorMat =
    textureLibrary?.createTiled(
      textures.floor,
      floorDeckSpan / floorTile,
      floorDeckSpan / floorTile
    ) ?? new THREE.MeshLambertMaterial({ color: 0xa39a8c });

  floorMat = arenaDeckMaterial(floorMat);

  const attachWall = getArenaAttachWall(arena);
  const attachWallDoorways = getDoorwaysOnWall(arena, attachWall);

  /** Floor with world-coord UVs — needed so the ExtrudeGeometry version of
   *  the arena floor tiles continuously instead of stretching one tile per
   *  shape. Only created when there are holes to cut. */
  const floorHoles = Array.isArray(arena.floorHoles) ? arena.floorHoles : [];
  const floorHasCutouts = floorHoles.length > 0;
  const worldUVFloorMat = floorHasCutouts
    ? arenaDeckMaterial(
        textureLibrary?.createTiled(
          textures.floor,
          1 / floorTile,
          1 / floorTile
        ) ?? new THREE.MeshLambertMaterial({ color: 0xa39a8c })
      )
    : null;

  const wallMatNorthSouth = finalizeArenaSurfaceMaterial(
    textureLibrary?.createTiled(
      textures.wall,
      ARENA_SIZE / wallTile,
      WALL_HEIGHT / wallTile
    ) ?? new THREE.MeshLambertMaterial({ color: 0xc4beb4 })
  );

  const wallMatEastWest = finalizeArenaSurfaceMaterial(
    textureLibrary?.createTiled(
      textures.wall,
      ARENA_SIZE / wallTile,
      WALL_HEIGHT / wallTile
    ) ?? wallMatNorthSouth
  );

  // Arena deck — solid under attached rooms; only config floorHoles are cut.
  const floorGeometry = floorHasCutouts
    ? buildArenaFloorGeometry(floorDeckSpan, FLOOR_THICKNESS, floorHoles)
    : new THREE.BoxGeometry(floorDeckSpan, FLOOR_THICKNESS, floorDeckSpan);
  const floor = new THREE.Mesh(
    floorGeometry,
    floorHasCutouts ? worldUVFloorMat : floorMat
  );
  // BoxGeometry is centred on origin, ExtrudeGeometry top sits at y=0 with
  // thickness extending below. Match the top surface to the original floor
  // top either way (y = 0).
  floor.position.y = floorHasCutouts ? 0 : FLOOR_Y;
  floor.userData.shadowCast = false;
  floor.userData.shadowReceive = true;
  group.add(floor);

  const northZ = -half - WALL_THICKNESS / 2;
  const southZ = half + WALL_THICKNESS / 2;
  const northDoorways = getDoorwaysOnWall(arena, "north");
  const southDoorways = getDoorwaysOnWall(arena, "south");

  if (northDoorways.length) {
    addDoorwayWall(
      group,
      wallMatNorthSouth,
      northDoorways,
      half,
      ARENA_SIZE,
      WALL_HEIGHT,
      WALL_THICKNESS,
      "north"
    );
  } else {
    const northGeo = createArenaWallBoxGeometry(
      ARENA_SIZE + WALL_THICKNESS,
      WALL_HEIGHT,
      WALL_THICKNESS,
      0,
      wallCenterY(WALL_HEIGHT),
      northZ,
      half,
      ARENA_SIZE,
      WALL_HEIGHT
    );
    addWallBox(group, northGeo, wallMatNorthSouth, 0, 0, 0);
  }

  if (southDoorways.length) {
    addDoorwayWall(
      group,
      wallMatNorthSouth,
      southDoorways,
      half,
      ARENA_SIZE,
      WALL_HEIGHT,
      WALL_THICKNESS,
      "south"
    );
  } else {
    const southGeo = createArenaWallBoxGeometry(
      ARENA_SIZE + WALL_THICKNESS,
      WALL_HEIGHT,
      WALL_THICKNESS,
      0,
      wallCenterY(WALL_HEIGHT),
      southZ,
      half,
      ARENA_SIZE,
      WALL_HEIGHT
    );
    addWallBox(group, southGeo, wallMatNorthSouth.clone(), 0, 0, 0);
  }

  const eastGeo = new THREE.BoxGeometry(
    WALL_THICKNESS,
    WALL_HEIGHT,
    ARENA_SIZE + WALL_THICKNESS
  );
  const east = new THREE.Mesh(eastGeo, wallMatEastWest);
  east.position.set(half + WALL_THICKNESS / 2, wallCenterY(WALL_HEIGHT), 0);
  east.castShadow = true;
  east.receiveShadow = true;
  group.add(east);

  const westWallHeight = WALL_HEIGHT * WEST_WALL_HEIGHT_RATIO;
  const wallMatWest =
    textureLibrary?.createTiled(
      textures.wall,
      ARENA_SIZE / wallTile,
      westWallHeight / wallTile
    ) ?? wallMatEastWest;
  const westGeo = new THREE.BoxGeometry(
    WALL_THICKNESS,
    westWallHeight,
    ARENA_SIZE + WALL_THICKNESS
  );
  const west = new THREE.Mesh(westGeo, wallMatWest);
  west.position.set(-half - WALL_THICKNESS / 2, wallCenterY(westWallHeight), 0);
  west.castShadow = true;
  west.receiveShadow = true;
  group.add(west);

  const ceilingId = textures.ceiling ?? textures.floor;
  const ceilingTile = textureLibrary?.tileSize(ceilingId) ?? floorTile;
  const ceilingMat = finalizeArenaSurfaceMaterial(
    textureLibrary?.createTiled(
      ceilingId,
      ARENA_SIZE / ceilingTile,
      ARENA_SIZE / ceilingTile
    ) ?? new THREE.MeshStandardMaterial({ color: 0x3a3a40 })
  );

  /** Flush with wall tops — large overlap caused a bright seam where deck met walls. */
  const CEILING_OVERLAP = 0;
  const CEILING_PAD = 0.25;
  const ceilingBottomY = WALL_HEIGHT - CEILING_OVERLAP;
  const ceilingFullWidth = ARENA_SIZE + 2 * WALL_THICKNESS + 2 * CEILING_PAD;
  const ceilingFullDepth = ceilingFullWidth;
  const ceilingWestOpen =
    arena.ceilingWestOpenRatio ??
    (WEST_WALL_HEIGHT_RATIO < 1 ? ARENA_CEILING_WEST_OPEN_RATIO : 0);

  const ceilingGroup = new THREE.Group();
  ceilingGroup.name = "arena_ceiling";
  group.add(ceilingGroup);

  const catwalkEdgeStandoff = arenaCatwalkEdgeStandoff(ceilingWestOpen, wallStandoff);

  function rebuildArenaCeiling(stairPlacement) {
    clearArenaCeilingGroup(ceilingGroup);
    ceilingColliders.length = 0;
    removeArenaCatwalkDeckSurfaces(groundSurfaces);
    const cutout = stairPlacement ? getStairCeilingCutout(stairPlacement) : null;
    const stairTopBridge = stairPlacement
      ? getStairTopDeckBridgeFootprint(stairPlacement)
      : null;
    addArenaCeilingDeck(
      ceilingGroup,
      ceilingColliders,
      groundSurfaces,
      ceilingFullWidth,
      ceilingFullDepth,
      CEILING_THICKNESS,
      ceilingBottomY,
      ceilingMat,
      ceilingWestOpen,
      cutout,
      ceilingTile,
      catwalkEdgeStandoff,
      stairTopBridge
    );
    assignWorldLayers(ceilingGroup);
    enableShadowsOn(ceilingGroup);
  }

  const ceilingTopY = ceilingBottomY + CEILING_THICKNESS;
  const catwalkDeckY = ceilingTopY;

  const groundSurfaces = [];
  registerArenaPerimeterFloorSupport(groundSurfaces, half, WALL_THICKNESS);
  registerFullArenaDeckSupport(groundSurfaces, half, WALL_THICKNESS);
  const baseGroundSurfaceCount = groundSurfaces.length;

  /** @type {import("./Collision.js").ColliderBox[]} */
  const ceilingColliders = [];

  const pillarHalf = PILLAR_SIZE / 2;
  const colliders = pillars.map(({ x, z }) => ({
    x,
    z,
    halfX: pillarHalf,
    halfZ: pillarHalf,
    bottomY: 0,
    topY: WALL_HEIGHT,
    kind: "pillar",
  }));

  addArenaPerimeterWallColliders(
    colliders,
    half,
    ARENA_SIZE,
    WALL_HEIGHT,
    WALL_THICKNESS,
    westWallHeight,
    arena
  );

  const stairsGroup = new THREE.Group();
  stairsGroup.name = "arena_stairs";
  group.add(stairsGroup);

  const stairTreadTile = textureLibrary?.tileSize("floor_metal_grate_rusty") ?? 2;
  const stairTreadMat = makeDeckPieceMaterial(
    finalizeArenaSurfaceMaterial(
      textureLibrary?.createTiled("floor_metal_grate_rusty", 1, 1) ??
        new THREE.MeshStandardMaterial({ color: 0x6a6460 })
    ),
    stairTreadTile
  );
  const stairStringerMat = finalizeArenaSurfaceMaterial(
    textureLibrary?.createTiled(
      "decal_hazard_stripes_worn",
      1,
      1
    ) ?? stairTreadMat
  );

  /** @type {{ x: number, z: number, halfX: number, halfZ: number }[]} */
  const stairColliders = [];

  function applyStairFlight(config) {
    clearStairGroup(stairsGroup);
    stairColliders.length = 0;
    while (groundSurfaces.length > baseGroundSurfaceCount) groundSurfaces.pop();

    if (!config) {
      rebuildArenaCeiling(null);
      return;
    }

    const stringerShape = resolvePillarShape({ shape: "rounded" }, arena);
    const built = buildStairFlight(
      stairsGroup,
      config,
      stairTreadMat,
      stairStringerMat,
      {
        ...stringerShape,
        catwalkDeckY,
        treadTileSize: stairTreadTile,
        catwalkEdgeStandoff,
      }
    );
    groundSurfaces.push(...built.groundSurfaces);
    stairColliders.push(...built.colliders);
    assignWorldLayers(stairsGroup);
    enableShadowsOn(stairsGroup);
    rebuildArenaCeiling(config);
  }

  applyStairFlight(stairConfig);

  const pillarMeshes = [];
  for (let pi = 0; pi < pillars.length; pi++) {
    const pillarDef = pillars[pi];
    const materialId = pillarDef.texture ?? textures.pillar;
    const pillarTile = textureLibrary?.tileSize(materialId) ?? defaultPillarTile;
    const pillarMat = finalizeArenaSurfaceMaterial(
      textureLibrary?.createTiled(
        materialId,
        PILLAR_SIZE / pillarTile,
        WALL_HEIGHT / pillarTile
      ) ?? new THREE.MeshLambertMaterial({ color: 0xb8956a })
    );

    const { shape, cornerRadius, cornerSegments } = resolvePillarShape(
      pillarDef,
      arena
    );
    const pillarGeo = getPillarGeometry(
      shape,
      PILLAR_SIZE,
      WALL_HEIGHT,
      PILLAR_SIZE,
      { cornerRadius, cornerSegments }
    );

    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(pillarDef.x, WALL_HEIGHT / 2, pillarDef.z);
    pillar.rotation.y = pillarDef.rotationY ?? 0;
    pillar.userData.shadowCast = true;
    pillar.userData.shadowReceive = true;
    pillar.userData.arenaPillarId = materialId;
    pillar.userData.levelObject = {
      type: "pillar",
      index: pi,
      def: { ...pillarDef },
    };
    group.add(pillar);
    pillarMeshes.push(pillar);
    addPillarPoster(pillar, pillarDef, {
      pillarSize: PILLAR_SIZE,
      wallHeight: WALL_HEIGHT,
    });
  }

  let boundsMinX = -innerHalf;
  let boundsMaxX = innerHalf;
  let boundsMinZ = -innerHalf;
  let boundsMaxZ = innerHalf;

  const roomExteriorDeckMat = makeDeckPieceMaterial(ceilingMat, ceilingTile);

  for (const room of rooms) {
    const built = buildAttachedRoom(
      group,
      room,
      textureLibrary,
      half,
      WALL_HEIGHT,
      colliders,
      attachWall,
      WALL_THICKNESS,
      CEILING_THICKNESS,
      attachWallDoorways,
      groundSurfaces,
      {
        arenaCeilingBottomY: ceilingBottomY,
        catwalkDeckY,
        exteriorDeckMat: roomExteriorDeckMat,
        exteriorDeckTileSize: ceilingTile,
        deckPad: CEILING_PAD,
        wallStandoff,
      }
    );
    boundsMinX = Math.min(boundsMinX, built.centerX - built.halfW);
    boundsMaxX = Math.max(boundsMaxX, built.centerX + built.halfW);
    boundsMinZ = Math.min(boundsMinZ, built.centerZ - built.halfD);
    boundsMaxZ = Math.max(boundsMaxZ, built.centerZ + built.halfD);

    if (attachWallDoorways.length && built.floorSouthZ != null) {
      for (const doorway of attachWallDoorways) {
        addDoorwayFloorBridge(
          group,
          floorMat,
          doorway,
          half,
          attachWall,
          WALL_THICKNESS,
          built.floorSouthZ,
          groundSurfaces
        );
      }
    }
  }

  // Make wall and pillar tops walkable — bounded to each collider footprint only.
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

  const bounds = {
    minX: boundsMinX,
    maxX: boundsMaxX,
    minZ: boundsMinZ,
    maxZ: boundsMaxZ,
  };
  const arenaBounds = {
    minX: -innerHalf,
    maxX: innerHalf,
    minZ: -innerHalf,
    maxZ: innerHalf,
  };
  const roomAttachExtentZ =
    attachWall === "north" ? boundsMinZ : boundsMaxZ;
  const doorwayPassages = buildDoorwayPassages(
    attachWallDoorways,
    attachWall,
    half,
    WALL_THICKNESS,
    innerHalf,
    roomAttachExtentZ
  );
  const floorBounds = {
    minX: Math.min(boundsMinX, -half - WALL_THICKNESS),
    maxX: Math.max(boundsMaxX, half + WALL_THICKNESS),
    minZ: Math.min(boundsMinZ, -half - WALL_THICKNESS),
    maxZ: Math.max(boundsMaxZ, half + WALL_THICKNESS),
  };
  const targetConfig = resolveTargetConfig(arena);
  const { targets, sharedGeo: targetGeo } = spawnTargets({
    group,
    bounds: arenaBounds,
    colliders: [...colliders, ...stairColliders],
    targetColliderSink: colliders,
    config: targetConfig,
    floorHoles,
  });

  for (const posterDef of arena.posters ?? []) {
    addWallPoster(group, posterDef, {
      half,
      wallHeight: WALL_HEIGHT,
      westWallHeight,
    });
  }

  scene.add(group);
  assignWorldLayers(group);

  return {
    group,
    targets,
    targetConfig,
    targetGeo,
    colliders,
    bounds,
    arenaBounds,
    attachWall,
    doorwayPassages,
    floorBounds,
    floorY: 0,
    floorHoles,
    wallHeight: WALL_HEIGHT,
    ceilingBottomY,
    ceilingTopY,
    catwalkDeckY,
    catwalkClearance: CATWALK_CLEARANCE,
    westWallHeight: WALL_HEIGHT * WEST_WALL_HEIGHT_RATIO,
    arenaId: arena.id,
    rooms,
    groundSurfaces,
    stairColliders,
    ceilingColliders,
    rebuildStairs: applyStairFlight,
    pillarMeshes,
    pickupsGroup,
  };
}

/** Remove level meshes from the scene and dispose GPU resources (HMR / unmount). */
export function disposeLevelGroup(group) {
  if (!group) return;
  const geometries = new Set();
  const materials = new Set();
  group.traverse((obj) => {
    if (obj.geometry && !geometries.has(obj.geometry)) {
      geometries.add(obj.geometry);
      obj.geometry.dispose();
    }
    const { material } = obj;
    if (!material) return;
    const mats = Array.isArray(material) ? material : [material];
    for (const mat of mats) {
      if (!materials.has(mat)) {
        materials.add(mat);
        if (mat.userData?.pillarPosterOwned) {
          mat.map?.dispose();
        }
        mat.dispose();
      }
    }
  });
  group.parent?.remove(group);
}

/** @deprecated Use createLevelFromArena with loadArenaConfig() */
export function createSquareLevel(scene, textureLibrary = null) {
  const arena = {
    id: "level1",
    name: "Level 1",
    size: 28,
    wallHeight: 4,
    wallThickness: 0.5,
    pillarSize: 1.2,
    playerBoundsInset: 0.35,
    wallStandoff: 0.5,
    textures: {
      floor: "ground_concrete_asphalt_dirty",
      wall: "wall_poured_concrete_industrial",
      pillar: "wall_corrugated_metal_weathered",
    },
    pillarDefaults: { shape: "box", cornerRadius: 0.12, cornerSegments: 4 },
    pillars: [
      { x: -8, z: -8, shape: "rounded" },
      { x: 8, z: -8, shape: "rounded" },
      { x: -8, z: 8, shape: "rounded" },
      { x: 8, z: 8, shape: "rounded" },
      { x: 0, z: 0, shape: "rounded", texture: "decal_hazard_stripes_worn" },
    ],
    target: { count: 5, radius: 0.45, height: 2.2, maxHealth: 30, respawnDelay: 2.5 },
  };
  return createLevelFromArena(scene, arena, textureLibrary);
}
