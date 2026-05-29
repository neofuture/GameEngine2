import * as THREE from "three";
import { setRoomInteriorLayer } from "./LightingLayers.js";
import { addShadowOccluderBox } from "./ShadowOccluders.js";
import {
  getArenaDoorInnerZ,
  getArenaWallCenterZ,
  getAttachedRoomCenterZ,
  getAttachedRoomFloorMeshBounds,
  getRoomFloorSouthZ,
} from "./RoomPlacement.js";
import { applyDeckPieceWorldUVs } from "./WallBoxUV.js";
import {
  openingsToExclusions,
  resolveDoorOpening,
  subtractXIntervals,
} from "./DoorwayWall.js";
import {
  FLOOR_THICKNESS,
  FLOOR_WALL_OVERLAP,
  FLOOR_Y,
  WALL_FLOOR_EMBED,
  WALL_STANDOFF,
  WALL_VISUAL_FLOOR_EMBED,
  wallCenterY,
} from "./LevelConstants.js";

/** Thin room-layer quads in front of the outdoor arena wall (room side), room pass only. */
const ARENA_WALL_OVERLAY_DEPTH = 0.03;
const ARENA_WALL_OVERLAY_INSET = 0.045;
/** Ceiling drops slightly into wall tops so corners do not leak the outdoor pass. */
const CEILING_WALL_OVERLAP = 0.04;
const CORNER_SEAL_SIZE = 0.14;

/** Room floor is a visual overlay — the solid arena deck owns depth + walk support. */
function floorMaterial(mat) {
  if (!mat?.clone) return mat;
  const m = mat.clone();
  m.depthWrite = false;
  m.depthTest = true;
  m.polygonOffset = false;
  return m;
}

function wallMaterial(mat) {
  if (!mat?.clone) return mat;
  const m = mat.clone();
  m.polygonOffset = true;
  m.polygonOffsetFactor = 3;
  m.polygonOffsetUnits = 3;
  return m;
}

function darkArenaWallOverlayMaterial(baseMat) {
  if (!baseMat?.clone) return baseMat;
  const m = baseMat.clone();
  m.polygonOffset = true;
  m.polygonOffsetFactor = -4;
  m.polygonOffsetUnits = -4;
  m.depthWrite = true;
  if (m.color) m.color.multiplyScalar(0.92);
  return m;
}

const OVERLAY_ARCH_SEGMENTS = 32;

/**
 * Visual-only "paint" on the arena doorway wall (room interior pass). Covers jambs/lintel
 * inside the room width so outdoor sun does not read through; no colliders.
 * Uses ExtrudeGeometry with smooth arch curves to match the outer wall.
 */
function addRoomArenaWallDarkOverlays(
  roomShell,
  wallMatBase,
  centerX,
  width,
  height,
  attachWall,
  arenaHalf,
  arenaWallThickness,
  doorways,
  wallY
) {
  const onWall = doorways.filter(
    (doorway) => (doorway.wall ?? "north") === attachWall
  );
  if (!onWall.length) return;

  const openings = onWall.map(resolveDoorOpening);
  const halfW = width / 2;
  const roomLeft = centerX - halfW;
  const roomRight = centerX + halfW;
  const wallCenterZ = getArenaWallCenterZ(
    attachWall,
    arenaHalf,
    arenaWallThickness
  );
  const roomFaceZ =
    attachWall === "north"
      ? wallCenterZ - arenaWallThickness / 2
      : wallCenterZ + arenaWallThickness / 2;
  const overlayZ =
    attachWall === "north"
      ? roomFaceZ - ARENA_WALL_OVERLAY_INSET
      : roomFaceZ + ARENA_WALL_OVERLAY_INSET;

  const bottomY = wallY - height / 2;
  const topY = wallY + height / 2;

  const shape = new THREE.Shape();
  shape.moveTo(roomLeft, bottomY);
  shape.lineTo(roomRight, bottomY);
  shape.lineTo(roomRight, topY);
  shape.lineTo(roomLeft, topY);
  shape.closePath();

  for (const op of openings) {
    const doorH = Math.min(op.height, height);
    const arch = op.arch && op.radius > 0;
    const rectTop = arch ? doorH - op.radius : doorH;

    const hole = new THREE.Path();
    if (arch) {
      hole.moveTo(op.left, bottomY);
      hole.lineTo(op.left, bottomY + rectTop);
      hole.absarc(
        op.centerX, bottomY + rectTop,
        op.radius,
        Math.PI, 0,
        true
      );
      hole.lineTo(op.right, bottomY);
      hole.closePath();
    } else {
      hole.moveTo(op.left, bottomY);
      hole.lineTo(op.left, bottomY + doorH);
      hole.lineTo(op.right, bottomY + doorH);
      hole.lineTo(op.right, bottomY);
      hole.closePath();
    }
    shape.holes.push(hole);
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: ARENA_WALL_OVERLAY_DEPTH,
    bevelEnabled: false,
    steps: 1,
    curveSegments: OVERLAY_ARCH_SEGMENTS,
  });
  geo.translate(0, 0, overlayZ - ARENA_WALL_OVERLAY_DEPTH / 2);

  const mesh = new THREE.Mesh(geo, darkArenaWallOverlayMaterial(wallMatBase));
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.roomArenaWallOverlay = true;
  roomShell.add(mesh);
}

/** Fill wall–wall–ceiling triple junctions (side walls used to stop short of the back wall). */
function addRoomCornerSeals(
  roomShell,
  wallMat,
  centerX,
  halfW,
  wallThickness,
  roomFloorNorthZ,
  roomFloorSouthZ,
  ceilingBottomY,
  ceilingThickness
) {
  const innerLeftX = centerX - halfW + wallThickness;
  const innerRightX = centerX + halfW - wallThickness;
  const sealHeight = ceilingThickness + CEILING_WALL_OVERLAP + 0.05;
  const sealY = ceilingBottomY + sealHeight / 2;
  const geo = new THREE.BoxGeometry(CORNER_SEAL_SIZE, sealHeight, CORNER_SEAL_SIZE);

  for (const [x, z] of [
    [innerLeftX, roomFloorNorthZ],
    [innerRightX, roomFloorNorthZ],
    [innerLeftX, roomFloorSouthZ],
    [innerRightX, roomFloorSouthZ],
  ]) {
    const seal = new THREE.Mesh(geo, wallMat);
    seal.position.set(x, sealY, z);
    seal.castShadow = false;
    seal.receiveShadow = true;
    seal.userData.roomCornerSeal = true;
    roomShell.add(seal);
  }
}

/**
 * @param {THREE.Group} group
 * @param {import("./loadArena.js").ArenaRoom} room
 * @param {Awaited<ReturnType<import("./LevelTextures.js").loadLevelTextureLibrary>>} textureLibrary
 * @param {number} arenaHalf Half-size of the arena (size / 2)
 * @param {number} wallHeight
 * @param {{ x: number, z: number, halfX: number, halfZ: number }[]} colliders
 * @param {"north" | "south"} attachWall Which perimeter the doorway is on
 * @param {number} [arenaWallThickness] Arena perimeter wall thickness (floor bridge)
 * @param {number} [arenaCeilingThickness] Default deck thickness for attached rooms
 * @param {import("./loadArena.js").ArenaDoorway[]} [doorways]
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number, y: number }[]} [groundSurfaces]
 * @param {{
 *   arenaCeilingBottomY?: number,
 *   catwalkDeckY?: number,
 *   exteriorDeckMat?: THREE.Material,
 *   exteriorDeckTileSize?: number,
 *   deckPad?: number,
 * } | null} [exteriorDeck]
 */
export function buildAttachedRoom(
  group,
  room,
  textureLibrary,
  arenaHalf,
  wallHeight,
  colliders,
  attachWall = "south",
  arenaWallThickness = 0.5,
  arenaCeilingThickness = 0.35,
  doorways = [],
  groundSurfaces = [],
  exteriorDeck = null
) {
  const {
    centerX,
    width,
    depth,
    height = wallHeight,
    wallThickness = 0.35,
    ceilingThickness = arenaCeilingThickness,
    textures,
  } = room;

  const floorId = textures.floor;
  const wallId = textures.wall;
  const ceilingId = textures.ceiling ?? textures.floor;
  const floorTile = textureLibrary?.tileSize(floorId) ?? 3;
  const wallTile = textureLibrary?.tileSize(wallId) ?? 3.2;
  const ceilingTile = textureLibrary?.tileSize(ceilingId) ?? floorTile;

  const halfW = width / 2;
  const halfD = depth / 2;
  const roomCenterZ = getAttachedRoomCenterZ(
    room,
    arenaHalf,
    attachWall,
    arenaWallThickness
  );
  const roomShell = new THREE.Group();
  roomShell.name = room.id ?? "attached_room";
  roomShell.userData.roomInterior = true;
  roomShell.userData.roomId = room.id ?? null;

  const floorMat =
    textureLibrary?.createTiled(floorId, width / floorTile, depth / floorTile) ??
    new THREE.MeshStandardMaterial({ color: 0x9a9a9a });
  if (floorMat.color) floorMat.color.multiplyScalar(0.55);

  const wallMatBase =
    textureLibrary?.createTiled(wallId, width / wallTile, height / wallTile) ??
    new THREE.MeshStandardMaterial({ color: 0x8a9ab0 });
  if (wallMatBase.color) wallMatBase.color.multiplyScalar(0.5);
  const wallMat = wallMaterial(wallMatBase);

  const roomFloorSouthZ = getRoomFloorSouthZ(
    attachWall,
    arenaHalf,
    arenaWallThickness,
    wallThickness
  );
  const floorBounds = getAttachedRoomFloorMeshBounds(
    room,
    attachWall,
    arenaHalf,
    arenaWallThickness
  );
  const floorMinZ = floorBounds.minZ;
  const floorMaxZ = floorBounds.maxZ;
  const floorDepth = floorMaxZ - floorMinZ;
  const floorCenterZ = (floorMinZ + floorMaxZ) / 2;
  const roomFloorNorthZ =
    attachWall === "north"
      ? roomCenterZ - halfD + wallThickness
      : roomCenterZ + halfD - wallThickness;

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(width + 2 * FLOOR_WALL_OVERLAP, FLOOR_THICKNESS, floorDepth),
    floorMaterial(floorMat)
  );
  floor.position.set(centerX, FLOOR_Y, floorCenterZ);
  floor.receiveShadow = true;
  roomShell.add(floor);

  const wallY = wallCenterY(height);
  const backZ =
    attachWall === "north"
      ? roomCenterZ - halfD + wallThickness / 2
      : roomCenterZ + halfD - wallThickness / 2;
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, wallThickness),
    wallMat
  );
  back.position.set(centerX, wallY, backZ);
  back.castShadow = true;
  back.receiveShadow = true;
  roomShell.add(back);
  colliders.push({
    x: centerX,
    z: backZ,
    halfX: halfW,
    halfZ: wallThickness / 2,
    bottomY: -WALL_FLOOR_EMBED,
    topY: height,
    kind: "wall",
  });

  /** Side walls span the full interior depth — floor mesh bounds include doorway overlap. */
  const sideWallDepth = Math.abs(roomFloorNorthZ - roomFloorSouthZ);
  const sideWallCenterZ = (roomFloorNorthZ + roomFloorSouthZ) / 2;
  const sideGeo = new THREE.BoxGeometry(wallThickness, height, sideWallDepth);
  const leftX = centerX - halfW + wallThickness / 2;
  const left = new THREE.Mesh(sideGeo, wallMaterial(wallMatBase));
  left.position.set(leftX, wallY, sideWallCenterZ);
  left.castShadow = true;
  left.receiveShadow = true;
  roomShell.add(left);
  colliders.push({
    x: leftX,
    z: sideWallCenterZ,
    halfX: wallThickness / 2,
    halfZ: sideWallDepth / 2,
    bottomY: -WALL_FLOOR_EMBED,
    topY: height,
    kind: "wall",
  });

  const rightX = centerX + halfW - wallThickness / 2;
  const right = new THREE.Mesh(sideGeo, wallMaterial(wallMatBase));
  right.position.set(rightX, wallY, sideWallCenterZ);
  right.castShadow = true;
  right.receiveShadow = true;
  roomShell.add(right);
  colliders.push({
    x: rightX,
    z: sideWallCenterZ,
    halfX: wallThickness / 2,
    halfZ: sideWallDepth / 2,
    bottomY: -WALL_FLOOR_EMBED,
    topY: height,
    kind: "wall",
  });

  const CEILING_SIDE_PAD = 0.12;
  const CEILING_BACK_PAD = 0.12;
  const wallTopY = height - WALL_VISUAL_FLOOR_EMBED;
  const interiorCeilingBottomY = wallTopY - CEILING_WALL_OVERLAP;
  const exteriorDeckBottomY =
    exteriorDeck?.arenaCeilingBottomY ?? interiorCeilingBottomY;
  const ceilingBottomY = interiorCeilingBottomY;
  const ceilingSpanZ = Math.abs(roomFloorNorthZ - roomFloorSouthZ);
  const ceilingDepth = ceilingSpanZ + CEILING_BACK_PAD;
  const ceilingWidth = width + 2 * CEILING_SIDE_PAD;
  const ceilingCenterZ =
    attachWall === "north"
      ? (roomFloorSouthZ + roomFloorNorthZ) / 2 - CEILING_BACK_PAD / 2
      : (roomFloorSouthZ + roomFloorNorthZ) / 2 + CEILING_BACK_PAD / 2;

  const ceilingMat =
    textureLibrary?.createTiled(
      ceilingId,
      ceilingWidth / ceilingTile,
      ceilingDepth / ceilingTile
    ) ?? new THREE.MeshStandardMaterial({ color: 0x2a2a32 });

  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(ceilingWidth, ceilingThickness, ceilingDepth),
    ceilingMat
  );
  ceiling.position.set(
    centerX,
    ceilingBottomY + ceilingThickness / 2,
    ceilingCenterZ
  );
  ceiling.castShadow = false;
  ceiling.receiveShadow = true;
  roomShell.add(ceiling);

  addRoomCornerSeals(
    roomShell,
    wallMat,
    centerX,
    halfW,
    wallThickness,
    roomFloorNorthZ,
    roomFloorSouthZ,
    ceilingBottomY,
    ceilingThickness
  );

  colliders.push({
    x: centerX,
    z: ceilingCenterZ,
    halfX: ceilingWidth / 2,
    halfZ: ceilingDepth / 2,
    bottomY: ceilingBottomY,
    topY: ceilingBottomY + ceilingThickness,
    kind: "deck",
  });

  const catwalkDeckY =
    exteriorDeck?.catwalkDeckY ?? ceilingBottomY + ceilingThickness;
  const deckPad = exteriorDeck?.deckPad ?? 0;
  const deckMinX = centerX - halfW - deckPad;
  const deckMaxX = centerX + halfW + deckPad;
  const deckMinZ = floorMinZ - deckPad;
  const deckMaxZ = floorMaxZ + deckPad;
  const deckWidth = deckMaxX - deckMinX;
  const deckDepth = deckMaxZ - deckMinZ;
  const deckCenterX = (deckMinX + deckMaxX) / 2;
  const deckCenterZ = (deckMinZ + deckMaxZ) / 2;

  if (exteriorDeck?.exteriorDeckMat) {
    const deckGeo = new THREE.BoxGeometry(
      deckWidth,
      arenaCeilingThickness,
      deckDepth
    );
    if (exteriorDeck.exteriorDeckTileSize) {
      applyDeckPieceWorldUVs(
        deckGeo,
        deckMinX,
        deckMaxX,
        deckMinZ,
        deckMaxZ,
        arenaCeilingThickness,
        exteriorDeck.exteriorDeckTileSize
      );
    }
    const extDeck = new THREE.Mesh(deckGeo, exteriorDeck.exteriorDeckMat);
    extDeck.position.set(
      deckCenterX,
      exteriorDeckBottomY + arenaCeilingThickness / 2,
      deckCenterZ
    );
    extDeck.castShadow = true;
    extDeck.receiveShadow = true;
    extDeck.userData.attachedRoomCatwalk = true;
    group.add(extDeck);

    colliders.push({
      x: deckCenterX,
      z: deckCenterZ,
      halfX: deckWidth / 2,
      halfZ: deckDepth / 2,
      bottomY: exteriorDeckBottomY,
      topY: catwalkDeckY,
      kind: "deck",
    });

    const ws = exteriorDeck?.wallStandoff ?? WALL_STANDOFF;
    groundSurfaces.push({
      minX: deckMinX,
      maxX: deckMaxX,
      minZ: deckMinZ,
      maxZ: deckMaxZ,
      y: catwalkDeckY,
      catwalkWalk: true,
      edgeStandoff: {
        west: ws,
        east: ws,
        north: attachWall === "south" ? 0 : ws,
        south: attachWall === "north" ? 0 : ws,
      },
    });
  }

  /** World-layer occluders — sun shadow map uses WORLD layer; room shells do not. */
  const occluders = new THREE.Group();
  occluders.name = `${roomShell.name}_sun_occluders`;
  addShadowOccluderBox(occluders, width, height, wallThickness, centerX, wallY, backZ);
  addShadowOccluderBox(
    occluders,
    wallThickness,
    height,
    sideWallDepth,
    leftX,
    wallY,
    sideWallCenterZ
  );
  addShadowOccluderBox(
    occluders,
    wallThickness,
    height,
    sideWallDepth,
    rightX,
    wallY,
    sideWallCenterZ
  );
  addShadowOccluderBox(
    occluders,
    ceilingWidth,
    ceilingThickness,
    ceilingDepth,
    centerX,
    ceilingBottomY + ceilingThickness / 2,
    ceilingCenterZ
  );

  addRoomArenaWallDarkOverlays(
    roomShell,
    wallMatBase,
    centerX,
    width,
    height,
    attachWall,
    arenaHalf,
    arenaWallThickness,
    doorways,
    wallY
  );

  group.add(occluders);

  const arenaInnerZ = getArenaDoorInnerZ(
    attachWall,
    arenaHalf,
    arenaWallThickness
  );
  const supportMaxZ =
    attachWall === "north"
      ? arenaInnerZ + FLOOR_WALL_OVERLAP
      : floorMaxZ + FLOOR_WALL_OVERLAP;
  const supportMinZ =
    attachWall === "south"
      ? arenaInnerZ - FLOOR_WALL_OVERLAP
      : floorMinZ - FLOOR_WALL_OVERLAP;
  groundSurfaces.push({
    minX: centerX - halfW - FLOOR_WALL_OVERLAP,
    maxX: centerX + halfW + FLOOR_WALL_OVERLAP,
    minZ: supportMinZ,
    maxZ: supportMaxZ,
    y: 0,
  });

  roomShell.traverse((obj) => {
    if (obj.isMesh) setRoomInteriorLayer(obj);
  });
  group.add(roomShell);

  return {
    centerX,
    centerZ: roomCenterZ,
    halfW,
    halfD,
    floorSouthZ: roomFloorSouthZ,
  };
}
