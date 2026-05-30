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

/** Inward-facing yaw for each arena perimeter wall (PlaneGeometry default normal is +Z). */
const WALL_FACE_YAW = {
  north: 0,
  south: Math.PI,
  east: Math.PI / 2,
  west: -Math.PI / 2,
};

/**
 * @param {string} poster
 * @param {number} width
 * @param {number} aspect
 * @returns {{ mesh: THREE.Mesh, material: THREE.MeshStandardMaterial }}
 */
function createPosterMesh(poster, width, aspect) {
  const url = resolvePosterUrl(poster);
  const height = width * aspect;
  const geometry = new THREE.PlaneGeometry(width, height);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0,
    side: THREE.FrontSide,
    transparent: true,
    opacity: 1,
    alphaTest: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  material.userData.pillarPosterOwned = true;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.renderOrder = 6;

  loadPosterTexture(url).then((tex) => {
    if (!tex || !mesh.parent) return;
    material.map = tex;
    material.transparent = true;
    material.alphaTest = 0;
    material.needsUpdate = true;
  });

  return { mesh, material, height };
}

/**
 * @param {import("./loadArena.js").ArenaWallPoster | import("./loadArena.js").ArenaPillar} def
 * @param {number} wallHeight
 * @param {number} aspect
 * @param {number} [defaultWidth]
 */
function resolvePosterWidth(def, wallHeight, aspect, defaultWidth = 0.92) {
  const margin = def.posterMargin ?? 0.35;
  const maxHeight = wallHeight - 2 * margin;
  let width = (def.posterWidth ?? defaultWidth) * (def.posterScale ?? 1);
  if (def.posterFit === false) return width;

  const rollRad = Math.abs(
    THREE.MathUtils.degToRad(def.posterRollDeg ?? def.posterTiltDeg ?? 0)
  );
  const pitchRad = Math.abs(
    THREE.MathUtils.degToRad(def.posterPitchDeg ?? 0)
  );
  const height = width * aspect;
  const boundH =
    height * Math.cos(rollRad) * Math.cos(pitchRad) +
    width * Math.sin(rollRad);
  if (boundH > maxHeight && boundH > 0) {
    width *= maxHeight / boundH;
  }
  return width;
}

/**
 * @param {import("./loadArena.js").ArenaWallPoster} def
 * @param {number} width
 * @param {number} aspect
 * @param {number} wallHeight
 */
function resolveWallPosterCenterY(def, width, aspect, wallHeight) {
  const margin = def.posterMargin ?? 0.35;
  const rollRad = Math.abs(
    THREE.MathUtils.degToRad(def.posterRollDeg ?? def.posterTiltDeg ?? 0)
  );
  const pitchRad = Math.abs(
    THREE.MathUtils.degToRad(def.posterPitchDeg ?? 0)
  );
  const height = width * aspect;
  const boundH =
    height * Math.cos(rollRad) * Math.cos(pitchRad) +
    width * Math.sin(rollRad);
  let centerY = def.centerY ?? wallHeight * 0.5;
  if (def.posterFit === false) return centerY;
  const minY = margin + boundH / 2;
  const maxY = wallHeight - margin - boundH / 2;
  if (maxY > minY) {
    centerY = THREE.MathUtils.clamp(centerY, minY, maxY);
  }
  return centerY;
}

/** Push poster off the wall enough that pitch/roll corners stay in front of the surface. */
function posterFaceOffset(width, height, pitchRad, rollRad, baseEpsilon = FACE_EPSILON) {
  const pitchLift = Math.sin(Math.abs(pitchRad)) * height * 0.5;
  const rollLift = Math.sin(Math.abs(rollRad)) * width * 0.5;
  return baseEpsilon + pitchLift + rollLift;
}

/**
 * Flat promo poster on an arena perimeter wall (world-space, added to level group).
 *
 * @param {THREE.Group} group
 * @param {import("./loadArena.js").ArenaWallPoster} def
 * @param {{ half: number, wallHeight: number, westWallHeight: number }} dims
 * @returns {THREE.Mesh | null}
 */
export function addWallPoster(group, def, { half, wallHeight, westWallHeight }) {
  const poster = def.poster ?? "vx-27poster";
  const wall = def.wall ?? "north";
  const faceYaw = WALL_FACE_YAW[wall];
  if (faceYaw == null) return null;

  const effectiveWallHeight = wall === "west" ? westWallHeight : wallHeight;
  const aspect = def.posterAspect ?? DEFAULT_POSTER_ASPECT;
  const width = resolvePosterWidth(def, effectiveWallHeight, aspect);
  const height = width * aspect;
  const centerY = resolveWallPosterCenterY(def, width, aspect, effectiveWallHeight);
  const along = def.along ?? 0;
  const rollRad = THREE.MathUtils.degToRad(def.posterRollDeg ?? def.posterTiltDeg ?? 0);
  const pitchRad = THREE.MathUtils.degToRad(def.posterPitchDeg ?? 0);
  const eps = posterFaceOffset(
    width,
    height,
    pitchRad,
    rollRad,
    def.posterFaceEpsilon ?? FACE_EPSILON
  );
  const yaw =
    faceYaw + THREE.MathUtils.degToRad(def.posterYawOffsetDeg ?? 0);

  const { mesh } = createPosterMesh(poster, width, aspect);

  if (wall === "north") {
    mesh.position.set(along, centerY, -half + eps);
  } else if (wall === "south") {
    mesh.position.set(along, centerY, half - eps);
  } else if (wall === "east") {
    mesh.position.set(half - eps, centerY, along);
  } else {
    mesh.position.set(-half + eps, centerY, along);
  }

  mesh.rotation.order = "YXZ";
  mesh.rotation.y = yaw;
  // Negative pitch tilts the top toward the arena interior (away from the wall).
  mesh.rotation.x = -pitchRad;
  mesh.rotation.z = rollRad;
  mesh.userData.arenaWallPoster = true;
  group.add(mesh);
  return mesh;
}

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

  const faceYawWorld = pillarDef.posterYaw ?? pillarDef.rotationY ?? 0;
  const pillarYaw = pillarMesh.rotation.y;
  const faceYawLocal =
    faceYawWorld -
    pillarYaw +
    THREE.MathUtils.degToRad(pillarDef.posterYawOffsetDeg ?? 0);
  const aspect = pillarDef.posterAspect ?? DEFAULT_POSTER_ASPECT;
  const width = resolvePosterWidth(
    pillarDef,
    wallHeight,
    aspect,
    pillarDef.posterWidth ?? pillarSize * 0.88
  );
  const height = width * aspect;
  const centerYLocal =
    (pillarDef.posterCenterY ?? wallHeight * 0.44) - wallHeight / 2;
  const rollRad = THREE.MathUtils.degToRad(
    pillarDef.posterRollDeg ?? pillarDef.posterTiltDeg ?? 0
  );
  const pitchRad = THREE.MathUtils.degToRad(pillarDef.posterPitchDeg ?? 0);
  const faceDist =
    pillarSize / 2 +
    posterFaceOffset(
      width,
      height,
      pitchRad,
      rollRad,
      pillarDef.posterFaceEpsilon ?? FACE_EPSILON
    );

  const { mesh } = createPosterMesh(poster, width, aspect);
  mesh.position.set(
    Math.sin(faceYawLocal) * faceDist,
    centerYLocal,
    Math.cos(faceYawLocal) * faceDist
  );
  mesh.rotation.order = "YXZ";
  mesh.rotation.y = faceYawLocal;
  mesh.rotation.x = -pitchRad;
  mesh.rotation.z = rollRad;
  mesh.userData.arenaPillarPoster = true;
  pillarMesh.add(mesh);

  return mesh;
}
