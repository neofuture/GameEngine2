import { getDefaultStairPlacement } from "./StairTuning.js";

/** First playable level — add `level2.json`, `level3.json`, etc. under public/levels/. */
export const DEFAULT_LEVEL = 1;

/** @param {number} levelNumber */
export function levelConfigUrl(levelNumber) {
  return `/levels/level${levelNumber}.json`;
}

export const DEFAULT_ARENA_URL = levelConfigUrl(DEFAULT_LEVEL);

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
 * @typedef {Object} LevelMeta
 * @property {number} number
 * @property {string} id
 * @property {string} name
 * @property {string} [objective]
 * @property {string} [description]
 */

/**
 * @typedef {Object} ArenaConfig
 * @property {LevelMeta} meta
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
 * @property {boolean | Record<string, unknown>} [stairs]
 *   Set `false` to omit stairs. Any other value (or omitting the key) uses
 *   baked-in placement from StairTuning.js — level JSON does not author coords.
 * @property {number} [playerBoundsInset] Legacy — use {@link wallStandoff} instead
 * @property {number} [wallStandoff] Clearance from inner wall face to player body edge (default 0.5)
 * @property {{ floor: string, wall: string, pillar: string, ceiling?: string }} textures
 * @property {{ x: number, z: number, radius: number }[]} [floorHoles] Circular cutouts in the arena floor — player falls through and is respawned by the death-fall handler
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
 *   spawnPoints?: { x: number, z: number, yaw?: number, note?: string }[],
 * }} [target]
 */

/** @param {string} url */
function parseLevelNumberFromUrl(url) {
  const match = url.match(/\/level(\d+)\.json(?:\?|$)/i);
  return match ? parseInt(match[1], 10) : DEFAULT_LEVEL;
}

/**
 * Merge `meta` with legacy top-level id/name and filename-derived level number.
 * @param {ArenaConfig & { meta?: Partial<LevelMeta> }} arena
 * @param {number} [levelNumber]
 */
export function normalizeLevelMeta(arena, levelNumber = DEFAULT_LEVEL) {
  const legacyId = arena.id;
  const legacyName = arena.name;
  const raw = arena.meta ?? {};

  const number = raw.number ?? levelNumber;
  /** @type {LevelMeta} */
  const meta = {
    number,
    id: raw.id ?? legacyId ?? `level${number}`,
    name: raw.name ?? legacyName ?? `Level ${number}`,
  };
  if (raw.objective) meta.objective = raw.objective;
  if (raw.description) meta.description = raw.description;

  arena.meta = meta;
  arena.id = meta.id;
  arena.name = meta.name;
}

/** @param {ArenaConfig} arena @returns {LevelMeta} */
export function getLevelMeta(arena) {
  return arena.meta;
}

/**
 * Stair placement is authored in code (StairTuning.js), not level JSON.
 * @param {ArenaConfig} arena
 */
function applyStairPlacementFromCode(arena) {
  if (arena.stairs === false) {
    delete arena.stairs;
    return;
  }
  arena.stairs = getDefaultStairPlacement();
}

/** @param {string} [url] @returns {Promise<ArenaConfig>} */
export async function loadArenaConfig(url = DEFAULT_ARENA_URL) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Arena config not found: ${url}`);
  }
  const arena = await res.json();
  normalizeLevelMeta(arena, parseLevelNumberFromUrl(url));
  applyStairPlacementFromCode(arena);
  return arena;
}

/** @param {number} [levelNumber] @returns {Promise<ArenaConfig>} */
export function loadLevelConfig(levelNumber = DEFAULT_LEVEL) {
  return loadArenaConfig(levelConfigUrl(levelNumber));
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
