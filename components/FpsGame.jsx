"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createLevelFromArena, disposeLevelGroup } from "@/lib/Level";
import { collectArenaTextureIds, loadArenaConfig } from "@/lib/loadArena";
import { loadLevelTextureLibrary } from "@/lib/LevelTextures";
import {
  createSkyDome,
  addRoomLights,
  ensureRoomInteriorAmbient,
  applyDayNightAtmosphere,
  applyDayNightEnvironment,
  applyDayNightEnvironmentNightness,
  createOutdoorLights,
  DAY_CLEAR_COLOR,
  enableShadowsOn,
  disableInteriorCastShadows,
  fitDirectionalLightShadow,
  fitMoonDirectionalLightShadow,
  registerOutdoorLightsForDayNight,
  renderSceneWithLayeredLighting,
  resetCameraRenderLayers,
  resetRoomInteriorAmbient,
  resetViewmodelInteriorAmbient,
  syncLightLayersForZone,
} from "@/lib/SceneEnvironment";
import {
  assignWorldLayers,
  HEALTH_BAR_LAYER,
  ROOM_INTERIOR_LAYER,
  VIEWMODEL_LAYER,
  WORLD_LAYER,
} from "@/lib/LightingLayers";
import { isPointInsideAnyRoom } from "@/lib/RoomPlacement";
import { getArenaAttachWall } from "@/lib/DoorwayWall";
import { createInput } from "@/lib/Input";
import { createPlayerController } from "@/lib/PlayerController";
import { createBulletPool, loadViewWeapon } from "@/lib/ViewWeapon";
import {
  applyTargetHit,
  activateTargetAt,
  deactivateTarget,
  disposeAllTargetHealthBars,
  pickRandomSpawnPosition,
  renderTargetHealthBarsPass,
  setHealthBarOccluders,
  updateTargetsRepair,
  updateTargetHealthBars,
} from "@/lib/Targets";
import {
  DEFAULT_ADS_POSE,
  DEFAULT_BODY_LOOK_DOWN_AMOUNT,
  DEFAULT_BODY_LOOK_UP_AMOUNT,
  DEFAULT_HIP_POSE,
  loadBodyLookDownAmount,
  loadBodyLookUpAmount,
  loadWeaponTuneEnabled,
  loadWeaponTuning,
  saveWeaponTuneEnabled,
} from "@/lib/WeaponTuning";
import WeaponTunePanel from "@/components/WeaponTunePanel";
import SunTunePanel from "@/components/SunTunePanel";
import StairTunePanel from "@/components/StairTunePanel";
import HemisphereTunePanel from "@/components/HemisphereTunePanel";
import WalkBobTunePanel from "@/components/WalkBobTunePanel";
import { SettingsSection } from "@/components/SettingsSection";
import {
  DEFAULT_HEMI_DAY,
  DEFAULT_HEMI_NIGHT,
  applyHemisphereSettings,
  loadHemiDay,
  loadHemiNight,
  saveHemiDay,
  saveHemiNight,
} from "@/lib/HemisphereTuning";
import {
  getArenaCatwalkDeckY,
  getArenaFloorDeckY,
  loadStairTuning,
  saveStairTuning,
} from "@/lib/StairTuning";
import {
  applySunLightPosition,
  loadSunAngles,
  loadSunDayMode,
  saveSunAngles,
  saveSunDayMode,
  sunPositionFromAngles,
} from "@/lib/SunLightTuning";
import {
  applyMoonLightPosition,
  loadMoonAngles,
  loadMoonIntensity,
  moonPositionFromAngles,
  saveMoonAngles,
  saveMoonIntensity,
} from "@/lib/MoonLightTuning";
import {
  DEFAULT_WALK_BOB_SIMPLE,
  loadWalkBobTuneEnabled,
  loadWalkBobTuning,
  normalizeWalkBobSimple,
  resolveWalkBobTuning,
  saveWalkBobTuneEnabled,
  saveWalkBobTuning,
} from "@/lib/WalkBobTuning";
import ControlsPanel from "@/components/ControlsPanel";
import CompassOverlay from "@/components/CompassOverlay";
import {
  isBindingDown,
  loadBindings,
  saveBindings,
  wasBindingPressed,
} from "@/lib/KeyBindings";

const INVERT_Y_KEY = "fps-invert-y";
const KEYBOARD_LOOK_KEY = "fps-keyboard-look";
const KEYBOARD_EASE_KEY = "fps-keyboard-ease";
const MOUSE_LOOK_KEY = "fps-mouse-look";
const MOUSE_EASE_KEY = "fps-mouse-ease";
const LOOK_MAX_RATE_KEY = "fps-look-max-rate";
const SUN_TUNE_ENABLED_KEY = "fps-sun-tune-enabled";
const HEMI_TUNE_ENABLED_KEY = "fps-hemi-tune-enabled";
const STAIRS_TUNE_ENABLED_KEY = "fps-stairs-tune-enabled";
const LEGACY_LOOK_SPEED_KEY = "fps-look-speed";
const LEGACY_LOOK_EASE_KEY = "fps-look-ease";
const DEFAULT_LOOK = 7;
const DEFAULT_MAX_LOOK_RATE = 2.5;
/** Seconds for the day/night toggle to crossfade from one state to the other. */
const DAY_NIGHT_FADE_DURATION = 10;
const MAGAZINE_SIZE = 80;
const SPARE_MAGAZINES = 4;
const BURST_SHOT_COUNT = 3;
const BURST_INTERVAL = 0.085;
const AUTO_FIRE_INTERVAL = 0.1;
const FIRE_MODE_ORDER = ["single", "burst", "auto"];
const FIRE_MODE_LABELS = {
  single: "Single",
  burst: "Burst",
  auto: "Auto",
};

function safeRequestPointerLock(canvas) {
  if (document.pointerLockElement === canvas) return;
  canvas.requestPointerLock().catch(() => {});
}

function safeExitPointerLock() {
  if (!document.pointerLockElement) return;
  try {
    document.exitPointerLock();
  } catch {
    // ignore — lock may already be releasing
  }
}

export default function FpsGame() {
  const canvasRef = useRef(null);
  const crosshairRef = useRef(null);
  const fpsRef = useRef(null);
  const compassDialRef = useRef(null);
  const [invertYLook, setInvertYLook] = useState(false);
  const [keyboardLook, setKeyboardLook] = useState(DEFAULT_LOOK);
  const [keyboardEase, setKeyboardEase] = useState(DEFAULT_LOOK);
  const [mouseLook, setMouseLook] = useState(DEFAULT_LOOK);
  const [mouseEase, setMouseEase] = useState(DEFAULT_LOOK);
  const [maxLookRate, setMaxLookRate] = useState(DEFAULT_MAX_LOOK_RATE);
  const [sunAzimuth, setSunAzimuth] = useState(() => loadSunAngles().azimuth);
  const [sunElevation, setSunElevation] = useState(() => loadSunAngles().elevation);
  const initialMoonAngles = loadMoonAngles();
  const [moonAzimuth, setMoonAzimuth] = useState(initialMoonAngles.azimuth);
  const [moonElevation, setMoonElevation] = useState(initialMoonAngles.elevation);
  const [moonIntensity, setMoonIntensity] = useState(() => loadMoonIntensity());
  const [sunIsDay, setSunIsDay] = useState(() => loadSunDayMode());
  const initialStairTuning = loadStairTuning();
  const initialWalkBobTuning = loadWalkBobTuning();
  const [stairX, setStairX] = useState(initialStairTuning.position.x);
  const [stairY, setStairY] = useState(initialStairTuning.position.y);
  const [stairZ, setStairZ] = useState(initialStairTuning.position.z);
  const [stairRotationY, setStairRotationY] = useState(initialStairTuning.rotationY);
  const [arenaHasStairs, setArenaHasStairs] = useState(false);
  const [stairsTuneEnabled, setStairsTuneEnabled] = useState(false);
  const [walkBobTuneEnabled, setWalkBobTuneEnabled] = useState(false);
  const [walkBobTuning, setWalkBobTuning] = useState(initialWalkBobTuning);
  const [sunTuneEnabled, setSunTuneEnabled] = useState(false);
  const [hemiTuneEnabled, setHemiTuneEnabled] = useState(false);
  const [floorDeckY, setFloorDeckY] = useState(0);
  const [catwalkDeckY, setCatwalkDeckY] = useState(4.13);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [weaponTuneEnabled, setWeaponTuneEnabled] = useState(false);
  const [bindings, setBindings] = useState(() => loadBindings());
  const [rebindAction, setRebindAction] = useState(null);
  const bindingsRef = useRef(loadBindings());
  const settingsOpenRef = useRef(false);
  const controlsOpenRef = useRef(false);
  const weaponTuneEnabledRef = useRef(false);
  const invertYRef = useRef(false);
  const keyboardLookRef = useRef(DEFAULT_LOOK);
  const keyboardEaseRef = useRef(DEFAULT_LOOK);
  const mouseLookRef = useRef(DEFAULT_LOOK);
  const mouseEaseRef = useRef(DEFAULT_LOOK);
  const maxLookRateRef = useRef(DEFAULT_MAX_LOOK_RATE);
  const storedSunAngles = loadSunAngles();
  const sunAnglesRef = useRef(storedSunAngles);
  const sunLightPosRef = useRef(
    sunPositionFromAngles(storedSunAngles.azimuth, storedSunAngles.elevation)
  );
  const moonAnglesRef = useRef(initialMoonAngles);
  const moonIntensityRef = useRef(loadMoonIntensity());
  const moonLightPosRef = useRef(
    moonPositionFromAngles(initialMoonAngles.azimuth, initialMoonAngles.elevation)
  );
  const refitSunShadowRef = useRef(null);
  const refitMoonShadowRef = useRef(null);
  const rebuildStairsRef = useRef(null);
  const stairParamsRef = useRef(initialStairTuning);
  const walkBobTuningRef = useRef(initialWalkBobTuning);
  const sunRef = useRef(null);
  const moonRef = useRef(null);
  const sunBaseIntensityRef = useRef(2.85);
  const sunIsDayRef = useRef(loadSunDayMode());
  const applyDayNightRef = useRef(null);
  // Continuous 0 (full day) → 1 (full night) value driving the day/night fade.
  // `target` is set instantly by the toggle; `cur` is slewed toward it in the
  // animate loop so every light/atmosphere/hemi setting eases together.
  const dayNightTargetNightnessRef = useRef(loadSunDayMode() ? 0 : 1);
  const dayNightCurNightnessRef = useRef(loadSunDayMode() ? 0 : 1);
  const skyRef = useRef(null);
  const weaponRef = useRef(null);
  const hemiRef = useRef(null);
  const [hemiDay, setHemiDay] = useState(() => ({ ...DEFAULT_HEMI_DAY }));
  const [hemiNight, setHemiNight] = useState(() => ({ ...DEFAULT_HEMI_NIGHT }));
  const hemiDayRef = useRef({ ...DEFAULT_HEMI_DAY });
  const hemiNightRef = useRef({ ...DEFAULT_HEMI_NIGHT });
  const [weaponPoseMode, setWeaponPoseMode] = useState("hip");
  const [hipWeaponPose, setHipWeaponPose] = useState(DEFAULT_HIP_POSE);
  const [adsWeaponPose, setAdsWeaponPose] = useState(DEFAULT_ADS_POSE);
  const [bodyLookUpAmount, setBodyLookUpAmount] = useState(0);
  const [bodyLookDownAmount, setBodyLookDownAmount] = useState(0);
  const [fireMode, setFireMode] = useState("single");
  const [roundsInMag, setRoundsInMag] = useState(MAGAZINE_SIZE);
  const [spareMags, setSpareMags] = useState(SPARE_MAGAZINES);
  const fireModeRef = useRef("single");
  const roundsInMagRef = useRef(MAGAZINE_SIZE);
  const spareMagsRef = useRef(SPARE_MAGAZINES);
  const setAmmoStateRef = useRef(null);
  const weaponTuningRef = useRef({
    hip: DEFAULT_HIP_POSE,
    ads: DEFAULT_ADS_POSE,
    bodyLookUpAmount: DEFAULT_BODY_LOOK_UP_AMOUNT,
    bodyLookDownAmount: DEFAULT_BODY_LOOK_DOWN_AMOUNT,
  });
  const weaponPoseModeRef = useRef("hip");
  const rebindActionRef = useRef(null);

  useEffect(() => {
    const tuning = loadWeaponTuning();
    setHipWeaponPose(tuning.hip);
    setAdsWeaponPose(tuning.ads);
    setBodyLookUpAmount(loadBodyLookUpAmount());
    setBodyLookDownAmount(loadBodyLookDownAmount());
    const storedHemiDay = loadHemiDay();
    const storedHemiNight = loadHemiNight();
    setHemiDay(storedHemiDay);
    setHemiNight(storedHemiNight);
    hemiDayRef.current = storedHemiDay;
    hemiNightRef.current = storedHemiNight;
    weaponTuningRef.current = {
      ...tuning,
      bodyLookUpAmount: loadBodyLookUpAmount(),
      bodyLookDownAmount: loadBodyLookDownAmount(),
    };
  }, []);

  weaponTuningRef.current = {
    hip: hipWeaponPose,
    ads: adsWeaponPose,
    bodyLookUpAmount,
    bodyLookDownAmount,
  };
  weaponPoseModeRef.current = weaponPoseMode;
  walkBobTuningRef.current = walkBobTuning;
  bindingsRef.current = bindings;
  rebindActionRef.current = rebindAction;
  fireModeRef.current = fireMode;
  roundsInMagRef.current = roundsInMag;
  spareMagsRef.current = spareMags;
  setAmmoStateRef.current = (rounds, spare) => {
    setRoundsInMag(rounds);
    setSpareMags(spare);
  };

  useEffect(() => {
    if (!rebindAction) return;
    const onKeyDown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") {
        setRebindAction(null);
        return;
      }
      if (e.code.startsWith("Mouse") || e.code === "Tab") return;
      setBindings((prev) => {
        const next = { ...prev, [rebindAction]: e.code };
        saveBindings(next);
        bindingsRef.current = next;
        return next;
      });
      setRebindAction(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [rebindAction]);

  useEffect(() => {
    const storedInvert = localStorage.getItem(INVERT_Y_KEY) === "true";
    const legacySpeed = parseFloat(localStorage.getItem(LEGACY_LOOK_SPEED_KEY));
    const legacyEase = parseFloat(localStorage.getItem(LEGACY_LOOK_EASE_KEY));
    const read = (key, fallback) => {
      const v = parseFloat(localStorage.getItem(key));
      return Number.isNaN(v) ? fallback : v;
    };
    const speedFallback = Number.isNaN(legacySpeed) ? DEFAULT_LOOK : legacySpeed;
    const easeFallback = Number.isNaN(legacyEase) ? DEFAULT_LOOK : legacyEase;
    const kbLook = read(KEYBOARD_LOOK_KEY, speedFallback);
    const kbEase = read(KEYBOARD_EASE_KEY, easeFallback);
    const mLook = read(MOUSE_LOOK_KEY, speedFallback);
    const mEase = read(MOUSE_EASE_KEY, easeFallback);
    const maxRate = read(LOOK_MAX_RATE_KEY, DEFAULT_MAX_LOOK_RATE);
    const tuneEnabled = loadWeaponTuneEnabled();
    const sunEnabled = localStorage.getItem(SUN_TUNE_ENABLED_KEY) === "true";
    const hemiEnabled = localStorage.getItem(HEMI_TUNE_ENABLED_KEY) === "true";
    const stairsEnabled = localStorage.getItem(STAIRS_TUNE_ENABLED_KEY) === "true";
    const walkBobEnabled = loadWalkBobTuneEnabled();
    setInvertYLook(storedInvert);
    setWeaponTuneEnabled(tuneEnabled);
    setSunTuneEnabled(sunEnabled);
    setHemiTuneEnabled(hemiEnabled);
    setStairsTuneEnabled(stairsEnabled);
    setWalkBobTuneEnabled(walkBobEnabled);
    setKeyboardLook(kbLook);
    setKeyboardEase(kbEase);
    setMouseLook(mLook);
    setMouseEase(mEase);
    setMaxLookRate(maxRate);
    invertYRef.current = storedInvert;
    keyboardLookRef.current = kbLook;
    keyboardEaseRef.current = kbEase;
    mouseLookRef.current = mLook;
    mouseEaseRef.current = mEase;
    maxLookRateRef.current = maxRate;
  }, []);

  invertYRef.current = invertYLook;
  keyboardLookRef.current = keyboardLook;
  keyboardEaseRef.current = keyboardEase;
  mouseLookRef.current = mouseLook;
  mouseEaseRef.current = mouseEase;
  maxLookRateRef.current = maxLookRate;
  sunAnglesRef.current = { azimuth: sunAzimuth, elevation: sunElevation };
  sunLightPosRef.current = sunPositionFromAngles(sunAzimuth, sunElevation);
  moonAnglesRef.current = { azimuth: moonAzimuth, elevation: moonElevation };
  moonIntensityRef.current = moonIntensity;
  moonLightPosRef.current = moonPositionFromAngles(moonAzimuth, moonElevation);
  sunIsDayRef.current = sunIsDay;
  const commitStairParams = (params) => {
    stairParamsRef.current = params;
    saveStairTuning(params);
    rebuildStairsRef.current?.(params);
  };
  settingsOpenRef.current = settingsOpen;
  controlsOpenRef.current = controlsOpen;
  weaponTuneEnabledRef.current = weaponTuneEnabled;

  useEffect(() => {
    const canvas = canvasRef.current;
    const crosshair = crosshairRef.current;
    if (!canvas || !crosshair) return;

    let sky = null;
    let scene = null;
    let levelTextures = null;
    let disposed = false;
    let rafId = 0;
    let level = null;
    let player = null;
    let input = null;
    let weapon = null;
    let weaponLoadId = 0;
    let flashTimeout = null;
    let bulletPool = null;
    let bullets = [];
    let gameReady = false;
    let onCanvasClick = null;
    let onPointerLockChange = null;
    let onKeyDown = null;
    let onResize = null;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      // Log depth breaks directional shadow maps in many Three.js builds.
      logarithmicDepthBuffer: false,
    });

    async function init() {
      const isActive = () => !disposed;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor(DAY_CLEAR_COLOR, 1);

      scene = new THREE.Scene();
      scene.fog = new THREE.Fog(DAY_CLEAR_COLOR, 45, 95);

      const HIP_FOV = 75;
      const ADS_FOV = 52;
      const camera = new THREE.PerspectiveCamera(
        HIP_FOV,
        window.innerWidth / window.innerHeight,
        0.1,
        200
      );
      camera.layers.enable(WORLD_LAYER);
      camera.layers.enable(ROOM_INTERIOR_LAYER);
      camera.layers.enable(VIEWMODEL_LAYER);
      camera.layers.enable(HEALTH_BAR_LAYER);
      const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
      const arena = await loadArenaConfig();
      if (!isActive()) return;

      levelTextures = await loadLevelTextureLibrary(
        maxAnisotropy,
        collectArenaTextureIds(arena)
      );
      if (!isActive()) return;

      const sheltered = (arena.ceilingThickness ?? 0) > 0;
      const { sun, moon, hemi, outdoorLights } = createOutdoorLights(scene, {
        sheltered,
      });
      hemiRef.current = hemi;
      registerOutdoorLightsForDayNight(outdoorLights);
      const attachWall = getArenaAttachWall(arena);
      const arenaHalf = arena.size / 2;
      const roomLights = addRoomLights(scene, arena.rooms, arenaHalf, attachWall);
      ensureRoomInteriorAmbient(scene);
      syncLightLayersForZone(scene, false, outdoorLights, roomLights);
      setFloorDeckY(getArenaFloorDeckY());
      setCatwalkDeckY(getArenaCatwalkDeckY(arena));
      let stairParams = loadStairTuning(arena.stairs, arena);
      stairParamsRef.current = stairParams;
      setStairX(stairParams.position.x);
      setStairY(stairParams.position.y);
      setStairZ(stairParams.position.z);
      setStairRotationY(stairParams.rotationY);
      level = createLevelFromArena(
        scene,
        { ...arena, stairs: stairParams },
        levelTextures
      );
      setArenaHasStairs(Boolean(arena.stairs));
      if (!isActive()) {
        if (level?.group) disposeLevelGroup(level.group);
        levelTextures?.dispose();
        return;
      }
      enableShadowsOn(level.group);
      assignWorldLayers(level.group);
      disableInteriorCastShadows(level.group);
      setHealthBarOccluders(level.group);
      applySunLightPosition(sun, sunLightPosRef.current);
      applyMoonLightPosition(moon, moonLightPosRef.current);
      sunRef.current = sun;
      moonRef.current = moon;
      sunBaseIntensityRef.current = sun.intensity;
      applyDayNightRef.current = (arg) => {
        // Accept either a boolean (legacy `isDay`) or a 0..1 nightness so
        // callers don't all have to be updated at once. The animate loop
        // passes the current nightness directly each frame.
        const nightness =
          typeof arg === "boolean"
            ? arg ? 0 : 1
            : THREE.MathUtils.clamp(arg ?? dayNightCurNightnessRef.current, 0, 1);
        dayNightCurNightnessRef.current = nightness;

        // Drive the sun across the sky from its configured elevation down
        // through the horizon to a mirrored elevation below it, while the
        // moon rises from the opposite (below-horizon) angle up to its
        // configured peak. At nightness=0.5 both lights are at the horizon
        // casting long shadows — that's the dawn/dusk moment.
        const sunCfg = sunAnglesRef.current;
        const moonCfg = moonAnglesRef.current;
        const sunElev = THREE.MathUtils.lerp(
          sunCfg.elevation,
          -sunCfg.elevation,
          nightness
        );
        const moonElev = THREE.MathUtils.lerp(
          -moonCfg.elevation,
          moonCfg.elevation,
          nightness
        );
        const animSunPos = sunPositionFromAngles(sunCfg.azimuth, sunElev);
        const animMoonPos = moonPositionFromAngles(moonCfg.azimuth, moonElev);

        applySunLightPosition(sun, animSunPos);

        applyDayNightEnvironmentNightness(
          sun,
          scene,
          renderer,
          sky ?? skyRef.current,
          {
            outdoorLights,
            sheltered,
            sunBaseIntensity: sunBaseIntensityRef.current,
            moon,
            moonIntensity: moonIntensityRef.current,
            moonPosition: animMoonPos,
            nightness,
            levelRoot: level?.group ?? null,
          }
        );

        // Override the linear nightness-based intensity with an elevation-
        // based one. Each light fades naturally as it approaches the horizon
        // and is gone once it dips below — this is also what kills shadows
        // before they'd otherwise render from below the floor.
        const sunFactor = THREE.MathUtils.smoothstep(sunElev, -2, 5);
        const moonFactor = THREE.MathUtils.smoothstep(moonElev, -2, 5);
        sun.intensity = sunBaseIntensityRef.current * sunFactor;
        sun.castShadow = sun.intensity > 0.001;
        moon.intensity = moonIntensityRef.current * moonFactor;
        moon.castShadow = moon.intensity > 0.001;

        // Pin the sky's sun/moon billboards to the same animated positions so
        // the discs visibly track the light sources. Opacity follows each
        // light's elevation factor so the disc fades with the actual lighting
        // contribution (and disappears below the horizon).
        const activeSky = sky ?? skyRef.current;
        if (activeSky) {
          activeSky.setSunPosition?.(animSunPos);
          activeSky.setMoonPosition?.(animMoonPos);
          activeSky.setSunOpacity?.(sunFactor);
          activeSky.setMoonOpacity?.(moonFactor);
        }

        // Hemi is user-tunable per mode — lerp temperature + intensity between
        // the two stored settings so the sky/ground hemi color eases too.
        const dayHemi = hemiDayRef.current;
        const nightHemi = hemiNightRef.current;
        applyHemisphereSettings(hemiRef.current, {
          temperature: THREE.MathUtils.lerp(
            dayHemi.temperature,
            nightHemi.temperature,
            nightness
          ),
          intensity: THREE.MathUtils.lerp(
            dayHemi.intensity,
            nightHemi.intensity,
            nightness
          ),
        });
      };
      refitSunShadowRef.current = () => {
        if (!level?.group) return;
        applySunLightPosition(sun, sunLightPosRef.current);
        fitDirectionalLightShadow(sun, level.group, {
          arenaSize: arena.size,
        });
        sun.updateMatrixWorld(true);
        sun.target.updateMatrixWorld(true);
      };
      refitMoonShadowRef.current = () => {
        if (!level?.group || !moon) return;
        applyMoonLightPosition(moon, moonLightPosRef.current);
        fitMoonDirectionalLightShadow(moon, level.group, {
          arenaSize: arena.size,
        });
        moon.updateMatrixWorld(true);
        moon.target.updateMatrixWorld(true);
      };
      applyDayNightRef.current(sunIsDayRef.current);
      if (sunIsDayRef.current) {
        refitSunShadowRef.current();
      } else {
        refitMoonShadowRef.current();
      }
      sun.updateMatrixWorld(true);
      sun.target.updateMatrixWorld(true);
      moon.updateMatrixWorld(true);
      moon.target.updateMatrixWorld(true);
      input = createInput(canvas, () => bindingsRef.current);
      rebuildStairsRef.current = (params) => {
        if (!level?.rebuildStairs) return;
        level.rebuildStairs(params);
      };

      player = createPlayerController(camera, level.bounds, level.floorY, {
        getColliders: () => [
          ...level.colliders,
          ...level.stairColliders,
          ...level.ceilingColliders,
        ],
        getGroundSurfaces: () => level.groundSurfaces,
        getBindings: () => bindingsRef.current,
        getInvertYLook: () => invertYRef.current,
        getKeyboardLookSpeed: () => keyboardLookRef.current,
        getKeyboardLookEase: () => keyboardEaseRef.current,
        getMouseLookSpeed: () => mouseLookRef.current,
        getMouseLookEase: () => mouseEaseRef.current,
        getMaxLookRate: () => maxLookRateRef.current,
        getWalkBobTuning: () =>
          resolveWalkBobTuning(walkBobTuningRef.current),
      });

      const shootRaycaster = new THREE.Raycaster();
      const currentWeaponLoad = ++weaponLoadId;
      loadViewWeapon(camera, scene, undefined, { maxAnisotropy })
        .then((loaded) => {
        if (disposed || currentWeaponLoad !== weaponLoadId) {
          loaded.dispose();
          return;
        }
        weapon = loaded;
        weaponRef.current = loaded;
        weapon.update(camera, 0, 0, weaponTuningRef);
      })
        .catch((err) => console.error("Rifle model failed to load:", err));
      bulletPool = createBulletPool();
      bullets = [];
      const muzzlePos = new THREE.Vector3();
      const muzzleDir = new THREE.Vector3();
      const BULLET_SPEED = 75;
      const BULLET_MAX_RANGE = 55;
      const targetConfig = level.targetConfig;

      function getLiveTargets() {
        return level.targets.filter(
          (t) => t.visible && t.userData.health > 0
        );
      }

      function scheduleRespawn(mesh) {
        const delayMs = targetConfig.respawnDelay * 1000;
        setTimeout(() => {
          if (disposed) return;
          const pos = pickRandomSpawnPosition({
            bounds: level.bounds,
            colliders: level.colliders,
            targets: level.targets,
            config: targetConfig,
            skip: mesh,
          });
          if (!pos) return;
          activateTargetAt(mesh, pos.x, pos.z, targetConfig);
        }, delayMs);
      }

      function applyHit(hit) {
        const { killed } = applyTargetHit(hit.object);
        if (killed) {
          deactivateTarget(hit.object);
          scheduleRespawn(hit.object);
        }
      }

      function removeBullet(index) {
        const b = bullets[index];
        scene.remove(b.mesh);
        b.core.material.dispose();
        b.glow.material.dispose();
        bullets.splice(index, 1);
      }

      function spawnBullet(origin, direction) {
        const bullet = bulletPool.spawn(scene, origin, direction);
        bullet.traveled = 0;
        bullets.push(bullet);
      }

      function flashMuzzle() {
        if (!weapon) return;
        weapon.muzzleFlash.color.setHex(0x66ccff);
        weapon.muzzleFlash.intensity = 5;
        if (flashTimeout) clearTimeout(flashTimeout);
        flashTimeout = setTimeout(() => {
          weapon.muzzleFlash.intensity = 0;
        }, 60);
      }

      let burstShotsLeft = 0;
      let burstTimer = 0;
      let autoFireTimer = 0;

      function syncAmmoToUi() {
        setAmmoStateRef.current?.(
          roundsInMagRef.current,
          spareMagsRef.current
        );
      }

      function tryReload() {
        if (spareMagsRef.current <= 0) return false;
        spareMagsRef.current -= 1;
        roundsInMagRef.current = MAGAZINE_SIZE;
        syncAmmoToUi();
        return true;
      }

      function fireOneRound() {
        if (roundsInMagRef.current <= 0 && !tryReload()) return false;

        roundsInMagRef.current -= 1;
        syncAmmoToUi();
        weapon.getMuzzleWorld(muzzlePos, muzzleDir, camera);
        spawnBullet(muzzlePos, muzzleDir);
        flashMuzzle();
        return true;
      }

      function processWeaponFire(dt) {
        if (!weapon) return;

        const mode = fireModeRef.current;
        if (
          burstShotsLeft === 0 &&
          mode === "burst" &&
          input.consumeShoot()
        ) {
          burstShotsLeft = BURST_SHOT_COUNT;
          burstTimer = 0;
        }

        if (burstShotsLeft > 0) {
          burstTimer -= dt;
          while (burstShotsLeft > 0 && burstTimer <= 0) {
            if (!fireOneRound()) {
              burstShotsLeft = 0;
              break;
            }
            burstShotsLeft -= 1;
            burstTimer = burstShotsLeft > 0 ? BURST_INTERVAL : 0;
          }
          return;
        }

        if (mode === "single" && input.consumeShoot()) {
          fireOneRound();
        } else if (mode === "auto") {
          autoFireTimer -= dt;
          if (
            input.isShootHeld() &&
            (input.consumeShoot() || autoFireTimer <= 0)
          ) {
            if (fireOneRound()) autoFireTimer = AUTO_FIRE_INTERVAL;
          }
        }
      }

      function updateBullets(dt) {
        const targets = getLiveTargets();
        for (let i = bullets.length - 1; i >= 0; i--) {
          const bullet = bullets[i];
          const prev = bullet.mesh.position.clone();
          const step = bullet.direction.clone().multiplyScalar(BULLET_SPEED * dt);
          bullet.mesh.position.add(step);
          bullet.traveled += step.length();

          shootRaycaster.set(prev, bullet.direction);
          shootRaycaster.far = step.length() + 0.05;
          const hits = shootRaycaster.intersectObjects(targets, false);
          if (hits[0]) {
            bullet.mesh.position.copy(hits[0].point);
            applyHit(hits[0]);
            removeBullet(i);
            continue;
          }

          if (bullet.traveled >= BULLET_MAX_RANGE) {
            removeBullet(i);
          }
        }
      }

      let lastTime = performance.now();
      let fpsSmooth = 60;

      function syncPointerLocked() {
        setPointerLocked(document.pointerLockElement === canvas);
      }

      function animate(now) {
        if (disposed || !gameReady || !level?.group) return;
        if (!level.group.parent) scene.add(level.group);
        rafId = requestAnimationFrame(animate);
        try {
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        if (dt > 0) {
          fpsSmooth += (1 / dt - fpsSmooth) * 0.12;
          if (fpsRef.current) {
            fpsRef.current.textContent = `${Math.round(fpsSmooth)} FPS`;
          }
        }

        const locked = input.isLocked();
        const aimHeld =
          !rebindActionRef.current &&
          isBindingDown(input, bindingsRef.current, "aim");
        const aimTabActive =
          weaponTuneEnabledRef.current && weaponPoseModeRef.current === "ads";
        const aimTarget = aimHeld || aimTabActive ? 1 : 0;
        const canUseWeapons =
          !rebindActionRef.current &&
          !settingsOpenRef.current &&
          !controlsOpenRef.current;

        player.update(input, dt);
        if (compassDialRef.current) {
          const yawDeg = (player.getYaw() * 180) / Math.PI;
          compassDialRef.current.style.transform = `rotate(${-yawDeg}deg)`;
        }
        camera.updateMatrixWorld(true);

        if (
          canUseWeapons &&
          wasBindingPressed(input, bindingsRef.current, "flashlight")
        ) {
          weapon?.toggleFlashlight();
        }

        weapon?.update(camera, aimTarget, dt, weaponTuningRef, {
          snapAim: !locked,
          moveSpeed: player.getHorizontalSpeed(),
          onStairs: player.isOnStairs(),
          walkBobTuning: resolveWalkBobTuning(walkBobTuningRef.current),
        });

        const aimBlend = weapon?.getAimBlend() ?? 0;
        const targetFov = THREE.MathUtils.lerp(HIP_FOV, ADS_FOV, aimBlend);
        camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-12 * dt));
        camera.updateProjectionMatrix();

        const keyboardShoot =
          canUseWeapons &&
          isBindingDown(input, bindingsRef.current, "shoot");

        if (canUseWeapons && (locked || keyboardShoot)) {
          processWeaponFire(dt);
        }

        if (
          !rebindActionRef.current &&
          !settingsOpenRef.current &&
          !controlsOpenRef.current &&
          wasBindingPressed(input, bindingsRef.current, "cycleFireMode")
        ) {
          const modes = FIRE_MODE_ORDER;
          const i = modes.indexOf(fireModeRef.current);
          const next = modes[(i + 1) % modes.length];
          fireModeRef.current = next;
          setFireMode(next);
        }

        const dnTarget = dayNightTargetNightnessRef.current;
        let dnCur = dayNightCurNightnessRef.current;
        if (dnCur !== dnTarget) {
          const dnStep = dt / DAY_NIGHT_FADE_DURATION;
          dnCur =
            dnTarget > dnCur
              ? Math.min(dnTarget, dnCur + dnStep)
              : Math.max(dnTarget, dnCur - dnStep);
          dayNightCurNightnessRef.current = dnCur;
          applyDayNightRef.current?.(dnCur);
        }

        updateBullets(dt);
        updateTargetsRepair(level.targets, dt);
        updateTargetHealthBars(level.targets, dt, camera);

        input.endFrame();
        sun.target.updateMatrixWorld();

        const inRoom = isPointInsideAnyRoom(
          camera.position.x,
          camera.position.z,
          arena.rooms,
          arenaHalf,
          attachWall
        );
        syncLightLayersForZone(scene, inRoom, outdoorLights, roomLights);

        sky?.update(camera);
        resetCameraRenderLayers(camera);
        renderSceneWithLayeredLighting(renderer, scene, camera, {
          skyRoot: sky?.mesh ?? null,
        });
        if (level?.targets) {
          renderTargetHealthBarsPass(renderer, scene, camera, level.targets);
        }
        weapon?.renderViewmodel(renderer, scene, camera);
        } catch (err) {
          console.error("Frame render failed:", err);
        }
      }

      onCanvasClick = (e) => {
        if (e.target !== canvas) return;
        safeRequestPointerLock(canvas);
      };
      onPointerLockChange = () => syncPointerLocked();
      onKeyDown = (e) => {
        if (e.code === "Escape") {
          if (settingsOpenRef.current) {
            setSettingsOpen(false);
          } else if (controlsOpenRef.current) {
            setControlsOpen(false);
          } else {
            safeExitPointerLock();
          }
          return;
        }
        if (e.code === "KeyI" && !e.repeat) {
          setInvertYLook((prev) => {
            const next = !prev;
            invertYRef.current = next;
            localStorage.setItem(INVERT_Y_KEY, String(next));
            return next;
          });
        }
      };
      onResize = () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };

      canvas.addEventListener("click", onCanvasClick);
      document.addEventListener("pointerlockchange", onPointerLockChange);
      document.addEventListener("pointerlockerror", onPointerLockChange);
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("resize", onResize);
      if (!isActive()) {
        if (level?.group) disposeLevelGroup(level.group);
        levelTextures?.dispose();
        return;
      }
      if (level?.group && !level.group.parent) {
        scene.add(level.group);
      }
      try {
        const loaded = await createSkyDome(scene, { renderer });
        if (!isActive()) {
          loaded.dispose();
          return;
        }
        sky = loaded;
        skyRef.current = loaded;
        loaded.update(camera);
        applyDayNightAtmosphere(
          scene,
          renderer,
          loaded,
          sunIsDayRef.current
        );
        // Sky was loaded after the first applyDayNightRef pass, so the sun
        // and moon discs are still at the origin / fully transparent. Re-run
        // the applier with the current nightness so they snap into place.
        applyDayNightRef.current?.(dayNightCurNightnessRef.current);
      } catch (err) {
        console.error("Sky dome failed to load:", err);
      }

      gameReady = true;
      syncPointerLocked();
      rafId = requestAnimationFrame(animate);
    }

    init().catch((err) => console.error("Game init failed:", err));

    return () => {
      disposed = true;
      weaponLoadId += 1;
      cancelAnimationFrame(rafId);
      if (flashTimeout) clearTimeout(flashTimeout);
      if (gameReady) {
        canvas.removeEventListener("click", onCanvasClick);
        document.removeEventListener("pointerlockchange", onPointerLockChange);
        document.removeEventListener("pointerlockerror", onPointerLockChange);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("resize", onResize);
      }
      const targets = level?.targets;
      if (level?.group) {
        disposeLevelGroup(level.group);
        level = null;
      }
      if (targets) {
        disposeAllTargetHealthBars(targets);
      }
      setHealthBarOccluders(null);
      levelTextures?.dispose();
      levelTextures = null;
      if (bulletPool) {
        for (let i = bullets.length - 1; i >= 0; i--) {
          const b = bullets[i];
          b.mesh.parent?.remove(b.mesh);
          b.core.material.dispose();
          b.glow.material.dispose();
        }
        bullets.length = 0;
        bulletPool.dispose();
      }
      weapon?.dispose();
      weaponRef.current = null;
      hemiRef.current = null;
      input?.dispose();
      sky?.dispose();
      skyRef.current = null;
      resetViewmodelInteriorAmbient();
      resetRoomInteriorAmbient();
      renderer.dispose();
      safeExitPointerLock();
    };
  }, []);

  const handleDayNightChange = (isDay) => {
    setSunIsDay(isDay);
    sunIsDayRef.current = isDay;
    saveSunDayMode(isDay);
    // Setting the target lets the animate loop ease toward it; pre-fit the
    // destination shadow caster so it's ready when its intensity rises.
    dayNightTargetNightnessRef.current = isDay ? 0 : 1;
    if (isDay) refitSunShadowRef.current?.();
    else refitMoonShadowRef.current?.();
  };

  return (
    <div className="gameRoot">
      <canvas ref={canvasRef} className="gameCanvas" />
      <div
        className="gameHud"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="settingsBtn"
          onClick={() => {
            safeExitPointerLock();
            setSettingsOpen(true);
          }}
        >
          Settings
        </button>
        <button
          type="button"
          className="settingsBtn"
          onClick={() => {
            safeExitPointerLock();
            setControlsOpen(true);
          }}
        >
          Controls
        </button>
        <div className="hudPanel" role="group" aria-label="Fire mode">
          <span className="hudPanelLabel">Fire mode</span>
          <div className="fireModeToggle">
            {FIRE_MODE_ORDER.map((mode) => (
              <button
                key={mode}
                type="button"
                className={`fireModeBtn${fireMode === mode ? " active" : ""}`}
                aria-pressed={fireMode === mode}
                onClick={() => {
                  fireModeRef.current = mode;
                  setFireMode(mode);
                }}
              >
                {FIRE_MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        </div>
        <div className="hudPanel hudAmmo" aria-label="Ammunition">
          <div className="hudAmmoPrimary">
            <span className="hudAmmoCount">{roundsInMag}</span>
            <span className="hudAmmoCap">/ {MAGAZINE_SIZE}</span>
          </div>
          <div className="hudAmmoMags">
            <span className="hudAmmoMagsLabel">Mags</span>
            <span className="hudAmmoMagsCount">{spareMags + 1}</span>
            <span className="hudAmmoMagsHint">
              ({spareMags} spare{spareMags === 1 ? "" : "s"})
            </span>
          </div>
        </div>
      </div>

      {settingsOpen && (
        <div
          className="settingsBackdrop"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="settingsModal"
            role="dialog"
            aria-labelledby="settings-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="settingsHeader">
              <h2 id="settings-title">Settings</h2>
              <button
                type="button"
                className="settingsClose"
                onClick={() => setSettingsOpen(false)}
              >
                Close
              </button>
            </div>
            <SettingsSection title="General" defaultOpen>
              <label className="settingRow">
                <input
                  type="checkbox"
                  checked={invertYLook}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setInvertYLook(checked);
                    invertYRef.current = checked;
                    localStorage.setItem(INVERT_Y_KEY, String(checked));
                  }}
                />
                Invert look (mouse & arrows)
              </label>
            </SettingsSection>

            <SettingsSection title="Weapon">
              <label className="settingRow">
                <input
                  type="checkbox"
                  checked={weaponTuneEnabled}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setWeaponTuneEnabled(checked);
                    weaponTuneEnabledRef.current = checked;
                    saveWeaponTuneEnabled(checked);
                    if (!checked) {
                      weaponPoseModeRef.current = "hip";
                      setWeaponPoseMode("hip");
                    }
                  }}
                />
                Weapon tuning
              </label>
              <p className="settingsHint">
                Shows the in-game weapon tune panel (hip / aim poses and look
                shift sliders).
              </p>
            </SettingsSection>

            <SettingsSection title="Keyboard">
              <label className="sliderRow">
                <span className="sliderLabel">
                  Keyboard look <output>{keyboardLook.toFixed(1)}×</output>
                </span>
                <input
                  type="range"
                  min="0.5"
                  max="10"
                  step="0.1"
                  value={keyboardLook}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    setKeyboardLook(value);
                    keyboardLookRef.current = value;
                    localStorage.setItem(KEYBOARD_LOOK_KEY, String(value));
                  }}
                />
              </label>
              <label className="sliderRow">
                <span className="sliderLabel">
                  Keyboard easing <output>{keyboardEase.toFixed(1)}</output>
                </span>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="0.5"
                  value={keyboardEase}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    setKeyboardEase(value);
                    keyboardEaseRef.current = value;
                    localStorage.setItem(KEYBOARD_EASE_KEY, String(value));
                  }}
                />
              </label>
            </SettingsSection>

            <SettingsSection title="Mouse">
              <label className="sliderRow">
                <span className="sliderLabel">
                  Mouse look <output>{mouseLook.toFixed(1)}×</output>
                </span>
                <input
                  type="range"
                  min="0.5"
                  max="10"
                  step="0.1"
                  value={mouseLook}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    setMouseLook(value);
                    mouseLookRef.current = value;
                    localStorage.setItem(MOUSE_LOOK_KEY, String(value));
                  }}
                />
              </label>
              <label className="sliderRow">
                <span className="sliderLabel">
                  Mouse easing <output>{mouseEase.toFixed(1)}</output>
                </span>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="0.5"
                  value={mouseEase}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    setMouseEase(value);
                    mouseEaseRef.current = value;
                    localStorage.setItem(MOUSE_EASE_KEY, String(value));
                  }}
                />
              </label>
            </SettingsSection>

            <SettingsSection title="Environment">
              <label className="settingRow">
                <input
                  type="checkbox"
                  checked={sunTuneEnabled}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSunTuneEnabled(checked);
                    localStorage.setItem(SUN_TUNE_ENABLED_KEY, String(checked));
                  }}
                />
                Sun / Moon tuning
              </label>
              <label className="settingRow">
                <input
                  type="checkbox"
                  checked={hemiTuneEnabled}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setHemiTuneEnabled(checked);
                    localStorage.setItem(HEMI_TUNE_ENABLED_KEY, String(checked));
                  }}
                />
                Sky fill tuning
              </label>
              <label className="settingRow">
                <input
                  type="checkbox"
                  checked={walkBobTuneEnabled}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setWalkBobTuneEnabled(checked);
                    saveWalkBobTuneEnabled(checked);
                  }}
                />
                Walk bob tuning
              </label>
              <label className="settingRow">
                <input
                  type="checkbox"
                  checked={stairsTuneEnabled}
                  disabled={!arenaHasStairs}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setStairsTuneEnabled(checked);
                    localStorage.setItem(
                      STAIRS_TUNE_ENABLED_KEY,
                      String(checked)
                    );
                  }}
                />
                Stairway tuning
                {!arenaHasStairs && (
                  <span className="settingsHint" style={{ marginLeft: "0.4rem" }}>
                    (no stairs in this arena)
                  </span>
                )}
              </label>
              <p className="settingsHint">
                Each toggle opens a floating tuning panel in the game UI. Use
                the × on the panel to close it (the toggle stays remembered).
              </p>
            </SettingsSection>
          </div>
        </div>
      )}
      {controlsOpen && (
        <ControlsPanel
          onClose={() => setControlsOpen(false)}
          onReleasePointer={safeExitPointerLock}
          bindings={bindings}
          onBindingsChange={(next) => {
            setBindings(next);
            bindingsRef.current = next;
          }}
          rebindAction={rebindAction}
          onRebindActionChange={setRebindAction}
        />
      )}
      <div className="environmentTuneStack">
        {sunTuneEnabled && (
          <SunTunePanel
            isDay={sunIsDay}
            onDayNightChange={handleDayNightChange}
            azimuth={sunAzimuth}
            elevation={sunElevation}
            onAzimuthChange={(value) => {
              setSunAzimuth(value);
              sunAnglesRef.current.azimuth = value;
              sunLightPosRef.current = sunPositionFromAngles(
                value,
                sunAnglesRef.current.elevation
              );
              saveSunAngles(value, sunAnglesRef.current.elevation);
              refitSunShadowRef.current?.();
            }}
            onElevationChange={(value) => {
              setSunElevation(value);
              sunAnglesRef.current.elevation = value;
              sunLightPosRef.current = sunPositionFromAngles(
                sunAnglesRef.current.azimuth,
                value
              );
              saveSunAngles(sunAnglesRef.current.azimuth, value);
              refitSunShadowRef.current?.();
            }}
            moonAzimuth={moonAzimuth}
            moonElevation={moonElevation}
            moonIntensity={moonIntensity}
            onMoonAzimuthChange={(value) => {
              setMoonAzimuth(value);
              moonAnglesRef.current.azimuth = value;
              moonLightPosRef.current = moonPositionFromAngles(
                value,
                moonAnglesRef.current.elevation
              );
              saveMoonAngles(value, moonAnglesRef.current.elevation);
              applyDayNightRef.current?.(dayNightCurNightnessRef.current);
              refitMoonShadowRef.current?.();
            }}
            onMoonElevationChange={(value) => {
              setMoonElevation(value);
              moonAnglesRef.current.elevation = value;
              moonLightPosRef.current = moonPositionFromAngles(
                moonAnglesRef.current.azimuth,
                value
              );
              saveMoonAngles(moonAnglesRef.current.azimuth, value);
              applyDayNightRef.current?.(dayNightCurNightnessRef.current);
              refitMoonShadowRef.current?.();
            }}
            onMoonIntensityChange={(value) => {
              setMoonIntensity(value);
              moonIntensityRef.current = value;
              saveMoonIntensity(value);
              applyDayNightRef.current?.(dayNightCurNightnessRef.current);
            }}
            onClose={() => {
              setSunTuneEnabled(false);
              localStorage.setItem(SUN_TUNE_ENABLED_KEY, "false");
            }}
          />
        )}
        {hemiTuneEnabled && (
          <HemisphereTunePanel
            isDay={sunIsDay}
            onDayNightChange={handleDayNightChange}
            day={hemiDay}
            night={hemiNight}
            onDayChange={(next) => {
              setHemiDay(next);
              hemiDayRef.current = next;
              saveHemiDay(next);
              applyDayNightRef.current?.(dayNightCurNightnessRef.current);
            }}
            onNightChange={(next) => {
              setHemiNight(next);
              hemiNightRef.current = next;
              saveHemiNight(next);
              applyDayNightRef.current?.(dayNightCurNightnessRef.current);
            }}
            onResetDay={() => {
              const next = { ...DEFAULT_HEMI_DAY };
              setHemiDay(next);
              hemiDayRef.current = next;
              saveHemiDay(next);
              applyDayNightRef.current?.(dayNightCurNightnessRef.current);
            }}
            onResetNight={() => {
              const next = { ...DEFAULT_HEMI_NIGHT };
              setHemiNight(next);
              hemiNightRef.current = next;
              saveHemiNight(next);
              applyDayNightRef.current?.(dayNightCurNightnessRef.current);
            }}
            onClose={() => {
              setHemiTuneEnabled(false);
              localStorage.setItem(HEMI_TUNE_ENABLED_KEY, "false");
            }}
          />
        )}
        {walkBobTuneEnabled && (
          <WalkBobTunePanel
            tuning={walkBobTuning}
            onChange={(key, value) => {
              setWalkBobTuning((prev) => {
                const next = normalizeWalkBobSimple({ ...prev, [key]: value });
                saveWalkBobTuning(next);
                walkBobTuningRef.current = next;
                return next;
              });
            }}
            onReset={() => {
              const next = { ...DEFAULT_WALK_BOB_SIMPLE };
              saveWalkBobTuning(next);
              walkBobTuningRef.current = next;
              setWalkBobTuning(next);
            }}
            onClose={() => {
              setWalkBobTuneEnabled(false);
              saveWalkBobTuneEnabled(false);
            }}
          />
        )}
        {arenaHasStairs && stairsTuneEnabled && (
          <StairTunePanel
            floorDeckY={floorDeckY}
            catwalkDeckY={catwalkDeckY}
            x={stairX}
            y={stairY}
            z={stairZ}
            rotationY={stairRotationY}
            onXChange={(value) => {
              setStairX(value);
              commitStairParams({
                ...stairParamsRef.current,
                position: { ...stairParamsRef.current.position, x: value },
              });
            }}
            onYChange={(value) => {
              setStairY(value);
              commitStairParams({
                ...stairParamsRef.current,
                position: { ...stairParamsRef.current.position, y: value },
              });
            }}
            onZChange={(value) => {
              setStairZ(value);
              commitStairParams({
                ...stairParamsRef.current,
                position: { ...stairParamsRef.current.position, z: value },
              });
            }}
            onRotationChange={(value) => {
              setStairRotationY(value);
              commitStairParams({
                ...stairParamsRef.current,
                rotationY: value,
              });
            }}
            onClose={() => {
              setStairsTuneEnabled(false);
              localStorage.setItem(STAIRS_TUNE_ENABLED_KEY, "false");
            }}
          />
        )}
      </div>
      {weaponTuneEnabled && (
        <WeaponTunePanel
          poseMode={weaponPoseMode}
          onPoseModeChange={(mode) => {
            weaponPoseModeRef.current = mode;
            setWeaponPoseMode(mode);
          }}
          onReleasePointer={safeExitPointerLock}
          hipPose={hipWeaponPose}
          adsPose={adsWeaponPose}
          onHipChange={setHipWeaponPose}
          onAdsChange={setAdsWeaponPose}
          maxLookRate={maxLookRate}
          onMaxLookRateChange={(value) => {
            setMaxLookRate(value);
            maxLookRateRef.current = value;
            localStorage.setItem(LOOK_MAX_RATE_KEY, String(value));
          }}
          bodyLookUpAmount={bodyLookUpAmount}
          onBodyLookUpAmountChange={(value) => {
            setBodyLookUpAmount(value);
            weaponTuningRef.current = {
              ...weaponTuningRef.current,
              bodyLookUpAmount: value,
            };
          }}
          bodyLookDownAmount={bodyLookDownAmount}
          onBodyLookDownAmountChange={(value) => {
            setBodyLookDownAmount(value);
            weaponTuningRef.current = {
              ...weaponTuningRef.current,
              bodyLookDownAmount: value,
            };
          }}
          onClose={() => {
            setWeaponTuneEnabled(false);
            weaponTuneEnabledRef.current = false;
            saveWeaponTuneEnabled(false);
            weaponPoseModeRef.current = "hip";
            setWeaponPoseMode("hip");
          }}
        />
      )}
      <div className="topRightHud">
        <button
          type="button"
          className={`dayNightToggle${sunIsDay ? " day" : " night"}`}
          aria-pressed={!sunIsDay}
          title={sunIsDay ? "Switch to night" : "Switch to day"}
          onClick={() => handleDayNightChange(!sunIsDay)}
        >
          <span className="dayNightGlyph" aria-hidden="true">
            {sunIsDay ? "☀" : "☾"}
          </span>
          <span className="dayNightLabel">{sunIsDay ? "Day" : "Night"}</span>
        </button>
        <div ref={fpsRef} className="fpsCounter" aria-live="polite">
          — FPS
        </div>
      </div>
      <div ref={crosshairRef} className="crosshair crosshairVisible" />
      <CompassOverlay dialRef={compassDialRef} />
    </div>
  );
}
