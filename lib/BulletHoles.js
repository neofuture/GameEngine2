import * as THREE from "three";
import { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry.js";
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
const _localPoint = new THREE.Vector3();
const _localNormal = new THREE.Vector3();
const _invMatrix = new THREE.Matrix4();
const _lookAtTarget = new THREE.Vector3();
const _up = new THREE.Vector3();
const _orientMatrix = new THREE.Matrix4();
const _decalEuler = new THREE.Euler();
const _decalSize = new THREE.Vector3();
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

/** Unlit alpha decal — PBR clones shade in shadow and read as dark squares. */
function createHoleMaterial(tex) {
  return new THREE.MeshBasicMaterial({
    map: tex,
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    side: THREE.DoubleSide,
    toneMapped: true,
  });
}

/** Curved surfaces need projected decals; flat caps/walls use a tangent plane. */
function shouldUseDecalGeometry(surfaceMesh) {
  const geo = surfaceMesh.geometry;
  if (!geo) return false;
  const type = geo.type;
  if (type === "CircleGeometry" || type === "PlaneGeometry") return false;
  if (type === "CylinderGeometry" && geo.parameters?.openEnded) return true;
  if (type === "LatheGeometry") return true;
  return false;
}

function copySurfaceLayers(decal, surfaceMesh) {
  decal.layers.mask = surfaceMesh.layers.mask;
}

function configureHoleMesh(hole, surfaceMesh) {
  hole.receiveShadow = false;
  hole.castShadow = false;
  copySurfaceLayers(hole, surfaceMesh);
}

/** @param {THREE.Euler} orientation */
function buildDecalOrientation(hitPoint, worldNormal, orientation) {
  _up.set(0, 1, 0);
  if (Math.abs(worldNormal.y) > 0.999) _up.set(1, 0, 0);
  _lookAtTarget.copy(hitPoint).add(worldNormal);
  _orientMatrix.lookAt(hitPoint, _lookAtTarget, _up);
  orientation.setFromRotationMatrix(_orientMatrix);
}

/**
 * Project decal geometry onto the hit mesh so curved surfaces (barrel rims, etc.)
 * do not show a floating camera-facing plane.
 * @param {THREE.Mesh} surfaceMesh
 * @param {THREE.Vector3} hitPoint
 * @param {THREE.Vector3} worldNormal
 * @param {number} size
 */
function tryBuildDecalGeometry(surfaceMesh, hitPoint, worldNormal, size) {
  surfaceMesh.updateWorldMatrix(true, false);

  const half = size * 0.5;
  _decalSize.set(half, half, half * 0.55);
  buildDecalOrientation(hitPoint, worldNormal, _decalEuler);

  const decalGeo = new DecalGeometry(
    surfaceMesh,
    hitPoint,
    _decalEuler,
    _decalSize
  );

  if (!decalGeo.attributes.position || decalGeo.attributes.position.count < 3) {
    decalGeo.dispose();
    return null;
  }

  _invMatrix.copy(surfaceMesh.matrixWorld).invert();
  decalGeo.applyMatrix4(_invMatrix);
  return decalGeo;
}

/** Place a fallback plane in the surface's local tangent frame. */
function placePlaneHoleLocal(hole, surfaceMesh, hitPoint, hitFace, bulletDir, offset) {
  resolveWorldNormal(surfaceMesh, hitPoint, hitFace, bulletDir);
  _invMatrix.copy(surfaceMesh.matrixWorld).invert();
  _localPoint.copy(hitPoint).applyMatrix4(_invMatrix);
  _localNormal.copy(_worldNormal).transformDirection(_invMatrix).normalize();

  surfaceMesh.add(hole);
  hole.position.copy(_localPoint).addScaledVector(_localNormal, offset);
  _quat.setFromUnitVectors(_zAxis, _localNormal);
  hole.quaternion.copy(_quat);
  hole.rotateZ(Math.random() * Math.PI * 2);
}

function disposeHoleMesh(mesh) {
  mesh.parent?.remove(mesh);
  if (mesh.geometry && mesh.geometry !== _planeGeo) mesh.geometry.dispose();
  mesh.material.dispose();
}

function applyHoleScale(hole, tex) {
  const aspect =
    tex.image?.height > 0 ? tex.image.width / tex.image.height : 1;
  const size = HOLE_BASE_SIZE * (0.88 + Math.random() * 0.28);
  if (aspect >= 1) {
    hole.scale.set(size * aspect, size, 1);
  } else {
    hole.scale.set(size, size / aspect, 1);
  }
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
    disposeHoleMesh(_holes.shift().mesh);
  }

  resolveWorldNormal(surfaceMesh, hitPoint, hitFace, bulletDir);

  const tex = pickHoleTexture();
  if (!tex) return;

  const seq = ++_holeSpawnSeq;
  const surfaceOffset =
    HOLE_OFFSET_BASE + (seq % 32) * HOLE_OFFSET_STEP;

  const mat = createHoleMaterial(tex);
  const size = HOLE_BASE_SIZE * (0.88 + Math.random() * 0.28);
  const decalGeo = shouldUseDecalGeometry(surfaceMesh)
    ? tryBuildDecalGeometry(surfaceMesh, hitPoint, _worldNormal, size)
    : null;

  let hole;
  if (decalGeo) {
    hole = new THREE.Mesh(decalGeo, mat);
    surfaceMesh.add(hole);
  } else {
    hole = new THREE.Mesh(_planeGeo, mat);
    placePlaneHoleLocal(hole, surfaceMesh, hitPoint, hitFace, bulletDir, surfaceOffset);
    applyHoleScale(hole, tex);
  }

  hole.userData.bulletHole = true;
  hole.renderOrder = HOLE_RENDER_ORDER_BASE + seq;
  configureHoleMesh(hole, surfaceMesh);
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
      disposeHoleMesh(entry.mesh);
      _holes.splice(i, 1);
      continue;
    }

    const mat = entry.mesh.material;
    if (!mat.userData.bulletHoleFading) {
      mat.userData.bulletHoleFading = true;
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
    disposeHoleMesh(entry.mesh);
  }
  _holes.length = 0;
  _holeSpawnSeq = 0;

  for (const entry of _flashes) {
    entry.light.parent?.remove(entry.light);
    entry.light.dispose();
  }
  _flashes.length = 0;
}
