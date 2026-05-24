import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { buildAttachedRoom } from "./LevelRoom.js";
import { getPillarGeometry, resolvePillarShape } from "./PillarGeometry.js";
import { resolveTargetConfig, spawnTargets } from "./Targets.js";
import { assignWorldLayers } from "./LightingLayers.js";
import { createArenaWallBoxGeometry } from "./WallBoxUV.js";
import {
  getArenaDoorInnerZ,
  getRoomFloorSouthZ,
  subtractXInterval,
} from "./RoomPlacement.js";
import {
  buildStairFlight,
  clearStairGroup,
  getArenaDeckWalkSurface,
  getStairCeilingCutout,
} from "./LevelStairs.js";
import { pushCollider } from "./Collision.js";
import {
  getArenaAttachWall,
  getDoorwaysOnWall,
  openingsToExclusions,
  pushDoorColliders,
  pushDoorLintelSpans,
  resolveDoorOpening,
  subtractXIntervals,
} from "./DoorwayWall.js";

const FLOOR_THICKNESS = 0.2;
const FLOOR_Y = -FLOOR_THICKNESS / 2;

const DOOR_JAMB_FLOOR_GAP = 0.06;

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

/** Arena deck underside (-Y normals): weak response to horizontal sun; light emissive only. */
export const ARENA_CEILING_DAY_EMISSIVE = 0.22;
export const ARENA_CEILING_NIGHT_EMISSIVE = 0.012;

function configureArenaCeilingMaterial(mat) {
  if (!mat) return mat;
  if (mat.map) {
    mat.emissiveMap = mat.map;
    mat.emissive = new THREE.Color(0xffffff);
    mat.emissiveIntensity = ARENA_CEILING_DAY_EMISSIVE;
    if (mat.color) mat.color.multiplyScalar(0.82);
  } else if (mat.color) {
    mat.color.multiplyScalar(0.65);
  }
  return mat;
}

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
  if (hz1 + gap < fullMaxZ) {
    pieces.push({
      minX: fullMinX,
      maxX: fullMaxX,
      minZ: Math.max(fullMinZ, hz1),
      maxZ: fullMaxZ,
    });
  }

  const zMid0 = Math.max(fullMinZ, hz0);
  const zMid1 = Math.min(fullMaxZ, hz1);
  if (zMid1 > zMid0 + gap) {
    if (fullMinX < hx0 - gap) {
      pieces.push({
        minX: fullMinX,
        maxX: Math.min(fullMaxX, hx0),
        minZ: zMid0,
        maxZ: zMid1,
      });
    }
    if (hx1 + gap < fullMaxX) {
      pieces.push({
        minX: Math.max(fullMinX, hx1),
        maxX: fullMaxX,
        minZ: zMid0,
        maxZ: zMid1,
      });
    }
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
  ceilingMat
) {
  const width = maxX - minX;
  const depth = maxZ - minZ;
  if (width < 0.05 || depth < 0.05) return;

  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(width, thickness, depth),
    ceilingMat
  );
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
 * Build a per-piece material clone whose texture repeat/offset describe the
 * piece's slice of the full deck. Without this, every piece reuses the same
 * `texture.repeat` (which was sized for the FULL deck) so a smaller piece
 * samples the same tile count over a smaller area — squishing the texture.
 * With this, the texture flows continuously across all pieces and the cutout
 * reads as a hole punched in one floor instead of patchwork.
 */
function makeDeckPieceMaterial(
  baseMat,
  pieceMinX,
  pieceMaxX,
  pieceMinZ,
  pieceMaxZ,
  tileSize
) {
  if (!baseMat?.map || !tileSize) return baseMat;
  const mat = baseMat.clone();
  const pieceW = pieceMaxX - pieceMinX;
  const pieceD = pieceMaxZ - pieceMinZ;
  // Top-face UV on a BoxGeometry runs +X→U and -Z→V (V is flipped). Match
  // the original deck mapping so tiles align with the full-deck pattern.
  const repeatU = pieceW / tileSize;
  const repeatV = pieceD / tileSize;
  const offsetU = pieceMinX / tileSize;
  const offsetV = -pieceMaxZ / tileSize;
  for (const key of ["map", "normalMap", "roughnessMap"]) {
    const tex = mat[key];
    if (!tex) continue;
    const cloned = tex.clone();
    cloned.repeat.set(repeatU, repeatV);
    cloned.offset.set(offsetU, offsetV);
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
  fullWidth,
  fullDepth,
  thickness,
  ceilingBottomY,
  ceilingMat,
  westOpenRatio,
  stairCutout = null,
  ceilingTile = null
) {
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

  for (const piece of pieces) {
    const pieceMat = makeDeckPieceMaterial(
      ceilingMat,
      piece.minX,
      piece.maxX,
      piece.minZ,
      piece.maxZ,
      ceilingTile
    );
    addArenaCeilingDeckPiece(
      group,
      piece.minX,
      piece.maxX,
      piece.minZ,
      piece.maxZ,
      thickness,
      ceilingBottomY,
      pieceMat
    );
    if (colliders) {
      const centerX = (piece.minX + piece.maxX) / 2;
      const centerZ = (piece.minZ + piece.maxZ) / 2;
      pushCollider(colliders, {
        x: centerX,
        z: centerZ,
        halfX: (piece.maxX - piece.minX) / 2,
        halfZ: (piece.maxZ - piece.minZ) / 2,
        bottomY: ceilingBottomY,
        topY: ceilingBottomY + thickness,
        kind: "deck",
      });
    }
  }
}

/** Dim the arena deck underside emissive boost when the sun is off. */
export { applyArenaCeilingDayNight } from "./ArenaCeilingDayNight.js";

function wallMaterialDoorway(mat) {
  if (!mat?.clone) return mat;
  const m = mat.clone();
  m.polygonOffset = true;
  m.polygonOffsetFactor = 1;
  m.polygonOffsetUnits = 1;
  return m;
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
 * @param {{ minX: number, maxX: number } | null} [roomCutout]
 */
function addDoorwayWallColliders(
  colliders,
  doorways,
  half,
  wallHeight,
  wallThickness,
  side,
  roomCutout = null
) {
  const openings = doorways.map(resolveDoorOpening);
  const exclusions = openingsToExclusions(openings);
  const z =
    side === "south"
      ? half + wallThickness / 2
      : -half - wallThickness / 2;
  const exMin = roomCutout?.minX ?? null;
  const exMax = roomCutout?.maxX ?? null;

  const pushSpan = (x0, x1, bottomY, topY) => {
    for (const [a, b] of subtractXInterval(x0, x1, exMin, exMax)) {
      const w = b - a;
      if (w < 0.15) continue;
      addSolidWallCollider(
        colliders,
        (a + b) / 2,
        z,
        w / 2,
        wallThickness / 2,
        bottomY,
        topY
      );
    }
  };

  for (const [x0, x1] of subtractXIntervals(-half, half, exclusions)) {
    pushSpan(x0, x1, 0, wallHeight);
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
      0,
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
      0,
      wallHeight
    );
  }

  addSolidWallCollider(
    colliders,
    eastX,
    0,
    wallThickness / 2,
    spanHalfZ,
    0,
    wallHeight
  );
  addSolidWallCollider(
    colliders,
    westX,
    0,
    wallThickness / 2,
    spanHalfZ,
    0,
    westWallHeight
  );
}

/**
 * Door gaps on the north or south perimeter — outdoor (world) layer only.
 * @param {{ minX: number, maxX: number } | null} [roomCutout] Omit arena wall under attached room width.
 */
function addDoorwayWall(
  group,
  wallMat,
  doorways,
  half,
  arenaSize,
  wallHeight,
  wallThickness,
  side,
  roomCutout = null
) {
  const openings = doorways.map(resolveDoorOpening);
  const exclusions = openingsToExclusions(openings);
  const z =
    side === "south"
      ? half + wallThickness / 2
      : -half - wallThickness / 2;
  const exMin = roomCutout?.minX ?? null;
  const exMax = roomCutout?.maxX ?? null;
  const pieces = [];

  const pushWallSpan = (x0, x1, spanHeight, centerY) => {
    for (const [a, b] of subtractXInterval(x0, x1, exMin, exMax)) {
      const w = b - a;
      if (w < 0.15) continue;
      pieces.push(
        createArenaWallBoxGeometry(
          w,
          spanHeight,
          wallThickness,
          (a + b) / 2,
          centerY,
          z,
          half,
          arenaSize,
          wallHeight
        )
      );
    }
  };

  for (const [x0, x1] of subtractXIntervals(-half, half, exclusions)) {
    pushWallSpan(x0, x1, wallHeight, wallHeight / 2);
  }

  for (const opening of openings) {
    pushDoorLintelSpans(pushWallSpan, opening, wallHeight);
  }

  if (pieces.length === 0) return;

  const merged =
    pieces.length === 1 ? pieces[0] : mergeGeometries(pieces);
  if (!merged) return;

  const mesh = new THREE.Mesh(merged, wallMaterialDoorway(wallMat));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.z = side === "north" ? 0.003 : -0.003;
  group.add(mesh);
}

function addFloorStripSegment(group, floorMat, width, depth, x, z) {
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(width, FLOOR_THICKNESS, depth),
    floorMat
  );
  strip.position.set(x, FLOOR_Y, z);
  strip.receiveShadow = true;
  group.add(strip);
}

/** Fills floor under perimeter wall thickness; skips doorway openings when present. */
function addPerimeterFloorStrip(
  group,
  floorMat,
  arenaSize,
  wallThickness,
  half,
  side,
  doorways,
  roomCutout = null
) {
  const z =
    side === "south"
      ? half + wallThickness / 2
      : -half - wallThickness / 2;
  const onSide = doorways.length > 0;
  const exMin = roomCutout?.minX ?? null;
  const exMax = roomCutout?.maxX ?? null;
  const openings = doorways.map(resolveDoorOpening);
  const doorExclusions = openingsToExclusions(openings).map((ex) => ({
    minX: ex.minX - DOOR_JAMB_FLOOR_GAP,
    maxX: ex.maxX + DOOR_JAMB_FLOOR_GAP,
  }));

  const pushStripSpan = (x0, x1) => {
    for (const [a, b] of subtractXInterval(x0, x1, exMin, exMax)) {
      const w = b - a;
      if (w < 0.15) continue;
      addFloorStripSegment(group, floorMat, w, wallThickness, (a + b) / 2, z);
    }
  };

  if (!onSide) {
    pushStripSpan(-half, half);
    return;
  }

  for (const [x0, x1] of subtractXIntervals(-half, half, doorExclusions)) {
    pushStripSpan(x0, x1);
  }
}

/** Threshold in the doorway opening — arena floor material, slight polygon offset over room slab. */
function addDoorwayFloorBridge(
  group,
  bridgeMat,
  doorway,
  arenaHalf,
  attachWall,
  arenaWallThickness,
  roomFloorSouthZ
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
    FLOOR_Y - 0.003,
    (arenaInnerZ + roomFloorSouthZ) / 2
  );
  bridge.receiveShadow = true;
  bridge.renderOrder = 0;
  group.add(bridge);
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
    playerBoundsInset = 0.35,
    textures,
    pillars,
    rooms = [],
    stairs: stairConfig = null,
  } = arena;

  const half = ARENA_SIZE / 2;
  const group = new THREE.Group();

  const floorTile = textureLibrary?.tileSize(textures.floor) ?? 4;
  const wallTile = textureLibrary?.tileSize(textures.wall) ?? 4;
  const defaultPillarTile = textureLibrary?.tileSize(textures.pillar) ?? 3;

  let floorMat =
    textureLibrary?.createTiled(
      textures.floor,
      ARENA_SIZE / floorTile,
      ARENA_SIZE / floorTile
    ) ?? new THREE.MeshLambertMaterial({ color: 0xa39a8c });
  const floorStripMat = floorMaterial(floorMat);
  floorMat = arenaDeckMaterial(floorMat);

  const wallMatNorthSouth =
    textureLibrary?.createTiled(
      textures.wall,
      ARENA_SIZE / wallTile,
      WALL_HEIGHT / wallTile
    ) ?? new THREE.MeshLambertMaterial({ color: 0xc4beb4 });

  const wallMatEastWest =
    textureLibrary?.createTiled(
      textures.wall,
      ARENA_SIZE / wallTile,
      WALL_HEIGHT / wallTile
    ) ?? wallMatNorthSouth;

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(ARENA_SIZE, FLOOR_THICKNESS, ARENA_SIZE),
    floorMat
  );
  floor.position.y = FLOOR_Y;
  floor.userData.shadowCast = false;
  floor.userData.shadowReceive = true;
  group.add(floor);

  const northZ = -half - WALL_THICKNESS / 2;
  const southZ = half + WALL_THICKNESS / 2;
  const attachWall = getArenaAttachWall(arena);
  const northDoorways = getDoorwaysOnWall(arena, "north");
  const southDoorways = getDoorwaysOnWall(arena, "south");

  addPerimeterFloorStrip(
    group,
    floorStripMat,
    ARENA_SIZE,
    WALL_THICKNESS,
    half,
    "north",
    northDoorways
  );

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
      WALL_HEIGHT / 2,
      northZ,
      half,
      ARENA_SIZE,
      WALL_HEIGHT
    );
    addWallBox(group, northGeo, wallMatNorthSouth, 0, 0, 0);
  }

  addPerimeterFloorStrip(
    group,
    floorStripMat,
    ARENA_SIZE,
    WALL_THICKNESS,
    half,
    "south",
    southDoorways
  );

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
      WALL_HEIGHT / 2,
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
  east.position.set(half + WALL_THICKNESS / 2, WALL_HEIGHT / 2, 0);
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
  west.position.set(-half - WALL_THICKNESS / 2, westWallHeight / 2, 0);
  west.castShadow = true;
  west.receiveShadow = true;
  group.add(west);

  const ceilingId = textures.ceiling ?? textures.floor;
  const ceilingTile = textureLibrary?.tileSize(ceilingId) ?? floorTile;
  const ceilingMat = configureArenaCeilingMaterial(
    textureLibrary?.createTiled(
      ceilingId,
      ARENA_SIZE / ceilingTile,
      ARENA_SIZE / ceilingTile
    ) ?? new THREE.MeshStandardMaterial({ color: 0x3a3a40 })
  );

  /** Overlap wall tops; extend past wall footprint so corners are capped. */
  const CEILING_OVERLAP = 0.22;
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

  function rebuildArenaCeiling(stairPlacement) {
    clearArenaCeilingGroup(ceilingGroup);
    ceilingColliders.length = 0;
    const cutout = stairPlacement ? getStairCeilingCutout(stairPlacement) : null;
    addArenaCeilingDeck(
      ceilingGroup,
      ceilingColliders,
      ceilingFullWidth,
      ceilingFullDepth,
      CEILING_THICKNESS,
      ceilingBottomY,
      ceilingMat,
      ceilingWestOpen,
      cutout,
      ceilingTile
    );
    assignWorldLayers(ceilingGroup);
  }

  const ceilingTopY = ceilingBottomY + CEILING_THICKNESS;
  const catwalkDeckY = ceilingTopY;

  const groundSurfaces = [
    getArenaDeckWalkSurface(arena, catwalkDeckY, ceilingWestOpen),
  ];

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

  const stairTreadMat =
    textureLibrary?.createTiled(
      textures.floor,
      2 / floorTile,
      2 / floorTile
    ) ?? new THREE.MeshLambertMaterial({ color: 0x9a9488 });
  const stairStringerMat =
    textureLibrary?.createTiled(
      textures.wall,
      2 / wallTile,
      2 / wallTile
    ) ?? stairTreadMat;

  /** @type {{ x: number, z: number, halfX: number, halfZ: number }[]} */
  const stairColliders = [];

  function applyStairFlight(config) {
    clearStairGroup(stairsGroup);
    stairColliders.length = 0;
    while (groundSurfaces.length > 1) groundSurfaces.pop();

    if (!config) return;

    const built = buildStairFlight(
      stairsGroup,
      config,
      stairTreadMat,
      stairStringerMat
    );
    groundSurfaces.push(...built.groundSurfaces);
    stairColliders.push(...built.colliders);
    assignWorldLayers(stairsGroup);
    rebuildArenaCeiling(config);
  }

  applyStairFlight(stairConfig);

  for (const pillarDef of pillars) {
    const materialId = pillarDef.texture ?? textures.pillar;
    const pillarTile = textureLibrary?.tileSize(materialId) ?? defaultPillarTile;
    const pillarMat =
      textureLibrary?.createTiled(
        materialId,
        PILLAR_SIZE / pillarTile,
        WALL_HEIGHT / pillarTile
      ) ?? new THREE.MeshLambertMaterial({ color: 0xb8956a });

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
    pillar.userData.shadowCast = true;
    pillar.userData.shadowReceive = true;
    pillar.userData.arenaPillarId = materialId;
    group.add(pillar);
  }

  const innerHalf = half - WALL_THICKNESS - playerBoundsInset;
  let boundsMinX = -innerHalf;
  let boundsMaxX = innerHalf;
  let boundsMinZ = -innerHalf;
  let boundsMaxZ = innerHalf;

  const attachWallDoorways = getDoorwaysOnWall(arena, attachWall);

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
      attachWallDoorways
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
          built.floorSouthZ
        );
      }
    }
  }

  const bounds = {
    minX: boundsMinX,
    maxX: boundsMaxX,
    minZ: boundsMinZ,
    maxZ: boundsMaxZ,
  };
  const targetConfig = resolveTargetConfig(arena);
  const { targets, sharedGeo: targetGeo } = spawnTargets({
    group,
    bounds,
    colliders,
    config: targetConfig,
  });

  scene.add(group);
  assignWorldLayers(group);

  return {
    group,
    targets,
    targetConfig,
    targetGeo,
    colliders,
    bounds,
    floorY: 0,
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
        mat.dispose();
      }
    }
  });
  group.parent?.remove(group);
}

/** @deprecated Use createLevelFromArena with loadArenaConfig() */
export function createSquareLevel(scene, textureLibrary = null) {
  const arena = {
    id: "square_arena_inline",
    name: "Square Arena",
    size: 28,
    wallHeight: 4,
    wallThickness: 0.5,
    pillarSize: 1.2,
    playerBoundsInset: 0.35,
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
