/**
 * @param {"north" | "south"} attachWall
 * @param {number} arenaHalf
 * @param {number} arenaWallThickness
 */
export function getArenaWallCenterZ(attachWall, arenaHalf, arenaWallThickness) {
  return attachWall === "north"
    ? -arenaHalf - arenaWallThickness / 2
    : arenaHalf + arenaWallThickness / 2;
}

/** Arena-facing inner face of the perimeter wall (playable side of the doorway). */
export function getArenaDoorInnerZ(attachWall, arenaHalf, arenaWallThickness) {
  const wallZ = getArenaWallCenterZ(attachWall, arenaHalf, arenaWallThickness);
  return attachWall === "north"
    ? wallZ + arenaWallThickness / 2
    : wallZ - arenaWallThickness / 2;
}

/**
 * South edge of room floor (north attach) — flush against the wall, not inside its thickness.
 * @param {"north" | "south"} attachWall
 * @param {number} arenaHalf
 * @param {number} arenaWallThickness
 * @param {number} roomWallThickness
 */
export function getRoomFloorSouthZ(
  attachWall,
  arenaHalf,
  arenaWallThickness,
  roomWallThickness
) {
  const innerZ = getArenaDoorInnerZ(attachWall, arenaHalf, arenaWallThickness);
  return attachWall === "north"
    ? innerZ - roomWallThickness
    : innerZ + roomWallThickness;
}

/**
 * Shared placement math for rooms attached to the arena north/south wall.
 * @param {import("./loadArena.js").ArenaRoom} room
 * @param {number} arenaHalf
 * @param {"north" | "south"} attachWall
 * @param {number} [arenaWallThickness]
 */
export function getAttachedRoomCenterZ(
  room,
  arenaHalf,
  attachWall,
  arenaWallThickness = 0.5
) {
  const depth = room.depth;
  const roomWallThickness = room.wallThickness ?? 0.35;
  const floorSouthZ = getRoomFloorSouthZ(
    attachWall,
    arenaHalf,
    arenaWallThickness,
    roomWallThickness
  );
  return attachWall === "north"
    ? floorSouthZ - depth / 2 + roomWallThickness
    : floorSouthZ + depth / 2 - roomWallThickness;
}

/**
 * Interior shell of the room (inside wall faces; stops at doorway, not arena floor).
 * @param {import("./loadArena.js").ArenaRoom} room
 * @param {number} arenaHalf
 * @param {"north" | "south"} attachWall
 * @param {number} [arenaWallThickness]
 */
export function getAttachedRoomShellBounds(
  room,
  arenaHalf,
  attachWall,
  arenaWallThickness = 0.5
) {
  const { centerX, width, depth, wallThickness = 0.35 } = room;
  const halfW = width / 2;
  const halfD = depth / 2;
  const roomCenterZ = getAttachedRoomCenterZ(
    room,
    arenaHalf,
    attachWall,
    arenaWallThickness
  );
  const backZ =
    attachWall === "north"
      ? roomCenterZ - halfD + wallThickness / 2
      : roomCenterZ + halfD - wallThickness / 2;

  const minX = centerX - halfW;
  const maxX = centerX + halfW;
  const northZ = backZ - wallThickness / 2;
  const southZ = getRoomFloorSouthZ(
    attachWall,
    arenaHalf,
    arenaWallThickness,
    wallThickness
  );

  return {
    centerX,
    roomCenterZ,
    minX,
    maxX,
    northZ,
    southZ,
  };
}

/**
 * @param {number} x
 * @param {number} z
 * @param {import("./loadArena.js").ArenaRoom} room
 * @param {number} arenaHalf
 * @param {"north" | "south"} attachWall
 */
export function isPointInsideAttachedRoom(
  x,
  z,
  room,
  arenaHalf,
  attachWall,
  arenaWallThickness = 0.5
) {
  const halfW = room.width / 2;
  const halfD = room.depth / 2;
  const roomCenterZ = getAttachedRoomCenterZ(
    room,
    arenaHalf,
    attachWall,
    arenaWallThickness
  );
  return (
    x >= room.centerX - halfW &&
    x <= room.centerX + halfW &&
    z >= roomCenterZ - halfD &&
    z <= roomCenterZ + halfD
  );
}

/**
 * @param {number} x
 * @param {number} z
 * @param {import("./loadArena.js").ArenaRoom[]} rooms
 * @param {number} arenaHalf
 * @param {"north" | "south"} attachWall
 */
export function isPointInsideAnyRoom(x, z, rooms, arenaHalf, attachWall) {
  for (const room of rooms) {
    if (isPointInsideAttachedRoom(x, z, room, arenaHalf, attachWall)) {
      return true;
    }
  }
  return false;
}
