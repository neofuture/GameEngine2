import * as THREE from "three";
import {
  getAttachedRoomShellBounds,
  isPointInsideAttachedRoom,
} from "./RoomPlacement.js";

/**
 * @typedef {{
 *   room: import("./loadArena.js").ArenaRoom,
 *   shell: THREE.Object3D,
 *   lights: THREE.Light[],
 *   bbox: THREE.Box3,
 * }} RoomCullable
 */

/**
 * Build a list of culling records — one per attached room. Each record knows
 * about the room's shell group (the parent of every interior mesh) plus all
 * point lights pinned inside it, and carries a precomputed bounding box used
 * for per-frame frustum tests.
 *
 * @param {THREE.Object3D} levelRoot The scene group returned by `createLevelFromArena`.
 * @param {import("./loadArena.js").ArenaRoom[]} rooms
 * @param {THREE.Light[]} roomLights All point lights returned by `addRoomLights`.
 * @param {number} arenaHalf
 * @param {"north" | "south"} attachWall
 * @param {number} defaultWallHeight Fallback Y extent for rooms whose config omits `height`.
 * @returns {RoomCullable[]}
 */
export function buildRoomCullables(
  levelRoot,
  rooms,
  roomLights,
  arenaHalf,
  attachWall,
  defaultWallHeight
) {
  /** @type {Map<string | null, THREE.Object3D>} */
  const shellsById = new Map();
  levelRoot.traverse((obj) => {
    if (obj.userData?.roomInterior) {
      shellsById.set(obj.userData.roomId ?? null, obj);
    }
  });

  /** @type {RoomCullable[]} */
  const cullables = [];
  for (const room of rooms) {
    const shell = shellsById.get(room.id ?? null);
    if (!shell) continue;
    const bounds = getAttachedRoomShellBounds(room, arenaHalf, attachWall);
    const top = (room.height ?? defaultWallHeight) + 0.1;
    const bbox = new THREE.Box3(
      new THREE.Vector3(
        bounds.minX,
        0,
        Math.min(bounds.northZ, bounds.southZ)
      ),
      new THREE.Vector3(
        bounds.maxX,
        top,
        Math.max(bounds.northZ, bounds.southZ)
      )
    );
    // Use the raw room bbox for the frustum check — extra padding makes
    // the room count as "visible" too often (any near-miss flip-flops
    // visibility as the camera bobs, which thrashes the renderer).
    const lights = roomLights.filter(
      (l) => (l.userData?.roomId ?? null) === (room.id ?? null)
    );
    cullables.push({ room, shell, lights, bbox });
  }
  return cullables;
}

const _projScreenMatrix = new THREE.Matrix4();
const _frustum = new THREE.Frustum();

/**
 * Update room visibility for the current frame. Hides the shell of any
 * room whose bounding box isn't intersecting the camera frustum (and that
 * the player isn't standing in). Returns the count of rooms left visible
 * so callers can skip the ROOM_INTERIOR_LAYER render pass entirely when
 * nothing's on-screen.
 *
 * NOTE: We intentionally do NOT toggle `light.visible` here. Three.js
 * caches WebGL programs keyed by active light count; flipping a light's
 * visibility forces program lookups (and on the first toggle, a fresh
 * shader compile per affected material). When the camera bobs near a
 * frustum edge that visibility can chatter at 60Hz, which is a real perf
 * drain. Hiding the shell is sufficient — when no ROOM_INTERIOR_LAYER
 * mesh is visible, there are no fragments for the candle to light, so
 * the light costs effectively nothing.
 *
 * @param {RoomCullable[]} cullables
 * @param {THREE.Camera} camera
 * @param {{ x: number, z: number }} playerPos
 * @param {number} arenaHalf
 * @param {"north" | "south"} attachWall
 * @returns {number} Visible room count.
 */
export function updateRoomCulling(
  cullables,
  camera,
  playerPos,
  arenaHalf,
  attachWall
) {
  _projScreenMatrix.multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse
  );
  _frustum.setFromProjectionMatrix(_projScreenMatrix);

  let visibleCount = 0;
  for (const cullable of cullables) {
    const insideRoom = isPointInsideAttachedRoom(
      playerPos.x,
      playerPos.z,
      cullable.room,
      arenaHalf,
      attachWall
    );
    const visible =
      insideRoom || _frustum.intersectsBox(cullable.bbox);
    cullable.shell.visible = visible;
    if (visible) visibleCount += 1;
  }
  return visibleCount;
}
