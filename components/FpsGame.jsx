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
import { buildRoomCullables, updateRoomCulling } from "@/lib/RoomCulling";
import {
  initCandleFlicker,
  updateCandleFlicker,
} from "@/lib/CandleFlicker";
import { getArenaAttachWall } from "@/lib/DoorwayWall";
import { createInput } from "@/lib/Input";
import { createPlayerController } from "@/lib/PlayerController";
import { createBulletPool, loadViewWeapon } from "@/lib/ViewWeapon";
import {
  spawnAmmoDrop, updateAmmoDrops,
  getGeometry as getCrateGeo, getMaterials as getCrateMats,
} from "@/lib/AmmoCrate";
import {
  spawnGrenade, updateGrenades, disposeAllGrenades,
  updateTrajectoryPreview, hideTrajectoryPreview, disposePreview,
  applyScreenShake, triggerScreenShake,
  getGrenadeParams, setGrenadeParams,
  spawnGrenadeDrop, updateGrenadeDrops, disposeAllGrenadeDrops,
  getGrenadeModel,
} from "@/lib/Grenade";
import {
  applyTargetHit,
  applyTargetPose,
  activateTargetAt,
  deactivateTarget,
  DEFAULT_TARGET_POSE,
  disposeAllTargetHealthBars,
  disposeAllHpOrbs,
  pickRandomSpawnPosition,
  renderTargetHealthBarsPass,
  setHealthBarOccluders,
  setHitDebug,
  setHitzoneOverlay,
  spawnHpOrb,
  startDeathAnimation,
  updateDeathAnimations,
  updateHitDebugMarkers,
  updateHpOrbs,
  getOrbGeometry,
  getOrbMaterials,
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
import TargetPoseTunePanel from "@/components/TargetPoseTunePanel";
import LevelObjectTunePanel from "@/components/LevelObjectTunePanel";
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
import {
  isBindingDown,
  loadBindings,
  saveBindings,
  wasBindingPressed,
} from "@/lib/KeyBindings";

const _radarScratch = new Array(64);

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
const RENDER_SCALE_KEY = "fps-render-scale";
const PLAYER_HEIGHT_KEY = "fps-player-height";
const SHOW_FPS_KEY = "fps-show-counter";
const WEAPON_RECOIL_KEY = "fps-weapon-recoil-enabled";
const DEFAULT_LOOK = 7;
const DEFAULT_MAX_LOOK_RATE = 2.5;
const DEFAULT_PLAYER_HEIGHT = 1.65;
/** Multiplier on `min(devicePixelRatio, 2)` — 1.0 = full quality, 0.5 = quarter pixel count. */
const DEFAULT_RENDER_SCALE = 1.0;
const MIN_RENDER_SCALE = 0.25;
const MAX_RENDER_SCALE = 1.0;

function loadRenderScale() {
  if (typeof window === "undefined") return DEFAULT_RENDER_SCALE;
  const raw = window.localStorage.getItem(RENDER_SCALE_KEY);
  if (!raw) return DEFAULT_RENDER_SCALE;
  const v = parseFloat(raw);
  if (!Number.isFinite(v)) return DEFAULT_RENDER_SCALE;
  return Math.min(MAX_RENDER_SCALE, Math.max(MIN_RENDER_SCALE, v));
}

function effectivePixelRatio(scale) {
  if (typeof window === "undefined") return 1;
  return Math.min(window.devicePixelRatio || 1, 2) * scale;
}
/** Persisted dev-only "Show FPS counter" toggle. Default off so a normal
 *  player never sees the dev HUD. */
function loadShowFps() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SHOW_FPS_KEY) === "true";
}
/** Seconds for the day/night toggle to crossfade from one state to the other. */
const DAY_NIGHT_FADE_DURATION = 10;
/** Meters below `floorY` at which a falling player is considered dead and
 *  respawned. Generous enough that any normal walking surface inaccuracy
 *  can't trigger it — only a real fall through a hole reaches this depth. */
const DEATH_FALL_DROP = 12;
/** Minimum time the death overlay stays fully opaque before the player
 *  can click to respawn. Prevents accidentally clicking through it. */
const DEATH_MIN_DISPLAY_MS = 800;
/** Time the overlay takes to fade out AFTER the player has respawned.
 *  The player can move/shoot/look around during this window — the fade
 *  is purely a visual transition off the death screen. */
const DEATH_FADE_MS = 1200;
const MAGAZINE_SIZE = 80;
const SPARE_MAGAZINES = 4;
const BURST_SHOT_COUNT = 3;
const BURST_INTERVAL = 0.085;
const AUTO_FIRE_INTERVAL = 0.1;
const FIRE_MODE_ORDER = ["single", "burst", "auto"];

/**
 * Show the full-screen death overlay with the given reason text. The overlay
 * is permanently mounted; we just update the reason copy and toggle classes
 * that drive the two-phase sequence (opaque hold → post-respawn fade). The
 * reflow trick (remove → reflow → re-add) lets back-to-back deaths replay
 * the animation instead of being deduped by the browser.
 */
function showDeathOverlay(overlayEl, reasonEl, reason) {
  if (reasonEl) reasonEl.textContent = reason ?? "";
  if (!overlayEl) return;
  overlayEl.classList.remove("deathOverlayFading");
  overlayEl.classList.remove("deathOverlayActive");
  // eslint-disable-next-line no-unused-expressions
  void overlayEl.offsetWidth;
  overlayEl.classList.add("deathOverlayActive");
}

/**
 * Switch the overlay from the opaque "hold" state to the fade-out state.
 * Called the moment the player respawns so the fade happens AFTER the world
 * has been restored behind the overlay.
 */
function beginDeathOverlayFade(overlayEl) {
  if (!overlayEl) return;
  overlayEl.classList.remove("deathOverlayActive");
  // eslint-disable-next-line no-unused-expressions
  void overlayEl.offsetWidth;
  overlayEl.classList.add("deathOverlayFading");
}

function hideDeathOverlay(overlayEl) {
  if (!overlayEl) return;
  overlayEl.classList.remove("deathOverlayActive");
  overlayEl.classList.remove("deathOverlayFading");
}

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

const PICKUP_DISPLAY_MS = 2000;

function PickupOverlay3D({ type, onDone }) {
  const containerRef = useRef(null);
  const [phase, setPhase] = useState("enter");

  const [gone, setGone] = useState(false);
  useEffect(() => {
    const frameId = requestAnimationFrame(() => setPhase("visible"));
    const hideTimer = setTimeout(() => setPhase("exit"), PICKUP_DISPLAY_MS);
    const removeTimer = setTimeout(() => { setGone(true); onDone?.(); }, PICKUP_DISPLAY_MS + 500);
    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(hideTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const w = 360, h = 360;
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(35, w / h, 0.1, 20);
    cam.position.set(0, 0.15, 1.8);
    cam.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(2, 3, 4);
    scene.add(dir);

    let mesh;
    if (type === "ammo") {
      mesh = new THREE.Mesh(getCrateGeo(), getCrateMats());
      mesh.scale.setScalar(0.25);
    } else if (type === "grenade") {
      mesh = getGrenadeModel();
      mesh.scale.setScalar(0.8);
      mesh.rotation.x = Math.PI / 2;
    } else {
      mesh = new THREE.Mesh(getOrbGeometry(), getOrbMaterials());
      mesh.rotation.z = Math.PI / 2;
      mesh.scale.setScalar(1.0);
    }
    scene.add(mesh);

    // Fit to view using the world-scale bounding box so both appear
    // at the same relative size as they do on the ground.
    const box = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const fitScale = 0.9 / maxDim;
    mesh.scale.multiplyScalar(fitScale);
    box.setFromObject(mesh);
    const center = new THREE.Vector3();
    box.getCenter(center);
    mesh.position.sub(center);

    let running = true;
    let t = 0;
    const startY = -2.0;
    const endY = 0;
    const zoomDuration = 0.6;
    mesh.position.y += startY;

    function animate() {
      if (!running) return;
      requestAnimationFrame(animate);
      t += 1 / 60;
      if (type === "grenade") mesh.rotation.z -= 0.008;
      else mesh.rotation.y += 0.008;

      const zoomT = Math.min(1, t / zoomDuration);
      const ease = 1 - Math.pow(1 - zoomT, 3);
      const offsetY = startY + (endY - startY) * ease;
      mesh.position.y = -center.y + offsetY;

      renderer.render(scene, cam);
    }
    animate();

    return () => {
      running = false;
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [type]);

  const label = type === "ammo" ? "10 Ammo Rounds" : type === "grenade" ? "+1 Grenade" : "10 Hit Points";

  if (gone) return null;
  return (
    <div className={`pickupOverlay pickupOverlay--${phase}`} aria-hidden="true">
      <div className="pickupOverlay3DLabel">{label}</div>
      <div ref={containerRef} className="pickupOverlay3DCanvas" />
    </div>
  );
}

export default function FpsGame() {
  const canvasRef = useRef(null);
  const crosshairRef = useRef(null);
  const fpsRef = useRef(null);
  const compassDialRef = useRef(null);
  const compassBearingRef = useRef(null);
  const radarRef = useRef(null);
  const radarSweepRef = useRef(null);
  const radarDotsRef = useRef(null);
  const deathOverlayRef = useRef(null);
  const deathReasonRef = useRef(null);
  /** Non-null while a death sequence is playing. The player stays frozen
   *  until they click to respawn. Input/physics/weapon are gated on this. */
  const deathStateRef = useRef(null);
  const grenadeSuicideRef = useRef(false);
  /** Callback set by the game loop to trigger a respawn from outside the
   *  effect (e.g. the overlay's onClick handler). */
  const respawnCallbackRef = useRef(null);
  const [invertYLook, setInvertYLook] = useState(false);
  const [renderScale, setRenderScale] = useState(DEFAULT_RENDER_SCALE);
  const renderScaleRef = useRef(DEFAULT_RENDER_SCALE);
  const rendererRef = useRef(null);
  const [keyboardLook, setKeyboardLook] = useState(DEFAULT_LOOK);
  const [keyboardEase, setKeyboardEase] = useState(DEFAULT_LOOK);
  const [mouseLook, setMouseLook] = useState(DEFAULT_LOOK);
  const [mouseEase, setMouseEase] = useState(DEFAULT_LOOK);
  const [maxLookRate, setMaxLookRate] = useState(DEFAULT_MAX_LOOK_RATE);
  const [playerHeight, setPlayerHeight] = useState(DEFAULT_PLAYER_HEIGHT);
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
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadDone, setLoadDone] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [showFps, setShowFps] = useState(false);
  const [showDevOverlay, setShowDevOverlay] = useState(() => window.localStorage.getItem("fps-show-dev-overlay") === "true");
  const [weaponRecoilEnabled, setWeaponRecoilEnabled] = useState(
    () => window.localStorage.getItem(WEAPON_RECOIL_KEY) !== "false"
  );
  const [hudTuneEnabled, setHudTuneEnabled] = useState(false);
  const [hudCogX, setHudCogX] = useState(4);
  const [hudCogY, setHudCogY] = useState(32);
  const [hudCogSize, setHudCogSize] = useState(8);
  const [hudRoundsX, setHudRoundsX] = useState(33);
  const [hudRoundsY, setHudRoundsY] = useState(10);
  const [hudMagX, setHudMagX] = useState(50);
  const [hudMagY, setHudMagY] = useState(10);
  const [hudMagsX, setHudMagsX] = useState(67);
  const [hudMagsY, setHudMagsY] = useState(10);
  const [hudValueFont, setHudValueFont] = useState(4.4);
  const [hudLabelY, setHudLabelY] = useState(8);
  const [hudFireModeY, setHudFireModeY] = useState(14.5);
  const [hudCompassX, setHudCompassX] = useState(92);
  const [hudCompassY, setHudCompassY] = useState(21);
  const [hudCompassSize, setHudCompassSize] = useState(6.3);
  const [hbLivesX, setHbLivesX] = useState(4.5);
  const [hbLivesY, setHbLivesY] = useState(11.5);
  const [hbLivesSize, setHbLivesSize] = useState(1.6);
  const [hbBarX, setHbBarX] = useState(18.5);
  const [hbBarY, setHbBarY] = useState(34);
  const [hbBarW, setHbBarW] = useState(76);
  const [hbBarH, setHbBarH] = useState(33.5);
  const [hbCorner, setHbCorner] = useState(3);
  const [radarInnerX] = useState(52);
  const [radarInnerY] = useState(50);
  const [radarInnerSize] = useState(80);
  const [radarX] = useState(1);
  const [radarY] = useState(1);
  const [radarScale] = useState(11);
  const [weaponTuneEnabled, setWeaponTuneEnabled] = useState(false);
  const [targetTuneEnabled, setTargetTuneEnabled] = useState(false);
  const [targetPose, setTargetPose] = useState(() => ({ ...DEFAULT_TARGET_POSE }));
  const [targetApplyAll, setTargetApplyAll] = useState(true);
  const selectedTargetRef = useRef(null);
  const targetTuneEnabledRef = useRef(false);
  const targetsRef = useRef([]);
  const [hitDebugEnabled, setHitDebugEnabled] = useState(false);
  const hitDebugEnabledRef = useRef(false);
  const weaponRecoilEnabledRef = useRef(true);
  const [hitzoneOverlayEnabled, setHitzoneOverlayEnabled] = useState(false);
  const [levelEditEnabled, setLevelEditEnabled] = useState(false);
  const levelEditEnabledRef = useRef(false);
  const selectedLevelObjectRef = useRef(null);
  const [selectedLevelObjectVer, setSelectedLevelObjectVer] = useState(0);
  const levelObjectsRef = useRef([]);
  const sceneRef = useRef(null);
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
  const playerHeightRef = useRef(DEFAULT_PLAYER_HEIGHT);
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
  const roomLightsRef = useRef([]);
  const dayNightToggleRef = useRef(null);
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
  const [playerHealth, setPlayerHealth] = useState(100);
  const [pickupFlash, setPickupFlash] = useState(null);
  const [grenadeCount, setGrenadeCount] = useState(3);
  const grenadeCountRef = useRef(3);
  const [grenadeTuneEnabled, setGrenadeTuneEnabled] = useState(false);
  const [grenadeParams, setGrenadeParamsState] = useState(() => getGrenadeParams());
  const [playerLives, setPlayerLives] = useState(3);
  const [hostileCount, setHostileCount] = useState(0);
  const [missionTime, setMissionTime] = useState(0);
  const missionTimeRef = useRef(0);
  const playerHealthRef = useRef(100);
  const playerLivesRef = useRef(3);
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
    const storedScale = loadRenderScale();
    setRenderScale(storedScale);
    renderScaleRef.current = storedScale;
    setShowFps(loadShowFps());
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
    const storedHeight = read(PLAYER_HEIGHT_KEY, DEFAULT_PLAYER_HEIGHT);
    setPlayerHeight(storedHeight);
    playerHeightRef.current = storedHeight;
    invertYRef.current = storedInvert;
    keyboardLookRef.current = kbLook;
    keyboardEaseRef.current = kbEase;
    mouseLookRef.current = mLook;
    mouseEaseRef.current = mEase;
    maxLookRateRef.current = maxRate;
  }, []);

  invertYRef.current = invertYLook;
  renderScaleRef.current = renderScale;
  keyboardLookRef.current = keyboardLook;
  keyboardEaseRef.current = keyboardEase;
  mouseLookRef.current = mouseLook;
  mouseEaseRef.current = mouseEase;
  maxLookRateRef.current = maxLookRate;
  playerHeightRef.current = playerHeight;
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
  weaponRecoilEnabledRef.current = weaponRecoilEnabled;

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
    let healthRegenTimer = 0;
    const HEALTH_REGEN_INTERVAL = 15;
    const HEALTH_REGEN_AMOUNT = 1;
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
    rendererRef.current = renderer;

    async function init() {
      const isActive = () => !disposed;
      renderer.setPixelRatio(effectivePixelRatio(renderScaleRef.current));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor(DAY_CLEAR_COLOR, 1);

      scene = new THREE.Scene();
      scene.fog = new THREE.Fog(DAY_CLEAR_COLOR, 45, 95);
      sceneRef.current = scene;
      if (hitDebugEnabledRef.current) setHitDebug(scene, true);

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
      setLoadProgress(20);

      levelTextures = await loadLevelTextureLibrary(
        maxAnisotropy,
        collectArenaTextureIds(arena)
      );
      if (!isActive()) return;
      setLoadProgress(60);

      const sheltered = (arena.ceilingThickness ?? 0) > 0;
      const { sun, moon, hemi, outdoorLights } = createOutdoorLights(scene, {
        sheltered,
      });
      hemiRef.current = hemi;
      registerOutdoorLightsForDayNight(outdoorLights);
      const attachWall = getArenaAttachWall(arena);
      const arenaHalf = arena.size / 2;
      const roomLights = addRoomLights(scene, arena.rooms, arenaHalf, attachWall);
      // Give the warm interior point lights a candle-like flicker so the
      // off-arena room feels alive instead of locked to a flat brightness.
      initCandleFlicker(roomLights);
      roomLightsRef.current = roomLights;
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
      setLoadProgress(85);
      targetsRef.current = level.targets;
      levelObjectsRef.current = level.pillarMeshes ?? [];
      // Per-room culling: hide interior shells and disable their lights
      // when the room isn't visible to the camera (and the player isn't
      // standing in it). Skips the room render pass entirely on frames
      // where no room is in view.
      const roomCullables = buildRoomCullables(
        level.group,
        arena.rooms ?? [],
        roomLights,
        arenaHalf,
        attachWall,
        arena.wallHeight
      );
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
        getFloorHoles: () => level.floorHoles ?? [],
        getFloorBounds: () => level.floorBounds,
        getBindings: () => bindingsRef.current,
        getInvertYLook: () => invertYRef.current,
        getKeyboardLookSpeed: () => keyboardLookRef.current,
        getKeyboardLookEase: () => keyboardEaseRef.current,
        getMouseLookSpeed: () => mouseLookRef.current,
        getMouseLookEase: () => mouseEaseRef.current,
        getMaxLookRate: () => maxLookRateRef.current,
        getStandEyeHeight: () => playerHeightRef.current,
        getWalkBobTuning: () =>
          resolveWalkBobTuning(walkBobTuningRef.current),
      });

      respawnCallbackRef.current = () => {
        player.respawn();
      };

      const shootRaycaster = new THREE.Raycaster();
      const hitRaycaster = new THREE.Raycaster();
      const screenCenter = new THREE.Vector2(0, 0);
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
      const hpOrbs = [];
      const ammoDrops = [];
      const grenades = [];
      const grenadeDrops = [];
      let grenadeHeld = false;
      const allColliders = [...level.colliders, ...level.stairColliders];
      let _lastHostileCount = -1;
      let _radarFrameSkip = 0;
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
            bounds: level.arenaBounds,
            colliders: allColliders,
            targets: level.targets,
            config: targetConfig,
            skip: mesh,
            floorHoles: level.floorHoles,
          });
          if (!pos) return;
          activateTargetAt(mesh, pos.x, pos.z, targetConfig, pos.y);
        }, delayMs);
      }

      function applyHit(hit, bulletDirection) {
        if (targetTuneEnabledRef.current) {
          selectedTargetRef.current = hit.object;
        }
        const { killed, zone } = applyTargetHit(hit.object, hit.point, bulletDirection);
        if (killed) {
          const deathPos = hit.object.position.clone();
          const rndAngle = Math.random() * Math.PI * 2;
          const rndOff = 0.3 + Math.random() * 0.5;
          const hpDelay = 800 + Math.random() * 400;
          const ammoDelay = 1800 + Math.random() * 400;
          if (zone === "head" || playerHealthRef.current < 50) {
            setTimeout(() => {
              hpOrbs.push(spawnHpOrb(scene, new THREE.Vector3(
                deathPos.x + Math.cos(rndAngle) * rndOff,
                deathPos.y,
                deathPos.z + Math.sin(rndAngle) * rndOff,
              ), level.floorY));
            }, hpDelay);
          }
          if (spareMagsRef.current <= 1) {
            setTimeout(() => {
              ammoDrops.push(spawnAmmoDrop(scene, new THREE.Vector3(
                deathPos.x + Math.cos(rndAngle + Math.PI) * rndOff,
                deathPos.y,
                deathPos.z + Math.sin(rndAngle + Math.PI) * rndOff,
              ), level.floorY));
            }, ammoDelay);
          }
          if (grenadeCountRef.current === 0 && Math.random() < 0.1) {
            const grenDelay = 2200 + Math.random() * 500;
            const grenAngle = rndAngle + Math.PI * 0.5;
            setTimeout(() => {
              grenadeDrops.push(spawnGrenadeDrop(scene, new THREE.Vector3(
                deathPos.x + Math.cos(grenAngle) * rndOff,
                deathPos.y,
                deathPos.z + Math.sin(grenAngle) * rndOff,
              ), level.floorY));
            }, grenDelay);
          }
          startDeathAnimation(hit.object, bulletDirection, {
            scene,
            colliders: allColliders,
            floorY: level.floorY,
            bounds: level.bounds,
            hitZone: zone,
            hitPoint: hit.point,
          });
        }
      }

      function applyGrenadeHit(mesh, hitPoint, blastDir, damage) {
        const ud = mesh.userData;
        if (ud.health <= 0) return { killed: false };
        ud.health = Math.max(0, ud.health - damage);
        ud.repairCooldown = ud.repairDelayAfterHit ?? 3;
        const ratio = ud.health / ud.maxHealth;
        const killed = ud.health <= 0;
        if (killed) {
          const deathPos = mesh.position.clone();
          const rndAngle = Math.random() * Math.PI * 2;
          const rndOff = 0.3 + Math.random() * 0.5;
          const hpDelay = 800 + Math.random() * 400;
          const ammoDelay = 1800 + Math.random() * 400;
          // Grenade kill: always drop HP orb. Otherwise only if under 50%
          setTimeout(() => {
            hpOrbs.push(spawnHpOrb(scene, new THREE.Vector3(
              deathPos.x + Math.cos(rndAngle) * rndOff, deathPos.y,
              deathPos.z + Math.sin(rndAngle) * rndOff,
            ), level.floorY));
          }, hpDelay);
          if (spareMagsRef.current <= 1) {
            setTimeout(() => {
              ammoDrops.push(spawnAmmoDrop(scene, new THREE.Vector3(
                deathPos.x + Math.cos(rndAngle + Math.PI) * rndOff, deathPos.y,
                deathPos.z + Math.sin(rndAngle + Math.PI) * rndOff,
              ), level.floorY));
            }, ammoDelay);
          }
          if (grenadeCountRef.current === 0 && Math.random() < 0.1) {
            const grenDelay = 2200 + Math.random() * 500;
            const grenAngle = rndAngle + Math.PI * 0.5;
            setTimeout(() => {
              grenadeDrops.push(spawnGrenadeDrop(scene, new THREE.Vector3(
                deathPos.x + Math.cos(grenAngle) * rndOff, deathPos.y,
                deathPos.z + Math.sin(grenAngle) * rndOff,
              ), level.floorY));
            }, grenDelay);
          }
        }
        return { killed, health: ud.health, ratio };
      }

      function removeBullet(index) {
        const b = bullets[index];
        scene.remove(b.mesh);
        b.core.material.dispose();
        b.glow.material.dispose();
        bullets.splice(index, 1);
      }

      function spawnBullet(origin, direction, visualOrigin) {
        const bullet = bulletPool.spawn(scene, visualOrigin ?? origin, direction);
        bullet.hitOrigin = origin.clone();
        bullet.hitPos = origin.clone();
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

      function tryReload(force) {
        if (spareMagsRef.current <= 0) return false;
        if (!force && roundsInMagRef.current >= 15) return false;
        spareMagsRef.current -= 1;
        roundsInMagRef.current = Math.min(
          roundsInMagRef.current + MAGAZINE_SIZE,
          MAGAZINE_SIZE * 2
        );
        syncAmmoToUi();
        return true;
      }

      function fireOneRound() {
        if (roundsInMagRef.current <= 0 && !tryReload(true)) return false;

        roundsInMagRef.current -= 1;
        syncAmmoToUi();
        weapon.getMuzzleWorld(muzzlePos, muzzleDir, camera);

        hitRaycaster.setFromCamera(screenCenter, camera);

        if (levelEditEnabledRef.current && levelObjectsRef.current.length) {
          const loHits = hitRaycaster.intersectObjects(levelObjectsRef.current, false);
          if (loHits.length) {
            const prev = selectedLevelObjectRef.current;
            if (prev && prev !== loHits[0].object) {
              prev.material.emissive?.setHex(0x000000);
            }
            const selected = loHits[0].object;
            selected.material.emissive?.setHex(0x222222);
            selectedLevelObjectRef.current = selected;
            setSelectedLevelObjectVer((v) => v + 1);
          }
        }

        const camDir = hitRaycaster.ray.direction.clone();
        spawnBullet(hitRaycaster.ray.origin.clone(), camDir, muzzlePos);
        flashMuzzle();
        if (weaponRecoilEnabledRef.current) {
          const ads = weapon.getAimBlend?.() ?? 0;
          const scale = 1 - ads * 0.45;
          player.addAimRecoil(scale);
          weapon.applyFireKick(ads);
        }
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

      const _bulletStepVec = new THREE.Vector3();
      const _bulletNextHit = new THREE.Vector3();

      function updateBullets(dt) {
        if (bullets.length === 0) return;
        const targets = getLiveTargets();
        for (let i = bullets.length - 1; i >= 0; i--) {
          const bullet = bullets[i];
          const stepLen = BULLET_SPEED * dt;

          bullet.mesh.position.addScaledVector(bullet.direction, stepLen);

          const prevHit = bullet.hitPos;
          _bulletNextHit.copy(prevHit).addScaledVector(bullet.direction, stepLen);

          shootRaycaster.set(prevHit, bullet.direction);
          shootRaycaster.far = stepLen + 0.05;
          const hits = shootRaycaster.intersectObjects(targets, false);

          bullet.hitPos.copy(_bulletNextHit);
          bullet.traveled += stepLen;

          if (hits[0]) {
            applyHit(hits[0], bullet.direction);
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

        // Candle-flicker the warm interior lights. Uses rAF's absolute
        // timestamp so the wobble keeps phase across frame-time hitches.
        updateCandleFlicker(roomLightsRef.current, now * 0.001);

        const locked = input.isLocked();
        const aimHeld =
          !rebindActionRef.current &&
          isBindingDown(input, bindingsRef.current, "aim");
        const aimTabActive =
          weaponTuneEnabledRef.current && weaponPoseModeRef.current === "ads";
        const aimTarget = aimHeld || aimTabActive ? 1 : 0;

        // Death sequence (two phases):
        //   1. FREEZE  — overlay is fully opaque, player is not respawned,
        //                input/physics/weapons are disabled. Stays until the
        //                player clicks to respawn (after a brief minimum
        //                display time to prevent accidental click-through).
        //   2. FADE    — player has just been respawned; the overlay fades
        //                out over `DEATH_FADE_MS` while the player can
        //                already move and shoot.
        // `frozen` is the only thing that gates input/physics; the fade
        // phase deliberately does NOT block gameplay.
        const deathState = deathStateRef.current;
        let frozen = false;
        if (deathState) {
          if (!deathState.respawned) {
            const canRespawn = now >= deathState.minDisplayEnd;
            if (canRespawn && input.consumeShoot()) {
              player.respawn();
              deathState.respawned = true;
              playerHealthRef.current = 100;
              setPlayerHealth(100);
              grenadeCountRef.current = getGrenadeParams().grenadeCount;
              setGrenadeCount(grenadeCountRef.current);
              deathState.fadeEndTime = now + DEATH_FADE_MS;
              beginDeathOverlayFade(deathOverlayRef.current);
            }
          }
          if (deathState.respawned && now >= deathState.fadeEndTime) {
            hideDeathOverlay(deathOverlayRef.current);
            deathStateRef.current = null;
          } else {
            frozen = !deathState.respawned;
          }
        }

        const canUseWeapons =
          !frozen &&
          !rebindActionRef.current &&
          !settingsOpenRef.current &&
          !controlsOpenRef.current;

        if (!frozen) {
          player.update(input, dt);
          // Death-fall: dropped through a floor hole. Only trigger a new
          // death sequence when one isn't already in progress (otherwise
          // the fade-phase player could re-trigger themselves before they
          // climb out of the hole). The respawn is held until the freeze
          // phase ends — the player can't be "in the world" while frozen.
          if (
            !deathStateRef.current &&
            player.getY() < level.floorY - DEATH_FALL_DROP
          ) {
            const reason = "You fell to your death";
            playerLivesRef.current = Math.max(0, playerLivesRef.current - 1);
            setPlayerLives(playerLivesRef.current);
            playerHealthRef.current = 0;
            setPlayerHealth(0);
            deathStateRef.current = {
              reason,
              respawned: false,
              minDisplayEnd: now + DEATH_MIN_DISPLAY_MS,
              fadeEndTime: Infinity,
            };
            showDeathOverlay(
              deathOverlayRef.current,
              deathReasonRef.current,
              reason
            );
            frozen = true;
          }
          if (
            !deathStateRef.current &&
            playerHealthRef.current <= 0
          ) {
            const reason = grenadeSuicideRef.current
              ? "Suicide is never the answer"
              : "You were killed by an enemy";
            grenadeSuicideRef.current = false;
            playerLivesRef.current = Math.max(0, playerLivesRef.current - 1);
            setPlayerLives(playerLivesRef.current);
            playerHealthRef.current = 0;
            setPlayerHealth(0);
            deathStateRef.current = {
              reason,
              respawned: false,
              minDisplayEnd: now + DEATH_MIN_DISPLAY_MS,
              fadeEndTime: Infinity,
            };
            showDeathOverlay(
              deathOverlayRef.current,
              deathReasonRef.current,
              reason
            );
            frozen = true;
          }
        }
        if (compassDialRef.current) {
          const yawDeg = (player.getYaw() * 180) / Math.PI;
          compassDialRef.current.style.transform = `rotate(${yawDeg}deg)`;
          if (compassBearingRef.current) {
            const bearing = (((-yawDeg % 360) + 360) % 360) | 0;
            compassBearingRef.current.textContent = `${bearing}°`;
          }
        }
        if (radarDotsRef.current && level?.targets) {
          const px = camera.position.x;
          const pz = camera.position.z;
          const yaw = player.getYaw();
          const RADAR_RANGE = 30;

          if (radarSweepRef.current) {
            const canvas = radarSweepRef.current;
            const sweepSpeed = 90;
            const prev = parseFloat(canvas.dataset.angle || "0");
            const next = (prev + sweepSpeed * dt) % 360;
            canvas.dataset.angle = next;

            _radarFrameSkip = (_radarFrameSkip + 1) % 3;
            if (_radarFrameSkip === 0) {
              const ctx = canvas.getContext("2d", { alpha: true });
              const cx = canvas.width / 2;
              const cy = canvas.height / 2;
              const r = cx - 2;
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              const sweepRad = (next - 90) * (Math.PI / 180);
              const tailSpan = 70 * (Math.PI / 180);
              const slices = 12;
              for (let s = 0; s < slices; s++) {
                const t0 = s / slices;
                const alpha = t0 * t0 * 0.85;
                const a0 = sweepRad - tailSpan + (tailSpan * s) / slices;
                const a1 = sweepRad - tailSpan + (tailSpan * (s + 1)) / slices;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.arc(cx, cy, r, a0, a1);
                ctx.closePath();
                ctx.fillStyle = `rgba(30, 170, 255, ${alpha})`;
                ctx.fill();
              }
              const ex = cx + Math.cos(sweepRad) * r;
              const ey = cy + Math.sin(sweepRad) * r;
              ctx.beginPath();
              ctx.moveTo(cx, cy);
              ctx.lineTo(ex, ey);
              ctx.strokeStyle = "rgba(30, 160, 255, 0.35)";
              ctx.lineWidth = 6;
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(cx, cy);
              ctx.lineTo(ex, ey);
              ctx.strokeStyle = "rgba(30, 170, 255, 1)";
              ctx.lineWidth = 2;
              ctx.stroke();
            }
          }

          let radarTargetCount = 0;
          for (const t of level.targets) {
            if (!t.visible || t.userData.health <= 0) continue;
            const dx = t.position.x - px;
            const dz = t.position.z - pz;
            if (dx * dx + dz * dz <= RADAR_RANGE * RADAR_RANGE) {
              _radarScratch[radarTargetCount++] = t;
            }
          }
          const container = radarDotsRef.current;
          while (container.children.length > radarTargetCount) container.lastChild.remove();
          while (container.children.length < radarTargetCount) {
            const dot = document.createElement("div");
            dot.className = "radarBlip";
            container.appendChild(dot);
          }
          const sweepAngleDeg = parseFloat(radarSweepRef.current?.dataset.angle || "0");
          const sweepRad = (sweepAngleDeg * Math.PI) / 180;
          for (let i = 0; i < radarTargetCount; i++) {
            const t = _radarScratch[i];
            const dx = t.position.x - px;
            const dz = t.position.z - pz;
            const angle = Math.atan2(dx, -dz) + yaw;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const r = (dist / RADAR_RANGE) * 44;
            const dotX = 50 + Math.sin(angle) * r;
            const dotY = 50 - Math.cos(angle) * r;
            const dot = container.children[i];
            dot.style.left = `${dotX}%`;
            dot.style.top = `${dotY}%`;

            let angleDiff = ((sweepRad - angle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
            const fade = angleDiff < Math.PI ? Math.max(0, 1 - angleDiff / Math.PI) : 0;
            dot.style.opacity = Math.max(0.15, fade);
          }

          // Reward dots (blue) for HP orbs, ammo drops, grenade drops
          const allDrops = [...hpOrbs, ...ammoDrops, ...grenadeDrops]
            .filter(d => !d.collected && d.mesh?.position);
          let rewardContainer = container.parentElement.querySelector(".radarRewardDots");
          if (!rewardContainer) {
            rewardContainer = document.createElement("div");
            rewardContainer.className = "radarRewardDots";
            rewardContainer.style.cssText = "position:absolute;inset:0;pointer-events:none";
            container.parentElement.appendChild(rewardContainer);
          }
          while (rewardContainer.children.length > allDrops.length) rewardContainer.lastChild.remove();
          while (rewardContainer.children.length < allDrops.length) {
            const dot = document.createElement("div");
            dot.style.cssText = "position:absolute;width:5px;height:5px;border-radius:50%;background:#3af;box-shadow:0 0 4px #3af;transform:translate(-50%,-50%)";
            rewardContainer.appendChild(dot);
          }
          for (let i = 0; i < allDrops.length; i++) {
            const d = allDrops[i];
            const dx = d.mesh.position.x - px;
            const dz = d.mesh.position.z - pz;
            if (dx * dx + dz * dz > RADAR_RANGE * RADAR_RANGE) {
              rewardContainer.children[i].style.opacity = "0";
              continue;
            }
            const angle = Math.atan2(dx, -dz) + yaw;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const r = (dist / RADAR_RANGE) * 44;
            const dotX = 50 + Math.sin(angle) * r;
            const dotY = 50 - Math.cos(angle) * r;
            const rdot = rewardContainer.children[i];
            rdot.style.left = `${dotX}%`;
            rdot.style.top = `${dotY}%`;
            rdot.style.opacity = "0.85";
          }
        }
        camera.updateMatrixWorld(true);

        if (
          canUseWeapons &&
          wasBindingPressed(input, bindingsRef.current, "flashlight")
        ) {
          weapon?.toggleFlashlight();
        }

        if (
          canUseWeapons &&
          wasBindingPressed(input, bindingsRef.current, "dayNightToggle")
        ) {
          // Toggle from the latest ref value so we don't fight the smooth
          // fade — handleDayNightChange just updates the target, the
          // animate loop slews toward it.
          dayNightToggleRef.current?.(!sunIsDayRef.current);
        }

        const keyboardShoot =
          canUseWeapons &&
          isBindingDown(input, bindingsRef.current, "shoot");

        if (canUseWeapons && (locked || keyboardShoot)) {
          processWeaponFire(dt);
        }

        if (!frozen) {
          weapon?.update(camera, aimTarget, dt, weaponTuningRef, {
            snapAim: !locked,
            moveSpeed: player.getHorizontalSpeed(),
            onStairs: player.isOnStairs(),
            walkBobTuning: resolveWalkBobTuning(walkBobTuningRef.current),
          });
        }

        const aimBlend = weapon?.getAimBlend() ?? 0;
        const targetFov = THREE.MathUtils.lerp(HIP_FOV, ADS_FOV, aimBlend);
        camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-12 * dt));
        camera.updateProjectionMatrix();

        if (
          !rebindActionRef.current &&
          !settingsOpenRef.current &&
          !controlsOpenRef.current &&
          wasBindingPressed(input, bindingsRef.current, "reload")
        ) {
          tryReload();
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

        // Grenade: hold G to preview, release to throw
        const gDown = isBindingDown(input, bindingsRef.current, "grenade");
        if (gDown && !grenadeHeld && !frozen) {
          grenadeHeld = true;
        }
        if (grenadeHeld && gDown && !frozen) {
          updateTrajectoryPreview(scene, camera, level.floorY, allColliders, level.bounds);
        }
        if (grenadeHeld && !gDown) {
          grenadeHeld = false;
          hideTrajectoryPreview();
          if (!frozen && grenadeCountRef.current > 0) {
            grenadeCountRef.current--;
            setGrenadeCount(grenadeCountRef.current);
            const g = spawnGrenade(scene, camera, level.floorY, allColliders, level.bounds);
            grenades.push(g);
          }
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

        const preDetonated = new Set(grenades.filter(g => g.detonated).map(g => g));
        updateGrenades(grenades, dt, scene, getLiveTargets, applyGrenadeHit,
          (mesh, blastDir, opts) => {
            startDeathAnimation(mesh, blastDir, opts);
          },
          { scene, colliders: allColliders, floorY: level.floorY, bounds: level.bounds },
        );
        for (const g of grenades) {
          if (g.detonated && !preDetonated.has(g) && g.explosionPos) {
            triggerScreenShake(camera.position, g.explosionPos);
            const distToPlayer = camera.position.distanceTo(g.explosionPos);
            if (distToPlayer < getGrenadeParams().blastRadius) {
              const hp = playerHealthRef.current;
              const newHp = Math.max(0, hp - 60);
              playerHealthRef.current = newHp;
              setPlayerHealth(newHp);
              if (newHp <= 0) grenadeSuicideRef.current = true;
            }
          }
        }
        applyScreenShake(camera, dt);

        // Health auto-regen: 1 HP every 15 seconds
        if (playerHealthRef.current > 0 && playerHealthRef.current < 100) {
          healthRegenTimer += dt;
          if (healthRegenTimer >= HEALTH_REGEN_INTERVAL) {
            healthRegenTimer -= HEALTH_REGEN_INTERVAL;
            const newHp = Math.min(100, playerHealthRef.current + HEALTH_REGEN_AMOUNT);
            playerHealthRef.current = newHp;
            setPlayerHealth(newHp);
          }
        } else {
          healthRegenTimer = 0;
        }

        updateTargetsRepair(level.targets, dt);
        updateTargetHealthBars(level.targets, dt, camera);
        updateHitDebugMarkers(dt);
        updateDeathAnimations(level.targets, dt, (mesh) => {
          deactivateTarget(mesh);
          scheduleRespawn(mesh);
        }, {
          colliders: allColliders,
          floorY: level.floorY,
          bounds: level.bounds,
        });


        updateHpOrbs(
          hpOrbs, dt, camera.position,
          (value) => {
            const next = playerHealthRef.current + value;
            playerHealthRef.current = next;
            setPlayerHealth(next);
            setPickupFlash({ type: "hp", ts: Date.now() });
          },
          allColliders,
          level.bounds,
        );

        updateAmmoDrops(
          ammoDrops, dt, camera.position,
          (value) => {
            roundsInMagRef.current += value;
            syncAmmoToUi();
            setPickupFlash({ type: "ammo", ts: Date.now() });
          },
          allColliders,
          level.bounds,
        );

        updateGrenadeDrops(
          grenadeDrops, dt, camera.position,
          (value) => {
            grenadeCountRef.current += value;
            setGrenadeCount(grenadeCountRef.current);
            setPickupFlash({ type: "grenade", ts: Date.now() });
          },
          allColliders,
          level.bounds,
        );

        if (!frozen) {
          missionTimeRef.current += dt;
          const secs = Math.floor(missionTimeRef.current);
          if (secs !== Math.floor(missionTimeRef.current - dt)) {
            setMissionTime(secs);
          }
        }
        let aliveCount = 0;
        for (const t of level.targets) {
          if (t.visible && t.userData.health > 0 && !t.userData.dying) aliveCount++;
        }
        if (aliveCount !== _lastHostileCount) {
          _lastHostileCount = aliveCount;
          setHostileCount(aliveCount);
        }

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
        // Per-room frustum culling — hide rooms (and their lights) that the
        // camera can't currently see, and tell the renderer to skip the
        // interior pass on frames where no room is in view.
        const visibleRoomCount = updateRoomCulling(
          roomCullables,
          camera,
          camera.position,
          arenaHalf,
          attachWall
        );
        renderSceneWithLayeredLighting(renderer, scene, camera, {
          skyRoot: sky?.mesh ?? null,
          skipRoomPass: visibleRoomCount === 0,
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
        const ds = deathStateRef.current;
        if (ds && !ds.respawned && performance.now() >= ds.minDisplayEnd) {
          player.respawn();
          ds.respawned = true;
          ds.fadeEndTime = performance.now() + DEATH_FADE_MS;
          playerHealthRef.current = 100;
          setPlayerHealth(100);
          beginDeathOverlayFade(deathOverlayRef.current);
        }
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
        renderer.setPixelRatio(effectivePixelRatio(renderScaleRef.current));
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
      setLoadProgress(100);
      rafId = requestAnimationFrame(animate);

      // 2-second cooldown to let GPU compile shaders / settle
      setTimeout(() => {
        setLoadDone(true);
        syncPointerLocked();
      }, 2000);
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
      disposeAllHpOrbs(hpOrbs);
      for (const d of ammoDrops) {
        d.mesh.parent?.remove(d.mesh);
        if (d.ownMats) for (const m of d.mesh.material) m.dispose();
      }
      ammoDrops.length = 0;
      disposeAllGrenades(grenades, scene);
      disposeAllGrenadeDrops(grenadeDrops);
      disposePreview();
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
      respawnCallbackRef.current = null;
      hemiRef.current = null;
      input?.dispose();
      sky?.dispose();
      skyRef.current = null;
      resetViewmodelInteriorAmbient();
      resetRoomInteriorAmbient();
      renderer.dispose();
      rendererRef.current = null;
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
  // Keep the ref pointing at the current closure so the animate loop and
  // any keypress handler can always call the latest version (without
  // having to be re-declared inside the init effect).
  dayNightToggleRef.current = handleDayNightChange;

  return (
    <div className="gameRoot">
      <div className={`loadingOverlay${loadDone ? " loadingDone" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ui/logo.png" alt="VX-27" className="loadingLogo" />
        <div className="loadingBarTrack">
          <div className="loadingBarFill" style={{ width: `${loadProgress}%` }} />
        </div>
      </div>
      <canvas ref={canvasRef} className="gameCanvas" />
      <div
        className="hudBottomBar"
        role="region"
        aria-label="Loadout HUD"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{
          "--hud-cog-x": `${hudCogX}%`,
          "--hud-cog-y": `${hudCogY}%`,
          "--hud-cog-size": `${hudCogSize}%`,
          "--hud-rounds-x": `${hudRoundsX}%`,
          "--hud-rounds-y": `${hudRoundsY}%`,
          "--hud-mag-x": `${hudMagX}%`,
          "--hud-mag-y": `${hudMagY}%`,
          "--hud-mags-x": `${hudMagsX}%`,
          "--hud-mags-y": `${hudMagsY}%`,
          "--hud-value-font": `${hudValueFont}vw`,
          "--hud-label-y": `${hudLabelY}px`,
          "--hud-firemode-y": `${hudFireModeY}%`,
          "--hud-compass-x": `${hudCompassX}%`,
          "--hud-compass-y": `${hudCompassY}%`,
          "--hud-compass-size": `${hudCompassSize}vw`,
        }}
      >
        {/* Settings button — sits in the top-left decorative tab */}
        <button
          type="button"
          className="hudGearBtn"
          aria-label="Open settings"
          title="Settings"
          onClick={() => {
            safeExitPointerLock();
            setSettingsOpen(true);
          }}
        >
          <img src="/ui/settings.png" alt="" className="hudGearImg" />
        </button>

        {/* Left section — ROUNDS */}
        <div className={`hudAmmoStat hudAmmoStatLeft${roundsInMag < 15 || (roundsInMag === 0 && spareMags === 0) ? " hudAmmoLow" : ""}`}>
          <span className="hudAmmoLabel">ROUNDS</span>
          <span className="hudAmmoValue">{String(roundsInMag).padStart(2, "0")}</span>
        </div>

        {/* Centre section — MAG */}
        <div className={`hudAmmoStat hudAmmoStatCenter${roundsInMag === 0 && spareMags === 0 ? " hudAmmoLow" : ""}`}>
          <span className="hudAmmoLabel">MAG</span>
          <span className="hudAmmoValue">{String(MAGAZINE_SIZE).padStart(2, "0")}</span>
        </div>

        {/* Right section — MAGS */}
        <div className={`hudAmmoStat hudAmmoStatRight${roundsInMag === 0 && spareMags === 0 ? " hudAmmoLow" : ""}`}>
          <span className="hudAmmoLabel">MAGS</span>
          <span className="hudAmmoValue">{String(spareMags).padStart(2, "0")}</span>
        </div>

        {/* Fire mode indicator — single | burst | auto */}
        <div className="hudFireMode">
          <button
            type="button"
            className={`hudFireModeOption${fireMode === "single" ? " hudFireModeActive" : ""}`}
            onClick={() => { fireModeRef.current = "single"; setFireMode("single"); }}
          >
            <img src={fireMode === "single" ? "/ui/bullet_selected.png" : "/ui/bullet.png"} className="hudBulletIcon" alt="" />
          </button>
          <button
            type="button"
            className={`hudFireModeOption${fireMode === "burst" ? " hudFireModeActive" : ""}`}
            onClick={() => { fireModeRef.current = "burst"; setFireMode("burst"); }}
          >
            <img src={fireMode === "burst" ? "/ui/bullet_selected.png" : "/ui/bullet.png"} className="hudBulletIcon" alt="" />
            <img src={fireMode === "burst" ? "/ui/bullet_selected.png" : "/ui/bullet.png"} className="hudBulletIcon" alt="" />
            <img src={fireMode === "burst" ? "/ui/bullet_selected.png" : "/ui/bullet.png"} className="hudBulletIcon" alt="" />
          </button>
          <button
            type="button"
            className={`hudFireModeOption${fireMode === "auto" ? " hudFireModeActive" : ""}`}
            onClick={() => { fireModeRef.current = "auto"; setFireMode("auto"); }}
          >
            <img src={fireMode === "auto" ? "/ui/bullet_selected.png" : "/ui/bullet.png"} className="hudBulletIcon" alt="" />
            <span className="hudFireModeLabel">A</span>
          </button>
        </div>

        {/* Compass — mirrors the cog on the right side */}
        <div className="hudCompass">
          <div className="hudCompassRing">
            <div ref={compassDialRef} className="hudCompassDial">
              <span className="hudCompassMark hudCompassN">N</span>
              <span className="hudCompassMark hudCompassE">E</span>
              <span className="hudCompassMark hudCompassS">S</span>
              <span className="hudCompassMark hudCompassW">W</span>
            </div>
            <div className="hudCompassPointer" />
            <span ref={compassBearingRef} className="hudCompassBearing">0°</span>
          </div>
        </div>
      </div>

      {/* Radar — top left */}
      <div className="hudRadar" ref={radarRef} style={{
        left: `${radarX}rem`,
        top: `${radarY}rem`,
        width: `${radarScale}rem`,
        height: `${radarScale}rem`,
      }}>
        <div className="radarRing">
          <div className="radarInner" style={{
            left: `${radarInnerX}%`,
            top: `${radarInnerY}%`,
            width: `${radarInnerSize}%`,
            height: `${radarInnerSize}%`,
          }}>
            <canvas ref={radarSweepRef} className="radarSweepCanvas" width="200" height="200" />
            <div ref={radarDotsRef} className="radarDots" />
            <div className="radarCenter" />
          </div>
        </div>
      </div>

      {showDevOverlay && (
        <div className="demoBtnGroup">
          <button
            type="button"
            className="demoDamageBtn"
            onClick={() => {
              const next = Math.max(0, playerHealthRef.current - 10);
              playerHealthRef.current = next;
              setPlayerHealth(next);
            }}
          >
            −10 HP
          </button>
          <button
            type="button"
            className="demoHealBtn"
            onClick={() => {
              const next = playerHealthRef.current + 10;
              playerHealthRef.current = next;
              setPlayerHealth(next);
            }}
          >
            +10 HP
          </button>
        </div>
      )}

      {/* Health bar — top right */}
      <div
        className="hudHealthBar"
        role="status"
        aria-label="Player health"
        style={{
          "--hb-lives-x": `${hbLivesX}%`,
          "--hb-lives-y": `${hbLivesY}%`,
          "--hb-lives-size": `${hbLivesSize}vw`,
          "--hb-bar-x": `${hbBarX}%`,
          "--hb-bar-y": `${hbBarY}%`,
          "--hb-bar-w": `${hbBarW}%`,
          "--hb-bar-h": `${hbBarH}%`,
          "--hb-corner": `${hbCorner}px`,
        }}
      >
        <div className="hudHealthLives">
          <span className="hudHealthLivesValue">{String(playerLives).padStart(2, "0")}</span>
        </div>
        <div
          className={`hudHealthTrack${playerHealth <= 25 ? " hudHealthCritical" : ""}${playerHealth > 100 ? " hudHealthRadioactive" : ""}${playerHealth > 150 ? " hudHealthOverload" : ""}`}
          style={playerHealth > 100 ? {
            "--radioactive-speed": `${Math.max(0.2, 0.8 - (playerHealth - 100) * 0.004)}s`,
            "--shake-speed": playerHealth > 150 ? `${Math.max(0.15, 0.6 - (Math.min(playerHealth, 190) - 150) * 0.01125)}s` : undefined,
          } : undefined}
        >
          <div
            className="hudHealthFill"
            style={(() => {
              const hp = Math.min(playerHealth, 100);
              const pct = hp / 100;
              let orangeOp = 0, redOp = 0;
              if (hp <= 50) {
                orangeOp = 1;
              }
              if (hp <= 25) {
                redOp = 1;
              }
              return {
                width: `${hp}%`,
                "--health-pct": pct,
                "--orange-op": orangeOp,
                "--red-op": redOp,
              };
            })()}
          >
            <div className="hudHealthLayer hudHealthBlue" />
            <div className="hudHealthLayer hudHealthOrange" style={{ opacity: `var(--orange-op)` }} />
            <div className="hudHealthLayer hudHealthRed" style={{ opacity: `var(--red-op)` }} />
            <div
              className="hudHealthLayer hudHealthFillRadioactive"
              style={{ opacity: playerHealth > 100 ? 1 : 0 }}
            />
          </div>
          <span className="hudHealthText hudHealthTextWhite">{playerHealth} HP</span>
          <span className="hudHealthText hudHealthTextBlack" style={{ width: `${Math.min(playerHealth, 100)}%` }}>{playerHealth} HP</span>
        </div>
      </div>

      {/* Mission info — below health bar */}
      <div className="hudMissionInfo">
        <div className="hudMissionObjective">OBJECTIVE: HOLD ZONE</div>
        <div className="hudMissionStats">
          <span className="hudMissionStat">HOSTILES: <strong>{String(hostileCount).padStart(2, "0")}</strong></span>
          <span className="hudMissionStat">TIMER: <strong>{`${String(Math.floor(missionTime / 60)).padStart(2, "0")}:${String(missionTime % 60).padStart(2, "0")}`}</strong></span>
        </div>
      </div>

      {/* Red vignette when low health */}
      <div
        className="hudDamageVignette"
        style={{ opacity: playerHealth <= 25 ? 0.5 + 0.5 * ((25 - playerHealth) / 25) : 0 }}
      />

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
            onWheel={(e) => e.stopPropagation()}
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
            <div className="settingsBody">
            <SettingsSection title="Controls" defaultOpen>
              <p className="settingsHint" style={{ marginTop: 0 }}>
                Configure keyboard and mouse bindings.
              </p>
              <button
                type="button"
                className="settingsBtn settingsInlineBtn"
                onClick={() => {
                  setSettingsOpen(false);
                  setControlsOpen(true);
                }}
              >
                Open key bindings…
              </button>
            </SettingsSection>

            <SettingsSection title="Time of Day">
              <div
                className="settingRow settingRowButtons"
                role="group"
                aria-label="Time of day"
              >
                <button
                  type="button"
                  className={`settingsBtn settingsToggleBtn${sunIsDay ? " active" : ""}`}
                  aria-pressed={sunIsDay}
                  onClick={() => handleDayNightChange(true)}
                >
                  ☀ Day
                </button>
                <button
                  type="button"
                  className={`settingsBtn settingsToggleBtn${!sunIsDay ? " active" : ""}`}
                  aria-pressed={!sunIsDay}
                  onClick={() => handleDayNightChange(false)}
                >
                  ☾ Night
                </button>
              </div>
              <p className="settingsHint">
                Crossfades the sun and moon over {DAY_NIGHT_FADE_DURATION}{" "}
                seconds. You can also press the bound Day/Night key.
              </p>
            </SettingsSection>

            <SettingsSection title="General">
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
              <label className="sliderRow">
                <span className="sliderLabel">
                  Render scale{" "}
                  <output>{Math.round(renderScale * 100)}%</output>
                </span>
                <input
                  type="range"
                  min={MIN_RENDER_SCALE}
                  max={MAX_RENDER_SCALE}
                  step="0.05"
                  value={renderScale}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    setRenderScale(value);
                    renderScaleRef.current = value;
                    localStorage.setItem(RENDER_SCALE_KEY, String(value));
                    const r = rendererRef.current;
                    if (r) {
                      r.setPixelRatio(effectivePixelRatio(value));
                      r.setSize(window.innerWidth, window.innerHeight);
                    }
                  }}
                />
              </label>
              <p className="settingsHint">
                Lowers internal rendering resolution. The single biggest
                framerate knob — fragment shader cost scales with pixel
                count. 100% = native; 50% = a quarter of the pixels.
              </p>
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

            <SettingsSection title="Player">
              <label className="sliderRow">
                <span className="sliderLabel">
                  Eye height <output>{playerHeight.toFixed(2)}m</output>
                </span>
                <input
                  type="range"
                  min="1.0"
                  max="2.2"
                  step="0.05"
                  value={playerHeight}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    setPlayerHeight(value);
                    playerHeightRef.current = value;
                    localStorage.setItem(PLAYER_HEIGHT_KEY, String(value));
                  }}
                />
              </label>
              <p className="settingsHint">
                Camera height when standing. Default 1.65m (≈ 5′9″ total).
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

            <SettingsSection title="Development">
              <label className="settingRow">
                <input
                  type="checkbox"
                  checked={levelEditEnabled}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setLevelEditEnabled(checked);
                    levelEditEnabledRef.current = checked;
                    if (!checked) {
                      const prev = selectedLevelObjectRef.current;
                      if (prev) prev.material.emissive?.setHex(0x000000);
                      selectedLevelObjectRef.current = null;
                      setSelectedLevelObjectVer((v) => v + 1);
                    }
                  }}
                />
                Level object editor
              </label>
              <p className="settingsHint">
                Shoot a pillar to select it. Adjust texture offset, rotation, and position
                with sliders. Copy JSON to paste into your level file.
              </p>
              <label className="settingRow">
                <input
                  type="checkbox"
                  checked={targetTuneEnabled}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setTargetTuneEnabled(checked);
                    targetTuneEnabledRef.current = checked;
                    if (!checked) selectedTargetRef.current = null;
                  }}
                />
                Target pose tuning
              </label>
              <p className="settingsHint">
                Shoot a target to select it, then adjust its pose with sliders.
              </p>
              <label className="settingRow">
                <input
                  type="checkbox"
                  checked={hitDebugEnabled}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setHitDebugEnabled(checked);
                    hitDebugEnabledRef.current = checked;
                    if (sceneRef.current) setHitDebug(sceneRef.current, checked);
                  }}
                />
                Hit debug markers
              </label>
              <p className="settingsHint">
                Shows colored dots where shots register. Zone color = hit, white = miss (gap).
                Green dot + yellow line = precision raycast result.
              </p>
              <label className="settingRow">
                <input
                  type="checkbox"
                  checked={hitzoneOverlayEnabled}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setHitzoneOverlayEnabled(checked);
                    setHitzoneOverlay(targetsRef.current, checked);
                  }}
                />
                Hitzone wireframe overlay
              </label>
              <p className="settingsHint">
                Cyan wireframe = hull (broad-phase capture). Colored wireframe = actual body
                geometry (what precision raycast tests). Gaps between them are misses.
              </p>
              <label className="settingRow">
                <input
                  type="checkbox"
                  checked={weaponRecoilEnabled}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setWeaponRecoilEnabled(checked);
                    weaponRecoilEnabledRef.current = checked;
                    localStorage.setItem(WEAPON_RECOIL_KEY, String(checked));
                  }}
                />
                Weapon recoil
              </label>
              <p className="settingsHint">
                Kicks the gun backward and nudges aim upward each shot so you
                have to re-center. Turn off to compare feel while tuning.
              </p>
              <label className="settingRow">
                <input
                  type="checkbox"
                  checked={showDevOverlay}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setShowDevOverlay(checked);
                    localStorage.setItem("fps-show-dev-overlay", String(checked));
                  }}
                />
                Show dev overlay (HP buttons)
              </label>
              <label className="settingRow">
                <input
                  type="checkbox"
                  checked={showFps}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setShowFps(checked);
                    localStorage.setItem(SHOW_FPS_KEY, String(checked));
                  }}
                />
                Show FPS counter
              </label>
              <label className="settingRow">
                <input
                  type="checkbox"
                  checked={hudTuneEnabled}
                  onChange={(e) => setHudTuneEnabled(e.target.checked)}
                />
                HUD position tuning
              </label>
              <p className="settingsHint">
                Opens a floating panel with X/Y sliders for each HUD element
                so you can align them over the artwork in real-time.
              </p>
            </SettingsSection>
            </div>
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
      {targetTuneEnabled && (
        <TargetPoseTunePanel
          pose={targetPose}
          onChange={(newPose) => {
            setTargetPose(newPose);
            if (targetApplyAll) {
              for (const t of targetsRef.current) {
                applyTargetPose(t, newPose);
              }
            } else if (selectedTargetRef.current) {
              applyTargetPose(selectedTargetRef.current, newPose);
            }
          }}
          applyToAll={targetApplyAll}
          onApplyToAllChange={setTargetApplyAll}
          onClose={() => {
            setTargetTuneEnabled(false);
            targetTuneEnabledRef.current = false;
            selectedTargetRef.current = null;
          }}
        />
      )}
      {levelEditEnabled && selectedLevelObjectRef.current && (
        <LevelObjectTunePanel
          key={selectedLevelObjectRef.current.uuid}
          mesh={selectedLevelObjectRef.current}
          onCopyAll={() => {
            const defs = levelObjectsRef.current.map((m) => {
              const lo = m.userData.levelObject;
              const def = { ...lo.def, x: parseFloat(m.position.x.toFixed(3)), z: parseFloat(m.position.z.toFixed(3)) };
              const r = m.rotation.y;
              const oU = m.material.map?.offset.x ?? 0;
              const oV = m.material.map?.offset.y ?? 0;
              if (r) def.rotationY = parseFloat(r.toFixed(4));
              if (oU) def.textureOffsetU = parseFloat(oU.toFixed(4));
              if (oV) def.textureOffsetV = parseFloat(oV.toFixed(4));
              return def;
            });
            const text = JSON.stringify(defs, null, 2);
            navigator.clipboard.writeText(text).catch(() => {});
            console.log("All pillars:", text);
          }}
          onClose={() => {
            const prev = selectedLevelObjectRef.current;
            if (prev) prev.material.emissive?.setHex(0x000000);
            selectedLevelObjectRef.current = null;
            setSelectedLevelObjectVer((v) => v + 1);
          }}
        />
      )}
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
      {showFps && (
        <div className="topRightHud">
          <div ref={fpsRef} className="fpsCounter" aria-live="polite">
            — FPS
          </div>
        </div>
      )}
      {hudTuneEnabled && (
        <div className="hudTunePanel" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <div className="hudTuneHeader">
            <span>HUD Position</span>
            <button type="button" className="hudTuneClose" onClick={() => setHudTuneEnabled(false)}>×</button>
          </div>
          <div className="hudTuneBody">
            <div className="hudTuneGroup">
              <span className="hudTuneGroupLabel">Rounds</span>
              <label className="hudTuneRow">
                <span>X</span>
                <input type="range" min={10} max={50} step={0.5} value={hudRoundsX} onChange={(e) => setHudRoundsX(+e.target.value)} />
                <span className="hudTuneVal">{hudRoundsX}%</span>
              </label>
              <label className="hudTuneRow">
                <span>Y</span>
                <input type="range" min={0} max={60} step={0.5} value={hudRoundsY} onChange={(e) => setHudRoundsY(+e.target.value)} />
                <span className="hudTuneVal">{hudRoundsY}%</span>
              </label>
            </div>
            <div className="hudTuneGroup">
              <span className="hudTuneGroupLabel">Mag</span>
              <label className="hudTuneRow">
                <span>X</span>
                <input type="range" min={30} max={70} step={0.5} value={hudMagX} onChange={(e) => setHudMagX(+e.target.value)} />
                <span className="hudTuneVal">{hudMagX}%</span>
              </label>
              <label className="hudTuneRow">
                <span>Y</span>
                <input type="range" min={0} max={60} step={0.5} value={hudMagY} onChange={(e) => setHudMagY(+e.target.value)} />
                <span className="hudTuneVal">{hudMagY}%</span>
              </label>
            </div>
            <div className="hudTuneGroup">
              <span className="hudTuneGroupLabel">Mags</span>
              <label className="hudTuneRow">
                <span>X</span>
                <input type="range" min={50} max={90} step={0.5} value={hudMagsX} onChange={(e) => setHudMagsX(+e.target.value)} />
                <span className="hudTuneVal">{hudMagsX}%</span>
              </label>
              <label className="hudTuneRow">
                <span>Y</span>
                <input type="range" min={0} max={60} step={0.5} value={hudMagsY} onChange={(e) => setHudMagsY(+e.target.value)} />
                <span className="hudTuneVal">{hudMagsY}%</span>
              </label>
            </div>
            <div className="hudTuneGroup">
              <span className="hudTuneGroupLabel">Fire Mode</span>
              <label className="hudTuneRow">
                <span>Y</span>
                <input type="range" min={0} max={40} step={0.5} value={hudFireModeY} onChange={(e) => setHudFireModeY(+e.target.value)} />
                <span className="hudTuneVal">{hudFireModeY}%</span>
              </label>
            </div>
            <div className="hudTuneGroup">
              <span className="hudTuneGroupLabel">Values</span>
              <label className="hudTuneRow">
                <span>Size</span>
                <input type="range" min={2} max={7} step={0.1} value={hudValueFont} onChange={(e) => setHudValueFont(+e.target.value)} />
                <span className="hudTuneVal">{hudValueFont.toFixed(1)}vw</span>
              </label>
              <label className="hudTuneRow">
                <span>Label↕</span>
                <input type="range" min={-10} max={20} step={1} value={hudLabelY} onChange={(e) => setHudLabelY(+e.target.value)} />
                <span className="hudTuneVal">{hudLabelY}px</span>
              </label>
            </div>
          </div>
        </div>
      )}
      {grenadeTuneEnabled && (
        <div className="hudTunePanel" style={{
            left: 0, right: 0, bottom: 0, top: "auto",
            width: "100%", maxWidth: "100%",
            zIndex: 999, borderRadius: 0, padding: "4px 8px",
          }}
          onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <div className="hudTuneHeader">
            <span>Grenade Tuning</span>
            <button type="button" className="hudTuneClose" onClick={() => setGrenadeTuneEnabled(false)}>×</button>
          </div>
          <div className="hudTuneBody" style={{ display: "flex", gap: 8, flexWrap: "nowrap" }}>
            <div className="hudTuneGroup" style={{ flex: "1 1 0", minWidth: 0 }}>
              <span className="hudTuneGroupLabel">Throw</span>
              <label className="hudTuneRow">
                <span>Speed</span>
                <input type="range" min={4} max={30} step={0.5}
                  value={grenadeParams.throwSpeed}
                  onChange={(e) => { const p = { ...grenadeParams, throwSpeed: +e.target.value }; setGrenadeParams(p); setGrenadeParamsState(p); }} />
                <span className="hudTuneVal">{grenadeParams.throwSpeed.toFixed(1)}</span>
              </label>
              <label className="hudTuneRow">
                <span>Loft</span>
                <input type="range" min={0} max={60} step={1}
                  value={grenadeParams.loftAngle}
                  onChange={(e) => { const p = { ...grenadeParams, loftAngle: +e.target.value }; setGrenadeParams(p); setGrenadeParamsState(p); }} />
                <span className="hudTuneVal">{grenadeParams.loftAngle}°</span>
              </label>
              <label className="hudTuneRow">
                <span>Gravity</span>
                <input type="range" min={4} max={20} step={0.1}
                  value={grenadeParams.gravity}
                  onChange={(e) => { const p = { ...grenadeParams, gravity: +e.target.value }; setGrenadeParams(p); setGrenadeParamsState(p); }} />
                <span className="hudTuneVal">{grenadeParams.gravity.toFixed(1)}</span>
              </label>
            </div>
            <div className="hudTuneGroup" style={{ flex: "1 1 0", minWidth: 0 }}>
              <span className="hudTuneGroupLabel">Bounce</span>
              <label className="hudTuneRow">
                <span>Restitution</span>
                <input type="range" min={0} max={0.9} step={0.01}
                  value={grenadeParams.bounceRestitution}
                  onChange={(e) => { const p = { ...grenadeParams, bounceRestitution: +e.target.value }; setGrenadeParams(p); setGrenadeParamsState(p); }} />
                <span className="hudTuneVal">{grenadeParams.bounceRestitution.toFixed(2)}</span>
              </label>
              <label className="hudTuneRow">
                <span>Friction</span>
                <input type="range" min={0} max={1} step={0.01}
                  value={grenadeParams.bounceFriction}
                  onChange={(e) => { const p = { ...grenadeParams, bounceFriction: +e.target.value }; setGrenadeParams(p); setGrenadeParamsState(p); }} />
                <span className="hudTuneVal">{grenadeParams.bounceFriction.toFixed(2)}</span>
              </label>
              <label className="hudTuneRow">
                <span>Fuse</span>
                <input type="range" min={0.5} max={6} step={0.1}
                  value={grenadeParams.fuseTime}
                  onChange={(e) => { const p = { ...grenadeParams, fuseTime: +e.target.value }; setGrenadeParams(p); setGrenadeParamsState(p); }} />
                <span className="hudTuneVal">{grenadeParams.fuseTime.toFixed(1)}s</span>
              </label>
            </div>
            <div className="hudTuneGroup" style={{ flex: "1 1 0", minWidth: 0 }}>
              <span className="hudTuneGroupLabel">Blast</span>
              <label className="hudTuneRow">
                <span>Radius</span>
                <input type="range" min={1} max={15} step={0.5}
                  value={grenadeParams.blastRadius}
                  onChange={(e) => { const p = { ...grenadeParams, blastRadius: +e.target.value }; setGrenadeParams(p); setGrenadeParamsState(p); }} />
                <span className="hudTuneVal">{grenadeParams.blastRadius.toFixed(1)}m</span>
              </label>
              <label className="hudTuneRow">
                <span>Damage</span>
                <input type="range" min={10} max={300} step={5}
                  value={grenadeParams.maxDamage}
                  onChange={(e) => { const p = { ...grenadeParams, maxDamage: +e.target.value }; setGrenadeParams(p); setGrenadeParamsState(p); }} />
                <span className="hudTuneVal">{grenadeParams.maxDamage}</span>
              </label>
              <label className="hudTuneRow">
                <span>Falloff</span>
                <input type="range" min={0.5} max={3} step={0.1}
                  value={grenadeParams.falloffPower}
                  onChange={(e) => { const p = { ...grenadeParams, falloffPower: +e.target.value }; setGrenadeParams(p); setGrenadeParamsState(p); }} />
                <span className="hudTuneVal">{grenadeParams.falloffPower.toFixed(1)}</span>
              </label>
            </div>
          </div>
        </div>
      )}
      {pickupFlash && (
        <PickupOverlay3D key={pickupFlash.ts} type={pickupFlash.type}
          onDone={() => setPickupFlash(null)} />
      )}
      <div className="hudSecondWeapon"
        onClick={() => setGrenadeTuneEnabled(prev => !prev)}>
        <div className={`hudSecondWeaponFrame${grenadeCount === 0 ? " hudSecondWeaponEmpty" : ""}`}>
          <span className="hudSecondWeaponKey">4</span>
          <div className="hudSecondWeaponBody">
            <img src="/ui/grenade.png" className="hudSecondWeaponIcon" alt="" />
            <span className="hudSecondWeaponLabel">GRENADE</span>
            <span className="hudSecondWeaponCount">{String(grenadeCount).padStart(2, "0")}</span>
          </div>
        </div>
      </div>
      <div ref={crosshairRef} className="crosshair crosshairVisible" />
      <div
        ref={deathOverlayRef}
        className="deathOverlay"
        role="alertdialog"
        aria-live="assertive"
        aria-hidden="true"
        onClick={() => {
          const ds = deathStateRef.current;
          if (ds && !ds.respawned && performance.now() >= ds.minDisplayEnd) {
            respawnCallbackRef.current?.();
            ds.respawned = true;
            ds.fadeEndTime = performance.now() + DEATH_FADE_MS;
            playerHealthRef.current = 100;
            setPlayerHealth(100);
            grenadeCountRef.current = getGrenadeParams().grenadeCount;
            setGrenadeCount(grenadeCountRef.current);
            beginDeathOverlayFade(deathOverlayRef.current);
          }
          safeRequestPointerLock(canvasRef.current);
        }}
      >
        <div className="deathOverlayInner">
          <h1 className="deathOverlayTitle">YOU DIED</h1>
          <p
            ref={deathReasonRef}
            className="deathOverlayReason"
          />
          <p className="deathOverlayHint">Click to respawn</p>
        </div>
      </div>
    </div>
  );
}
