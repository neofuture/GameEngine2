import * as THREE from "three";

const GRAVITY = 14;
const BLOOD_PALETTE = [
  new THREE.Color(0.55, 0.02, 0.02),
  new THREE.Color(0.72, 0.04, 0.03),
  new THREE.Color(0.42, 0.01, 0.01),
  new THREE.Color(0.88, 0.08, 0.05),
];

let _bloodTex = null;
let _bloodMarkTex = null;
let _bloodMarkGeo = null;
let _bloodMarkMat = null;

const MAX_BLOOD_MARKS_PER_TARGET = 48;
const _markLocalPoint = new THREE.Vector3();
const _markLocalNormal = new THREE.Vector3();
const _markWorldNormal = new THREE.Vector3();
const _markInvMatrix = new THREE.Matrix4();
const _markZAxis = new THREE.Vector3(0, 0, 1);
const _markQuat = new THREE.Quaternion();

function getBloodParticleTexture() {
  if (_bloodTex) return _bloodTex;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(180, 20, 20, 1)");
  grad.addColorStop(0.35, "rgba(120, 8, 8, 0.85)");
  grad.addColorStop(1, "rgba(80, 0, 0, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  _bloodTex = new THREE.CanvasTexture(canvas);
  _bloodTex.colorSpace = THREE.SRGBColorSpace;
  return _bloodTex;
}

function getBloodMarkTexture() {
  if (_bloodMarkTex) return _bloodMarkTex;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const blobs = [
    { x: cx, y: cy, rx: 42, ry: 36, rot: 0.2, a: 0.95 },
    { x: cx - 18, y: cy + 10, rx: 22, ry: 16, rot: -0.5, a: 0.85 },
    { x: cx + 20, y: cy - 8, rx: 18, ry: 24, rot: 0.9, a: 0.8 },
    { x: cx + 6, y: cy + 22, rx: 14, ry: 20, rot: 0.1, a: 0.75 },
  ];
  for (const b of blobs) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(b.rx, b.ry));
    grad.addColorStop(0, `rgba(120, 8, 8, ${b.a})`);
    grad.addColorStop(0.45, `rgba(90, 4, 4, ${b.a * 0.85})`);
    grad.addColorStop(1, "rgba(60, 0, 0, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, b.rx, b.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (let i = 0; i < 8; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 28 + Math.random() * 22;
    const r = 2 + Math.random() * 5;
    ctx.fillStyle = `rgba(70, 2, 2, ${0.35 + Math.random() * 0.45})`;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, r, 0, Math.PI * 2);
    ctx.fill();
  }

  _bloodMarkTex = new THREE.CanvasTexture(canvas);
  _bloodMarkTex.colorSpace = THREE.SRGBColorSpace;
  return _bloodMarkTex;
}

function getBloodMarkGeometry() {
  if (!_bloodMarkGeo) _bloodMarkGeo = new THREE.CircleGeometry(0.5, 16);
  return _bloodMarkGeo;
}

function getBloodMarkMaterial() {
  if (!_bloodMarkMat) {
    _bloodMarkMat = new THREE.MeshBasicMaterial({
      map: getBloodMarkTexture(),
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
      side: THREE.DoubleSide,
    });
  }
  return _bloodMarkMat;
}

/**
 * Persistent blood splatter decal on a target mesh (stays on the body).
 * @param {THREE.Mesh} targetMesh
 * @param {THREE.Vector3} hitPoint
 * @param {THREE.Face | null | undefined} hitFace
 * @param {THREE.Vector3 | null | undefined} bulletDir
 * @param {number} damageDealt
 */
export function spawnBloodMarkOnTarget(targetMesh, hitPoint, hitFace, bulletDir, damageDealt) {
  if (!targetMesh || !hitPoint || !Number.isFinite(damageDealt) || damageDealt <= 0) return;

  if (!targetMesh.userData.bloodMarks) targetMesh.userData.bloodMarks = [];
  const marks = targetMesh.userData.bloodMarks;

  while (marks.length >= MAX_BLOOD_MARKS_PER_TARGET) {
    const old = marks.shift();
    old.parent?.remove(old);
  }

  if (hitFace?.normal) {
    _markWorldNormal.copy(hitFace.normal).transformDirection(targetMesh.matrixWorld).normalize();
  } else if (bulletDir?.lengthSq() > 1e-6) {
    _markWorldNormal.copy(bulletDir).normalize().negate();
  } else {
    _markWorldNormal.set(0, 0, 1).applyQuaternion(targetMesh.quaternion);
  }

  _markInvMatrix.copy(targetMesh.matrixWorld).invert();
  _markLocalNormal.copy(_markWorldNormal).transformDirection(_markInvMatrix).normalize();

  const markCount = damageDealt >= 10 ? 2 : 1;
  const geo = getBloodMarkGeometry();
  const mat = getBloodMarkMaterial();

  for (let i = 0; i < markCount; i++) {
    _markLocalPoint.copy(hitPoint).applyMatrix4(_markInvMatrix);
    if (i > 0) {
      _markLocalPoint.x += (Math.random() - 0.5) * 0.06;
      _markLocalPoint.y += (Math.random() - 0.5) * 0.06;
      _markLocalPoint.z += (Math.random() - 0.5) * 0.06;
    }

    const mark = new THREE.Mesh(geo, mat);
    mark.renderOrder = 3;
    mark.position.copy(_markLocalPoint).addScaledVector(_markLocalNormal, 0.004);
    _markQuat.setFromUnitVectors(_markZAxis, _markLocalNormal);
    mark.quaternion.copy(_markQuat);
    mark.rotateOnAxis(_markLocalNormal, Math.random() * Math.PI * 2);

    const size =
      THREE.MathUtils.lerp(0.06, 0.14, Math.random()) *
      (0.8 + Math.min(damageDealt, 24) * 0.02);
    mark.scale.set(size, size * (0.85 + Math.random() * 0.3), 1);

    targetMesh.add(mark);
    marks.push(mark);
  }
}

/** Move blood marks onto ragdoll root so they stay visible after death. */
export function reparentBloodMarks(fromObject, toObject) {
  const marks = fromObject.userData?.bloodMarks;
  if (!marks?.length || !toObject) return;
  if (!toObject.userData.bloodMarks) toObject.userData.bloodMarks = [];
  for (const mark of marks) {
    toObject.attach(mark);
    toObject.userData.bloodMarks.push(mark);
  }
  fromObject.userData.bloodMarks = [];
}

/** @param {THREE.Object3D} object */
export function disposeBloodMarksOnTarget(object) {
  const marks = object.userData?.bloodMarks;
  if (!marks?.length) return;
  for (const mark of marks) mark.parent?.remove(mark);
  object.userData.bloodMarks = [];
}

/** More HP lost → more droplets (24–160). */
export function bloodParticleCountForDamage(damage) {
  if (!Number.isFinite(damage) || damage <= 0) return 0;
  return Math.min(160, Math.max(24, Math.round(18 + damage * 6)));
}

/**
 * @param {THREE.Scene} scene
 * @param {THREE.Vector3} hitPoint
 * @param {THREE.Vector3 | null | undefined} bulletDir
 * @param {number} damageDealt
 */
export function spawnBloodSplatter(scene, hitPoint, bulletDir, damageDealt) {
  const count = bloodParticleCountForDamage(damageDealt);
  if (count <= 0 || !scene) return null;

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const lifetimes = new Float32Array(count);
  const ages = new Float32Array(count);

  const dir = bulletDir?.lengthSq() > 1e-6
    ? bulletDir.clone().normalize()
    : new THREE.Vector3(0, 0, -1);
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
  else right.normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();

  for (let i = 0; i < count; i++) {
    positions[i * 3] = hitPoint.x + (Math.random() - 0.5) * 0.04;
    positions[i * 3 + 1] = hitPoint.y + (Math.random() - 0.5) * 0.04;
    positions[i * 3 + 2] = hitPoint.z + (Math.random() - 0.5) * 0.04;

    const sprayDir = dir.clone()
      .multiplyScalar(0.35 + Math.random() * 0.85)
      .addScaledVector(right, (Math.random() - 0.5) * 1.1)
      .addScaledVector(up, Math.random() * 0.65)
      .normalize();

    const speed = THREE.MathUtils.lerp(2.0, 7.5, Math.random()) * (0.85 + damageDealt * 0.04);
    velocities[i * 3] = sprayDir.x * speed;
    velocities[i * 3 + 1] = sprayDir.y * speed + Math.random() * 0.8;
    velocities[i * 3 + 2] = sprayDir.z * speed;

    lifetimes[i] = THREE.MathUtils.lerp(0.35, 0.95, Math.random());
    ages[i] = 0;

    const col = BLOOD_PALETTE[Math.floor(Math.random() * BLOOD_PALETTE.length)];
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.085,
    map: getBloodParticleTexture(),
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.NormalBlending,
    vertexColors: true,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 6;
  scene.add(points);

  return {
    points,
    geo,
    mat,
    positions,
    colors,
    velocities,
    lifetimes,
    ages,
    count,
    age: 0,
  };
}

/** @param {ReturnType<typeof spawnBloodSplatter>[]} splatters @param {number} dt @param {THREE.Scene} scene */
export function updateBloodSplatters(splatters, dt, scene) {
  for (let i = splatters.length - 1; i >= 0; i--) {
    const s = splatters[i];
    if (!s) {
      splatters.splice(i, 1);
      continue;
    }

    s.age += dt;
    let alive = 0;

    for (let p = 0; p < s.count; p++) {
      s.ages[p] += dt;
      if (s.ages[p] >= s.lifetimes[p]) continue;
      alive++;

      s.velocities[p * 3 + 1] -= GRAVITY * dt;
      s.positions[p * 3] += s.velocities[p * 3] * dt;
      s.positions[p * 3 + 1] += s.velocities[p * 3 + 1] * dt;
      s.positions[p * 3 + 2] += s.velocities[p * 3 + 2] * dt;

      s.velocities[p * 3] *= Math.max(0, 1 - 2.5 * dt);
      s.velocities[p * 3 + 2] *= Math.max(0, 1 - 2.5 * dt);
    }

    s.geo.attributes.position.needsUpdate = true;

    const maxLife = Math.max(...s.lifetimes);
    const fadeT = Math.min(1, s.age / maxLife);
    s.mat.opacity = 0.95 * (1 - fadeT * fadeT);

    if (alive === 0 || s.age >= maxLife + 0.05) {
      disposeBloodSplatter(s, scene);
      splatters.splice(i, 1);
    }
  }
}

/** @param {ReturnType<typeof spawnBloodSplatter>} splatter @param {THREE.Scene} scene */
function disposeBloodSplatter(splatter, scene) {
  scene.remove(splatter.points);
  splatter.geo.dispose();
  splatter.mat.dispose();
}

/** @param {ReturnType<typeof spawnBloodSplatter>[]} splatters @param {THREE.Scene} scene */
export function disposeAllBloodSplatters(splatters, scene) {
  for (const s of splatters) disposeBloodSplatter(s, scene);
  splatters.length = 0;
}
