import * as THREE from "three";
import { setRoomInteriorLayer } from "./LightingLayers.js";
import {
  getArenaWallCenterZ,
  getAttachedRoomCenterZ,
  getRoomFloorSouthZ,
} from "./RoomPlacement.js";

const FLOOR_THICKNESS = 0.2;
const FLOOR_Y = -FLOOR_THICKNESS / 2;

/**
 * Room-side panels over the arena doorway jambs/lintel — same layer as the room so
 * outdoor pass-1 lighting does not flood the wall around the door opening.
 */
function addRoomDoorSurround(
  roomShell,
  wallMat,
  centerX,
  width,
  height,
  attachWall,
  arenaHalf,
  arenaWallThickness,
  doorway
) {
  if (!doorway || doorway.wall !== attachWall) return;

  const doorW = doorway.width ?? 1.1;
  const doorH = doorway.height ?? 2.05;
  const doorX = doorway.centerX ?? 0;
  const halfW = width / 2;
  const wallCenterZ = getArenaWallCenterZ(
    attachWall,
    arenaHalf,
    arenaWallThickness
  );
  const roomFaceZ =
    attachWall === "north"
      ? wallCenterZ - arenaWallThickness / 2
      : wallCenterZ + arenaWallThickness / 2;
  const inset = 0.01;
  const z =
    attachWall === "north" ? roomFaceZ + inset : roomFaceZ - inset;
  const depth = 0.035;

  const addPanel = (panelWidth, panelHeight, x, y) => {
    if (panelWidth < 0.05 || panelHeight < 0.05) return;
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(panelWidth, panelHeight, depth),
      wallMat.clone()
    );
    panel.position.set(x, y, z);
    panel.castShadow = false;
    panel.receiveShadow = true;
    roomShell.add(panel);
  };

  const leftX0 = centerX - halfW;
  const leftX1 = doorX - doorW / 2;
  const rightX0 = doorX + doorW / 2;
  const rightX1 = centerX + halfW;

  addPanel(leftX1 - leftX0, height, (leftX0 + leftX1) / 2, height / 2);
  addPanel(rightX1 - rightX0, height, (rightX0 + rightX1) / 2, height / 2);

  const lintelH = height - doorH;
  if (lintelH > 0.05) {
    addPanel(doorW, lintelH, doorX, doorH + lintelH / 2);
  }
}

/** Prefer floor in depth test when wall bottoms share the same Y as the slab top. */
function floorMaterial(mat) {
  if (!mat?.clone) return mat;
  const m = mat.clone();
  m.polygonOffset = true;
  m.polygonOffsetFactor = -4;
  m.polygonOffsetUnits = -4;
  return m;
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
 * @param {import("./loadArena.js").ArenaDoorway} [doorway] Arena door cut on the attach wall
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
  doorway = null
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

  const floorMat =
    textureLibrary?.createTiled(floorId, width / floorTile, depth / floorTile) ??
    new THREE.MeshStandardMaterial({ color: 0x9a9a9a });
  if (floorMat.color) floorMat.color.multiplyScalar(0.55);

  const wallMat =
    textureLibrary?.createTiled(wallId, width / wallTile, height / wallTile) ??
    new THREE.MeshStandardMaterial({ color: 0x8a9ab0 });
  if (wallMat.color) wallMat.color.multiplyScalar(0.5);
  wallMat.polygonOffset = true;
  wallMat.polygonOffsetFactor = 2;
  wallMat.polygonOffsetUnits = 2;

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
  roomShell.add(floor);

  const backZ =
    attachWall === "north"
      ? roomCenterZ - halfD + wallThickness / 2
      : roomCenterZ + halfD - wallThickness / 2;
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, wallThickness),
    wallMat
  );
  back.position.set(centerX, height / 2, backZ);
  back.castShadow = true;
  back.receiveShadow = true;
  roomShell.add(back);
  colliders.push({
    x: centerX,
    z: backZ,
    halfX: halfW,
    halfZ: wallThickness / 2,
  });

  /** Side walls span the interior floor only — not through the arena doorway gap. */
  const sideGeo = new THREE.BoxGeometry(wallThickness, height, floorDepth);
  const leftX = centerX - halfW + wallThickness / 2;
  const left = new THREE.Mesh(sideGeo, wallMat.clone());
  left.position.set(leftX, height / 2, floorCenterZ);
  left.castShadow = true;
  left.receiveShadow = true;
  roomShell.add(left);
  colliders.push({
    x: leftX,
    z: floorCenterZ,
    halfX: wallThickness / 2,
    halfZ: floorDepth / 2,
  });

  const rightX = centerX + halfW - wallThickness / 2;
  const right = new THREE.Mesh(sideGeo, wallMat.clone());
  right.position.set(rightX, height / 2, floorCenterZ);
  right.castShadow = true;
  right.receiveShadow = true;
  roomShell.add(right);
  colliders.push({
    x: rightX,
    z: floorCenterZ,
    halfX: wallThickness / 2,
    halfZ: floorDepth / 2,
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

  addRoomDoorSurround(
    roomShell,
    wallMat,
    centerX,
    width,
    height,
    attachWall,
    arenaHalf,
    arenaWallThickness,
    doorway
  );

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
