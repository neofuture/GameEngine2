export const DEFAULT_ARENA_URL = "/levels/square_arena.json";

/**
 * @typedef {Object} ArenaPillarDefaults
 * @property {"box" | "rounded"} [shape]
 * @property {number} [cornerRadius] Meters; default ~10% of pillar width
 * @property {number} [cornerSegments] RoundedBox detail (default 4)
 */

/**
 * @typedef {Object} ArenaPillar
 * @property {number} x
 * @property {number} z
 * @property {string} [texture] Material folder id under /public/textures (overrides textures.pillar)
 * @property {"box" | "rounded"} [shape]
 * @property {number} [cornerRadius]
 * @property {number} [cornerSegments]
 */

/**
 * @typedef {Object} ArenaDoorway
 * @property {"north" | "south"} [wall]
 * @property {number} [centerX]
 * @property {number} [width]
 * @property {number} [height]
 * @property {"flat" | "arch"} [top]
 */

/**
 * @typedef {Object} ArenaRoomLight
 * @property {"point"} [type]
 * @property {[number, number, number]} position Offset from room center (x, y, z)
 * @property {string} [color]
 * @property {number} [intensity]
 * @property {number} [distance]
 * @property {number} [decay]
 */

/**
 * @typedef {Object} ArenaRoom
 * @property {string} id
 * @property {number} centerX
 * @property {number} width
 * @property {number} depth
 * @property {number} [height]
 * @property {number} [wallThickness]
 * @property {number} [ceilingThickness] Overrides arena default for this room
 * @property {{ floor: string, wall: string, ceiling?: string }} textures
 * @property {ArenaRoomLight[]} [lights]
 */

/**
 * @typedef {Object} ArenaConfig
 * @property {string} id
 * @property {string} name
 * @property {number} size
 * @property {number} wallHeight
 * @property {number} wallThickness
 * @property {number} [ceilingThickness] Solid deck slab on top of walls (meters)
 * @property {number} [catwalkClearance] Headroom under deck for a future catwalk (meters)
 * @property {number} [westWallHeightRatio] West wall height as fraction of wallHeight (clerestory; default 0.5)
 * @property {number} [ceilingWestOpenRatio] West-side deck width left open (0–1; default 0.5 when clerestory)
 * @property {number} pillarSize
 * @property {ArenaPillarDefaults} [pillarDefaults]
 * @property {ArenaDoorway} [doorway]
 * @property {ArenaDoorway[]} [doorways]
 * @property {ArenaRoom[]} [rooms]
 * @property {{
 *   position: { x: number, y?: number, z: number },
 *   rotationY: number,
 * }} [stairs] Fixed-size flight; position = bottom of first tread, rotationY in degrees
 * @property {number} [playerBoundsInset]
 * @property {{ floor: string, wall: string, pillar: string, ceiling?: string }} textures
 * @property {ArenaPillar[]} pillars
 * @property {{ x: number, z: number }[]} [targets] Legacy fixed positions (count fallback only)
 * @property {{
 *   count?: number,
 *   radius?: number,
 *   height?: number,
 *   maxHealth?: number,
 *   respawnDelay?: number,
 *   spawnMargin?: number,
 *   repairPerSecond?: number,
 *   repairDelayAfterHit?: number,
 *   width?: number,
 *   depth?: number,
 * }} [target]
 */

/** @param {string} [url] @returns {Promise<ArenaConfig>} */
export async function loadArenaConfig(url = DEFAULT_ARENA_URL) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Arena config not found: ${url}`);
  }
  return res.json();
}

/** @param {ArenaConfig} arena */
export function collectArenaTextureIds(arena) {
  const ids = new Set([
    arena.textures.floor,
    arena.textures.wall,
    arena.textures.pillar,
  ]);
  if (arena.textures.ceiling) ids.add(arena.textures.ceiling);
  for (const pillar of arena.pillars) {
    if (pillar.texture) ids.add(pillar.texture);
  }
  for (const room of arena.rooms ?? []) {
    if (room.textures?.floor) ids.add(room.textures.floor);
    if (room.textures?.wall) ids.add(room.textures.wall);
    if (room.textures?.ceiling) ids.add(room.textures.ceiling);
  }
  return [...ids];
}
