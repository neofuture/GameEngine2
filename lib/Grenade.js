import * as THREE from "three";

/* ── Tuneable defaults ────────────────────────────────────────────── */

const defaults = {
  throwSpeed: 12,
  loftAngle: 15,
  gravity: 9.8,
  bounceRestitution: 0.15,
  bounceFriction: 0.85,
  fuseTime: 2.5,
  blastRadius: 5.0,
  maxDamage: 150,
  falloffPower: 1, // 1 = linear, 2 = quadratic
  grenadeCount: 3,
};

let _params = { ...defaults };

export function getGrenadeParams() { return { ..._params }; }
export function setGrenadeParams(p) { Object.assign(_params, p); return _params; }

/* ── Constants ────────────────────────────────────────────────────── */

const GRENADE_RADIUS = 0.05;
const GRENADE_SEGMENTS = 12;
const SIM_STEP = 0.02;
const MAX_SIM_STEPS = 500;
const ARC_MAX_POINTS = 300;

/* ── Procedural grenade model ─────────────────────────────────────── */

const SEGMENTS = 32;
const TEX_PATH = "/textures/grenade/grenade_reward_cylinder_";

let _tex = null;

function loadTex(file, srgb) {
  const t = new THREE.TextureLoader().load(TEX_PATH + file);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8;
  return t;
}

function ensureTex() {
  if (_tex) return _tex;
  _tex = {
    body: loadTex("body_wrap_albedo.png", true),
    top:  loadTex("top_cap_albedo.png", true),
    bot:  loadTex("bottom_cap_albedo.png", true),
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

function buildGrenadeModel() {
  const t = ensureTex();

  const H = BASE_H;
  const botY = -H / 2;
  const topY =  H / 2;

  // Build profile from the 30 radius control points
  const pts = [];
  for (let i = 0; i < LATHE_POINTS; i++) {
    const frac = i / (LATHE_POINTS - 1);
    const y = botY + frac * (topY - botY);
    const r = Math.max(0.001, _latheRadii[i] * BASE_R);
    pts.push(new THREE.Vector2(r, y));
  }

  const bodyGeo = new THREE.LatheGeometry(pts, SEGMENTS);

  // Remap UV V by height
  const uvAttr = bodyGeo.getAttribute("uv");
  const posAttr = bodyGeo.getAttribute("position");
  for (let i = 0; i < uvAttr.count; i++) {
    uvAttr.setY(i, (posAttr.getY(i) - botY) / (topY - botY));
  }
  uvAttr.needsUpdate = true;

  const bodyMat = new THREE.MeshStandardMaterial({
    map: t.body, metalness: 0.3, roughness: 0.5,
  });

  const group = new THREE.Group();
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(body);

  // Top cap — use the radius of the top-most point
  const topR = Math.max(0.001, _latheRadii[LATHE_POINTS - 1] * BASE_R);
  const topCapGeo = new THREE.CircleGeometry(topR, 32);
  const topCap = new THREE.Mesh(topCapGeo, new THREE.MeshStandardMaterial({
    map: t.top, metalness: 0.3, roughness: 0.5,
  }));
  topCap.rotation.x = -Math.PI / 2;
  topCap.position.y = topY;
  group.add(topCap);

  // Bottom cap
  const botR = Math.max(0.001, _latheRadii[0] * BASE_R);
  const botCapGeo = new THREE.CircleGeometry(botR, 32);
  const botCap = new THREE.Mesh(botCapGeo, new THREE.MeshStandardMaterial({
    map: t.bot, metalness: 0.3, roughness: 0.5,
  }));
  botCap.rotation.x = Math.PI / 2;
  botCap.position.y = botY;
  group.add(botCap);

  group.userData._mats = [bodyMat, topCap.material, botCap.material];
  group.userData._geos = [bodyGeo, topCapGeo, botCapGeo];
  return group;
}

export function getGrenadeModel() {
  return buildGrenadeModel();
}

export function disposeGrenadeModel(group) {
  if (group.userData._geos) for (const g of group.userData._geos) g.dispose();
  if (group.userData._mats) for (const m of group.userData._mats) m.dispose();
}

function getProjectileModel() {
  const model = buildGrenadeModel();
  model.scale.setScalar(3.0);
  return model;
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
      for (const c of colliders) {
        if (c.active === false) continue;
        const hx = c.halfX, hz = c.halfZ;
        const dx = pos.x - c.x, dz = pos.z - c.z;
        if (Math.abs(dx) < hx + GRENADE_RADIUS && Math.abs(dz) < hz + GRENADE_RADIUS) {
          const overlapX = hx + GRENADE_RADIUS - Math.abs(dx);
          const overlapZ = hz + GRENADE_RADIUS - Math.abs(dz);
          if (overlapX < overlapZ) {
            pos.x += Math.sign(dx) * overlapX;
            vel.x = -vel.x * _params.bounceRestitution;
          } else {
            pos.z += Math.sign(dz) * overlapZ;
            vel.z = -vel.z * _params.bounceRestitution;
          }
        }
      }
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
  color: 0xff4444, dashSize: 0.15, gapSize: 0.08,
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
    _previewLandCircle = makeCircle(_params.blastRadius, 0xff3333, 0.25);
    _previewLandCircle.position.set(landPos.x, floorY + 0.02, landPos.z);
    group.add(_previewLandCircle);
  } else {
    _previewLandCircle = null;
  }

  // Bounce circle
  if (_previewBounceCircle) { group.remove(_previewBounceCircle); _previewBounceCircle.geometry.dispose(); _previewBounceCircle.material.dispose(); }
  if (bouncePos) {
    _previewBounceCircle = makeCircle(_params.blastRadius * 0.6, 0xff6633, 0.15);
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

export function spawnGrenade(scene, camera, floorY, colliders, bounds) {
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
    floorY,
    colliders,
    bounds,
    bounceCount: 0,
  };
}

/* ── Per-frame update ─────────────────────────────────────────────── */

export function updateGrenades(grenades, dt, scene, getLiveTargets, applyHitFn, startDeathFn, deathOpts) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.time += dt;

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

      // Floor bounce
      if (g.mesh.position.y <= g.floorY + GRENADE_RADIUS) {
        g.mesh.position.y = g.floorY + GRENADE_RADIUS;
        g.vel.y = -g.vel.y * _params.bounceRestitution;
        g.vel.x *= (1 - _params.bounceFriction * 0.3);
        g.vel.z *= (1 - _params.bounceFriction * 0.3);
        g.bounceCount++;
      }

      // Wall collisions
      if (g.colliders) {
        for (const c of g.colliders) {
          if (c.active === false) continue;
          const hx = c.halfX, hz = c.halfZ;
          const dx = g.mesh.position.x - c.x, dz = g.mesh.position.z - c.z;
          if (Math.abs(dx) < hx + GRENADE_RADIUS && Math.abs(dz) < hz + GRENADE_RADIUS) {
            const overlapX = hx + GRENADE_RADIUS - Math.abs(dx);
            const overlapZ = hz + GRENADE_RADIUS - Math.abs(dz);
            if (overlapX < overlapZ) {
              g.mesh.position.x += Math.sign(dx) * overlapX;
              g.vel.x = -g.vel.x * _params.bounceRestitution;
            } else {
              g.mesh.position.z += Math.sign(dz) * overlapZ;
              g.vel.z = -g.vel.z * _params.bounceRestitution;
            }
          }
        }
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
      if (g.time >= _params.fuseTime) {
        g.detonated = true;
        g.detonateTime = g.time;
        g.explosionPos = g.mesh.position.clone();

        // Area damage
        const targets = getLiveTargets();
        for (const mesh of targets) {
          const dist = mesh.position.distanceTo(g.explosionPos);
          if (dist < _params.blastRadius) {
            const falloff = 1 - Math.pow(dist / _params.blastRadius, _params.falloffPower);
            const damage = _params.maxDamage * falloff;
            const fakeDir = mesh.position.clone().sub(g.explosionPos).normalize();
            const result = applyHitFn(mesh, g.explosionPos, fakeDir, damage);
            if (result?.killed) {
              startDeathFn(mesh, fakeDir, deathOpts);
            }
          }
        }

        // Create explosion VFX
        g.explosion = createExplosion(scene, g.explosionPos);

        // Remove grenade mesh
        scene.remove(g.mesh);
        disposeGrenadeModel(g.mesh);
      }
    } else {
      // Update explosion
      if (g.explosion) {
        const since = g.time - g.detonateTime;
        const alive = updateExplosion(g.explosion, since);
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

const EXPLOSION_DURATION = 0.5;
const EXPLOSION_MAX_SCALE = 1.0;

function createExplosion(scene, pos) {
  const geo = new THREE.SphereGeometry(1, 24, 24);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xff6600, transparent: true, opacity: 0.8,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const sphere = new THREE.Mesh(geo, mat);
  sphere.position.copy(pos);
  sphere.scale.setScalar(0.01);
  scene.add(sphere);

  const innerGeo = new THREE.SphereGeometry(1, 16, 16);
  const innerMat = new THREE.MeshBasicMaterial({
    color: 0xffcc00, transparent: true, opacity: 1.0,
    depthWrite: false,
  });
  const inner = new THREE.Mesh(innerGeo, innerMat);
  inner.position.copy(pos);
  inner.scale.setScalar(0.01);
  scene.add(inner);

  const light = new THREE.PointLight(0xff8800, 15, _params.blastRadius * 2);
  light.position.copy(pos);
  scene.add(light);

  return { sphere, inner, light, geo, mat, innerGeo, innerMat };
}

function updateExplosion(expl, elapsed) {
  if (elapsed > EXPLOSION_DURATION) return false;
  const t = elapsed / EXPLOSION_DURATION;
  const easeOut = 1 - Math.pow(1 - t, 2);

  const scale = EXPLOSION_MAX_SCALE * _params.blastRadius * easeOut * 0.4;
  expl.sphere.scale.setScalar(scale);
  expl.inner.scale.setScalar(scale * 0.5);

  expl.mat.opacity = 0.8 * (1 - t);
  expl.innerMat.opacity = 1.0 * (1 - t * t);
  expl.light.intensity = 15 * (1 - t);

  return true;
}

function disposeExplosion(expl, scene) {
  scene.remove(expl.sphere);
  scene.remove(expl.inner);
  scene.remove(expl.light);
  expl.geo.dispose();
  expl.mat.dispose();
  expl.innerGeo.dispose();
  expl.innerMat.dispose();
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
  const mesh = buildGrenadeModel();
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

export function updateGrenadeDrops(drops, dt, playerPos, onCollect, colliders, bounds) {
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.time += dt;

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
