import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import {
  beginHoleFall,
  pointInFloorHole,
  updateEntityForFloorHole,
  resolveBoxCollider,
} from "./Collision.js";

/* ── Tuneable defaults ────────────────────────────────────────────── */

export const PROJECTILE_GRENADE = "grenade";
export const PROJECTILE_FLASHBANG = "flashbang";

const defaults = {
  throwSpeed: 12,
  loftAngle: 15,
  gravity: 9.8,
  bounceRestitution: 0.69,
  bounceFriction: 0.74,
  groundRollFriction: 16,
  fuseTime: 2.5,
  blastRadius: 5.0,
  maxDamage: 150,
  falloffPower: 1, // 1 = linear, 2 = quadratic
  grenadeCount: 4,
  /** Max distance for flashbang blind when the blast is visible to the player. */
  flashbangBlindRadius: 18,
};

export const DEFAULT_EXPLOSION_VFX = {
  duration: 1.35,
  flash: true,
  shockRings: true,
  shockDome: true,
  sparks: true,
  embers: true,
  debris: true,
  light: true,
  flashDuration: 0.29,
  flashScaleMul: 1.2,
  ringOpacity: 0.1,
  ringScaleMul: 1.15,
  ringDuration: 0.18,
  ring2Delay: 0.04,
  ring3Delay: 0.08,
  domeOpacity: 0.6,
  domeCoreOpacity: 0.75,
  domeScaleMul: 0.65,
  domeDuration: 0.4,
  sparkCount: 600,
  emberCount: 400,
  debrisCount: 180,
  sparkSize: 0.125,
  emberSize: 0.105,
  debrisSize: 0.15,
  particleSpread: 0.5,
  sparkGravity: 5.5,
  emberGravity: 3.2,
  debrisGravity: 8.5,
  lightIntensity: 5,
  lightDuration: 0.13,
  lightBlueMix: 1.0,
  lightning: true,
  lightningBoltCount: 10,
  lightningSegments: 14,
  lightningLengthMul: 1.05,
  lightningJag: 0.42,
  lightningThickness: 4,
  lightningBranchChance: 0,
  lightningDuration: 0.32,
  lightningGrowTime: 0.05,
  lightningOpacity: 1.0,
  lightningCoreSize: 0,
};

let _params = {
  ...defaults,
  explosionVfx: { ...DEFAULT_EXPLOSION_VFX },
};

export function getGrenadeParams() {
  return {
    ..._params,
    explosionVfx: { ..._params.explosionVfx },
  };
}

export function setGrenadeParams(p) {
  const { explosionVfx, ...rest } = p;
  Object.assign(_params, rest);
  if (explosionVfx) Object.assign(_params.explosionVfx, explosionVfx);
  return getGrenadeParams();
}

export function getGrenadeExplosionVfx() {
  return { ..._params.explosionVfx };
}

export function setGrenadeExplosionVfx(patch) {
  Object.assign(_params.explosionVfx, patch);
  return getGrenadeExplosionVfx();
}

export function resetGrenadeExplosionVfx() {
  _params.explosionVfx = { ...DEFAULT_EXPLOSION_VFX };
  return getGrenadeExplosionVfx();
}

/* ── Constants ────────────────────────────────────────────────────── */

const GRENADE_RADIUS = 0.05;
const GRENADE_SEGMENTS = 12;
const SIM_STEP = 0.02;
const MAX_SIM_STEPS = 500;
const ARC_MAX_POINTS = 300;

/* ── Procedural grenade model ─────────────────────────────────────── */

const SEGMENTS = 32;
const TEX_PATH = "/textures/grenade/grenade_reward_cylinder_";
const _texLoader = new THREE.TextureLoader();

let _tex = null;
let _sharedBodyGeo = null;
let _sharedTopGeo = null;
let _sharedBotGeo = null;
let _sharedBodyMat = null;
let _sharedTopMat = null;
let _sharedBotMat = null;
let _capTopY = 0;
let _capBotY = 0;
let _preloadPromise = null;

function configureTex(tex, srgb, anisotropy) {
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = anisotropy;
  return tex;
}

function loadTex(file, srgb, anisotropy = 8) {
  return configureTex(_texLoader.load(TEX_PATH + file), srgb, anisotropy);
}

function ensureTex(anisotropy = 8) {
  if (_tex) return _tex;
  _tex = {
    body: loadTex("body_wrap_albedo.png", true, anisotropy),
    top: loadTex("top_cap_albedo.png", true, anisotropy),
    bot: loadTex("bottom_cap_albedo.png", true, anisotropy),
  };
  return _tex;
}

const LATHE_POINTS = 45;
const BASE_R = 0.034;
const BASE_H = BASE_R * Math.PI;

const _latheRadii = [
  0.76, 0.76, 0.75, 0.76, 0.78, 0.99, 1.00, 1.00, 1.00, 1.00, // #0–#9
  1.00, 0.97, 0.72, 0.87, 0.96, 1.00, 1.00, 1.00, 1.00, 1.00, // #10–#19
  1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,                    // #20–#26
  1.00, 1.00, 0.97, 0.83, 0.80, 0.80, 0.92,                    // #27–#33
  0.92, 0.92, 0.90, 0.87, 0.84, 0.77, 0.67,                    // #34–#40
  0.47, 0.47, 0.47, 0.47,                                       // #41–#44
];

function ensureSharedGrenadeAssets(anisotropy = 8) {
  if (_sharedBodyGeo) return;
  const t = ensureTex(anisotropy);

  const H = BASE_H;
  const botY = -H / 2;
  const topY = H / 2;
  _capTopY = topY;
  _capBotY = botY;

  const pts = [];
  for (let i = 0; i < LATHE_POINTS; i++) {
    const frac = i / (LATHE_POINTS - 1);
    const y = botY + frac * (topY - botY);
    const r = Math.max(0.001, _latheRadii[i] * BASE_R);
    pts.push(new THREE.Vector2(r, y));
  }

  _sharedBodyGeo = new THREE.LatheGeometry(pts, SEGMENTS);
  const uvAttr = _sharedBodyGeo.getAttribute("uv");
  const posAttr = _sharedBodyGeo.getAttribute("position");
  for (let i = 0; i < uvAttr.count; i++) {
    uvAttr.setY(i, (posAttr.getY(i) - botY) / (topY - botY));
  }
  uvAttr.needsUpdate = true;

  _sharedBodyMat = new THREE.MeshStandardMaterial({
    map: t.body,
    metalness: 0.3,
    roughness: 0.5,
  });

  const topR = Math.max(0.001, _latheRadii[LATHE_POINTS - 1] * BASE_R);
  _sharedTopGeo = new THREE.CircleGeometry(topR, 32);
  _sharedTopMat = new THREE.MeshStandardMaterial({
    map: t.top,
    metalness: 0.3,
    roughness: 0.5,
  });

  const botR = Math.max(0.001, _latheRadii[0] * BASE_R);
  _sharedBotGeo = new THREE.CircleGeometry(botR, 32);
  _sharedBotMat = new THREE.MeshStandardMaterial({
    map: t.bot,
    metalness: 0.3,
    roughness: 0.5,
  });
}

/** Load textures and build shared geometry/materials before first throw or pickup. */
export function preloadGrenadeAssets(anisotropy = 8) {
  if (_sharedBodyGeo) return Promise.resolve();
  if (_preloadPromise) return _preloadPromise;
  _preloadPromise = Promise.all([
    _texLoader.loadAsync(TEX_PATH + "body_wrap_albedo.png"),
    _texLoader.loadAsync(TEX_PATH + "top_cap_albedo.png"),
    _texLoader.loadAsync(TEX_PATH + "bottom_cap_albedo.png"),
  ])
    .then(([body, top, bot]) => {
      _tex = {
        body: configureTex(body, true, anisotropy),
        top: configureTex(top, true, anisotropy),
        bot: configureTex(bot, true, anisotropy),
      };
      ensureSharedGrenadeAssets(anisotropy);
    })
    .catch((err) => {
      _preloadPromise = null;
      throw err;
    });
  return _preloadPromise;
}

function cloneGrenadeMaterial(source) {
  const mat = source.clone();
  mat.opacity = 1;
  mat.transparent = false;
  mat.depthWrite = true;
  return mat;
}

function cloneGrenadeModel(anisotropy = 8) {
  ensureSharedGrenadeAssets(anisotropy);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(_sharedBodyGeo, cloneGrenadeMaterial(_sharedBodyMat)));

  const topCap = new THREE.Mesh(_sharedTopGeo, cloneGrenadeMaterial(_sharedTopMat));
  topCap.rotation.x = -Math.PI / 2;
  topCap.position.y = _capTopY;
  group.add(topCap);

  const botCap = new THREE.Mesh(_sharedBotGeo, cloneGrenadeMaterial(_sharedBotMat));
  botCap.rotation.x = Math.PI / 2;
  botCap.position.y = _capBotY;
  group.add(botCap);

  return group;
}

export function getGrenadeModel() {
  return cloneGrenadeModel();
}

export function disposeGrenadeModel(group) {
  group.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) mat.dispose?.();
  });
  group.parent?.remove(group);
}

function getProjectileModel() {
  const model = cloneGrenadeModel();
  model.scale.setScalar(3.0);
  return model;
}

/**
 * Grenade projectile, explosion VFX, and trajectory preview GPU warmup.
 * Called from warmupGameGpu once the level is in the scene.
 */
export async function warmupGrenadeThrow(renderer, scene, camera, compileOpts = {}, opts = {}) {
  if (!renderer || !scene || !camera) return;

  const warmInView =
    compileOpts.warmInView ??
    ((object) =>
      compileOpts.compileInPlace?.(object) ??
      Promise.resolve());
  const compileInPlace =
    compileOpts.compileInPlace ?? (() => Promise.resolve());
  const warmPos =
    compileOpts.getWarmupPos ??
    ((slot = 0) => new THREE.Vector3(0, -560 - slot * 5, 0));
  const { floorY, colliders, bounds } = compileOpts.floorY != null ? compileOpts : opts;

  getSoftParticleTexture();
  getFireEmberTexture();
  getLightningLineMaterial();

  const projectile = getProjectileModel();
  projectile.castShadow = true;
  projectile.position.set(0, 0, 0);
  scene.add(projectile);
  await warmInView(projectile);
  scene.remove(projectile);
  disposeGrenadeModel(projectile);

  const pickup = getGrenadeModel();
  pickup.scale.setScalar(2.0);
  pickup.castShadow = true;
  pickup.position.set(0, 0, 0);
  scene.add(pickup);
  await warmInView(pickup);
  scene.remove(pickup);
  disposeGrenadeModel(pickup);

  const warmupExpl = createExplosion(scene, warmPos(40));
  for (const t of [0.02, 0.08, 0.18, 0.28]) {
    updateExplosion(warmupExpl, t, camera.position);
    await compileInPlace(warmupExpl.group);
  }
  disposeExplosion(warmupExpl, scene);

  if (floorY != null && colliders) {
    updateTrajectoryPreview(scene, camera, floorY, colliders, bounds);
    hideTrajectoryPreview();
  }
}

/* ── Trajectory simulation ────────────────────────────────────────── */

function simulateTrajectory(origin, velocity, floorY, colliders, bounds) {
  const pos = origin.clone();
  const vel = velocity.clone();
  const points = [pos.clone()];
  let landed = false;
  let firstLandPos = null;
  let bouncePos = null;
  let bounceCount = 0;

  for (let i = 0; i < MAX_SIM_STEPS; i++) {
    vel.y -= _params.gravity * SIM_STEP;
    pos.x += vel.x * SIM_STEP;
    pos.y += vel.y * SIM_STEP;
    pos.z += vel.z * SIM_STEP;

    // Floor bounce
    if (pos.y <= floorY + GRENADE_RADIUS) {
      pos.y = floorY + GRENADE_RADIUS;
      if (!landed) {
        landed = true;
        firstLandPos = pos.clone();
      } else if (bounceCount === 0) {
        bouncePos = pos.clone();
      }
      bounceCount++;
      vel.y = -vel.y * _params.bounceRestitution;
      vel.x *= (1 - _params.bounceFriction);
      vel.z *= (1 - _params.bounceFriction);

      if (Math.abs(vel.y) < 0.1 && bounceCount > 1) {
        points.push(pos.clone());
        break;
      }
    }

    // Wall collisions
    if (colliders) {
      resolveProjectileAgainstColliders(pos, GRENADE_RADIUS, vel, colliders);
    }

    // Bounds clamping
    if (bounds) {
      if (pos.x < bounds.minX + GRENADE_RADIUS) { pos.x = bounds.minX + GRENADE_RADIUS; vel.x = Math.abs(vel.x) * _params.bounceRestitution; }
      if (pos.x > bounds.maxX - GRENADE_RADIUS) { pos.x = bounds.maxX - GRENADE_RADIUS; vel.x = -Math.abs(vel.x) * _params.bounceRestitution; }
      if (pos.z < bounds.minZ + GRENADE_RADIUS) { pos.z = bounds.minZ + GRENADE_RADIUS; vel.z = Math.abs(vel.z) * _params.bounceRestitution; }
      if (pos.z > bounds.maxZ - GRENADE_RADIUS) { pos.z = bounds.maxZ - GRENADE_RADIUS; vel.z = -Math.abs(vel.z) * _params.bounceRestitution; }
    }

    if (points.length < ARC_MAX_POINTS) points.push(pos.clone());
  }

  const landPos = landed ? pos.clone() : firstLandPos;
  return { points, landPos, bouncePos };
}

/** Rotation-aware wall bounce — matches player collider resolution. */
function resolveProjectileAgainstColliders(position, radius, vel, colliders) {
  if (!colliders?.length) return;
  for (const c of colliders) {
    if (c.active === false) continue;
    if (c.bottomY != null && c.topY != null) {
      const py = position.y;
      if (py - radius > c.topY + 0.02) continue;
      if (py + radius < c.bottomY - 0.02) continue;
    }
    const px = position.x;
    const pz = position.z;
    resolveBoxCollider(position, radius, c);
    const pushX = position.x - px;
    const pushZ = position.z - pz;
    const pushLen = Math.hypot(pushX, pushZ);
    if (pushLen < 1e-6) continue;
    const nx = pushX / pushLen;
    const nz = pushZ / pushLen;
    const vDotN = vel.x * nx + vel.z * nz;
    if (vDotN < 0) {
      const rest = _params.bounceRestitution;
      vel.x -= (1 + rest) * vDotN * nx;
      vel.z -= (1 + rest) * vDotN * nz;
    }
  }
}

/* ── Throw velocity ───────────────────────────────────────────────── */

function computeThrowVelocity(aimDir) {
  const loftRad = (_params.loftAngle * Math.PI) / 180;
  const right = new THREE.Vector3().crossVectors(aimDir, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, aimDir).normalize();
  const dir = aimDir.clone().multiplyScalar(Math.cos(loftRad)).add(up.multiplyScalar(Math.sin(loftRad)));
  return dir.normalize().multiplyScalar(_params.throwSpeed);
}

/* ── Trajectory preview ───────────────────────────────────────────── */

let _previewArc = null;
let _previewLandCircle = null;
let _previewBounceCircle = null;
let _previewGroup = null;

function ensurePreviewGroup(scene) {
  if (!_previewGroup) {
    _previewGroup = new THREE.Group();
    _previewGroup.renderOrder = 200;
    scene.add(_previewGroup);
  }
  return _previewGroup;
}

const _arcMat = new THREE.LineDashedMaterial({
  color: 0x44aaff, dashSize: 0.15, gapSize: 0.08,
  transparent: true, opacity: 0.7, depthTest: false,
});

function makeCircle(radius, color, opacity) {
  const geo = new THREE.RingGeometry(radius * 0.85, radius, 48);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, side: THREE.DoubleSide,
    depthTest: false,
  });
  return new THREE.Mesh(geo, mat);
}

export function updateTrajectoryPreview(scene, camera, floorY, colliders, bounds) {
  const group = ensurePreviewGroup(scene);

  const aimDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  const origin = camera.position.clone();
  const vel = computeThrowVelocity(aimDir);
  const { points, landPos, bouncePos } = simulateTrajectory(origin, vel, floorY, colliders, bounds);

  // Arc line
  if (_previewArc) { group.remove(_previewArc); _previewArc.geometry.dispose(); }
  const arcGeo = new THREE.BufferGeometry().setFromPoints(points);
  _previewArc = new THREE.Line(arcGeo, _arcMat);
  _previewArc.computeLineDistances();
  group.add(_previewArc);

  // Landing circle
  if (_previewLandCircle) { group.remove(_previewLandCircle); _previewLandCircle.geometry.dispose(); _previewLandCircle.material.dispose(); }
  if (landPos) {
    _previewLandCircle = makeCircle(_params.blastRadius, 0x3399ff, 0.25);
    _previewLandCircle.position.set(landPos.x, floorY + 0.02, landPos.z);
    group.add(_previewLandCircle);
  } else {
    _previewLandCircle = null;
  }

  // Bounce circle
  if (_previewBounceCircle) { group.remove(_previewBounceCircle); _previewBounceCircle.geometry.dispose(); _previewBounceCircle.material.dispose(); }
  if (bouncePos) {
    _previewBounceCircle = makeCircle(_params.blastRadius * 0.6, 0x66bbff, 0.15);
    _previewBounceCircle.position.set(bouncePos.x, floorY + 0.02, bouncePos.z);
    group.add(_previewBounceCircle);
  } else {
    _previewBounceCircle = null;
  }
}

export function hideTrajectoryPreview() {
  if (_previewGroup) {
    if (_previewArc) { _previewGroup.remove(_previewArc); _previewArc.geometry.dispose(); _previewArc = null; }
    if (_previewLandCircle) { _previewGroup.remove(_previewLandCircle); _previewLandCircle.geometry.dispose(); _previewLandCircle.material.dispose(); _previewLandCircle = null; }
    if (_previewBounceCircle) { _previewGroup.remove(_previewBounceCircle); _previewBounceCircle.geometry.dispose(); _previewBounceCircle.material.dispose(); _previewBounceCircle = null; }
  }
}

export function disposePreview() {
  hideTrajectoryPreview();
  if (_previewGroup) { _previewGroup.parent?.remove(_previewGroup); _previewGroup = null; }
}

/* ── Grenade spawning ─────────────────────────────────────────────── */

export function spawnGrenade(
  scene,
  camera,
  floorY,
  colliders,
  bounds,
  floorHoles = [],
  type = PROJECTILE_GRENADE
) {
  const aimDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  const origin = camera.position.clone().add(aimDir.clone().multiplyScalar(0.5));
  const vel = computeThrowVelocity(aimDir);

  const mesh = getProjectileModel();
  mesh.castShadow = true;
  mesh.position.copy(origin);
  scene.add(mesh);

  return {
    mesh,
    vel,
    time: 0,
    detonated: false,
    justDetonated: false,
    type,
    floorY,
    colliders,
    bounds,
    floorHoles,
    bounceCount: 0,
    airborne: true,
    countdownPlayed: false,
  };
}

/* ── Per-frame update ─────────────────────────────────────────────── */

export function updateGrenades(grenades, dt, scene, getLiveTargets, applyHitFn, startDeathFn, deathOpts) {
  const floorHoles = deathOpts?.floorHoles ?? [];
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.justDetonated = false;
    g.time += dt;
    if (!g.floorHoles?.length && floorHoles.length) g.floorHoles = floorHoles;

    if (!g.detonated) {
      // Gravity
      g.vel.y -= _params.gravity * dt;

      // Move
      g.mesh.position.x += g.vel.x * dt;
      g.mesh.position.y += g.vel.y * dt;
      g.mesh.position.z += g.vel.z * dt;

      // Spin only while moving
      const speed = Math.sqrt(g.vel.x * g.vel.x + g.vel.y * g.vel.y + g.vel.z * g.vel.z);
      if (speed > 0.5) {
        g.mesh.rotation.x += dt * 8;
        g.mesh.rotation.z += dt * 6;
      }

      const overHole = pointInFloorHole(
        g.mesh.position.x,
        g.mesh.position.z,
        g.floorHoles,
        GRENADE_RADIUS
      );
      if (overHole) beginHoleFall(g);

      // Floor bounce — only resolve a landing while airborne (avoids rest stutter)
      const floorTop = g.floorY + GRENADE_RADIUS;
      if (!g.fallingThroughHole && g.mesh.position.y <= floorTop) {
        const inboundY = g.vel.y;
        g.mesh.position.y = floorTop;

        if (g.airborne && inboundY < -0.15) {
          const impact = Math.min(1, Math.abs(inboundY) / 8);
          g.vel.y = -inboundY * _params.bounceRestitution;
          const slideRetain = Math.max(0, 1 - _params.bounceFriction);
          g.vel.x *= slideRetain;
          g.vel.z *= slideRetain;
          g.bounceCount++;
          deathOpts?.onFloorHit?.(g.mesh.position.clone(), impact);
          if (Math.abs(g.vel.y) < 0.45) {
            g.vel.y = 0;
            g.airborne = false;
          }
        } else {
          g.vel.y = 0;
          g.airborne = false;
        }

        if (!g.airborne) {
          const rollDamp = Math.exp(-(_params.groundRollFriction ?? 16) * dt);
          g.vel.x *= rollDamp;
          g.vel.z *= rollDamp;
          const slideSpeed = Math.hypot(g.vel.x, g.vel.z);
          if (slideSpeed < 0.08) {
            g.vel.x = 0;
            g.vel.z = 0;
          }
        }
      } else if (!g.fallingThroughHole) {
        g.airborne = true;
      }

      if (g.fallingThroughHole) {
        const hole = updateEntityForFloorHole(
          g,
          g.mesh.position.x,
          g.mesh.position.z,
          g.mesh.position.y,
          g.floorY,
          dt,
          g.floorHoles,
          GRENADE_RADIUS
        );
        g.mesh.position.y = hole.y;
        if (hole.remove) {
          scene.remove(g.mesh);
          disposeGrenadeModel(g.mesh);
          grenades.splice(i, 1);
          continue;
        }
      }

      // Wall collisions
      if (g.colliders) {
        resolveProjectileAgainstColliders(
          g.mesh.position,
          GRENADE_RADIUS,
          g.vel,
          g.colliders
        );
      }

      // Bounds
      if (g.bounds) {
        const b = g.bounds;
        if (g.mesh.position.x < b.minX + GRENADE_RADIUS) { g.mesh.position.x = b.minX + GRENADE_RADIUS; g.vel.x = Math.abs(g.vel.x) * _params.bounceRestitution; }
        if (g.mesh.position.x > b.maxX - GRENADE_RADIUS) { g.mesh.position.x = b.maxX - GRENADE_RADIUS; g.vel.x = -Math.abs(g.vel.x) * _params.bounceRestitution; }
        if (g.mesh.position.z < b.minZ + GRENADE_RADIUS) { g.mesh.position.z = b.minZ + GRENADE_RADIUS; g.vel.z = Math.abs(g.vel.z) * _params.bounceRestitution; }
        if (g.mesh.position.z > b.maxZ - GRENADE_RADIUS) { g.mesh.position.z = b.maxZ - GRENADE_RADIUS; g.vel.z = -Math.abs(g.vel.z) * _params.bounceRestitution; }
      }

      // Fuse
      const clipDur = deathOpts?.countdownDuration ?? 0;
      if (
        !g.countdownPlayed &&
        clipDur > 0 &&
        _params.fuseTime > 0.05
      ) {
        const lead = Math.min(clipDur, Math.max(0.12, _params.fuseTime - 0.05));
        const startAt = _params.fuseTime - lead;
        if (g.time >= startAt) {
          g.countdownPlayed = true;
          const playbackRate = THREE.MathUtils.clamp(clipDur / lead, 0.85, 2.5);
          deathOpts?.onCountdown?.(g.mesh.position.clone(), playbackRate);
        }
      }

      if (g.time >= _params.fuseTime) {
        g.detonated = true;
        g.justDetonated = true;
        g.detonateTime = g.time;
        g.explosionPos = g.mesh.position.clone();
        deathOpts?.onExplode?.(g.explosionPos.clone());

        const targets = getLiveTargets();
        const isFlashbang = g.type === PROJECTILE_FLASHBANG;

        if (isFlashbang) {
          const simTime = deathOpts?.simTime ?? 0;
          const blindRadius = _params.flashbangBlindRadius ?? 18;
          for (const mesh of targets) {
            const dist = mesh.position.distanceTo(g.explosionPos);
            if (dist < blindRadius) {
              deathOpts?.onTargetBlinded?.(mesh, simTime);
            }
          }
          if (deathOpts?.canFlashbangBlindPlayer?.(g.explosionPos)) {
            deathOpts?.onPlayerBlinded?.();
          }
          g.explosion = createExplosion(scene, g.explosionPos, {
            onGround: !g.airborne,
            noParticles: true,
          });
        } else {
          // Area damage
          for (const mesh of targets) {
            const dist = mesh.position.distanceTo(g.explosionPos);
            if (dist < _params.blastRadius) {
              const falloff = 1 - Math.pow(dist / _params.blastRadius, _params.falloffPower);
              const damage = _params.maxDamage * falloff;
              const fakeDir = mesh.position.clone().sub(g.explosionPos).normalize();
              const result = applyHitFn(mesh, g.explosionPos, fakeDir, damage);
              if (result?.killed) {
                startDeathFn(mesh, fakeDir, {
                  ...deathOpts,
                  hitZone: "grenade",
                  knockbackMul: THREE.MathUtils.lerp(0.85, 1.35, falloff),
                  blastFalloff: falloff,
                });
              }
            }
          }

          // Create explosion VFX
          g.explosion = createExplosion(scene, g.explosionPos, { onGround: !g.airborne });
        }

        // Remove grenade mesh
        scene.remove(g.mesh);
        disposeGrenadeModel(g.mesh);
      }
    } else {
      // Update explosion
      if (g.explosion) {
        const since = g.time - g.detonateTime;
        const alive = updateExplosion(g.explosion, since, deathOpts?.viewerPos);
        if (!alive) {
          disposeExplosion(g.explosion, scene);
          g.explosion = null;
          grenades.splice(i, 1);
        }
      } else {
        grenades.splice(i, 1);
      }
    }
  }
}

/* ── Explosion VFX ────────────────────────────────────────────────── */

const SPARK_COUNT_DEFAULT = 600;
const DEBRIS_COUNT_DEFAULT = 180;
const EMBER_COUNT_DEFAULT = 400;

/** TEMP preview — multiplies slider particle counts at detonation. Set to 1 to disable. */
const PARTICLE_COUNT_PREVIEW_MUL = 10;

function previewParticleCount(count) {
  return Math.max(0, Math.round(count * PARTICLE_COUNT_PREVIEW_MUL));
}

function getVfx() {
  return _params.explosionVfx ?? DEFAULT_EXPLOSION_VFX;
}

let _particleTex = null;
let _emberTex = null;

function getSoftParticleTexture() {
  if (_particleTex) return _particleTex;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.2, "rgba(255,248,210,0.9)");
  grad.addColorStop(0.45, "rgba(255,190,90,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  _particleTex = new THREE.CanvasTexture(canvas);
  _particleTex.colorSpace = THREE.SRGBColorSpace;
  return _particleTex;
}

/** Tighter, opaque core — reads as solid fire chunks rather than soft glow. */
function getFireEmberTexture() {
  if (_emberTex) return _emberTex;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const cx = size / 2;
  const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
  grad.addColorStop(0, "rgba(255,255,210,1)");
  grad.addColorStop(0.14, "rgba(255,190,80,1)");
  grad.addColorStop(0.35, "rgba(255,145,45,0.98)");
  grad.addColorStop(0.55, "rgba(255,110,35,0.88)");
  grad.addColorStop(0.75, "rgba(255,85,30,0.55)");
  grad.addColorStop(1, "rgba(255,70,25,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  _emberTex = new THREE.CanvasTexture(canvas);
  _emberTex.colorSpace = THREE.SRGBColorSpace;
  return _emberTex;
}

function makeGlowRing(innerRatio, color, opacity) {
  const geo = new THREE.RingGeometry(innerRatio, 1, 72);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 6;
  return { mesh, geo, mat };
}

function makeSoftShockDome(opacity, coreStrength) {
  const geo = new THREE.SphereGeometry(1, 64, 36, 0, Math.PI * 2, 0, Math.PI / 2);
  const uniforms = {
    uColorOuter: { value: new THREE.Color(0x55ccff) },
    uColorInner: { value: new THREE.Color(0xccf4ff) },
    uOpacity: { value: opacity },
    uCoreStrength: { value: coreStrength },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vLocalPos;
      void main() {
        vLocalPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorOuter;
      uniform vec3 uColorInner;
      uniform float uOpacity;
      uniform float uCoreStrength;
      varying vec3 vLocalPos;

      void main() {
        float height = clamp(vLocalPos.y, 0.0, 1.0);
        float radial = length(vLocalPos.xz);

        // Wide blurred haze envelope
        float haze = 1.0 - smoothstep(0.15, 1.12, radial);
        haze *= 1.0 - smoothstep(0.45, 1.0, height);
        haze = pow(max(haze, 0.0), 0.35);

        // Mid shell with soft rim
        float shell = 1.0 - smoothstep(0.32, 1.0, radial);
        shell *= smoothstep(0.0, 0.08, height) * (1.0 - smoothstep(0.55, 1.0, height));
        shell = pow(max(shell, 0.0), 0.65);

        // Bright core at the blast base
        float core = exp(-radial * radial * 2.6) * exp(-height * 3.2);

        float alpha = (haze * 0.48 + shell * 0.62 + core * uCoreStrength * 0.5) * uOpacity;
        alpha = clamp(alpha, 0.0, 1.0);

        vec3 col = mix(uColorOuter, uColorInner, clamp(core * 2.2, 0.0, 1.0));
        gl_FragColor = vec4(col * alpha, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 5;
  return { mesh, geo, mat, uniforms };
}

const _flashLightHot = new THREE.Color(0xfff8ee);
const _flashLightA = new THREE.Color(0xfff4dd);
const _flashLightB = new THREE.Color(0x66aaff);
const _emberYellow = new THREE.Color(1, 0.97, 0.58);
const _emberOrange = new THREE.Color(1, 0.72, 0.22);
const _emberDeepOrange = new THREE.Color(1, 0.52, 0.14);
const _emberScratch = new THREE.Color();

const EMBER_SIZE_TIERS = [
  { share: 0.34, sizeMul: 0.55 },
  { share: 0.42, sizeMul: 1.0 },
  { share: 0.24, sizeMul: 1.45 },
];

const _burstDir = new THREE.Vector3();
const _lightningPerpA = new THREE.Vector3();
const _lightningPerpB = new THREE.Vector3();
const _lightningPoint = new THREE.Vector3();
const _lightningBoltHot = new THREE.Color(0xe8fbff);
const _lightningBoltMid = new THREE.Color(0x55bbff);
const _lightningBoltCool = new THREE.Color(0x1144cc);

/** 0 = full sphere, 1 = upward dome bias (legacy look). */
function sampleExplosionDirection(hemisphereStrength = 1) {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const domeY = Math.abs(cosPhi) * 0.55 + Math.random() * 0.45;
  const y = THREE.MathUtils.lerp(cosPhi, domeY, hemisphereStrength);
  return _burstDir.set(sinPhi * Math.cos(theta), y, sinPhi * Math.sin(theta)).normalize();
}

/** Per-particle distance jitter — skew < 1 yields more long-distance outliers. */
function randomTravelMul(min, max, skew = 0.52) {
  return min + Math.pow(Math.random(), skew) * (max - min);
}

const SPARK_BURST_BASE = {
  hemisphereStrength: 0.2,
  travelJitter: [0.35, 2.2],
  lifeJitter: [0.55, 1.25],
};
const EMBER_BURST_BASE = {
  hemisphereStrength: 0.75,
  travelJitter: [0.4, 1.85],
  lifeJitter: [0.6, 1.2],
};
const DEBRIS_BURST_BASE = {
  hemisphereStrength: 0.55,
  travelJitter: [0.4, 1.9],
  lifeJitter: [0.55, 1.15],
};

/** Scale travel/life jitter and dome bias from particleSpread (0.15 tight → 1 wide). */
function scaleBurstOpts(base, spread, onGround = true) {
  const s = THREE.MathUtils.clamp(spread ?? 0.5, 0.15, 1);
  const tightHemi = Math.min(1, base.hemisphereStrength + 0.3);
  let hemisphereStrength = onGround
    ? THREE.MathUtils.lerp(tightHemi, base.hemisphereStrength, s)
    : 0;
  return {
    hemisphereStrength,
    travelJitter: [
      THREE.MathUtils.lerp(0.5, base.travelJitter[0], s),
      THREE.MathUtils.lerp(0.9, base.travelJitter[1], s),
    ],
    lifeJitter: [
      THREE.MathUtils.lerp(0.65, base.lifeJitter[0], s),
      THREE.MathUtils.lerp(0.85, base.lifeJitter[1], s),
    ],
  };
}

/** Fire embers: per-particle colour from yellow through orange to red-orange. */
function initEmberCloud(count, spread, speedMin, speedMax, lifeRange = [0.55, 1.25], opts = {}) {
  const {
    hemisphereStrength = 1,
    travelJitter = [0.35, 2.0],
    lifeJitter = [0.55, 1.35],
  } = opts;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const lifetimes = new Float32Array(count);
  const [lifeMin, lifeMax] = lifeRange;

  for (let i = 0; i < count; i++) {
    const dir = sampleExplosionDirection(hemisphereStrength);
    const speed =
      THREE.MathUtils.lerp(speedMin, speedMax, Math.random()) *
      randomTravelMul(travelJitter[0], travelJitter[1]);
    velocities[i * 3] = dir.x * speed * spread;
    velocities[i * 3 + 1] = dir.y * speed * spread;
    velocities[i * 3 + 2] = dir.z * speed * spread;

    lifetimes[i] =
      (lifeMin + Math.random() * (lifeMax - lifeMin)) *
      randomTravelMul(lifeJitter[0], lifeJitter[1], 0.65);

    const heat = Math.random();
    if (heat < 0.42) {
      _emberScratch.copy(_emberYellow).lerp(_emberOrange, heat / 0.42);
    } else {
      _emberScratch.copy(_emberOrange).lerp(_emberDeepOrange, (heat - 0.42) / 0.58);
    }
    const bright = 0.94 + Math.random() * 0.06;
    colors[i * 3] = _emberScratch.r * bright;
    colors[i * 3 + 1] = _emberScratch.g * bright;
    colors[i * 3 + 2] = _emberScratch.b * bright;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  return { geo, positions, colors, velocities, lifetimes };
}

function createEmberLayers(totalCount, spread, speedMin, speedMax, baseSize, lifeRange, burstOpts) {
  const layers = [];
  let assigned = 0;

  for (let t = 0; t < EMBER_SIZE_TIERS.length; t += 1) {
    const tier = EMBER_SIZE_TIERS[t];
    const count =
      t === EMBER_SIZE_TIERS.length - 1
        ? totalCount - assigned
        : Math.round(totalCount * tier.share);
    assigned += count;
    if (count <= 0) continue;

    const cloud = initEmberCloud(count, spread, speedMin, speedMax, lifeRange, burstOpts);
    layers.push(
      createParticlePoints(cloud, baseSize * tier.sizeMul * 1.08, 1, {
        additive: false,
        map: getFireEmberTexture(),
        depthWrite: true,
        alphaTest: 0.06,
        fadeScale: 1.05,
      })
    );
  }

  return layers;
}

function initParticleCloud(
  count,
  spread,
  speedMin,
  speedMax,
  palette,
  lifeRange = [0.35, 1.1],
  opts = {}
) {
  const {
    hemisphereStrength = 1,
    travelJitter = [0.35, 2.0],
    lifeJitter = [0.55, 1.35],
  } = opts;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const lifetimes = new Float32Array(count);
  const sizes = new Float32Array(count);
  const [lifeMin, lifeMax] = lifeRange;

  for (let i = 0; i < count; i++) {
    const dir = sampleExplosionDirection(hemisphereStrength);
    const speed =
      THREE.MathUtils.lerp(speedMin, speedMax, Math.random()) *
      randomTravelMul(travelJitter[0], travelJitter[1]);
    velocities[i * 3] = dir.x * speed * spread;
    velocities[i * 3 + 1] = dir.y * speed * spread;
    velocities[i * 3 + 2] = dir.z * speed * spread;

    lifetimes[i] =
      (lifeMin + Math.random() * (lifeMax - lifeMin)) *
      randomTravelMul(lifeJitter[0], lifeJitter[1], 0.65);
    sizes[i] = 0.035 + Math.random() * 0.09;

    const col = palette[Math.floor(Math.random() * palette.length)];
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  return { geo, positions, colors, velocities, lifetimes, sizes };
}

function createParticlePoints(cloud, size, opacity, opts = {}) {
  const {
    additive = true,
    map = getSoftParticleTexture(),
    depthWrite = false,
    alphaTest = 0,
    fadeScale = 0.85,
  } = opts;
  const mat = new THREE.PointsMaterial({
    size,
    map,
    transparent: true,
    opacity,
    depthWrite,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexColors: true,
    sizeAttenuation: true,
    alphaTest,
  });
  const points = new THREE.Points(cloud.geo, mat);
  points.renderOrder = 8;
  return { points, mat, fadeScale, baseSize: size, ...cloud };
}

const _explosionWorldPos = new THREE.Vector3();

/** Scale particle size from how far the viewer is from the blast centre. */
function getViewerParticleSizeMul(viewerDist, blastRadius) {
  const ref = Math.max(blastRadius * 1.35, 2.0);
  return THREE.MathUtils.clamp(ref / (viewerDist + ref * 0.35), 0.28, 2.6);
}

function applyViewerParticleScale(expl, viewerPos) {
  if (!viewerPos || !expl) return;
  expl.group.getWorldPosition(_explosionWorldPos);
  const mul = getViewerParticleSizeMul(
    viewerPos.distanceTo(_explosionWorldPos),
    expl.blast
  );

  const scaleCloud = (cloud) => {
    if (!cloud?.mat || cloud.baseSize == null) return;
    cloud.mat.size = cloud.baseSize * mul;
  };

  scaleCloud(expl.sparks);
  scaleCloud(expl.debris);
  for (const layer of expl.emberLayers ?? []) {
    scaleCloud(layer);
  }
}

function updateParticleCloud(cloud, elapsed, gravity, drag, duration, flashBoost = 0) {
  const { positions, velocities, lifetimes } = cloud;
  const count = lifetimes.length;
  let anyAlive = false;
  const dragFactor = Math.exp(-drag * elapsed);
  const fadeScale = cloud.fadeScale ?? 0.85;

  for (let i = 0; i < count; i += 1) {
    const life = lifetimes[i];
    if (elapsed > life) {
      positions[i * 3 + 1] = -999;
      continue;
    }
    anyAlive = true;
    const t = elapsed;
    positions[i * 3] = velocities[i * 3] * t * dragFactor;
    positions[i * 3 + 1] =
      velocities[i * 3 + 1] * t * dragFactor - 0.5 * gravity * t * t;
    positions[i * 3 + 2] = velocities[i * 3 + 2] * t * dragFactor;
  }

  cloud.geo.attributes.position.needsUpdate = true;
  const op = Math.max(0, 1 - elapsed / (duration * fadeScale)) * (1 + flashBoost);
  if (cloud.mat.uniforms?.opacity) {
    cloud.mat.uniforms.opacity.value = op;
  } else {
    cloud.mat.opacity = op;
  }
  return anyAlive;
}

function getExplosionFlashBoost(vfx, elapsed) {
  if (!vfx.flash) return 0;
  const flashT = THREE.MathUtils.clamp(elapsed / vfx.flashDuration, 0, 1);
  return Math.pow(1 - flashT, 2) * (1.4 + vfx.flashScaleMul * 2.2);
}

function updateExplosionLight(expl, vfx, elapsed) {
  if (!expl.light) return;

  const peak = vfx.lightIntensity;
  const blast = expl.blast;
  let flashIntensity = 0;
  let sustainIntensity = 0;

  if (vfx.flash) {
    const flashT = THREE.MathUtils.clamp(elapsed / vfx.flashDuration, 0, 1);
    const flashPeak = peak * THREE.MathUtils.lerp(2.8, 7.5, vfx.flashScaleMul);
    flashIntensity = flashPeak * Math.pow(1 - flashT, 2.2);
    expl.light.distance = blast * THREE.MathUtils.lerp(3.2, 5.5, vfx.flashScaleMul);
  }

  const lightDur = Math.max(vfx.lightDuration ?? 0.32, 0.04);
  if (vfx.light && elapsed < lightDur) {
    const lightT = THREE.MathUtils.clamp(elapsed / lightDur, 0, 1);
    sustainIntensity = peak * Math.pow(1 - lightT, 2.1);
    if (!vfx.flash) {
      expl.light.distance = blast * 3.2;
    }
  }

  expl.light.intensity = flashIntensity + sustainIntensity;

  const blueMix = THREE.MathUtils.clamp(vfx.lightBlueMix ?? 0.85, 0, 1);
  if (vfx.flash && elapsed < vfx.flashDuration * 1.2) {
    const flashT = THREE.MathUtils.clamp(elapsed / vfx.flashDuration, 0, 1);
    expl.light.color.copy(_flashLightHot).lerp(_flashLightA, flashT);
  } else if (sustainIntensity > 0.001) {
    expl.light.color.copy(_flashLightA).lerp(_flashLightB, blueMix);
  }
}

function pickLightningPerpAxes(dir) {
  _lightningPerpA.set(0, 1, 0);
  if (Math.abs(dir.y) > 0.92) _lightningPerpA.set(1, 0, 0);
  _lightningPerpA.crossVectors(_lightningPerpA, dir).normalize();
  _lightningPerpB.crossVectors(dir, _lightningPerpA).normalize();
}

function sampleRandomLightningDirection() {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  const sinPhi = Math.sin(phi);
  return new THREE.Vector3(
    sinPhi * Math.cos(theta),
    Math.cos(phi),
    sinPhi * Math.sin(theta)
  );
}

/** Per-segment sharp kinks — alternating zigzags, baked once per bolt. */
function createRandomBoltKinks(segments) {
  const kinkA = new Float32Array(segments + 1);
  const kinkB = new Float32Array(segments + 1);
  let prevA = 0;
  for (let i = 1; i <= segments; i += 1) {
    const flip = Math.random() < 0.72 ? -prevA : (Math.random() - 0.5) * 2.2;
    kinkA[i] = flip + (Math.random() - 0.5) * 1.1;
    kinkB[i] = (Math.random() - 0.5) * 1.7;
    prevA = kinkA[i];
  }
  return { kinkA, kinkB };
}

/** Zigzag bolt from blast centre — each segment steps outward then kinks sideways. */
function buildLightningBoltPoints(bolt, growT) {
  const { dir, length, segments, jag, kinkA, kinkB, points } = bolt;
  pickLightningPerpAxes(dir);

  points[0] = 0;
  points[1] = 0;
  points[2] = 0;
  _lightningPoint.set(0, 0, 0);

  const stepOut = length / segments;
  const stepJag = jag * length / segments;

  for (let i = 1; i <= segments; i += 1) {
    _lightningPoint.addScaledVector(dir, stepOut);
    _lightningPoint.addScaledVector(_lightningPerpA, kinkA[i] * stepJag);
    _lightningPoint.addScaledVector(_lightningPerpB, kinkB[i] * stepJag);

    const idx = i * 3;
    points[idx] = _lightningPoint.x * growT;
    points[idx + 1] = _lightningPoint.y * growT;
    points[idx + 2] = _lightningPoint.z * growT;
  }
}

/** Screen-space line width in CSS pixels (legacy world-unit values map to ~4px). */
function getLightningLineWidth(vfx) {
  const value = vfx.lightningThickness ?? 4;
  if (value <= 0.25) return 4;
  return THREE.MathUtils.clamp(value, 1, 8);
}

let _lightningLineMat = null;

/** Shared LineMaterial — kept alive after warmup so throws don't recompile shaders. */
export function getLightningLineMaterial() {
  if (!_lightningLineMat) {
    _lightningLineMat = new LineMaterial({
      linewidth: 4,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      toneMapped: false,
      worldUnits: false,
      blending: THREE.AdditiveBlending,
    });
  }
  return _lightningLineMat;
}

function buildLightningBoltColors(segments) {
  const colors = new Float32Array((segments + 1) * 3);
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    _emberScratch
      .copy(_lightningBoltHot)
      .lerp(_lightningBoltMid, t * 0.35)
      .lerp(_lightningBoltCool, t * t * 0.65);
    const idx = i * 3;
    colors[idx] = _emberScratch.r;
    colors[idx + 1] = _emberScratch.g;
    colors[idx + 2] = _emberScratch.b;
  }
  return colors;
}

function createLightningBolt(spec, group) {
  const mat = getLightningLineMaterial();
  const geo = new LineGeometry();
  geo.setColors(buildLightningBoltColors(spec.segments));
  const line = new Line2(geo, mat);
  line.position.set(0, 0, 0);
  line.frustumCulled = false;
  line.renderOrder = 12;
  group.add(line);
  return {
    ...spec,
    line,
    geo,
    points: new Float32Array((spec.segments + 1) * 3),
  };
}

function createLightningZaps(blast, vfx) {
  const group = new THREE.Group();
  group.position.set(0, blast * 0.1, 0);
  const bolts = [];
  const boltCount = Math.max(3, Math.round(vfx.lightningBoltCount ?? 10));
  const baseSegments = Math.max(6, Math.round(vfx.lightningSegments ?? 11));
  const length = blast * (vfx.lightningLengthMul ?? 1.05);
  const baseJag = vfx.lightningJag ?? 0.42;

  for (let b = 0; b < boltCount; b += 1) {
    const segments = Math.max(8, baseSegments + Math.floor(Math.random() * 5) - 2);
    const { kinkA, kinkB } = createRandomBoltKinks(segments);
    bolts.push(
      createLightningBolt(
        {
          dir: sampleRandomLightningDirection(),
          length: length * (0.82 + Math.random() * 0.28),
          segments,
          jag: baseJag * (0.85 + Math.random() * 0.35),
          kinkA,
          kinkB,
        },
        group
      )
    );
  }

  return { group, bolts, blast };
}

function updateLightningBoltLine(bolt) {
  bolt.geo.setPositions(bolt.points);
}

function updateLightningZaps(lightning, elapsed, vfx) {
  const dur = Math.max(vfx.lightningDuration ?? 0.32, 0.05);
  const growTime = Math.max(vfx.lightningGrowTime ?? 0.05, 0.01);
  if (elapsed > dur) {
    lightning.group.visible = false;
    return;
  }
  lightning.group.visible = true;

  const growT = THREE.MathUtils.clamp(elapsed / growTime, 0, 1);
  const fadeStart = dur * 0.4;
  const fadeT =
    elapsed <= fadeStart
      ? 1
      : Math.max(0, 1 - (elapsed - fadeStart) / (dur - fadeStart));
  const flicker =
    elapsed < growTime ? 1 : 0.62 + Math.random() * 0.38;
  const opacity = fadeT * flicker * (vfx.lightningOpacity ?? 1);
  const mat = getLightningLineMaterial();
  mat.linewidth = getLightningLineWidth(vfx);
  mat.opacity = opacity;

  for (const bolt of lightning.bolts) {
    buildLightningBoltPoints(bolt, growT);
    updateLightningBoltLine(bolt);
  }
}

function disposeLightningZaps(lightning) {
  if (!lightning) return;
  for (const bolt of lightning.bolts) {
    bolt.geo.dispose();
  }
}

const EXPLOSION_POOL_MAX = 2;
const _explosionPool = [];

function resolveExplosionVfx(opts = {}) {
  const base = getVfx();
  if (opts.noParticles) {
    return { ...base, sparks: false, embers: false, debris: false };
  }
  return base;
}

function resetExplosionForReuse(expl) {
  const vfx = expl.vfx ?? getVfx();
  expl.group.visible = true;
  if (expl.light) expl.light.intensity = 0;

  if (expl.lightning) {
    disposeLightningZaps(expl.lightning);
    expl.lightning.group.parent?.remove(expl.lightning.group);
    expl.lightning = null;
  }
  if (vfx.lightning) {
    expl.lightning = createLightningZaps(expl.blast, vfx);
    expl.group.add(expl.lightning.group);
  }

  const resetCloud = (cloud, visible) => {
    if (!cloud?.positions) return;
    cloud.positions.fill(0);
    cloud.geo.attributes.position.needsUpdate = true;
    cloud.mat.opacity = 1;
    if (cloud.points) cloud.points.visible = visible;
  };
  resetCloud(expl.sparks, !!vfx.sparks);
  resetCloud(expl.debris, !!vfx.debris);
  for (const layer of expl.emberLayers ?? []) {
    resetCloud(layer, !!vfx.embers);
  }

  updateExplosion(expl, 0);
}

function destroyExplosion(expl) {
  for (const ring of [expl.shockPrimary, expl.shockSecondary, expl.shockTertiary]) {
    if (!ring) continue;
    ring.geo.dispose();
    ring.mat.dispose();
  }
  if (expl.shockDome) {
    expl.shockDome.geo.dispose();
    expl.shockDome.mat.dispose();
  }
  for (const cloud of [expl.sparks, expl.debris]) {
    if (!cloud) continue;
    cloud.geo.dispose();
    cloud.mat.dispose();
  }
  for (const layer of expl.emberLayers ?? []) {
    layer.geo.dispose();
    layer.mat.dispose();
  }
  disposeLightningZaps(expl.lightning);
}

function createExplosion(scene, pos, opts = {}) {
  const vfx = resolveExplosionVfx(opts);
  const pooled = _explosionPool.pop();
  if (pooled) {
    pooled.vfx = vfx;
    pooled.group.position.copy(pos);
    if (!pooled.group.parent) scene.add(pooled.group);
    resetExplosionForReuse(pooled);
    return pooled;
  }
  return buildExplosion(scene, pos, opts, vfx);
}

function buildExplosion(scene, pos, opts = {}, vfx = resolveExplosionVfx(opts)) {
  const { onGround = true } = opts;
  const group = new THREE.Group();
  group.position.copy(pos);
  scene.add(group);

  const blast = _params.blastRadius;

  let shockPrimary = null;
  let shockSecondary = null;
  let shockTertiary = null;
  if (vfx.shockRings) {
    shockPrimary = makeGlowRing(0.82, 0x55ccff, vfx.ringOpacity);
    shockSecondary = makeGlowRing(0.88, 0x99eeff, vfx.ringOpacity * 0.68);
    shockTertiary = makeGlowRing(0.9, 0x2288ff, vfx.ringOpacity * 0.47);
    group.add(shockPrimary.mesh, shockSecondary.mesh, shockTertiary.mesh);
  }

  let shockDome = null;
  if (vfx.shockDome) {
    shockDome = makeSoftShockDome(vfx.domeOpacity, vfx.domeCoreOpacity);
    group.add(shockDome.mesh);
  }

  const sparkPalette = [
    new THREE.Color(1, 1, 1),
    new THREE.Color(1, 0.95, 0.7),
    new THREE.Color(1, 0.72, 0.35),
    new THREE.Color(0.85, 0.92, 1),
  ];
  const spread = vfx.particleSpread ?? 0.5;
  const burstOpts = (base) => scaleBurstOpts(base, spread, onGround);
  let emberLayers = null;
  if (vfx.embers) {
    emberLayers = createEmberLayers(
      previewParticleCount(vfx.emberCount ?? EMBER_COUNT_DEFAULT),
      1,
      2.2,
      6.5,
      vfx.emberSize,
      [0.55, 1.25],
      burstOpts(EMBER_BURST_BASE)
    );
    for (const layer of emberLayers) {
      group.add(layer.points);
    }
  }

  const debrisPalette = [
    new THREE.Color(0.18, 0.14, 0.1),
    new THREE.Color(0.28, 0.22, 0.16),
    new THREE.Color(0.12, 0.1, 0.08),
    new THREE.Color(0.35, 0.28, 0.2),
  ];

  let sparks = null;
  if (vfx.sparks) {
    sparks = createParticlePoints(
      initParticleCloud(
        previewParticleCount(vfx.sparkCount ?? SPARK_COUNT_DEFAULT),
        1,
        4.5,
        11,
        sparkPalette,
        undefined,
        scaleBurstOpts(SPARK_BURST_BASE, spread, onGround)
      ),
      vfx.sparkSize,
      1,
      { additive: true }
    );
    group.add(sparks.points);
  }

  let debris = null;
  if (vfx.debris) {
    debris = createParticlePoints(
      initParticleCloud(
        previewParticleCount(vfx.debrisCount ?? DEBRIS_COUNT_DEFAULT),
        1,
        2,
        6.5,
        debrisPalette,
        undefined,
        scaleBurstOpts(DEBRIS_BURST_BASE, spread, onGround)
      ),
      vfx.debrisSize,
      0.9,
      { additive: false }
    );
    group.add(debris.points);
  }

  let light = null;
  if (vfx.flash || vfx.light) {
    light = new THREE.PointLight(
      0xfff6e8,
      0,
      blast * THREE.MathUtils.lerp(3.2, 5.5, vfx.flash ? vfx.flashScaleMul : 0)
    );
    light.position.set(0, blast * 0.12, 0);
    light.decay = 2;
    group.add(light);
  }

  let lightning = null;
  if (vfx.lightning) {
    lightning = createLightningZaps(blast, vfx);
    group.add(lightning.group);
  }

  return {
    group,
    shockPrimary,
    shockSecondary,
    shockTertiary,
    shockDome,
    sparks,
    emberLayers,
    debris,
    light,
    lightning,
    blast,
    vfx,
  };
}

function updateShockwaveRing(ring, elapsed, start, duration, maxScale, opacityPeak) {
  const local = elapsed - start;
  if (local < 0 || local > duration) {
    ring.mesh.visible = false;
    return;
  }
  ring.mesh.visible = true;
  const t = local / duration;
  const ease = 1 - Math.pow(1 - t, 3);
  const scale = maxScale * ease;
  ring.mesh.scale.set(scale, scale, scale);
  ring.mat.opacity = opacityPeak * (1 - t) * (1 - t * 0.35);
}

function updateExplosion(expl, elapsed, viewerPos = null) {
  const vfx = expl.vfx ?? getVfx();
  const duration = vfx.duration;
  if (elapsed > duration) return false;

  applyViewerParticleScale(expl, viewerPos);

  const blast = expl.blast;
  const flashBoost = getExplosionFlashBoost(vfx, elapsed);

  const ringScale = vfx.ringScaleMul;
  const ringDur = vfx.ringDuration;
  if (expl.shockPrimary) {
    updateShockwaveRing(
      expl.shockPrimary,
      elapsed,
      0,
      ringDur,
      blast * 1.15 * ringScale,
      vfx.ringOpacity
    );
  }
  if (expl.shockSecondary) {
    updateShockwaveRing(
      expl.shockSecondary,
      elapsed,
      vfx.ring2Delay,
      ringDur + 0.06,
      blast * 1.35 * ringScale,
      vfx.ringOpacity * 0.74
    );
  }
  if (expl.shockTertiary) {
    updateShockwaveRing(
      expl.shockTertiary,
      elapsed,
      vfx.ring3Delay,
      ringDur + 0.13,
      blast * 1.55 * ringScale,
      vfx.ringOpacity * 0.47
    );
  }

  if (expl.shockDome) {
    const domeT = THREE.MathUtils.clamp(elapsed / vfx.domeDuration, 0, 1);
    const domeEase = 1 - Math.pow(1 - domeT, 2.5);
    const domeScale = blast * vfx.domeScaleMul * domeEase;
    expl.shockDome.mesh.visible = domeT < 1;
    expl.shockDome.mesh.scale.setScalar(domeScale);
    expl.shockDome.uniforms.uOpacity.value = vfx.domeOpacity * (1 - domeT);
    expl.shockDome.uniforms.uCoreStrength.value =
      vfx.domeCoreOpacity * (1 - domeT * domeT);
  }

  if (expl.sparks && vfx.sparks) {
    const alive = updateParticleCloud(
      expl.sparks,
      elapsed,
      vfx.sparkGravity,
      0.9,
      duration,
      flashBoost
    );
    expl.sparks.points.visible = alive;
  } else if (expl.sparks) {
    expl.sparks.points.visible = false;
  }
  if (expl.emberLayers && vfx.embers) {
    for (const layer of expl.emberLayers) {
      const alive = updateParticleCloud(
        layer,
        elapsed,
        vfx.emberGravity,
        0.92,
        duration,
        flashBoost
      );
      layer.points.visible = alive;
    }
  } else if (expl.emberLayers) {
    for (const layer of expl.emberLayers) {
      if (layer.points) layer.points.visible = false;
    }
  }
  if (expl.debris && vfx.debris) {
    const alive = updateParticleCloud(
      expl.debris,
      elapsed,
      vfx.debrisGravity,
      0.86,
      duration,
      flashBoost
    );
    expl.debris.points.visible = alive;
  } else if (expl.debris) {
    expl.debris.points.visible = false;
  }

  updateExplosionLight(expl, vfx, elapsed);

  if (expl.lightning) {
    updateLightningZaps(expl.lightning, elapsed, vfx, viewerPos);
  }

  return elapsed < duration;
}

function disposeExplosion(expl, scene) {
  if (!expl) return;
  scene.remove(expl.group);
  expl.group.visible = false;
  if (_explosionPool.length < EXPLOSION_POOL_MAX) {
    _explosionPool.push(expl);
    return;
  }
  destroyExplosion(expl);
}

export function clearExplosionPool() {
  while (_explosionPool.length) destroyExplosion(_explosionPool.pop());
}

/* ── Screen shake ─────────────────────────────────────────────────── */

let _shakeIntensity = 0;
let _shakeTime = 0;
const SHAKE_DURATION = 0.35;
const SHAKE_DECAY = 4;

export function triggerScreenShake(playerPos, explosionPos) {
  const dist = playerPos.distanceTo(explosionPos);
  const maxDist = _params.blastRadius * 3;
  if (dist > maxDist) return;
  _shakeIntensity = Math.max(_shakeIntensity, 0.03 * (1 - dist / maxDist));
  _shakeTime = 0;
}

export function applyScreenShake(camera, dt) {
  if (_shakeIntensity <= 0.0001) return;
  _shakeTime += dt;
  const decay = Math.exp(-SHAKE_DECAY * _shakeTime);
  const amp = _shakeIntensity * decay;
  camera.position.x += Math.sin(_shakeTime * 60) * amp;
  camera.position.y += Math.cos(_shakeTime * 45) * amp * 0.7;
  if (_shakeTime > SHAKE_DURATION) {
    _shakeIntensity = 0;
    _shakeTime = 0;
  }
}

/* ── Grenade pickup drops ─────────────────────────────────────────── */

const GREN_DROP_GRAVITY = 12;
const GREN_DROP_BOUNCE = 0.45;
const GREN_DROP_FRICTION = 3;
const GREN_DROP_COLLECT_RADIUS = 1.2;
const GREN_DROP_LIFETIME = 20;
const GREN_DROP_FADE = 1.5;
const GREN_DROP_SPIN = 2.0;
const GREN_DROP_BOB_SPEED = 2.0;
const GREN_DROP_BOB_HEIGHT = 0.06;
const GREN_DROP_SETTLE_Y = 0.07;

export function spawnGrenadeDrop(scene, position, floorY) {
  const mesh = cloneGrenadeModel();
  mesh.scale.setScalar(2.0);
  mesh.rotation.x = Math.PI / 2;
  mesh.castShadow = true;
  const spawnY = Math.max(position.y, floorY + 0.5);
  mesh.position.set(position.x, spawnY, position.z);
  scene.add(mesh);

  const angle = Math.random() * Math.PI * 2;
  const hSpeed = 1.5 + Math.random() * 1.5;

  return {
    mesh,
    velX: Math.sin(angle) * hSpeed,
    velY: 3.0 + Math.random() * 2.0,
    velZ: Math.cos(angle) * hSpeed,
    floorY,
    time: 0,
    settled: false,
    settledTime: 0,
    collected: false,
    value: 1,
    type: "grenade",
    baseScale: 0.8,
  };
}

export function updateGrenadeDrops(drops, dt, playerPos, onCollect, colliders, bounds, floorHoles = []) {
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.time += dt;

    const hole = updateEntityForFloorHole(
      d,
      d.mesh.position.x,
      d.mesh.position.z,
      d.mesh.position.y,
      d.floorY,
      dt,
      floorHoles,
      0.06
    );
    d.mesh.position.y = hole.y;
    if (hole.remove) {
      d.mesh.parent?.remove(d.mesh);
      disposeGrenadeModel(d.mesh);
      drops.splice(i, 1);
      continue;
    }
    if (hole.falling) {
      d.mesh.rotation.z += GREN_DROP_SPIN * dt;
      continue;
    }

    if (!d.settled) {
      d.velY -= GREN_DROP_GRAVITY * dt;
      d.mesh.position.x += d.velX * dt;
      d.mesh.position.y += d.velY * dt;
      d.mesh.position.z += d.velZ * dt;

      if (d.mesh.position.y <= d.floorY + GREN_DROP_SETTLE_Y) {
        d.mesh.position.y = d.floorY + GREN_DROP_SETTLE_Y;
        if (Math.abs(d.velY) < 0.3) {
          d.velY = 0; d.velX = 0; d.velZ = 0;
          d.settled = true;
          d.settledTime = d.time;
          d.settleBlend = 0;
        } else {
          d.velY *= -GREN_DROP_BOUNCE;
          d.velX *= 0.7;
          d.velZ *= 0.7;
        }
      }

      d.velX *= Math.max(0, 1 - GREN_DROP_FRICTION * dt);
      d.velZ *= Math.max(0, 1 - GREN_DROP_FRICTION * dt);

      if (colliders) {
        for (const c of colliders) {
          const px = d.mesh.position.x, pz = d.mesh.position.z;
          const r = 0.06;
          const cx = Math.max(c.minX ?? (c.x - c.halfX), Math.min(c.maxX ?? (c.x + c.halfX), px));
          const cz = Math.max(c.minZ ?? (c.z - c.halfZ), Math.min(c.maxZ ?? (c.z + c.halfZ), pz));
          const ddx = px - cx, ddz = pz - cz;
          if (ddx * ddx + ddz * ddz < r * r) {
            const len = Math.sqrt(ddx * ddx + ddz * ddz) || 0.001;
            d.mesh.position.x = cx + (ddx / len) * r;
            d.mesh.position.z = cz + (ddz / len) * r;
            d.velX *= -0.4; d.velZ *= -0.4;
          }
        }
      }
      if (bounds) {
        d.mesh.position.x = Math.max(bounds.minX + 0.06, Math.min(bounds.maxX - 0.06, d.mesh.position.x));
        d.mesh.position.z = Math.max(bounds.minZ + 0.06, Math.min(bounds.maxZ - 0.06, d.mesh.position.z));
      }
    } else {
      d.settleBlend = Math.min(1, (d.settleBlend ?? 0) + dt * 1.8);
      const ease = d.settleBlend * d.settleBlend * (3 - 2 * d.settleBlend);
      const hoverY = d.floorY + GREN_DROP_SETTLE_Y + 0.1;
      const groundY = d.floorY + GREN_DROP_SETTLE_Y;
      const baseY = groundY + (hoverY - groundY) * ease;
      const bob = Math.sin((d.time - d.settledTime) * GREN_DROP_BOB_SPEED) * GREN_DROP_BOB_HEIGHT * ease;
      d.mesh.position.y = baseY + bob;
    }

    d.mesh.rotation.z += GREN_DROP_SPIN * dt;

    if (!d.collected) {
      const dx = d.mesh.position.x - playerPos.x;
      const dz = d.mesh.position.z - playerPos.z;
      if (dx * dx + dz * dz < GREN_DROP_COLLECT_RADIUS * GREN_DROP_COLLECT_RADIUS) {
        d.collected = true;
        d.collectTime = d.time;
        onCollect(d.value);
      }
    }

    let remove = false;
    if (d.collected) {
      const since = d.time - d.collectTime;
      const scale = Math.max(0, 1 - since / 0.25);
      d.mesh.scale.setScalar(d.baseScale * scale);
      d.mesh.position.y += dt * 3;
      if (scale <= 0) remove = true;
    } else if (d.time > GREN_DROP_LIFETIME) {
      const fadeT = (d.time - GREN_DROP_LIFETIME) / GREN_DROP_FADE;
      if (fadeT >= 1) remove = true;
      else {
        const op = Math.max(0, 1 - fadeT);
        const setOp = (m) => { m.transparent = true; m.opacity = op; };
        if (Array.isArray(d.mesh.material)) d.mesh.material.forEach(setOp);
        else if (d.mesh.material) setOp(d.mesh.material);
        d.mesh.traverse?.(child => {
          if (child !== d.mesh && child.isMesh) {
            if (Array.isArray(child.material)) child.material.forEach(setOp);
            else setOp(child.material);
          }
        });
      }
    }

    if (remove) {
      d.mesh.parent?.remove(d.mesh);
      disposeGrenadeModel(d.mesh);
      drops.splice(i, 1);
    }
  }
}

/* ── Cleanup ──────────────────────────────────────────────────────── */

export function disposeAllGrenades(grenades, scene) {
  for (const g of grenades) {
    if (!g.detonated) {
      scene.remove(g.mesh);
      disposeGrenadeModel(g.mesh);
    }
    if (g.explosion) disposeExplosion(g.explosion, scene);
  }
  grenades.length = 0;
}

export function disposeAllGrenadeDrops(drops) {
  for (const d of drops) {
    d.mesh.parent?.remove(d.mesh);
    disposeGrenadeModel(d.mesh);
  }
  drops.length = 0;
}
