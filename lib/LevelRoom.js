import * as THREE from "three";
import { setRoomInteriorLayer } from "./LightingLayers.js";
import { addShadowOccluderBox } from "./ShadowOccluders.js";
import {
  getArenaWallCenterZ,
  getAttachedRoomCenterZ,
  getRoomFloorSouthZ,
} from "./RoomPlacement.js";
import {
  openingsToExclusions,
  resolveDoorOpening,
  subtractXIntervals,
} from "./DoorwayWall.js";

/** Thin room-layer quads in front of the outdoor arena wall (room side), room pass only. */
const ARENA_WALL_OVERLAY_DEPTH = 0.03;
const ARENA_WALL_OVERLAY_INSET = 0.045;

const FLOOR_THICKNESS = 0.2;
const FLOOR_Y = -FLOOR_THICKNESS / 2;
/** Sink wall bases into the slab so bottoms are not coplanar with the floor top. */
const WALL_FLOOR_EMBED = 0.06;

/** Prefer floor in depth test when wall bottoms share the same Y as the slab top. */
function floorMaterial(mat) {
  if (!mat?.clone) return mat;
  const m = mat.clone();
  m.polygonOffset = true;
  m.polygonOffsetFactor = -6;
  m.polygonOffsetUnits = -6;
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

function wallCenterY(height) {
  return height / 2 - WALL_FLOOR_EMBED;
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
  groundSurfaces = []
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
  const roomFloorNorthZ =
    attachWall === "north"
      ? roomCenterZ - halfD + wallThickness
      : roomCenterZ + halfD - wallThickness;
  const floorDepth = Math.abs(roomFloorNorthZ - roomFloorSouthZ);
  const floorCenterZ = (roomFloorSouthZ + roomFloorNorthZ) / 2;

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(width, FLOOR_THICKNESS, floorDepth),
    floorMaterial(floorMat)
  );
  floor.position.set(centerX, FLOOR_Y, floorCenterZ);
  floor.receiveShadow = true;
  floor.renderOrder = 1;
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
    bottomY: 0,
    topY: height,
    kind: "wall",
  });

  /** Side walls span the interior floor only — not through the arena doorway gap. */
  const sideGeo = new THREE.BoxGeometry(wallThickness, height, floorDepth);
  const leftX = centerX - halfW + wallThickness / 2;
  const left = new THREE.Mesh(sideGeo, wallMaterial(wallMatBase));
  left.position.set(leftX, wallY, floorCenterZ);
  left.castShadow = true;
  left.receiveShadow = true;
  roomShell.add(left);
  colliders.push({
    x: leftX,
    z: floorCenterZ,
    halfX: wallThickness / 2,
    halfZ: floorDepth / 2,
    bottomY: 0,
    topY: height,
    kind: "wall",
  });

  const rightX = centerX + halfW - wallThickness / 2;
  const right = new THREE.Mesh(sideGeo, wallMaterial(wallMatBase));
  right.position.set(rightX, wallY, floorCenterZ);
  right.castShadow = true;
  right.receiveShadow = true;
  roomShell.add(right);
  colliders.push({
    x: rightX,
    z: floorCenterZ,
    halfX: wallThickness / 2,
    halfZ: floorDepth / 2,
    bottomY: 0,
    topY: height,
    kind: "wall",
  });

  const CEILING_SIDE_PAD = 0.12;
  const CEILING_BACK_PAD = 0.12;
  const CEILING_OVERLAP = 0.22;
  const ceilingBottomY = height - CEILING_OVERLAP;
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
  if (ceilingMat.color) {
    ceilingMat.color.multiplyScalar(0.45);
  }

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
  colliders.push({
    x: centerX,
    z: ceilingCenterZ,
    halfX: ceilingWidth / 2,
    halfZ: ceilingDepth / 2,
    bottomY: ceilingBottomY,
    topY: ceilingBottomY + ceilingThickness,
    kind: "deck",
  });

  // Exterior roof slab — sits flush on top of the interior ceiling but
  // lives outside the room shell so it ends up on WORLD_LAYER, gets sun
  // lighting from above, and shows up when looked at from the catwalk
  // (the interior ceiling alone is invisible from outside because it's
  // on ROOM_INTERIOR_LAYER). It's also what makes the roof walkable: we
  // register a groundSurface at its top so the player no longer falls
  // through the black rectangle above the room.
  //
  // Dimensions deliberately match the floor / outer wall outline rather
  // than the interior ceiling's padded footprint — otherwise the roof
  // overhangs the walls below and looks like a floating slab from
  // outside (with empty void underneath).
  const ROOF_SLAB_THICKNESS = 0.06;
  const roofSlabY =
    ceilingBottomY + ceilingThickness + ROOF_SLAB_THICKNESS / 2;
  const roofWidth = width;
  const roofDepth = floorDepth;
  const roofCenterZ = floorCenterZ;
  const roofMat =
    textureLibrary?.createTiled(
      ceilingId,
      roofWidth / ceilingTile,
      roofDepth / ceilingTile
    ) ?? new THREE.MeshStandardMaterial({ color: 0x6a6c70 });
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(roofWidth, ROOF_SLAB_THICKNESS, roofDepth),
    roofMat
  );
  roof.position.set(centerX, roofSlabY, roofCenterZ);
  roof.castShadow = true;
  roof.receiveShadow = true;
  roof.userData.attachedRoomRoof = true;
  group.add(roof);

  const roofTopY = ceilingBottomY + ceilingThickness + ROOF_SLAB_THICKNESS;
  groundSurfaces.push({
    minX: centerX - roofWidth / 2,
    maxX: centerX + roofWidth / 2,
    minZ: roofCenterZ - roofDepth / 2,
    maxZ: roofCenterZ + roofDepth / 2,
    y: roofTopY,
  });

  const floorMinZ = Math.min(roomFloorSouthZ, roomFloorNorthZ);
  const floorMaxZ = Math.max(roomFloorSouthZ, roomFloorNorthZ);
  groundSurfaces.push({
    minX: centerX - halfW,
    maxX: centerX + halfW,
    minZ: floorMinZ,
    maxZ: floorMaxZ,
    y: 0,
  });

  /** World-layer occluders — sun shadow map uses WORLD layer; room shells do not. */
  const occluders = new THREE.Group();
  occluders.name = `${roomShell.name}_sun_occluders`;
  addShadowOccluderBox(occluders, width, height, wallThickness, centerX, wallY, backZ);
  addShadowOccluderBox(
    occluders,
    wallThickness,
    height,
    floorDepth,
    leftX,
    wallY,
    floorCenterZ
  );
  addShadowOccluderBox(
    occluders,
    wallThickness,
    height,
    floorDepth,
    rightX,
    wallY,
    floorCenterZ
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
