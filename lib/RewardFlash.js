import * as THREE from "three";

/** Seconds before despawn when rewards begin flashing. */
export const REWARD_FLASH_WARN_SEC = 5;
/** Blink cycle length at the start of the warn window. */
const FLASH_INTERVAL_START = 0.5;
/** Blink cycle length just before despawn. */
const FLASH_INTERVAL_END = 0.2;

const _warnEmissive = new THREE.Color(0xff5522);

/**
 * @param {number} time - seconds since spawn
 * @param {number} lifetime - seconds until instant despawn
 */
export function getRewardExpireVisuals(time, lifetime) {
  const timeLeft = lifetime - time;

  if (timeLeft <= 0) {
    return { remove: true, flashing: false, flashOn: false, urgency: 1 };
  }

  const warnStart = lifetime - REWARD_FLASH_WARN_SEC;
  if (time < warnStart) {
    return { remove: false, flashing: false, flashOn: true, urgency: 0 };
  }

  const elapsed = time - warnStart;
  const urgency = Math.min(1, elapsed / REWARD_FLASH_WARN_SEC);
  const interval = THREE.MathUtils.lerp(FLASH_INTERVAL_START, FLASH_INTERVAL_END, urgency);
  const flashOn = (elapsed / interval) % 1 < 0.5;

  return { remove: false, flashing: true, flashOn, urgency };
}

function captureFlashBase(material) {
  return {
    emissive: material.emissive?.clone?.() ?? new THREE.Color(0x000000),
    emissiveIntensity: material.emissiveIntensity ?? 0,
    opacity: material.opacity ?? 1,
  };
}

/**
 * Clone mesh materials so flash does not affect shared assets.
 * @param {object} drop
 * @param {() => THREE.Material[]} cloneMaterialsFn
 */
export function ensureRewardOwnMaterials(drop, cloneMaterialsFn) {
  if (drop.ownMats) return;
  drop.ownMats = true;
  drop.mesh.material = cloneMaterialsFn().map((m) => m.clone());
  drop.flashMats = drop.mesh.material;
  drop.flashBase = drop.flashMats.map(captureFlashBase);
  for (const m of drop.flashMats) {
    m.transparent = true;
    m.depthWrite = false;
  }
}

/** Clone all materials on a multi-mesh pickup (e.g. grenade model). */
export function ensureTraverseOwnMaterials(drop) {
  if (drop.ownMats) return;
  drop.ownMats = true;
  drop.flashMats = [];
  drop.flashBase = [];
  drop.mesh.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    if (Array.isArray(child.material)) {
      child.material = child.material.map((m) => {
        const c = m.clone();
        c.transparent = true;
        c.depthWrite = false;
        drop.flashMats.push(c);
        drop.flashBase.push(captureFlashBase(c));
        return c;
      });
    } else {
      const c = child.material.clone();
      c.transparent = true;
      c.depthWrite = false;
      child.material = c;
      drop.flashMats.push(c);
      drop.flashBase.push(captureFlashBase(c));
    }
  });
}

/**
 * Apply blink. Caller must clone materials first when flashing.
 * @param {THREE.Object3D} root
 * @param {{ flashing: boolean, flashOn: boolean, urgency: number }} vis
 * @param {{ flashMats?: THREE.Material[], flashBase?: ReturnType<typeof captureFlashBase>[] }} drop
 */
export function applyRewardExpireVisual(root, vis, drop) {
  if (!vis.flashing) {
    root.visible = true;
    return;
  }

  root.visible = vis.flashOn;

  const mats = drop.flashMats;
  const base = drop.flashBase;
  if (!mats?.length || !base?.length) return;

  const warnBoost = 1.2 + vis.urgency * 1.8;
  for (let i = 0; i < mats.length; i++) {
    const m = mats[i];
    const b = base[i];
    m.opacity = b.opacity;
    if (vis.flashOn) {
      m.emissive.copy(_warnEmissive);
      m.emissiveIntensity = Math.max(b.emissiveIntensity, 0.35) + warnBoost;
    } else {
      m.emissive.copy(b.emissive);
      m.emissiveIntensity = b.emissiveIntensity;
    }
  }
}
