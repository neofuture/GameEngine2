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
} from "./RoomPlacement.js";

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

/** Arena deck underside (-Y normals): weak response to horizontal sun; light emissive only. */
function configureArenaCeilingMaterial(mat) {
  if (!mat) return mat;
  if (mat.map) {
    mat.emissiveMap = mat.map;
    mat.emissive = new THREE.Color(0xffffff);
    mat.emissiveIntensity = 0.22;
    if (mat.color) mat.color.multiplyScalar(0.82);
  } else if (mat.color) {
    mat.color.multiplyScalar(0.65);
  }
  return mat;
}

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

/** Door gap on the north or south perimeter — one merged mesh, uniform wall UVs. */
function addDoorwayWall(
  group,
  wallMat,
  doorway,
  half,
  arenaSize,
  wallHeight,
  wallThickness,
  side
) {
  const doorW = doorway.width ?? 1.1;
  const doorH = doorway.height ?? 2.05;
  const doorX = doorway.centerX ?? 0;
  const z =
    side === "south"
      ? half + wallThickness / 2
      : -half - wallThickness / 2;
  const leftSpan = doorX - doorW / 2 - -half;
  const rightSpan = half - (doorX + doorW / 2);
  const pieces = [];

  if (leftSpan > 0.15) {
    pieces.push(
      createArenaWallBoxGeometry(
        leftSpan,
        wallHeight,
        wallThickness,
        -half + leftSpan / 2,
        wallHeight / 2,
        z,
        half,
        arenaSize,
        wallHeight
      )
    );
  }
  if (rightSpan > 0.15) {
    pieces.push(
      createArenaWallBoxGeometry(
        rightSpan,
        wallHeight,
        wallThickness,
        doorX + doorW / 2 + rightSpan / 2,
        wallHeight / 2,
        z,
        half,
        arenaSize,
        wallHeight
      )
    );
  }
  const lintelH = wallHeight - doorH;
  if (lintelH > 0.1) {
    pieces.push(
      createArenaWallBoxGeometry(
        doorW,
        lintelH,
        wallThickness,
        doorX,
        doorH + lintelH / 2,
        z,
        half,
        arenaSize,
        wallHeight
      )
    );
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

/** Fills floor under perimeter wall thickness; skips doorway opening when present. */
function addPerimeterFloorStrip(
  group,
  floorMat,
  arenaSize,
  wallThickness,
  half,
  side,
  doorway
) {
  const z =
    side === "south"
      ? half + wallThickness / 2
      : -half - wallThickness / 2;
  const doorOnSide = doorway?.wall === side;

  if (!doorOnSide) {
    addFloorStripSegment(group, floorMat, arenaSize, wallThickness, 0, z);
    return;
  }

  const doorW = doorway.width ?? 1.1;
  const doorX = doorway.centerX ?? 0;
  const doorLeft = doorX - doorW / 2;
  const doorRight = doorX + doorW / 2;
  const leftEnd = doorLeft - DOOR_JAMB_FLOOR_GAP;
  const rightStart = doorRight + DOOR_JAMB_FLOOR_GAP;
  const leftSpan = leftEnd - -half;
  const rightSpan = half - rightStart;

  if (leftSpan > 0.15) {
    addFloorStripSegment(
      group,
      floorMat,
      leftSpan,
      wallThickness,
      -half + leftSpan / 2,
      z
    );
  }
  if (rightSpan > 0.15) {
    addFloorStripSegment(
      group,
      floorMat,
      rightSpan,
      wallThickness,
      rightStart + rightSpan / 2,
      z
    );
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

  const mat = floorMaterial(bridgeMat, 3);

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
  bridge.renderOrder = 2;
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
    doorway,
    rooms = [],
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
  floorMat = floorMaterial(floorMat);

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
  floor.receiveShadow = true;
  group.add(floor);

  const northZ = -half - WALL_THICKNESS / 2;
  const southZ = half + WALL_THICKNESS / 2;

  addPerimeterFloorStrip(
    group,
    floorMat,
    ARENA_SIZE,
    WALL_THICKNESS,
    half,
    "north",
    doorway
  );

  if (doorway?.wall === "north") {
    addDoorwayWall(
      group,
      wallMatNorthSouth,
      doorway,
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
    floorMat,
    ARENA_SIZE,
    WALL_THICKNESS,
    half,
    "south",
    doorway
  );

  if (doorway?.wall === "south") {
    addDoorwayWall(
      group,
      wallMatNorthSouth,
      doorway,
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
  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(
      ARENA_SIZE + 2 * WALL_THICKNESS + 2 * CEILING_PAD,
      CEILING_THICKNESS,
      ARENA_SIZE + 2 * WALL_THICKNESS + 2 * CEILING_PAD
    ),
    ceilingMat
  );
  ceiling.position.set(
    0,
    ceilingBottomY + CEILING_THICKNESS / 2,
    0
  );
  /** Deck has catwalk/skylight gaps — receive shadows but don't block key light. */
  ceiling.castShadow = false;
  ceiling.receiveShadow = true;
  group.add(ceiling);

  const ceilingTopY = ceilingBottomY + CEILING_THICKNESS;
  const catwalkDeckY = ceilingTopY;

  const pillarHalf = PILLAR_SIZE / 2;
  const colliders = pillars.map(({ x, z }) => ({
    x,
    z,
    halfX: pillarHalf,
    halfZ: pillarHalf,
  }));

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
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    pillar.userData.arenaPillarId = materialId;
    group.add(pillar);
  }

  const innerHalf = half - WALL_THICKNESS - playerBoundsInset;
  let boundsMinX = -innerHalf;
  let boundsMaxX = innerHalf;
  let boundsMinZ = -innerHalf;
  let boundsMaxZ = innerHalf;

  const attachWall = doorway?.wall === "north" ? "north" : "south";

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
      doorway ?? null
    );
    boundsMinX = Math.min(boundsMinX, built.centerX - built.halfW);
    boundsMaxX = Math.max(boundsMaxX, built.centerX + built.halfW);
    boundsMinZ = Math.min(boundsMinZ, built.centerZ - built.halfD);
    boundsMaxZ = Math.max(boundsMaxZ, built.centerZ + built.halfD);

    if (doorway && built.floorSouthZ != null) {
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
