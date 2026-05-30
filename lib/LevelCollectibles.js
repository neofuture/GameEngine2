import * as THREE from "three";
import { getArenaDeckWalkSurface } from "./LevelStairs.js";
import { getArenaCatwalkDeckY } from "./StairTuning.js";
import {
  spawnLevelCollectiblePickup,
  tickLevelCollectibleDrop,
  tickLevelCollectibleCollectFade,
  canCollectLevelCollectible,
  disposeAmmoPickupMeshShadow,
  finalizePickupInScene,
} from "./AmmoCrate.js";
import { spawnHpOrb, getOrbMaterials } from "./Targets.js";
import {
  spawnGrenadeDrop,
  disposeGrenadeModel,
  PROJECTILE_FLASHBANG,
} from "./Grenade.js";

const COMPASS_POINTER_SRC = "/ui/compass-pointer.png";
const COMPASS_MARKER_FOV_DEG = 52.5;
/** Matches player capsule radius — crate sits just inboard of the walk limit. */
const CATWALK_CORNER_INSET = 0.55;

/** QA — after pickup, respawn a random floor/catwalk reward with a new compass marker. */
export const LEVEL_COLLECTIBLE_TEST_RESPAWN = true;

export const TEST_REWARD_TYPES = ["ammo", "hp", "grenade", "flashbang"];

const SOFT_DROP_VY = -1.2;
const SOFT_GRAVITY = 12;
const SOFT_BOUNCE = 0.55;
const HP_SETTLE_Y = 0.065 + 0.02;
const GREN_SETTLE_Y = 0.07;
const BOB_SPEED = 2;
const BOB_HEIGHT = 0.08;
const SPIN = 2.5;

/**
 * @param {import("./loadArena.js").ArenaConfig} arena
 * @param {import("./loadArena.js").ArenaCollectible} def
 */
function getArenaFloorWalkBounds(arena) {
  const wallStandoff = arena.wallStandoff ?? 0.5;
  const inner = arena.size / 2 - wallStandoff;
  return {
    minX: -inner,
    maxX: inner,
    minZ: -inner,
    maxZ: inner,
    y: arena.floorY ?? 0,
  };
}

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
    const inset = def.inset ?? CATWALK_CORNER_INSET;
    return {
      x: deck.maxX - inset,
      z: deck.maxZ - inset,
      y: deck.y,
      floorY: deck.y,
      surface: "catwalk",
    };
  }

  if (def.preset === "arenaFloorRandom") {
    return {
      ...pickRandomArenaFloorCollectiblePosition(arena, def.inset ?? 0.85),
      surface: "floor",
    };
  }

  if (def.preset === "catwalkRandom") {
    return {
      ...pickRandomCatwalkCollectiblePosition(arena, def.inset ?? 0.85),
      surface: "catwalk",
    };
  }

  const onCatwalk =
    def.surface === "catwalk" || def.y === "catwalk";
  const floorY = onCatwalk
    ? getArenaCatwalkDeckY(arena)
    : def.floorY ?? arena.floorY ?? 0;
  const y = onCatwalk ? floorY : def.y ?? floorY;

  return {
    x: def.x,
    z: def.z,
    y,
    floorY,
    surface: onCatwalk ? "catwalk" : def.surface ?? "floor",
  };
}

/**
 * @param {THREE.Object3D} root Scene or level pickups group
 * @param {import("./loadArena.js").ArenaConfig} arena
 */
export function spawnLevelCollectibles(root, arena) {
  /** @type {import("./loadArena.js").LevelCollectibleEntry[]} */
  const entries = [];
  const drops = [];

  for (const def of arena.collectibles ?? []) {
    if (!def?.id || def.type !== "ammo") continue;

    const pos = resolveCollectiblePosition(arena, def);
    const drop = spawnLevelCollectiblePickup(
      root,
      pos.x,
      pos.z,
      pos.floorY,
      def.value ?? 10
    );
    finalizePickupInScene(drop.mesh);
    drop.compassMarkerId = def.id;
    drop.rewardType = "ammo";
    drop.pickupKind = "ammo";
    drop.surface = pos.surface ?? "catwalk";

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

export function pickRandomTestRewardType() {
  return TEST_REWARD_TYPES[Math.floor(Math.random() * TEST_REWARD_TYPES.length)];
}

/**
 * Random point on the arena floor (inset from wall standoff).
 * @param {import("./loadArena.js").ArenaConfig} arena
 */
export function pickRandomArenaFloorCollectiblePosition(arena, margin = 0.85) {
  const floor = getArenaFloorWalkBounds(arena);
  const spanX = floor.maxX - floor.minX - margin * 2;
  const spanZ = floor.maxZ - floor.minZ - margin * 2;
  return {
    x: floor.minX + margin + Math.random() * spanX,
    z: floor.minZ + margin + Math.random() * spanZ,
    floorY: floor.y,
    surface: "floor",
  };
}

/**
 * Random point on the east catwalk deck (inset from edges).
 * @param {import("./loadArena.js").ArenaConfig} arena
 */
export function pickRandomCatwalkCollectiblePosition(arena, margin = 0.85) {
  const westOpen =
    arena.ceilingWestOpenRatio ??
    ((arena.westWallHeightRatio ?? 1) < 1 ? 0.5 : 0);
  const deck = getArenaDeckWalkSurface(
    arena,
    getArenaCatwalkDeckY(arena),
    westOpen
  );
  return {
    x: deck.minX + margin + Math.random() * (deck.maxX - deck.minX - margin * 2),
    z: deck.minZ + margin + Math.random() * (deck.maxZ - deck.minZ - margin * 2),
    floorY: deck.y,
    surface: "catwalk",
  };
}

/** Random reward point on arena floor or catwalk (50/50). */
export function pickRandomLevelCollectiblePosition(arena, margin = 0.85) {
  return Math.random() < 0.5
    ? pickRandomArenaFloorCollectiblePosition(arena, margin)
    : pickRandomCatwalkCollectiblePosition(arena, margin);
}

function prepSoftDrop(drop) {
  drop.velX = 0;
  drop.velZ = 0;
  drop.velY = SOFT_DROP_VY;
  drop.settled = false;
  drop.settledTime = 0;
  drop.settleBlend = 0;
  drop.collected = false;
  drop.collectTime = undefined;
  drop.levelCollectible = true;
  if (drop.mesh) {
    drop.mesh.visible = true;
    drop.mesh.position.y = drop.floorY + 0.45;
  }
  return drop;
}

/**
 * @param {THREE.Scene} scene
 * @param {"ammo" | "hp" | "grenade" | "flashbang"} rewardType
 * @param {{ x: number, z: number, floorY: number }} pos
 */
export function spawnCollectibleByType(scene, rewardType, pos) {
  const vec = new THREE.Vector3(pos.x, pos.floorY + 0.45, pos.z);
  const surface = pos.surface ?? "catwalk";

  if (rewardType === "hp") {
    const drop = prepSoftDrop(spawnHpOrb(scene, vec, pos.floorY));
    drop.pickupKind = "hp";
    drop.rewardType = "hp";
    drop.surface = surface;
    drop.baseScale = drop.baseScale ?? 1;
    return drop;
  }

  if (rewardType === "grenade" || rewardType === "flashbang") {
    const drop = prepSoftDrop(spawnGrenadeDrop(scene, vec, pos.floorY));
    drop.pickupKind = rewardType;
    drop.rewardType = rewardType;
    drop.surface = surface;
    drop.type = rewardType === "flashbang" ? PROJECTILE_FLASHBANG : "grenade";
    drop.baseScale = drop.mesh.scale.x;
    drop.value = 1;
    return drop;
  }

  const drop = spawnLevelCollectiblePickup(scene, pos.x, pos.z, pos.floorY, 10);
  finalizePickupInScene(drop.mesh);
  drop.pickupKind = "ammo";
  drop.rewardType = "ammo";
  drop.surface = surface;
  drop.baseScale = drop.mesh.scale.x;
  return drop;
}

function tickSoftCollectiblePhysics(d, dt, settleY, spinAxis = "y") {
  if (!d?.mesh) return;
  d.time += dt;

  if (!d.settled) {
    d.velY -= SOFT_GRAVITY * dt;
    d.mesh.position.y += d.velY * dt;
    if (d.mesh.position.y <= d.floorY + settleY) {
      d.mesh.position.y = d.floorY + settleY;
      if (Math.abs(d.velY) < 0.35) {
        d.velY = 0;
        d.settled = true;
        d.settledTime = d.time;
        d.settleBlend = 0;
      } else {
        d.velY *= -SOFT_BOUNCE;
      }
    }
  } else {
    d.settleBlend = Math.min(1, (d.settleBlend ?? 0) + dt * 1.8);
    const ease = d.settleBlend * d.settleBlend * (3 - 2 * d.settleBlend);
    const hoverY = d.floorY + settleY + 0.12;
    const groundY = d.floorY + settleY;
    const baseY = groundY + (hoverY - groundY) * ease;
    const bob =
      Math.sin((d.time - d.settledTime) * BOB_SPEED) * BOB_HEIGHT * 1.5 * ease;
    d.mesh.position.y = baseY + bob;
  }

  if (spinAxis === "z") {
    d.mesh.rotation.z += SPIN * dt;
  } else {
    d.mesh.rotation.y += SPIN * dt;
  }
  d.worldX = d.mesh.position.x;
  d.worldZ = d.mesh.position.z;
}

function tickCollectibleDrop(entry, dt) {
  const d = entry.drop;
  const kind = entry.type ?? d?.rewardType ?? "ammo";
  if (kind === "ammo") {
    tickLevelCollectibleDrop(d, dt);
    return;
  }
  if (kind === "hp") {
    tickSoftCollectiblePhysics(d, dt, HP_SETTLE_Y, "y");
    return;
  }
  tickSoftCollectiblePhysics(d, dt, GREN_SETTLE_Y, "z");
}

/** @returns {boolean} true when the mesh should be removed */
function tickCollectibleCollectFade(entry, dt) {
  const d = entry.drop;
  if (!d?.mesh || !d.collected) return false;

  const kind = entry.type ?? d?.rewardType ?? "ammo";

  if (kind === "ammo") {
    return tickLevelCollectibleCollectFade(d, dt);
  }

  const since = d.time - (d.collectTime ?? d.time);
  const fade = Math.max(0, 1 - since / 0.25);
  const base = d.baseScale ?? d.mesh.scale.x;
  d.mesh.scale.setScalar(base * fade);
  d.mesh.position.y += dt * 3;

  if (kind === "hp") {
    if (!d.ownMats) {
      d.ownMats = true;
      d.mesh.material = getOrbMaterials().map((m) => m.clone());
    }
    const mats = Array.isArray(d.mesh.material)
      ? d.mesh.material
      : [d.mesh.material];
    for (const m of mats) {
      if (m) {
        m.transparent = true;
        m.opacity = fade;
      }
    }
  }

  return fade <= 0;
}

function disposeCollectibleDrop(drop) {
  if (!drop?.mesh) return;
  drop.mesh.parent?.remove(drop.mesh);
  if (drop.pickupKind === "grenade" || drop.pickupKind === "flashbang") {
    disposeGrenadeModel(drop.mesh);
    return;
  }
  disposeAmmoPickupMeshShadow(drop.mesh);
  if (drop.ownMats) {
    const mats = Array.isArray(drop.mesh.material)
      ? drop.mesh.material
      : [drop.mesh.material];
    for (const m of mats) m.dispose?.();
  }
}

/** @param {HTMLElement | null} container */
export function addCompassCollectibleMarker(container, entry) {
  if (!container || entry.collected || entry.markerEl) return;
  const el = document.createElement("img");
  el.src = COMPASS_POINTER_SRC;
  el.alt = "";
  el.className = "hudCompassPointer";
  el.dataset.collectibleId = entry.id;
  el.draggable = false;
  container.appendChild(el);
  entry.markerEl = el;
}

/**
 * @param {THREE.Scene} scene
 * @param {import("./loadArena.js").ArenaConfig} arena
 * @param {import("./loadArena.js").LevelCollectibleEntry} entry
 * @param {HTMLElement | null} compassContainer
 * @param {"ammo" | "hp" | "grenade" | "flashbang"} [rewardType]
 */
export function respawnLevelCollectibleEntry(
  scene,
  arena,
  entry,
  compassContainer,
  rewardType = pickRandomTestRewardType()
) {
  const pos = pickRandomLevelCollectiblePosition(arena);
  entry.type = rewardType;
  entry.collected = false;
  entry.drop = spawnCollectibleByType(scene, rewardType, pos);
  entry.drop.compassMarkerId = entry.id;
  addCompassCollectibleMarker(compassContainer, entry);
}

/**
 * Animate and collect level pickups — separate from enemy ammoDrops so init
 * resets cannot orphan static crates.
 *
 * @param {import("./loadArena.js").LevelCollectibleEntry[]} entries
 * @param {number} dt
 * @param {number} playerX
 * @param {number} playerFootY
 * @param {number} playerZ
 * @param {(value: number, drop: object, entry: import("./loadArena.js").LevelCollectibleEntry) => void} onCollect
 * @param {{ testRespawn?: boolean, scene?: THREE.Scene, arena?: import("./loadArena.js").ArenaConfig, compassContainer?: HTMLElement | null, catwalkDeckY?: number }} [opts]
 */
export function updateLevelCollectibles(
  entries,
  dt,
  playerX,
  playerFootY,
  playerZ,
  onCollect,
  opts = {}
) {
  const {
    testRespawn = false,
    scene = null,
    arena = null,
    compassContainer = null,
    catwalkDeckY = arena ? getArenaCatwalkDeckY(arena) : 4.35,
  } = opts;

  for (const entry of entries) {
    const d = entry.drop;
    if (!d?.mesh) continue;

    tickCollectibleDrop(entry, dt);

    if (
      !entry.collected &&
      canCollectLevelCollectible(d, playerX, playerFootY, playerZ, catwalkDeckY)
    ) {
      entry.collected = true;
      d.collected = true;
      d.collectTime = d.time;
      onCollect(d.value, d, entry);
    }

    if (d.collected && tickCollectibleCollectFade(entry, dt)) {
      disposeCollectibleDrop(d);
      entry.drop = null;

      if (
        testRespawn &&
        scene &&
        arena &&
        LEVEL_COLLECTIBLE_TEST_RESPAWN
      ) {
        respawnLevelCollectibleEntry(scene, arena, entry, compassContainer);
      }
    }
  }
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
