import { getArenaDeckWalkSurface } from "./LevelStairs.js";
import { getArenaCatwalkDeckY } from "./StairTuning.js";
import { spawnStaticAmmoCollectible } from "./AmmoCrate.js";

const COMPASS_POINTER_SRC = "/ui/compass-pointer.png";
const COMPASS_MARKER_FOV_DEG = 52.5;

/**
 * @param {import("./loadArena.js").ArenaConfig} arena
 * @param {import("./loadArena.js").ArenaCollectible} def
 */
export function resolveCollectiblePosition(arena, def) {
  if (def.preset === "catwalkBackRight") {
    const westOpen =
      arena.ceilingWestOpenRatio ??
      ((arena.westWallHeightRatio ?? 1) < 1 ? 0.5 : 0);
    const deck = getArenaDeckWalkSurface(
      arena,
      getArenaCatwalkDeckY(arena),
      westOpen
    );
    const inset = def.inset ?? 0.35;
    return {
      x: deck.maxX - inset,
      z: deck.maxZ - inset,
      y: deck.y,
      floorY: deck.y,
    };
  }

  const floorY =
    def.surface === "catwalk" || def.y === "catwalk"
      ? getArenaCatwalkDeckY(arena)
      : def.floorY ?? 0;
  const y = def.y === "catwalk" || def.surface === "catwalk" ? floorY : def.y ?? floorY;

  return {
    x: def.x,
    z: def.z,
    y,
    floorY,
  };
}

/**
 * @param {THREE.Scene} scene
 * @param {import("./loadArena.js").ArenaConfig} arena
 */
export function spawnLevelCollectibles(scene, arena) {
  /** @type {import("./loadArena.js").LevelCollectibleEntry[]} */
  const entries = [];
  const drops = [];

  for (const def of arena.collectibles ?? []) {
    if (!def?.id || def.type !== "ammo") continue;

    const pos = resolveCollectiblePosition(arena, def);
    const drop = spawnStaticAmmoCollectible(
      scene,
      pos.x,
      pos.y,
      pos.z,
      pos.floorY,
      def.value ?? 10
    );
    drop.compassMarkerId = def.id;
    drop.permanent = true;

    entries.push({
      id: def.id,
      type: "ammo",
      drop,
      markerEl: null,
      collected: false,
    });
    drops.push(drop);
  }

  return { entries, drops };
}

/**
 * @param {HTMLElement | null} container
 * @param {import("./loadArena.js").LevelCollectibleEntry[]} entries
 */
export function mountCompassCollectibleMarkers(container, entries) {
  if (!container) return;
  container.replaceChildren();

  for (const entry of entries) {
    if (entry.collected) continue;
    const el = document.createElement("img");
    el.src = COMPASS_POINTER_SRC;
    el.alt = "";
    el.className = "hudCompassPointer";
    el.dataset.collectibleId = entry.id;
    el.draggable = false;
    container.appendChild(el);
    entry.markerEl = el;
  }
}

/** Mount markers once the compass HUD ref is available (async level load). */
export function ensureCompassCollectibleMarkers(container, entries) {
  if (!container || entries.length === 0) return;
  if (entries.some((entry) => !entry.collected && !entry.markerEl)) {
    mountCompassCollectibleMarkers(container, entries);
  }
}

/**
 * @param {import("./loadArena.js").LevelCollectibleEntry[]} entries
 * @param {number} playerX
 * @param {number} playerZ
 * @param {number} playerYaw Player look yaw in radians (0 = facing −Z)
 * @param {HTMLElement} viewport
 * @param {number} pxPerDeg
 */
export function updateCompassCollectibleMarkers(
  entries,
  playerX,
  playerZ,
  playerYaw,
  viewport,
  pxPerDeg
) {
  const center = viewport.offsetWidth * 0.5;

  for (const entry of entries) {
    const el = entry.markerEl;
    if (!el || entry.collected) continue;

    const drop = entry.drop;
    const wx = drop.worldX ?? drop.mesh.position.x;
    const wz = drop.worldZ ?? drop.mesh.position.z;
    const dx = wx - playerX;
    const dz = wz - playerZ;
    const targetYaw = -Math.atan2(dx, -dz);
    let rel = ((playerYaw - targetYaw) * 180) / Math.PI;
    while (rel > 180) rel -= 360;
    while (rel < -180) rel += 360;

    if (Math.abs(rel) > COMPASS_MARKER_FOV_DEG) {
      el.style.visibility = "hidden";
      continue;
    }

    el.style.visibility = "visible";
    el.style.left = `${center + rel * pxPerDeg}px`;
  }
}

/**
 * @param {import("./loadArena.js").LevelCollectibleEntry[]} entries
 * @param {string} markerId
 */
export function hideCompassCollectibleMarker(entries, markerId) {
  for (const entry of entries) {
    if (entry.id !== markerId) continue;
    entry.collected = true;
    entry.markerEl?.remove();
    entry.markerEl = null;
    break;
  }
}

/**
 * @param {import("./loadArena.js").LevelCollectibleEntry[]} entries
 */
export function disposeCompassCollectibleMarkers(entries) {
  for (const entry of entries) {
    entry.markerEl?.remove();
    entry.markerEl = null;
  }
  entries.length = 0;
}
