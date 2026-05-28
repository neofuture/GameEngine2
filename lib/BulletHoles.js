import * as THREE from "three";
import { getLaserPalette } from "./ViewWeapon.js";
import {
  pinLightToRoomInteriorLayer,
  pinLightToWorldLayer,
  ROOM_INTERIOR_LAYER,
} from "./LightingLayers.js";

const BULLET_HOLE_PATHS = [
  "/textures/bullet_holes/01_concrete_bullet_hole_alpha.png",
  "/textures/bullet_holes/02_concrete_bullet_hole_alpha.png",
  "/textures/bullet_holes/03_concrete_bullet_hole_alpha.png",
  "/textures/bullet_holes/04_concrete_bullet_hole_alpha.png",
  "/textures/bullet_holes/05_concrete_bullet_hole_alpha.png",
];

const HOLE_LIFETIME = 60;
const HOLE_FADE_DURATION = 2;
const HOLE_BASE_SIZE = 0.24;
const MAX_HOLES = 140;
const HOLE_OFFSET_BASE = 0.004;
const HOLE_OFFSET_STEP = 0.00018;
const HOLE_RENDER_ORDER_BASE = 4;
const FLASH_DURATION = 0.12;
const FLASH_PEAK_INTENSITY = 3.5;
const FLASH_DISTANCE = 0.85;

/** @type {THREE.Texture[]} */
let _holeTextures = [];
let _texturesReady = false;
/** @type {Promise<void> | null} */
let _loadPromise = null;

/** @type {{ mesh: THREE.Mesh, age: number }[]} */
const _holes = [];
/** @type {{ light: THREE.PointLight, age: number, duration: number, peakIntensity: number }[]} */
const _flashes = [];
let _holeSpawnSeq = 0;

const _worldNormal = new THREE.Vector3();
const _worldPos = new THREE.Vector3();
const _zAxis = new THREE.Vector3(0, 0, 1);
const _quat = new THREE.Quaternion();
const _planeGeo = new THREE.PlaneGeometry(1, 1);

/**
 * @param {THREE.Object3D} levelGroup
 * @param {THREE.Object3D[]} targets
 * @returns {THREE.Mesh[]}
 */
export function collectLevelHitMeshes(levelGroup, targets = []) {
  const targetSet = new Set(targets);
  /** @type {THREE.Mesh[]} */
  const meshes = [];

  levelGroup.traverse((obj) => {
    if (!obj.isMesh) return;
    if (obj.userData?.bulletHole || obj.userData?.bulletImpactFlash) return;
    if (obj.userData?.healthBar) return;

    let node = obj;
    while (node) {
      if (targetSet.has(node)) return;
      node = node.parent;
    }

    meshes.push(obj);
  });

  return meshes;
}

/** @returns {Promise<void>} */
export function preloadBulletHoleTextures() {
  if (_texturesReady) return Promise.resolve();
  if (_loadPromise) return _loadPromise;

  const loader = new THREE.TextureLoader();
  _loadPromise = Promise.all(
    BULLET_HOLE_PATHS.map(
      (path) =>
        new Promise((resolve, reject) => {
          loader.load(
            path,
            (tex) => {
              tex.colorSpace = THREE.SRGBColorSpace;
              tex.premultiplyAlpha = false;
              resolve(tex);
            },
            undefined,
            reject
          );
        })
    )
  ).then((textures) => {
    _holeTextures = textures;
    _texturesReady = true;
  });

  return _loadPromise;
}

function pickHoleTexture() {
  if (!_holeTextures.length) return null;
  return _holeTextures[(Math.random() * _holeTextures.length) | 0];
}

function resolveWorldNormal(surfaceMesh, hitPoint, hitFace, bulletDir) {
  if (hitFace?.normal) {
    _worldNormal.copy(hitFace.normal).transformDirection(surfaceMesh.matrixWorld).normalize();
  } else if (bulletDir?.lengthSq() > 1e-6) {
    _worldNormal.copy(bulletDir).normalize().negate();
  } else {
    _worldNormal.set(0, 0, 1).applyQuaternion(surfaceMesh.quaternion);
  }

  if (bulletDir?.lengthSq() > 1e-6 && _worldNormal.dot(bulletDir) > 0) {
    _worldNormal.negate();
  }
  return _worldNormal;
}

/** Match the hit surface material so decals shade like the wall/floor (incl. sun shadows). */
function createHoleMaterial(tex, surfaceMesh) {
  const refMat = Array.isArray(surfaceMesh.material)
    ? surfaceMesh.material[0]
    : surfaceMesh.material;

  if (refMat?.isMeshStandardMaterial) {
    const mat = refMat.clone();
    mat.map = tex;
    // Soft PNG alpha — blend into the wall; alphaTest cutout leaves a white fringe.
    mat.transparent = true;
    mat.opacity = 1;
    mat.alphaTest = 0;
    mat.depthWrite = false;
    mat.polygonOffset = false;
    mat.side = THREE.DoubleSide;
    // Tiled normal/roughness UVs do not match the decal plane — drop maps so
    // sun shadow + outdoor lights respond like a flat surface patch.
    mat.normalMap = null;
    mat.roughnessMap = null;
    mat.metalnessMap = null;
    mat.aoMap = null;
    mat.emissiveMap = null;
    mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
    return mat;
  }

  const mat = new THREE.MeshLambertMaterial({
    map: tex,
    transparent: true,
    opacity: 1,
    alphaTest: 0,
    depthWrite: false,
    polygonOffset: false,
    side: THREE.DoubleSide,
  });
  if (refMat?.color) mat.color.copy(refMat.color);
  return mat;
}

function copySurfaceLayers(decal, surfaceMesh) {
  decal.layers.mask = surfaceMesh.layers.mask;
}

function configureHoleMesh(hole, surfaceMesh) {
  hole.receiveShadow = true;
  hole.castShadow = false;
  copySurfaceLayers(hole, surfaceMesh);
}

/** Align +Z to the surface normal, then spin randomly around that normal. */
function orientDecalToNormal(mesh, normal) {
  _quat.setFromUnitVectors(_zAxis, normal);
  mesh.quaternion.copy(_quat);
  mesh.rotateZ(Math.random() * Math.PI * 2);
}

/** Place a decal flush on a surface using world-space basis (avoids parent skew). */
function placeDecalOnSurface(mesh, hitPoint, worldNormal, offset = 0.004) {
  _worldPos.copy(hitPoint).addScaledVector(worldNormal, offset);
  mesh.position.copy(_worldPos);
  orientDecalToNormal(mesh, worldNormal);
}

/**
 * @param {THREE.Mesh} surfaceMesh
 * @param {THREE.Vector3} hitPoint
 * @param {THREE.Face | null | undefined} hitFace
 * @param {THREE.Vector3 | null | undefined} bulletDir
 */
export function spawnBulletHole(surfaceMesh, hitPoint, hitFace, bulletDir) {
  if (!surfaceMesh || !hitPoint) return;
  if (!_texturesReady) {
    preloadBulletHoleTextures().then(() =>
      spawnBulletHole(surfaceMesh, hitPoint, hitFace, bulletDir)
    );
    return;
  }

  while (_holes.length >= MAX_HOLES) {
    const old = _holes.shift();
    old.mesh.parent?.remove(old.mesh);
    old.mesh.material.dispose();
  }

  resolveWorldNormal(surfaceMesh, hitPoint, hitFace, bulletDir);

  const tex = pickHoleTexture();
  if (!tex) return;

  const seq = ++_holeSpawnSeq;
  const surfaceOffset =
    HOLE_OFFSET_BASE + (seq % 32) * HOLE_OFFSET_STEP;

  const mat = createHoleMaterial(tex, surfaceMesh);
  const hole = new THREE.Mesh(_planeGeo, mat);
  hole.userData.bulletHole = true;
  hole.renderOrder = HOLE_RENDER_ORDER_BASE + seq;
  configureHoleMesh(hole, surfaceMesh);
  placeDecalOnSurface(hole, hitPoint, _worldNormal, surfaceOffset);

  const aspect =
    tex.image?.height > 0 ? tex.image.width / tex.image.height : 1;
  const size = HOLE_BASE_SIZE * (0.88 + Math.random() * 0.28);
  if (aspect >= 1) {
    hole.scale.set(size * aspect, size, 1);
  } else {
    hole.scale.set(size, size / aspect, 1);
  }

  surfaceMesh.attach(hole);
  _holes.push({ mesh: hole, age: 0 });
}

/**
 * Brief coloured point-light flash at impact — same hue as the laser bolt.
 * @param {THREE.Mesh} surfaceMesh
 * @param {THREE.Vector3} hitPoint
 * @param {THREE.Vector3} worldNormal
 * @param {boolean} [radioactive=false]
 */
export function spawnBulletImpactFlash(
  surfaceMesh,
  hitPoint,
  worldNormal,
  radioactive = false
) {
  const palette = getLaserPalette(radioactive);
  const light = new THREE.PointLight(
    palette.muzzle,
    FLASH_PEAK_INTENSITY,
    FLASH_DISTANCE,
    2
  );
  light.userData.bulletImpactFlash = true;

  const onRoomInterior =
    (surfaceMesh.layers.mask & (1 << ROOM_INTERIOR_LAYER)) !== 0;
  if (onRoomInterior) pinLightToRoomInteriorLayer(light);
  else pinLightToWorldLayer(light);

  _worldPos.copy(hitPoint).addScaledVector(worldNormal, 0.04);
  light.position.copy(_worldPos);
  surfaceMesh.attach(light);

  _flashes.push({
    light,
    age: 0,
    duration: FLASH_DURATION,
    peakIntensity: FLASH_PEAK_INTENSITY,
  });
}

/**
 * @param {THREE.Intersection} hit
 * @param {THREE.Vector3} bulletDir
 * @param {boolean} [radioactive=false]
 */
export function applyBulletSurfaceHit(hit, bulletDir, radioactive = false) {
  if (!hit?.object?.isMesh || !hit.point) return;

  const worldNormal = resolveWorldNormal(
    hit.object,
    hit.point,
    hit.face,
    bulletDir
  ).clone();

  spawnBulletImpactFlash(hit.object, hit.point, worldNormal, radioactive);
  spawnBulletHole(hit.object, hit.point, hit.face, bulletDir);
}

/** @param {number} dt */
export function updateBulletHoles(dt) {
  for (let i = _holes.length - 1; i >= 0; i--) {
    const entry = _holes[i];
    entry.age += dt;
    const fadeStart = HOLE_LIFETIME;
    if (entry.age < fadeStart) continue;

    const fadeT = (entry.age - fadeStart) / HOLE_FADE_DURATION;
    if (fadeT >= 1) {
      entry.mesh.parent?.remove(entry.mesh);
      entry.mesh.material.dispose();
      _holes.splice(i, 1);
      continue;
    }

    const mat = entry.mesh.material;
    if (!mat.userData.bulletHoleFading) {
      mat.userData.bulletHoleFading = true;
      mat.receiveShadow = false;
    }
    mat.opacity = 1 - fadeT;
  }

  for (let i = _flashes.length - 1; i >= 0; i--) {
    const entry = _flashes[i];
    entry.age += dt;
    const t = entry.age / entry.duration;
    if (t >= 1) {
      entry.light.parent?.remove(entry.light);
      entry.light.dispose();
      _flashes.splice(i, 1);
      continue;
    }
    const falloff = (1 - t) * (1 - t);
    entry.light.intensity = entry.peakIntensity * falloff;
  }
}

export function disposeAllBulletHoles() {
  for (const entry of _holes) {
    entry.mesh.parent?.remove(entry.mesh);
    entry.mesh.material.dispose();
  }
  _holes.length = 0;
  _holeSpawnSeq = 0;

  for (const entry of _flashes) {
    entry.light.parent?.remove(entry.light);
    entry.light.dispose();
  }
  _flashes.length = 0;
}
