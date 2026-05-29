import * as THREE from "three";

/** vx-27poster.png is 1055×1491 (RGBA) */
const DEFAULT_POSTER_ASPECT = 1491 / 1055;

const texturePromises = new Map();

/**
 * @param {string} url
 * @returns {Promise<THREE.Texture | null>}
 */
function loadPosterTexture(url) {
  const cached = texturePromises.get(url);
  if (cached) return cached;

  const promise = new Promise((resolve) => {
    new THREE.TextureLoader().load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        tex.premultiplyAlpha = false;
        resolve(tex);
      },
      undefined,
      () => resolve(null)
    );
  });
  texturePromises.set(url, promise);
  return promise;
}

/**
 * @param {string} poster
 * @returns {string}
 */
function resolvePosterUrl(poster) {
  if (poster.startsWith("/")) return poster;
  if (poster.includes(".")) return `/ui/${poster}`;
  return `/ui/${poster}.png`;
}

/** Nudge past the pillar face — enough to avoid z-fight, not enough to look floating. */
const FACE_EPSILON = 0.003;

/**
 * Flat promo poster on one face of an arena pillar (parented to the pillar mesh).
 *
 * @param {THREE.Mesh} pillarMesh
 * @param {import("./loadArena.js").ArenaPillar} pillarDef
 * @param {{ pillarSize: number, wallHeight: number }} dims
 * @returns {THREE.Mesh | null}
 */
export function addPillarPoster(pillarMesh, pillarDef, { pillarSize, wallHeight }) {
  const poster = pillarDef.poster;
  if (!poster) return null;

  const url = resolvePosterUrl(poster);
  const faceYawWorld = pillarDef.posterYaw ?? pillarDef.rotationY ?? 0;
  const pillarYaw = pillarMesh.rotation.y;
  const faceYawLocal =
    faceYawWorld -
    pillarYaw +
    THREE.MathUtils.degToRad(pillarDef.posterYawOffsetDeg ?? 0);
  const aspect = pillarDef.posterAspect ?? DEFAULT_POSTER_ASPECT;
  const scale = pillarDef.posterScale ?? 1;
  const width = (pillarDef.posterWidth ?? pillarSize * 0.88) * scale;
  const height = width * aspect;
  const centerYLocal =
    (pillarDef.posterCenterY ?? wallHeight * 0.44) - wallHeight / 2;
  const faceDist = pillarSize / 2 + (pillarDef.posterFaceEpsilon ?? FACE_EPSILON);

  const geometry = new THREE.PlaneGeometry(width, height);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0,
    side: THREE.FrontSide,
    transparent: true,
    opacity: 1,
    alphaTest: 0.06,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  material.userData.pillarPosterOwned = true;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(
    Math.sin(faceYawLocal) * faceDist,
    centerYLocal,
    Math.cos(faceYawLocal) * faceDist
  );
  mesh.rotation.order = "YXZ";
  mesh.rotation.y = faceYawLocal;
  mesh.rotation.x = THREE.MathUtils.degToRad(pillarDef.posterPitchDeg ?? 0);
  mesh.rotation.z = THREE.MathUtils.degToRad(
    pillarDef.posterRollDeg ?? pillarDef.posterTiltDeg ?? 0
  );
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.arenaPillarPoster = true;
  pillarMesh.add(mesh);

  loadPosterTexture(url).then((tex) => {
    if (!tex || !mesh.parent) return;
    material.map = tex;
    material.transparent = true;
    material.alphaTest = 0.06;
    material.needsUpdate = true;
  });

  return mesh;
}
