import * as THREE from "three";
import { HEALTH_BAR_LAYER } from "./LightingLayers.js";

export const TARGET_DAMAGE = 1;

export const DEFAULT_TARGET_CONFIG = {
  count: 5,
  radius: 0.45,
  height: 2.2,
  maxHealth: 30,
  respawnDelay: 2.5,
  spawnMargin: 1.5,
  repairPerSecond: 0.105,
  repairDelayAfterHit: 1.25,
};

const HEALTH_GREEN = { r: 0x3d, g: 0xcc, b: 0x5c };
const HEALTH_AMBER = { r: 0xe8, g: 0xa0, b: 0x20 };
const HEALTH_RED = { r: 0xd4, g: 0x3a, b: 0x32 };

function rgbToHex({ r, g, b }) {
  return (r << 16) | (g << 8) | b;
}

/** Subtle emissive glow tinted to match RAG health. */
function ragEmissiveHex(ratio, intensity = 0.14) {
  const { r, g, b } = getHealthBarRgb(ratio);
  return (
    (Math.floor(r * intensity) << 16) |
    (Math.floor(g * intensity) << 8) |
    Math.floor(b * intensity)
  );
}

/** @param {import("./loadArena.js").ArenaConfig} arena */
export function resolveTargetConfig(arena) {
  const t = arena.target ?? {};
  return {
    count: t.count ?? arena.targets?.length ?? DEFAULT_TARGET_CONFIG.count,
    radius: t.radius ?? (t.width != null ? t.width / 2 : undefined) ?? DEFAULT_TARGET_CONFIG.radius,
    height: t.height ?? DEFAULT_TARGET_CONFIG.height,
    maxHealth: t.maxHealth ?? DEFAULT_TARGET_CONFIG.maxHealth,
    respawnDelay: t.respawnDelay ?? DEFAULT_TARGET_CONFIG.respawnDelay,
    spawnMargin: t.spawnMargin ?? DEFAULT_TARGET_CONFIG.spawnMargin,
    repairPerSecond: t.repairPerSecond ?? DEFAULT_TARGET_CONFIG.repairPerSecond,
    repairDelayAfterHit:
      t.repairDelayAfterHit ?? DEFAULT_TARGET_CONFIG.repairDelayAfterHit,
  };
}

function lerpChannel(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function lerpRgb(c0, c1, t) {
  return {
    r: lerpChannel(c0.r, c1.r, t),
    g: lerpChannel(c0.g, c1.g, t),
    b: lerpChannel(c0.b, c1.b, t),
  };
}

function rgbToCss({ r, g, b }) {
  return `rgb(${r}, ${g}, ${b})`;
}

/** @param {number} ratio 0–1 */
export function getHealthBarRgb(ratio) {
  const r = THREE.MathUtils.clamp(ratio, 0, 1);
  if (r >= 0.5) {
    return lerpRgb(HEALTH_AMBER, HEALTH_GREEN, (r - 0.5) * 2);
  }
  return lerpRgb(HEALTH_RED, HEALTH_AMBER, r * 2);
}

/** @param {number} ratio 0–1 */
export function getHealthBarColor(ratio) {
  return rgbToCss(getHealthBarRgb(ratio));
}

const HEALTH_BAR_CANVAS_W = 320;
const HEALTH_BAR_PCT_FONT_BASE = 14;
/** 400% bigger than baseline (5× label area + type size). */
const HEALTH_BAR_PCT_TEXT_SCALE = 5;
const HEALTH_BAR_PCT_FONT_PX =
  HEALTH_BAR_PCT_FONT_BASE * HEALTH_BAR_PCT_TEXT_SCALE;
const HEALTH_BAR_LABEL_H = 18 * HEALTH_BAR_PCT_TEXT_SCALE;
const HEALTH_BAR_BAR_H = 32;
const HEALTH_BAR_CANVAS_H = HEALTH_BAR_LABEL_H + HEALTH_BAR_BAR_H;
/** World width at ~1 m; scaled up with distance so it stays a small HUD strip. */
const HEALTH_BAR_WORLD_W_NEAR = 0.22;
const HEALTH_BAR_WORLD_W_PER_M = 0.055;
const HEALTH_BAR_WORLD_W_MAX = 0.55;
const HEALTH_BAR_FILL_SPEED = 14;
const _healthBarWorldPos = new THREE.Vector3();
const _healthBarAimPos = new THREE.Vector3();
const _healthBarLosOrigin = new THREE.Vector3();
const _healthBarLosDir = new THREE.Vector3();
const _healthBarLosHits = [];
const _healthBarLosRaycaster = new THREE.Raycaster();
const HEALTH_BAR_HIT_PULSE_DECAY = 18;
/** Level root for line-of-sight checks (walls, pillars, room shells). */
let healthBarOccluderRoot = null;

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawHealthBarCanvas(ctx, ratio, hitFlash = 0) {
  const w = HEALTH_BAR_CANVAS_W;
  const h = HEALTH_BAR_CANVAS_H;
  ctx.clearRect(0, 0, w, h);

  const clamped = THREE.MathUtils.clamp(ratio, 0, 1);
  const pctLabel = `${Math.round(clamped * 100)}%`;
  ctx.font = `600 ${HEALTH_BAR_PCT_FONT_PX}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
  ctx.lineWidth = 3 * HEALTH_BAR_PCT_TEXT_SCALE;
  ctx.strokeText(pctLabel, w / 2, HEALTH_BAR_LABEL_H / 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
  ctx.fillText(pctLabel, w / 2, HEALTH_BAR_LABEL_H / 2);

  const barH = Math.round(HEALTH_BAR_BAR_H * 0.72);
  const barY =
    HEALTH_BAR_LABEL_H + Math.round((HEALTH_BAR_BAR_H - barH) / 2);
  const trackW = Math.round(w * 0.94);
  const barX = Math.round((w - trackW) / 2);
  const radius = barH / 2;
  const fillW =
    clamped <= 0 ? 0 : Math.max(2, Math.round(trackW * clamped));

  ctx.fillStyle = "rgba(8, 10, 14, 0.72)";
  roundRect(ctx, barX, barY, trackW, barH, radius);
  ctx.fill();

  if (fillW > 0) {
    const { r, g, b } = getHealthBarRgb(clamped);
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.save();
    ctx.beginPath();
    ctx.rect(barX, barY, fillW, barH);
    ctx.clip();
    roundRect(ctx, barX, barY, trackW, barH, radius);
    ctx.fill();
    ctx.restore();

    const strokeAlpha = 0.38 + Math.min(1, hitFlash) * 0.5;
    ctx.strokeStyle = `rgba(255, 255, 255, ${strokeAlpha})`;
    ctx.lineWidth = 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(barX, barY, fillW, barH);
    ctx.clip();
    roundRect(ctx, barX + 1, barY + 1, trackW - 2, barH - 2, radius - 1);
    ctx.stroke();
    ctx.restore();
  }

  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 1;
  roundRect(ctx, barX + 0.5, barY + 0.5, trackW - 1, barH - 1, radius - 0.5);
  ctx.stroke();
}

function createHealthBarSprite(height) {
  const canvas = document.createElement("canvas");
  canvas.width = HEALTH_BAR_CANVAS_W;
  canvas.height = HEALTH_BAR_CANVAS_H;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.05,
    depthTest: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  const aspect = HEALTH_BAR_CANVAS_H / HEALTH_BAR_CANVAS_W;
  const nearH = HEALTH_BAR_WORLD_W_NEAR * aspect;
  const yOffset = ((HEALTH_BAR_LABEL_H / 2) / HEALTH_BAR_CANVAS_H) * nearH;
  sprite.scale.set(HEALTH_BAR_WORLD_W_NEAR, nearH, 1);
  sprite.position.set(0, height * 0.62 + yOffset, 0);
  sprite.layers.set(HEALTH_BAR_LAYER);
  sprite.renderOrder = 25;
  sprite.userData.healthBarCanvas = canvas;
  sprite.userData.healthBarCtx = ctx;
  sprite.userData.healthBarTexture = texture;
  sprite.userData.hitFlash = 0;
  sprite.userData.barYOffset =
    (HEALTH_BAR_LABEL_H / 2) / HEALTH_BAR_CANVAS_H;
  return sprite;
}

function targetHealthRatio(mesh) {
  const ud = mesh.userData;
  if (!ud.maxHealth) return 0;
  return THREE.MathUtils.clamp(ud.health / ud.maxHealth, 0, 1);
}

function paintHealthBar(mesh, ratio) {
  const bar = mesh.userData.healthBar;
  if (!bar) return;
  drawHealthBarCanvas(
    bar.userData.healthBarCtx,
    ratio,
    bar.userData.hitFlash ?? 0
  );
  bar.userData.healthBarTexture.needsUpdate = true;
}

function setHealthBarTarget(mesh, ratio) {
  mesh.userData.healthBarTargetRatio = THREE.MathUtils.clamp(ratio, 0, 1);
}

function resetHealthBarAnimation(mesh, ratio = 1) {
  const r = THREE.MathUtils.clamp(ratio, 0, 1);
  mesh.userData.healthBarDisplayRatio = r;
  mesh.userData.healthBarTargetRatio = r;
  paintHealthBar(mesh, r);
}

/** @param {THREE.Object3D | null} root */
export function setHealthBarOccluders(root) {
  healthBarOccluderRoot = root;
}

function isDescendantOf(object, ancestor) {
  let o = object;
  while (o) {
    if (o === ancestor) return true;
    o = o.parent;
  }
  return false;
}

/**
 * True when no level geometry blocks the ray from the camera to the target body.
 * @param {THREE.Mesh} mesh
 * @param {THREE.Camera} camera
 */
export function isTargetVisibleFromCamera(mesh, camera) {
  if (!healthBarOccluderRoot || !camera) return true;

  const height = mesh.userData.height ?? 2.2;
  mesh.getWorldPosition(_healthBarAimPos);
  _healthBarAimPos.y = height * 0.55;

  _healthBarLosOrigin.copy(camera.position);
  _healthBarLosDir.subVectors(_healthBarAimPos, _healthBarLosOrigin);
  const dist = _healthBarLosDir.length();
  if (dist < 0.08) return true;

  _healthBarLosDir.multiplyScalar(1 / dist);
  _healthBarLosRaycaster.set(_healthBarLosOrigin, _healthBarLosDir);
  _healthBarLosRaycaster.far = dist + 0.08;
  _healthBarLosRaycaster.near = 0.05;

  _healthBarLosHits.length = 0;
  _healthBarLosRaycaster.intersectObject(
    healthBarOccluderRoot,
    true,
    _healthBarLosHits
  );

  for (const hit of _healthBarLosHits) {
    if (hit.object.isSprite) continue;
    if (isDescendantOf(hit.object, mesh)) return true;
    return false;
  }
  return true;
}

function refreshHealthBarVisibility(mesh, camera) {
  const bar = mesh.userData.healthBar;
  if (!bar) return;

  const alive = mesh.visible && mesh.userData.health > 0;
  if (!alive) {
    bar.visible = false;
    return;
  }

  bar.visible =
    !camera || isTargetVisibleFromCamera(mesh, camera);
}

export function syncTargetHealthBar(mesh, camera) {
  const bar = mesh.userData.healthBar;
  if (!bar) return;

  refreshHealthBarVisibility(mesh, camera);
  if (!bar.visible) return;

  const ratio = targetHealthRatio(mesh);
  setHealthBarTarget(mesh, ratio);
}

function tickHealthBar(mesh, dt) {
  const bar = mesh.userData.healthBar;
  if (!bar?.visible) return;

  const target = mesh.userData.healthBarTargetRatio ?? 1;
  let display = mesh.userData.healthBarDisplayRatio ?? 1;
  let dirty = false;

  if (Math.abs(display - target) > 0.0005) {
    const blend = 1 - Math.exp(-HEALTH_BAR_FILL_SPEED * dt);
    display += (target - display) * blend;
    if (Math.abs(display - target) < 0.001) display = target;
    mesh.userData.healthBarDisplayRatio = display;
    dirty = true;
  }

  if (bar.userData.hitFlash > 0) {
    bar.userData.hitFlash = Math.max(
      0,
      bar.userData.hitFlash - dt * HEALTH_BAR_HIT_PULSE_DECAY
    );
    dirty = true;
  }

  if (dirty) paintHealthBar(mesh, display);
}

function updateHealthBarScale(mesh, camera) {
  const bar = mesh.userData.healthBar;
  if (!bar?.visible) return;

  mesh.getWorldPosition(_healthBarWorldPos);
  const dist = Math.max(0.5, camera.position.distanceTo(_healthBarWorldPos));
  const worldW = THREE.MathUtils.clamp(
    HEALTH_BAR_WORLD_W_NEAR + dist * HEALTH_BAR_WORLD_W_PER_M,
    HEALTH_BAR_WORLD_W_NEAR,
    HEALTH_BAR_WORLD_W_MAX
  );
  const aspect = HEALTH_BAR_CANVAS_H / HEALTH_BAR_CANVAS_W;
  const worldH = worldW * aspect;
  bar.scale.set(worldW, worldH, 1);
  const height = mesh.userData.height ?? 2.2;
  const yOffset = (bar.userData.barYOffset ?? 0) * worldH;
  bar.position.set(0, height * 0.62 + yOffset, 0);
}

/** Smoothly animate health bars toward current target health. */
export function updateTargetHealthBars(targets, dt, camera) {
  for (const mesh of targets) {
    if (!mesh.userData.healthBar) continue;
    refreshHealthBarVisibility(mesh, camera);
    tickHealthBar(mesh, dt);
    if (camera) updateHealthBarScale(mesh, camera);
  }
}

/**
 * Draw visible health bar sprites after world + room (depth-tested against geometry).
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {THREE.Mesh[]} targets
 */
export function renderTargetHealthBarsPass(renderer, scene, camera, targets) {
  const prevAutoClear = renderer.autoClear;
  const prevMask = camera.layers.mask;

  for (const mesh of targets) {
    if (!mesh.visible || mesh.userData.health <= 0) continue;
    mesh.updateMatrixWorld(true);
    const bar = mesh.userData.healthBar;
    if (bar?.visible) bar.updateMatrixWorld(true);
  }

  try {
    renderer.autoClear = false;
    camera.layers.set(HEALTH_BAR_LAYER);
    renderer.render(scene, camera);
  } finally {
    renderer.autoClear = prevAutoClear;
    camera.layers.mask = prevMask;
  }
}

export function disposeTargetHealthBar(mesh) {
  const bar = mesh.userData.healthBar;
  if (!bar) return;
  mesh.remove(bar);
  bar.material.map?.dispose();
  bar.material.dispose();
  mesh.userData.healthBar = null;
}

/** @param {THREE.Mesh[]} targets */
export function disposeAllTargetHealthBars(targets) {
  for (const mesh of targets) {
    disposeTargetHealthBar(mesh);
  }
}

function overlapsBox(x, z, radius, margin, box) {
  if (box.active === false) return false;
  const dx = Math.abs(x - box.x);
  const dz = Math.abs(z - box.z);
  return dx < box.halfX + radius + margin && dz < box.halfZ + radius + margin;
}

function overlapsTargets(x, z, radius, margin, targets, skip) {
  const minDist = radius * 2 + margin;
  const minDistSq = minDist * minDist;
  for (const mesh of targets) {
    if (mesh === skip) continue;
    if (mesh.userData.health <= 0 || mesh.visible === false) continue;
    const dx = x - mesh.position.x;
    const dz = z - mesh.position.z;
    if (dx * dx + dz * dz < minDistSq) return true;
  }
  return false;
}

/**
 * @param {object} opts
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number }} opts.bounds
 * @param {object[]} opts.colliders
 * @param {THREE.Mesh[]} opts.targets
 * @param {ReturnType<typeof resolveTargetConfig>} opts.config
 * @param {THREE.Mesh} [opts.skip]
 */
export function pickRandomSpawnPosition(opts) {
  const { bounds, colliders, targets, config, skip } = opts;
  const { radius, spawnMargin } = config;
  const pad = radius + spawnMargin;
  const minX = bounds.minX + pad;
  const maxX = bounds.maxX - pad;
  const minZ = bounds.minZ + pad;
  const maxZ = bounds.maxZ - pad;
  if (minX >= maxX || minZ >= maxZ) return null;

  for (let attempt = 0; attempt < 100; attempt++) {
    const x = THREE.MathUtils.lerp(minX, maxX, Math.random());
    const z = THREE.MathUtils.lerp(minZ, maxZ, Math.random());
    let blocked = false;
    for (const box of colliders) {
      if (overlapsBox(x, z, radius, 0, box)) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    if (overlapsTargets(x, z, radius, spawnMargin, targets, skip)) continue;
    return { x, z };
  }
  return null;
}

function createTargetMaterial() {
  return new THREE.MeshLambertMaterial({
    color: rgbToHex(getHealthBarRgb(1)),
    emissive: ragEmissiveHex(1),
  });
}

/**
 * @param {object} opts
 * @param {THREE.Group} opts.group
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number }} opts.bounds
 * @param {object[]} opts.colliders
 * @param {ReturnType<typeof resolveTargetConfig>} opts.config
 */
export function spawnTargets(opts) {
  const { group, bounds, colliders, config } = opts;
  const targets = [];
  const sharedGeo = new THREE.CylinderGeometry(
    config.radius,
    config.radius,
    config.height,
    16
  );

  for (let i = 0; i < config.count; i++) {
    const pos = pickRandomSpawnPosition({
      bounds,
      colliders,
      targets,
      config,
    });
    if (!pos) break;

    const mesh = new THREE.Mesh(sharedGeo, createTargetMaterial());
    mesh.position.set(pos.x, config.height / 2, pos.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.isTarget = true;
    mesh.userData.maxHealth = config.maxHealth;
    mesh.userData.health = config.maxHealth;
    mesh.userData.height = config.height;
    mesh.userData.radius = config.radius;
    mesh.userData.repairPerSecond = config.repairPerSecond;
    mesh.userData.repairDelayAfterHit = config.repairDelayAfterHit;
    mesh.userData.repairCooldown = 0;

    const healthBar = createHealthBarSprite(config.height);
    mesh.add(healthBar);
    mesh.userData.healthBar = healthBar;
    resetHealthBarAnimation(mesh, 1);

    const collider = {
      x: pos.x,
      z: pos.z,
      halfX: config.radius,
      halfZ: config.radius,
      active: true,
      targetMesh: mesh,
    };
    mesh.userData.collider = collider;
    colliders.push(collider);

    group.add(mesh);
    targets.push(mesh);
  }

  return { targets, sharedGeo };
}

export function setTargetHealthVisual(mesh, healthRatio) {
  const mat = mesh.material;
  const alive = healthRatio > 0;
  const ratio = alive ? healthRatio : 0;
  mat.color.setHex(rgbToHex(getHealthBarRgb(ratio)));
  mat.emissive.setHex(alive ? ragEmissiveHex(ratio) : 0x000000);
  const bar = mesh.userData.healthBar;
  if (!bar) return;
  if (!alive) {
    bar.visible = false;
    return;
  }
  setHealthBarTarget(mesh, healthRatio);
}

export function applyTargetHit(mesh) {
  const ud = mesh.userData;
  ud.health = Math.max(0, ud.health - TARGET_DAMAGE);
  ud.repairCooldown = ud.repairDelayAfterHit ?? DEFAULT_TARGET_CONFIG.repairDelayAfterHit;
  const ratio = ud.health / ud.maxHealth;
  setTargetHealthVisual(mesh, ratio);
  const bar = mesh.userData.healthBar;
  if (bar) bar.userData.hitFlash = 1;
  return { killed: ud.health <= 0, health: ud.health, ratio };
}

/** Slowly restore health on living targets after a post-hit delay. */
export function updateTargetsRepair(targets, dt) {
  for (const mesh of targets) {
    if (!mesh.visible || mesh.userData.health <= 0) continue;
    const ud = mesh.userData;
    if (ud.repairCooldown > 0) {
      ud.repairCooldown = Math.max(0, ud.repairCooldown - dt);
      continue;
    }
    if (ud.health >= ud.maxHealth) continue;
    const rate = ud.repairPerSecond ?? DEFAULT_TARGET_CONFIG.repairPerSecond;
    ud.health = Math.min(ud.maxHealth, ud.health + rate * dt);
    setTargetHealthVisual(mesh, ud.health / ud.maxHealth);
  }
}

/**
 * @param {THREE.Mesh} mesh
 * @param {number} x
 * @param {number} z
 * @param {ReturnType<typeof resolveTargetConfig>} config
 */
export function activateTargetAt(mesh, x, z, config) {
  const ud = mesh.userData;
  const collider = ud.collider;
  ud.health = ud.maxHealth;
  ud.repairCooldown = 0;
  mesh.visible = true;
  mesh.position.set(x, config.height / 2, z);
  collider.x = x;
  collider.z = z;
  collider.halfX = config.radius;
  collider.halfZ = config.radius;
  collider.active = true;
  resetHealthBarAnimation(mesh, 1);
  setTargetHealthVisual(mesh, 1);
}

export function deactivateTarget(mesh) {
  mesh.visible = false;
  mesh.userData.health = 0;
  const collider = mesh.userData.collider;
  if (collider) {
    collider.active = false;
    collider.halfX = 0;
    collider.halfZ = 0;
  }
  setTargetHealthVisual(mesh, 0);
}
