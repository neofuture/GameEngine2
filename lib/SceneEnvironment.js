import * as THREE from "three";
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
import { applyArenaCeilingNightness } from "./ArenaCeilingDayNight.js";
import { createDefaultSunPosition } from "./SunLightTuning.js";
import { loadMoonAngles, moonPositionFromAngles, configureMoonShadow, MOON_SHADOW_PADDING } from "./MoonLightTuning.js";

export { createSkyDome } from "./SkyDome.js";

/**
 * Apply shadow cast/receive flags. Meshes can opt out via userData:
 * `shadowCast: false` (deck, ceiling) · `shadowReceive: false`
 */
export function enableShadowsOn(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const ud = obj.userData;
    obj.castShadow = ud.shadowCast !== false;
    obj.receiveShadow = ud.shadowReceive !== false;
  });
}

/** Room interiors use local point lights — skip sun shadow map casting. */
export function disableInteriorCastShadows(root) {
  root.traverse((obj) => {
    if (!obj.isMesh || obj.userData.isShadowOccluder) return;
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

export const DAY_CLEAR_COLOR = 0xb8daf0;
export const NIGHT_CLEAR_COLOR = 0x060a14;
const DAY_FOG_NEAR = 45;
const DAY_FOG_FAR = 95;
const NIGHT_FOG_NEAR = 28;
const NIGHT_FOG_FAR = 68;
const SKY_NIGHT_BLEND = 1;

// Scratch for hex-color interpolation. Reused so we don't allocate per frame.
const _lerpHexA = new THREE.Color();
const _lerpHexB = new THREE.Color();
function lerpHexColor(aHex, bHex, t) {
  _lerpHexA.setHex(aHex);
  _lerpHexB.setHex(bHex);
  _lerpHexA.lerp(_lerpHexB, t);
  return _lerpHexA.getHex();
}

/** Interpolate two captured light states by t = 0 (day) → 1 (night). */
function lerpDayNightLightState(dayState, nightState, t) {
  const intensity = THREE.MathUtils.lerp(
    dayState.intensity,
    nightState.intensity,
    t
  );
  if (dayState.type === "hemi") {
    return {
      type: "hemi",
      intensity,
      sky: lerpHexColor(dayState.sky, nightState.sky, t),
      ground: lerpHexColor(dayState.ground, nightState.ground, t),
    };
  }
  if (dayState.color != null && nightState.color != null) {
    return {
      type: dayState.type,
      intensity,
      color: lerpHexColor(dayState.color, nightState.color, t),
    };
  }
  return { type: dayState.type, intensity };
}

/** @param {THREE.Light} light */
function captureDayNightLightBase(light) {
  if (light.isHemisphereLight) {
    return {
      type: "hemi",
      intensity: light.intensity,
      sky: light.color.getHex(),
      ground: light.groundColor.getHex(),
    };
  }
  if (light.isAmbientLight) {
    return { type: "ambient", intensity: light.intensity, color: light.color.getHex() };
  }
  if (light.isDirectionalLight) {
    return { type: "dir", intensity: light.intensity, color: light.color.getHex() };
  }
  return { type: "other", intensity: light.intensity };
}

/** @param {ReturnType<typeof captureDayNightLightBase>} state */
function applyDayNightLightState(light, state) {
  light.intensity = state.intensity;
  if (state.type === "hemi") {
    light.color.setHex(state.sky);
    light.groundColor.setHex(state.ground);
    return;
  }
  if (state.color != null) {
    light.color.setHex(state.color);
  }
}

/** @param {ReturnType<typeof captureDayNightLightBase>} base @param {boolean} sheltered @param {THREE.Light} light */
function nightLightStateFromDay(base, sheltered, light) {
  if (light.userData?.dayNightRole === "ceilingFill") {
    return { type: "dir", intensity: 0, color: base.color ?? 0x283850 };
  }

  const fillMult = sheltered ? 0.05 : 0.08;
  const hemiMult = sheltered ? 0.12 : 0.16;
  const ambMult = sheltered ? 0.14 : 0.18;

  if (base.type === "hemi") {
    return {
      type: "hemi",
      intensity: base.intensity * hemiMult,
      sky: 0x152238,
      ground: 0x060608,
    };
  }
  if (base.type === "ambient") {
    return {
      type: "ambient",
      intensity: base.intensity * ambMult,
      color: 0x405068,
    };
  }
  if (base.type === "dir") {
    return {
      type: "dir",
      intensity: base.intensity * fillMult,
      color: 0x283850,
    };
  }
  return { ...base, intensity: base.intensity * fillMult };
}

/** Store day intensities/colors on each outdoor light (call once after createOutdoorLights). */
export function registerOutdoorLightsForDayNight(outdoorLights) {
  for (const light of outdoorLights) {
    if (!light?.isLight) continue;
    light.userData.dayNightBase = captureDayNightLightBase(light);
  }
}

/**
 * Dim hemisphere, ambient, and shadowless fills for night. Sun is handled separately.
 * @param {THREE.Light[]} outdoorLights
 * @param {THREE.DirectionalLight | null | undefined} sun
 */
export function applyOutdoorDayNight(outdoorLights, isDay, sheltered = true, sun = null) {
  applyOutdoorDayNightNightness(outdoorLights, isDay ? 0 : 1, sheltered, sun);
}

/**
 * Same as {@link applyOutdoorDayNight} but accepts a continuous 0 = day → 1 =
 * night blend. Used by the day/night fade so lights smoothly interpolate
 * between their captured day base and their derived night state.
 * @param {THREE.Light[]} outdoorLights
 * @param {number} nightness 0..1
 */
export function applyOutdoorDayNightNightness(
  outdoorLights,
  nightness,
  sheltered = true,
  sun = null
) {
  const t = THREE.MathUtils.clamp(nightness, 0, 1);
  for (const light of outdoorLights) {
    if (!light?.isLight || light === sun || light.userData?.isMoon) continue;
    // Hemisphere light is driven directly by the user via applyHemisphereSettings.
    if (light.userData?.hemiManualControl) continue;
    const base = light.userData.dayNightBase;
    if (!base) continue;
    const nightState = nightLightStateFromDay(base, sheltered, light);
    applyDayNightLightState(light, lerpDayNightLightState(base, nightState, t));
  }
}

/**
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer} renderer
 * @param {{ setNightBlend?: (n: number) => void } | null | undefined} sky
 */
export function applyDayNightAtmosphere(scene, renderer, sky, isDay) {
  applyDayNightAtmosphereNightness(scene, renderer, sky, isDay ? 0 : 1);
}

/** Lerp version of {@link applyDayNightAtmosphere}. */
export function applyDayNightAtmosphereNightness(scene, renderer, sky, nightness) {
  const t = THREE.MathUtils.clamp(nightness, 0, 1);
  const clear = lerpHexColor(DAY_CLEAR_COLOR, NIGHT_CLEAR_COLOR, t);
  renderer.setClearColor(clear, 1);
  if (scene.fog) {
    scene.fog.color.setHex(clear);
    scene.fog.near = THREE.MathUtils.lerp(DAY_FOG_NEAR, NIGHT_FOG_NEAR, t);
    scene.fog.far = THREE.MathUtils.lerp(DAY_FOG_FAR, NIGHT_FOG_FAR, t);
  }
  sky?.setNightBlend?.(t * SKY_NIGHT_BLEND);
}

/**
 * @param {THREE.DirectionalLight} light
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer} renderer
 * @param {{ setNightBlend?: (n: number) => void } | null | undefined} sky
 * @param {{ outdoorLights: THREE.Light[], sheltered?: boolean, sunBaseIntensity: number, moon?: THREE.DirectionalLight | null, moonIntensity?: number, moonPosition?: { x: number, y: number, z: number }, isDay: boolean, levelRoot?: THREE.Object3D | null }} options
 */
export function applyDayNightEnvironment(
  light,
  scene,
  renderer,
  sky,
  options
) {
  applyDayNightEnvironmentNightness(light, scene, renderer, sky, {
    ...options,
    nightness: options.isDay ? 0 : 1,
  });
}

/**
 * Continuous version of {@link applyDayNightEnvironment}. Accepts `nightness`
 * (0 = full day, 1 = full night) so the caller can fade between states.
 */
export function applyDayNightEnvironmentNightness(
  light,
  scene,
  renderer,
  sky,
  {
    outdoorLights,
    sheltered = true,
    sunBaseIntensity,
    moon = null,
    moonIntensity = 0,
    moonPosition = null,
    nightness,
    levelRoot = null,
  }
) {
  const t = THREE.MathUtils.clamp(nightness, 0, 1);
  applySunNightness(light, t, sunBaseIntensity);
  applyMoonNightness(moon, {
    nightness: t,
    intensity: moonIntensity,
    position: moonPosition ?? undefined,
  });
  applyOutdoorDayNightNightness(outdoorLights, t, sheltered, light);
  applyDayNightAtmosphereNightness(scene, renderer, sky, t);
  if (levelRoot) {
    applyArenaCeilingNightness(levelRoot, t);
  }
}

/** @param {THREE.DirectionalLight} light @param {boolean} enabled @param {number} baseIntensity */
export function applySunEnabled(light, enabled, baseIntensity) {
  applySunNightness(light, enabled ? 0 : 1, baseIntensity);
}

/**
 * Sun intensity fades to 0 at full night. Shadow casting follows intensity so
 * the sun and moon can BOTH cast (and cross-blend) shadows during the fade,
 * each one's shadow naturally weighted by how brightly it's lighting the
 * scene. A small epsilon avoids paying for a shadow map render once the light
 * is effectively dark.
 */
export function applySunNightness(light, nightness, baseIntensity) {
  if (!light) return;
  const t = THREE.MathUtils.clamp(nightness, 0, 1);
  light.intensity = baseIntensity * (1 - t);
  light.castShadow = light.intensity > 0.001;
}

/**
 * @param {THREE.DirectionalLight | null | undefined} moon
 * @param {{ enabled: boolean, intensity: number, position?: { x: number, y: number, z: number } }} options
 */
export function applyMoonLight(moon, { enabled, intensity, position }) {
  applyMoonNightness(moon, {
    nightness: enabled ? 1 : 0,
    intensity,
    position,
  });
}

/** Moon counterpart of {@link applySunNightness}. */
export function applyMoonNightness(moon, { nightness, intensity, position }) {
  if (!moon) return;
  const t = THREE.MathUtils.clamp(nightness, 0, 1);
  moon.intensity = intensity * t;
  moon.castShadow = moon.intensity > 0.001;
  if (position) {
    moon.position.set(position.x, position.y, position.z);
    moon.updateMatrixWorld(true);
  }
}

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

/** Moon shadow frustum — wider coverage + already configured PCF blur radius. */
export function fitMoonDirectionalLightShadow(light, root, options = {}) {
  fitDirectionalLightShadow(light, root, {
    ...options,
    padding: options.padding ?? MOON_SHADOW_PADDING,
  });
}

let viewmodelInteriorAmbient = null;
let roomInteriorAmbient = null;

/** Low fill so room shells are not pitch-black when the point light misses a face. */
export function ensureRoomInteriorAmbient(scene) {
  if (!roomInteriorAmbient || roomInteriorAmbient.parent !== scene) {
    if (roomInteriorAmbient?.parent) {
      roomInteriorAmbient.parent.remove(roomInteriorAmbient);
    }
    roomInteriorAmbient = new THREE.AmbientLight(0x998070, 0.09);
    pinLightToRoomInteriorLayer(roomInteriorAmbient);
    scene.add(roomInteriorAmbient);
  }
}

export function resetRoomInteriorAmbient() {
  if (roomInteriorAmbient?.parent) {
    roomInteriorAmbient.parent.remove(roomInteriorAmbient);
  }
  roomInteriorAmbient = null;
}

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
 * @returns {{ sun: THREE.DirectionalLight, moon: THREE.DirectionalLight, hemi: THREE.HemisphereLight, outdoorLights: THREE.Light[] }}
 */
export function createOutdoorLights(scene, options = {}) {
  const sheltered = options.sheltered === true;

  // Sheltered arena: roof blocks most sky; keep modest fill so the floor stays
  // readable — ceiling undersides stay in shadow unless a light hits them.
  const hemi = new THREE.HemisphereLight(
    0x9ec0e8,
    0x5c5348,
    sheltered ? 0.28 : 0.38
  );
  hemi.userData.hemiManualControl = true;
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
  let moon;

  const moonAngles = loadMoonAngles();
  const moonPos = moonPositionFromAngles(moonAngles.azimuth, moonAngles.elevation);
  moon = new THREE.DirectionalLight(0xb8c8f0, 0);
  moon.userData.isMoon = true;
  moon.position.set(moonPos.x, moonPos.y, moonPos.z);
  moon.target.position.set(0, 1.4, 0);
  moon.castShadow = false;
  configureMoonShadow(moon);
  scene.add(moon.target);
  scene.add(moon);

  if (sheltered) {
    sun = new THREE.DirectionalLight(0xfff4e8, 2.85);
    const initial = createDefaultSunPosition();
    sun.position.set(initial.x, initial.y, initial.z);
    sun.target.position.set(0, 1.4, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.00025;
    sun.shadow.normalBias = 0.012;

    scene.add(sun.target);
    scene.add(sun);

    const outdoorLights = [hemi, ambient, sun, moon, fill, westFill];
    for (const light of outdoorLights) {
      pinLightToLayers(light, WORLD_LAYER, VIEWMODEL_LAYER);
    }
    return { sun, moon, hemi, outdoorLights };
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
  sun.shadow.normalBias = 0.012;
  scene.add(sun.target);
  scene.add(sun);

  const outdoorLights = [hemi, ambient, sun, moon, fill, westFill];
  for (const light of outdoorLights) {
    pinLightToLayers(light, WORLD_LAYER, VIEWMODEL_LAYER);
  }

  return { sun, moon, hemi, outdoorLights };
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
      light.userData.roomId = room.id ?? null;
      scene.add(light);
      lights.push(light);
    }
  }
  return lights;
}

/**
 * @param {THREE.Scene} scene
 * @returns {Map<THREE.Object3D, boolean>}
 */
function hideWorldMeshesExceptSky(scene) {
  const saved = new Map();
  scene.traverse((obj) => {
    if (!(obj.isMesh || obj.isSprite)) return;
    if (!obj.layers.test(WORLD_LAYER)) return;
    if (obj.userData.isSkyDome) return;
    saved.set(obj, obj.visible);
    obj.visible = false;
  });
  return saved;
}

function hideSkyMeshes(scene) {
  const saved = new Map();
  scene.traverse((obj) => {
    if (!(obj.isMesh || obj.isSprite)) return;
    if (!obj.userData.isSkyDome) return;
    saved.set(obj, obj.visible);
    obj.visible = false;
  });
  return saved;
}

function restoreMeshVisibility(saved) {
  for (const [obj, visible] of saved) {
    obj.visible = visible;
  }
}

/**
 * Three.js merges all camera-visible lights into one list, so layers alone do not
 * block outdoor lights from room meshes. Sky is drawn first (pass 0), then world
 * geometry (pass 1), then room interiors (pass 2). scene.background cannot be used
 * here — it redraws on every pass and erases the level.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {{ skyRoot?: THREE.Object3D | null }} [options]
 */
export function renderSceneWithLayeredLighting(renderer, scene, camera, options = {}) {
  const skyRoot = options.skyRoot ?? null;
  const hasSky = skyRoot?.visible !== false;
  // When no room is in view, skip the interior pass entirely — the cost
  // isn't just the per-mesh draw (those frustum-cull anyway) but also the
  // light gathering and uniform upload for any room point lights still
  // marked visible elsewhere in the scene graph.
  const skipRoomPass = options.skipRoomPass === true;
  const prevAutoClear = renderer.autoClear;
  const prevMask = camera.layers.mask;

  try {
    camera.layers.set(WORLD_LAYER);

    if (hasSky) {
      const hiddenWorld = hideWorldMeshesExceptSky(scene);
      renderer.autoClear = true;
      renderer.render(scene, camera);
      restoreMeshVisibility(hiddenWorld);

      const hiddenSky = hideSkyMeshes(scene);
      renderer.autoClear = false;
      renderer.render(scene, camera);
      restoreMeshVisibility(hiddenSky);
    } else {
      renderer.autoClear = true;
      renderer.render(scene, camera);
    }

    if (!skipRoomPass) {
      renderer.autoClear = false;
      camera.layers.set(ROOM_INTERIOR_LAYER);
      renderer.render(scene, camera);
    }
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
