import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import {
  ALL_RENDER_LAYERS_MASK,
  ROOM_INTERIOR_LAYER,
  VIEWMODEL_LAYER,
  WORLD_LAYER,
  pinLightToLayers,
  pinLightToRoomInteriorLayer,
  setWorldLayer,
} from "./LightingLayers.js";
import { getAttachedRoomCenterZ } from "./RoomPlacement.js";

const SKY_ASSET_MANIFEST = "/sky/sky_dome_asset.json";
const SKY_MESH_URL = "/sky/sky_dome_hemisphere_inward.obj";
export const DEFAULT_SKY_DOME_SCALE = 500;
export const SKY_DOME_SCALE_MIN = 200;
export const SKY_DOME_SCALE_MAX = 2500;
/** Fixed world radius so the dome stays inside the camera far plane. */
const SKY_MESH_RADIUS = 180;

function skyDomeScaleToUniform(scale) {
  const t = THREE.MathUtils.clamp(
    (scale - SKY_DOME_SCALE_MIN) / (SKY_DOME_SCALE_MAX - SKY_DOME_SCALE_MIN),
    0,
    1
  );
  // Higher slider = more expansive sky (lower zoom on the panorama).
  return THREE.MathUtils.lerp(2, 0.4, t);
}

function resolveTextureFile(manifest) {
  return (
    manifest.files?.primary_jpg ??
    manifest.texture_files?.runtime_recommended ??
    "sky_dome_equirectangular_8k.jpg"
  );
}

function loadSkyTextures(textureUrl) {
  const base = new THREE.TextureLoader().loadAsync(textureUrl).then((tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.needsUpdate = true;
    return tex;
  });

  return base.then((source) => {
    const meshMap = source.clone();
    meshMap.mapping = THREE.UVMapping;
    meshMap.wrapS = THREE.ClampToEdgeWrapping;
    meshMap.wrapT = THREE.ClampToEdgeWrapping;

    return { meshMap, source };
  });
}

function createSkyMaterial(texture, skyScale) {
  const uniforms = {
    uTexture: { value: texture },
    uSkyScale: { value: skyDomeScaleToUniform(skyScale) },
    uCameraPosition: { value: new THREE.Vector3() },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTexture;
      uniform float uSkyScale;
      uniform vec3 uCameraPosition;
      varying vec3 vWorldPosition;

      void main() {
        vec3 viewDir = normalize(vWorldPosition - uCameraPosition);
        float theta = atan(viewDir.z, viewDir.x);
        float phi = asin(clamp(viewDir.y, -1.0, 1.0));
        vec2 uv = vec2(
          theta * 0.15915494309189535 + 0.5,
          phi * 0.3183098861837907 + 0.5
        );
        uv = (uv - 0.5) / max(uSkyScale, 0.15) + 0.5;
        uv = clamp(uv, 0.0, 1.0);
        gl_FragColor = vec4(texture2D(uTexture, uv).rgb, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: true,
  });
}

function configureSkyMesh(root, texture, skyScale) {
  const material = createSkyMaterial(texture, skyScale);
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    if (obj.material) {
      const old = obj.material;
      if (Array.isArray(old)) old.forEach((m) => m.dispose());
      else old.dispose();
    }
    obj.material = material;
    obj.castShadow = false;
    obj.receiveShadow = false;
    obj.frustumCulled = false;
    obj.renderOrder = -1;
  });
  return material;
}

/**
 * Bright Day Sky Dome v2 — equirectangular JPG on inward hemisphere mesh.
 * @see CONSTRUCTION ASSETS/large_sky_dome_8k/sky_dome_asset.json
 */
export async function createSkyDome(scene, scale = DEFAULT_SKY_DOME_SCALE) {
  const manifest = await fetch(SKY_ASSET_MANIFEST).then((r) => {
    if (!r.ok) throw new Error(`Sky manifest not found: ${SKY_ASSET_MANIFEST}`);
    return r.json();
  });

  const textureUrl = `/sky/${resolveTextureFile(manifest)}`;
  const { meshMap } = await loadSkyTextures(textureUrl);

  const objRoot = await new OBJLoader().loadAsync(SKY_MESH_URL);
  let currentScale = scale;
  objRoot.scale.setScalar(SKY_MESH_RADIUS);
  const material = configureSkyMesh(objRoot, meshMap, currentScale);
  objRoot.traverse((obj) => {
    if (obj.isMesh) setWorldLayer(obj);
  });
  scene.add(objRoot);

  const disposables = [];
  objRoot.traverse((obj) => {
    if (obj.isMesh) {
      disposables.push(obj.geometry);
    }
  });

  return {
    mesh: objRoot,
    texture: meshMap,
    getScale() {
      return currentScale;
    },
    setScale(next) {
      currentScale = next;
      material.uniforms.uSkyScale.value = skyDomeScaleToUniform(currentScale);
    },
    update(camera) {
      objRoot.position.copy(camera.position);
      material.uniforms.uCameraPosition.value.copy(camera.position);
    },
    dispose() {
      scene.remove(objRoot);
      for (const geo of disposables) geo.dispose();
      meshMap.dispose();
      material.dispose();
      objRoot.traverse((obj) => {
        if (obj.isMesh) obj.material = null;
      });
    },
  };
}

export function enableShadowsOn(root) {
  root.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
}

/** Room interiors use local point lights — skip sun shadow map casting. */
export function disableInteriorCastShadows(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    let parent = obj.parent;
    while (parent) {
      if (parent.userData?.roomInterior) {
        obj.castShadow = false;
        return;
      }
      parent = parent.parent;
    }
  });
}

const _shadowLightPos = new THREE.Vector3();
const _shadowTargetPos = new THREE.Vector3();

/**
 * @param {THREE.DirectionalLight} light
 * @param {THREE.Object3D} root
 * @param {{ arenaSize?: number, padding?: number }} [options] Fit shadow frustum to the arena slab, not attached rooms.
 */
export function fitDirectionalLightShadow(light, root, options = {}) {
  const padding = options.padding ?? 2;
  const arenaHalf =
    options.arenaSize != null ? options.arenaSize / 2 : null;

  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const size = new THREE.Vector3();
  box.getSize(size);

  const half =
    arenaHalf != null
      ? arenaHalf + padding
      : Math.max(size.x, size.z) / 2 + padding;

  light.target.position.set(center.x, 1.5, arenaHalf != null ? 0 : center.z);
  light.updateMatrixWorld(true);
  light.target.updateMatrixWorld(true);

  const cam = light.shadow.camera;
  cam.left = -half;
  cam.right = half;
  cam.top = half;
  cam.bottom = -half;

  light.getWorldPosition(_shadowLightPos);
  light.target.getWorldPosition(_shadowTargetPos);
  const focusDist = _shadowLightPos.distanceTo(center);
  const depthExtent = half + size.y * 0.5 + padding;
  cam.near = Math.max(0.5, focusDist - depthExtent);
  cam.far = focusDist + depthExtent;
  cam.updateProjectionMatrix();
}

let viewmodelInteriorAmbient = null;

export function resetViewmodelInteriorAmbient() {
  if (viewmodelInteriorAmbient?.parent) {
    viewmodelInteriorAmbient.parent.remove(viewmodelInteriorAmbient);
  }
  viewmodelInteriorAmbient = null;
}

/**
 * @param {THREE.Scene} scene
 * @param {boolean} inRoom
 * @param {THREE.Light[]} outdoorLights
 * @param {THREE.Light[]} roomLights
 */
export function syncLightLayersForZone(scene, inRoom, outdoorLights, roomLights) {
  if (!viewmodelInteriorAmbient || viewmodelInteriorAmbient.parent !== scene) {
    if (viewmodelInteriorAmbient?.parent) {
      viewmodelInteriorAmbient.parent.remove(viewmodelInteriorAmbient);
    }
    viewmodelInteriorAmbient = new THREE.AmbientLight(0xffcc99, 0.04);
    viewmodelInteriorAmbient.layers.set(VIEWMODEL_LAYER);
    viewmodelInteriorAmbient.visible = false;
    scene.add(viewmodelInteriorAmbient);
  }
  viewmodelInteriorAmbient.visible = inRoom;

  for (const light of outdoorLights) {
    if (!light?.isLight) continue;
    pinLightToLayers(
      light,
      WORLD_LAYER,
      ...(inRoom ? [] : [VIEWMODEL_LAYER])
    );
  }
  for (const light of roomLights) {
    if (!light?.isLight) continue;
    pinLightToLayers(
      light,
      ROOM_INTERIOR_LAYER,
      ...(inRoom ? [VIEWMODEL_LAYER] : [])
    );
  }
}

/**
 * @param {THREE.Scene} scene
 * @param {{ sheltered?: boolean }} [options] Sheltered = arena has a roof; trims shadowless fill that blows out corners.
 * @returns {{ sun: THREE.DirectionalLight, outdoorLights: THREE.Light[] }}
 */
export function createOutdoorLights(scene, options = {}) {
  const sheltered = options.sheltered === true;

  // Sheltered arena: roof blocks most sky; still need enough fill so the deck underside
  // does not outshine the floor (ceiling gets a small emissive boost in Level.js).
  const hemi = new THREE.HemisphereLight(
    0x9ec0e8,
    0x5c5348,
    sheltered ? 0.28 : 0.38
  );
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(0xd0dce8, sheltered ? 0.1 : 0.14);
  scene.add(ambient);

  /** Shadowless fill — moderate under a roof; very low values leave the arena murky. */
  const fill = new THREE.DirectionalLight(0xc8d4e8, sheltered ? 0.16 : 0.48);
  fill.position.set(-22, 14, 32);
  fill.target.position.set(0, 0, 0);
  fill.castShadow = false;
  scene.add(fill.target);
  scene.add(fill);

  /** Soft bounce on the shadow side — subtle outdoors, minimal under a deck. */
  const westFill = new THREE.DirectionalLight(0xb8c8e0, sheltered ? 0.14 : 0.32);
  westFill.position.set(-38, 16, 4);
  westFill.target.position.set(0, 2, 0);
  westFill.castShadow = false;
  scene.add(westFill.target);
  scene.add(westFill);

  let sun;

  if (sheltered) {
    // West skybox edge — low sun shines through the 50% west clerestory opening.
    sun = new THREE.DirectionalLight(0xfff4e8, 2.85);
    const westX = -(SKY_MESH_RADIUS - 12);
    sun.position.set(westX, 16, 0);
    sun.target.position.set(0, 1.4, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.00025;
    sun.shadow.normalBias = 0.001;

    const overhead = new THREE.DirectionalLight(0xd8e4f4, 0.72);
    overhead.position.set(8, 42, -12);
    overhead.target.position.set(0, 1.5, 0);
    overhead.castShadow = false;
    scene.add(overhead.target);
    scene.add(overhead);

    /** Downward bounce — hits floor (+Y) and ceiling underside (-Y); sun is mostly horizontal. */
    const deckBounce = new THREE.DirectionalLight(0xe4ecf4, 0.38);
    deckBounce.position.set(0, 36, 4);
    deckBounce.target.position.set(0, 0, 0);
    deckBounce.castShadow = false;
    scene.add(deckBounce.target);
    scene.add(deckBounce);

    scene.add(sun.target);
    scene.add(sun);

    const outdoorLights = [hemi, ambient, sun, overhead, deckBounce, fill, westFill];
    for (const light of outdoorLights) {
      pinLightToLayers(light, WORLD_LAYER, VIEWMODEL_LAYER);
    }
    return { sun, outdoorLights };
  }

  sun = new THREE.DirectionalLight(0xfff0dc, 2.45);
  const dist = 45;
  const elevation = THREE.MathUtils.degToRad(38);
  const azimuth = THREE.MathUtils.degToRad(-125);
  sun.position.set(
    dist * Math.cos(elevation) * Math.sin(azimuth),
    dist * Math.sin(elevation),
    dist * Math.cos(elevation) * Math.cos(azimuth)
  );
  sun.target.position.set(0, 1.5, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.002;
  scene.add(sun.target);
  scene.add(sun);

  const outdoorLights = [hemi, ambient, sun, fill, westFill];
  for (const light of outdoorLights) {
    pinLightToLayers(light, WORLD_LAYER, VIEWMODEL_LAYER);
  }

  return { sun, outdoorLights };
}

/**
 * Interior lights for arena rooms (normal/roughness maps read best with local points).
 * @param {THREE.Scene} scene
 * @param {import("./loadArena.js").ArenaRoom[]} rooms
 * @param {number} arenaHalf
 * @param {"north" | "south"} [attachWall]
 */
export function addRoomLights(scene, rooms = [], arenaHalf = 14, attachWall = "south") {
  const lights = [];
  for (const room of rooms) {
    const roomCenterZ = getAttachedRoomCenterZ(room, arenaHalf, attachWall);
    for (const spec of room.lights ?? []) {
      const color = new THREE.Color(spec.color ?? "#ffe8c8");
      const light = new THREE.PointLight(
        color,
        spec.intensity ?? 12,
        spec.distance ?? 8,
        spec.decay ?? 2
      );
      const [lx, ly, lz] = spec.position;
      light.position.set(
        room.centerX + lx,
        ly,
        roomCenterZ + lz
      );
      light.castShadow = spec.castShadow ?? false;
      if (light.castShadow) {
        light.shadow.mapSize.set(512, 512);
        light.shadow.bias = -0.002;
      }
      pinLightToRoomInteriorLayer(light);
      scene.add(light);
      lights.push(light);
    }
  }
  return lights;
}

/**
 * Three.js merges all camera-visible lights into one list, so layers alone do not
 * block outdoor lights from room meshes. Two passes: world (sun/ambient) then
 * interiors (point lights only).
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 */
export function renderSceneWithLayeredLighting(renderer, scene, camera) {
  const prevAutoClear = renderer.autoClear;
  const prevMask = camera.layers.mask;

  try {
    // Pass 1 — outdoor arena, sky, targets (sun / hemi / ambient only).
    renderer.autoClear = true;
    camera.layers.set(WORLD_LAYER);
    renderer.render(scene, camera);

    // Pass 2 — room shells (point lights only); keep world depth for doorway occlusion.
    renderer.autoClear = false;
    camera.layers.set(ROOM_INTERIOR_LAYER);
    renderer.render(scene, camera);
  } finally {
    renderer.autoClear = prevAutoClear;
    camera.layers.mask = prevMask;
  }
}

/** Weapon uses VIEWMODEL_LAYER and shares zone lighting from syncLightLayersForZone. */
export function renderViewmodelPass(renderer, scene, camera) {
  const prevAutoClear = renderer.autoClear;
  const prevMask = camera.layers.mask;

  try {
    renderer.autoClear = false;
    renderer.clearDepth(false);
    camera.layers.set(VIEWMODEL_LAYER);
    renderer.render(scene, camera);
  } finally {
    renderer.autoClear = prevAutoClear;
    camera.layers.mask = prevMask;
  }
}

/** Call at the start of each frame before layered renders (guards against a stuck mask). */
export function resetCameraRenderLayers(camera) {
  camera.layers.mask = ALL_RENDER_LAYERS_MASK;
}
