import * as THREE from "three";
import { setWorldLayer } from "./LightingLayers.js";
import {
  loadOilBarrelTuning,
  normalizeOilBarrelTuning,
} from "./OilBarrelTuning.js";

/** Standing eye height — barrel height is ~half of this. */
export const PLAYER_STAND_EYE = 1.65;
export const OIL_BARREL_HEIGHT = PLAYER_STAND_EYE * 0.5;
export const OIL_BARREL_RADIUS = 0.3;
/** Rounded rim where the cylinder wall meets the flat end caps. */
const RIM_BEVEL = Math.min(0.038, OIL_BARREL_RADIUS * 0.11);
/** Nudge end caps off the lathe rim so coplanar faces do not z-fight. */
const CAP_SURFACE_OFFSET = 0.002;

const TEX_ROOT = "/textures/oil_barrel";

const _loader = new THREE.TextureLoader();
/** @type {import("./OilBarrelTuning.js").OilBarrelTuning} */
let _tuning = loadOilBarrelTuning();
/** @type {Record<string, THREE.Texture> | null} */
let _tex = null;
let _bodyMat = null;
let _topMat = null;
let _bottomMat = null;
let _preloadPromise = null;
/** @type {Map<string, THREE.Texture>} */
const _capAlbedoCache = new Map();

function configureColorTex(tex, repeatU, repeatV, wrap = THREE.RepeatWrapping) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = wrap;
  tex.wrapT = wrap;
  tex.repeat.set(repeatU, repeatV);
  tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

function configureDataTex(tex, repeatU, repeatV, wrap = THREE.RepeatWrapping) {
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.wrapS = wrap;
  tex.wrapT = wrap;
  tex.repeat.set(repeatU, repeatV);
  tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

function applyBrightness(mat, brightness, tuning) {
  mat.color.setRGB(
    brightness,
    brightness * tuning.warmth,
    brightness * tuning.blueTint
  );
  mat.roughness = tuning.roughness;
  mat.metalness = 0;
}

function applyBodySurface(mat, tuning = _tuning) {
  applyBrightness(mat, tuning.bodyBrightness, tuning);
  mat.emissiveIntensity = tuning.emissiveIntensity;
  if (mat.normalScale) {
    mat.normalScale.set(tuning.normalScale, tuning.normalScale);
  }
}

function applyCapSurface(mat, tuning = _tuning) {
  applyBrightness(mat, tuning.capBrightness, tuning);
  if (mat.normalScale) {
    mat.normalScale.set(tuning.capNormalScale, tuning.capNormalScale);
  }
}

/**
 * Bakes albedo contrast in software (1 = unchanged). Avoids re-exporting endcap PNGs.
 * @param {THREE.Texture} sourceTex
 * @param {number} contrast
 */
function getCapAlbedoTexture(sourceTex, contrast) {
  const cacheKey = `${sourceTex.uuid}|${contrast.toFixed(3)}`;
  const cached = _capAlbedoCache.get(cacheKey);
  if (cached) return cached;

  const wrap = THREE.ClampToEdgeWrapping;
  if (contrast === 1) {
    const clone = configureColorTex(sourceTex.clone(), 1, 1, wrap);
    _capAlbedoCache.set(cacheKey, clone);
    return clone;
  }

  const image = sourceTex.image;
  if (!image?.width || !image?.height) {
    const fallback = configureColorTex(sourceTex.clone(), 1, 1, wrap);
    _capAlbedoCache.set(cacheKey, fallback);
    return fallback;
  }

  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const fallback = configureColorTex(sourceTex.clone(), 1, 1, wrap);
    _capAlbedoCache.set(cacheKey, fallback);
    return fallback;
  }

  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const n = data[i + c] / 255;
      data[i + c] = Math.round(
        Math.min(255, Math.max(0, ((n - 0.5) * contrast + 0.5) * 255))
      );
    }
  }
  ctx.putImageData(pixels, 0, 0);

  const tex = configureColorTex(new THREE.CanvasTexture(canvas), 1, 1, wrap);
  tex.needsUpdate = true;
  _capAlbedoCache.set(cacheKey, tex);
  return tex;
}

/** @param {THREE.MeshStandardMaterial} mat @param {THREE.Texture} sourceAlbedo */
function applyCapAlbedoMap(mat, sourceAlbedo, tuning = _tuning) {
  mat.map = getCapAlbedoTexture(sourceAlbedo, tuning.capContrast);
  mat.needsUpdate = true;
}

function refreshCapMaterials(tuning = _tuning) {
  if (!_tex || !_topMat || !_bottomMat) return;
  applyCapAlbedoMap(_topMat, _tex.topAlbedo, tuning);
  applyCapAlbedoMap(_bottomMat, _tex.bottomAlbedo, tuning);
  applyCapSurface(_topMat, tuning);
  applyCapSurface(_bottomMat, tuning);
}

/** @param {import("./OilBarrelTuning.js").OilBarrelTuning} [tuning] */
export function refreshOilBarrelMaterials(tuning = _tuning) {
  _tuning = normalizeOilBarrelTuning(tuning);
  if (_bodyMat) applyBodySurface(_bodyMat, _tuning);
  refreshCapMaterials(_tuning);
}

/** @returns {import("./OilBarrelTuning.js").OilBarrelTuning} */
export function getOilBarrelTuning() {
  return { ..._tuning };
}

/** @param {Partial<import("./OilBarrelTuning.js").OilBarrelTuning>} patch */
export function setOilBarrelTuning(patch) {
  refreshOilBarrelMaterials({ ..._tuning, ...patch });
}

function makeBodyMaterial(tex, repeatU, repeatV) {
  const mat = new THREE.MeshStandardMaterial({
    map: configureColorTex(tex.bodyAlbedo.clone(), repeatU, repeatV),
    normalMap: configureDataTex(tex.bodyNormal.clone(), repeatU, repeatV),
    emissiveMap: configureColorTex(tex.bodyEmissive.clone(), repeatU, repeatV),
    emissive: new THREE.Color(0xffaa44),
    emissiveIntensity: _tuning.emissiveIntensity,
    side: THREE.DoubleSide,
  });
  applyBodySurface(mat);
  return mat;
}

function makeCapMaterial(tex, maps) {
  const wrap = THREE.ClampToEdgeWrapping;
  const mat = new THREE.MeshStandardMaterial({
    normalMap: configureDataTex(tex[maps.normal].clone(), 1, 1, wrap),
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  applyCapAlbedoMap(mat, tex[maps.albedo], _tuning);
  applyCapSurface(mat);
  return mat;
}

function buildMaterials() {
  if (!_tex) return;

  _bodyMat = makeBodyMaterial(_tex, 1, 1);
  _topMat = makeCapMaterial(_tex, {
    albedo: "topAlbedo",
    normal: "topNormal",
  });
  _bottomMat = makeCapMaterial(_tex, {
    albedo: "bottomAlbedo",
    normal: "bottomNormal",
  });
  refreshOilBarrelMaterials(_tuning);
}

const _wallGeoCache = new Map();
const _rimGeoCache = new Map();
const _capDiskGeoCache = new Map();

/**
 * @param {number} radius
 * @param {number} height
 * @param {number} bevel
 */
function rimDimensions(radius, height, bevel) {
  const hh = height / 2;
  const b = Math.min(bevel, radius * 0.2, hh * 0.45);
  return { bevel: b, capR: radius - b, wallHeight: height - 2 * b, halfHeight: hh };
}

/**
 * Quarter-circle fillet from the cylinder lip to the cap edge (local +Y = toward cap).
 * @param {number} radius
 * @param {number} bevel
 * @param {1 | -1} towardCap
 * @param {number} filletSteps
 */
function buildRimFilletProfile(radius, bevel, towardCap, filletSteps = 6) {
  const b = Math.min(bevel, radius * 0.2);
  const capR = radius - b;
  const sign = towardCap === 1 ? 1 : -1;
  const profile = [new THREE.Vector2(radius, 0)];

  for (let i = 1; i <= filletSteps; i++) {
    const angle = (i / filletSteps) * (Math.PI / 2);
    profile.push(
      new THREE.Vector2(
        capR + b * Math.cos(angle),
        sign * b * Math.sin(angle)
      )
    );
  }

  return profile;
}

/** @param {number} radius @param {number} wallHeight @param {number} segments */
function getWallCylinderGeo(radius, wallHeight, segments) {
  const key = `${radius}|${wallHeight}|${segments}`;
  let geo = _wallGeoCache.get(key);
  if (!geo) {
    geo = new THREE.CylinderGeometry(radius, radius, wallHeight, segments, 1, true);
    _wallGeoCache.set(key, geo);
  }
  return geo;
}

/** @param {number} radius @param {number} bevel @param {1 | -1} towardCap @param {number} segments */
function getRimFilletGeo(radius, bevel, towardCap, segments) {
  const key = `${radius}|${bevel}|${towardCap}|${segments}`;
  let geo = _rimGeoCache.get(key);
  if (!geo) {
    geo = new THREE.LatheGeometry(
      buildRimFilletProfile(radius, bevel, towardCap),
      segments
    );
    _rimGeoCache.set(key, geo);
  }
  return geo;
}

/** @param {number} capRadius @param {number} segments */
function getCapDiskGeo(capRadius, segments) {
  const key = `${capRadius}|${segments}`;
  let geo = _capDiskGeoCache.get(key);
  if (!geo) {
    geo = new THREE.CircleGeometry(capRadius, segments);
    _capDiskGeoCache.set(key, geo);
  }
  return geo;
}

function buildBarrelMesh() {
  const h = OIL_BARREL_HEIGHT;
  const r = OIL_BARREL_RADIUS;
  const radialSegments = 32;
  const { bevel, capR, wallHeight, halfHeight: hh } = rimDimensions(
    r,
    h,
    RIM_BEVEL
  );
  const capGeo = getCapDiskGeo(capR, radialSegments);

  const wall = new THREE.Mesh(
    getWallCylinderGeo(r, wallHeight, radialSegments),
    _bodyMat
  );

  const topRim = new THREE.Mesh(
    getRimFilletGeo(r, bevel, 1, radialSegments),
    _bodyMat
  );
  topRim.position.y = hh - bevel;

  const bottomRim = new THREE.Mesh(
    getRimFilletGeo(r, bevel, -1, radialSegments),
    _bodyMat
  );
  bottomRim.position.y = -hh + bevel;

  const top = new THREE.Mesh(capGeo, _topMat);
  top.rotation.x = -Math.PI / 2;
  top.position.y = hh + CAP_SURFACE_OFFSET;
  top.renderOrder = 1;

  const bottom = new THREE.Mesh(capGeo, _bottomMat);
  bottom.rotation.x = Math.PI / 2;
  bottom.position.y = -hh - CAP_SURFACE_OFFSET;
  bottom.renderOrder = 1;

  const group = new THREE.Group();
  group.name = "oil_barrel";
  group.add(wall, topRim, bottomRim, top, bottom);
  return group;
}

/** Decode barrel PBR textures before first spawn. */
export function preloadOilBarrelAssets() {
  if (_tex) return Promise.resolve();
  if (_preloadPromise) return _preloadPromise;

  const load = (name) => _loader.loadAsync(`${TEX_ROOT}/${name}`);

  _preloadPromise = Promise.all([
    load("barrel_body_albedo.png"),
    load("barrel_body_normal.png"),
    load("barrel_body_emissive.png"),
    load("barrel_top_endcap_albedo.png"),
    load("barrel_top_endcap_normal.png"),
    load("barrel_bottom_endcap_albedo.png"),
    load("barrel_bottom_endcap_normal.png"),
  ])
    .then(
      ([
        bodyAlbedo,
        bodyNormal,
        bodyEmissive,
        topAlbedo,
        topNormal,
        bottomAlbedo,
        bottomNormal,
      ]) => {
        _tex = {
          bodyAlbedo,
          bodyNormal,
          bodyEmissive,
          topAlbedo,
          topNormal,
          bottomAlbedo,
          bottomNormal,
        };
        buildMaterials();
      }
    )
    .catch((err) => {
      _preloadPromise = null;
      console.warn("Oil barrel textures failed to load:", err);
    });

  return _preloadPromise;
}

/**
 * @param {THREE.Object3D} parent
 * @param {number} x
 * @param {number} z
 * @param {number} [floorY=0]
 * @param {number} [rotationY=0]
 */
export function createOilBarrel(parent, x, z, floorY = 0, rotationY = 0) {
  if (!_bodyMat) {
    buildMaterials();
    if (!_bodyMat) {
      _bodyMat = new THREE.MeshStandardMaterial({ color: 0x5a5048 });
      _topMat = new THREE.MeshStandardMaterial({ color: 0x4a4238 });
      _bottomMat = new THREE.MeshStandardMaterial({ color: 0x3a342c });
    }
  }

  const barrel = buildBarrelMesh();
  barrel.position.set(x, floorY + OIL_BARREL_HEIGHT / 2, z);
  barrel.rotation.y = rotationY;
  barrel.castShadow = true;
  barrel.receiveShadow = true;
  barrel.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  setWorldLayer(barrel);
  parent.add(barrel);
  return barrel;
}

/**
 * @param {THREE.Object3D} root
 * @param {import("./loadArena.js").ArenaConfig} arena
 * @returns {THREE.Object3D[]}
 */
export function spawnLevelOilBarrels(root, arena) {
  const meshes = [];
  const floorY = arena.floorY ?? 0;

  for (const def of arena.props ?? []) {
    if (def.type !== "oilBarrel") continue;
    const y = def.y ?? def.floorY ?? floorY;
    meshes.push(
      createOilBarrel(root, def.x, def.z, y, def.rotationY ?? 0)
    );
  }

  return meshes;
}

/** @param {import("./loadArena.js").ArenaProp} def @param {number} floorY */
export function oilBarrelCollider(def, floorY = 0) {
  const y = def.y ?? def.floorY ?? floorY;
  const h = OIL_BARREL_HEIGHT;
  const r = OIL_BARREL_RADIUS;
  return {
    x: def.x,
    z: def.z,
    halfX: r,
    halfZ: r,
    rotationY: def.rotationY ?? 0,
    bottomY: y,
    topY: y + h,
    kind: "pillar",
    cornerRadius: 0,
  };
}
