"use client";

import Link from "next/link";
import { memo, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createLevelFromArena, disposeLevelGroup } from "@/lib/Level";
import { collectArenaTextureIds, getLevelMeta, loadArenaConfig } from "@/lib/loadArena";
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
import { isPointInsideAnyRoom, isPlayerInsideRoomForLighting } from "@/lib/RoomPlacement";
import { buildRoomCullables, updateRoomCulling } from "@/lib/RoomCulling";
import {
  initCandleFlicker,
  updateCandleFlicker,
} from "@/lib/CandleFlicker";
import { getArenaAttachWall } from "@/lib/DoorwayWall";
import { createInput } from "@/lib/Input";
import { createPlayerController } from "@/lib/PlayerController";
import {
  createSoundManager,
  DEFAULT_LEVEL_TRACK_ID,
  loadStoredLoadingTrackId,
} from "@/lib/Sound";
import LoadingAudioViz from "@/components/LoadingAudioViz";
import PickupFlashLayer from "@/components/PickupFlashLayer";
import { warmupPickupPreviewEngine } from "@/lib/PickupPreviewEngine";
import { createBulletPool, getLaserPalette, loadViewWeapon } from "@/lib/ViewWeapon";
import {
  spawnAmmoDrop, updateAmmoDrops,
  disposeAllAmmoDrops,
  preloadAmmoCrateAssets,
  refreshLevelPickupShadows,
} from "@/lib/AmmoCrate";
import {
  preloadOilBarrelAssets,
  setOilBarrelTuning as applyOilBarrelMaterialTuning,
} from "@/lib/OilBarrel";
import {
  DEFAULT_OIL_BARREL_TUNING,
  loadOilBarrelTuneEnabled,
  loadOilBarrelTuning,
  normalizeOilBarrelTuning,
  saveOilBarrelTuneEnabled,
  saveOilBarrelTuning,
} from "@/lib/OilBarrelTuning";
import OilBarrelTunePanel from "@/components/OilBarrelTunePanel";
import {
  spawnLevelCollectibles,
  mountCompassCollectibleMarkers,
  ensureCompassCollectibleMarkers,
  updateCompassCollectibleMarkers,
  hideCompassCollectibleMarker,
  disposeCompassCollectibleMarkers,
  updateLevelCollectibles,
  LEVEL_COLLECTIBLE_TEST_RESPAWN,
} from "@/lib/LevelCollectibles";

import {
  spawnGrenade, updateGrenades, disposeAllGrenades,
  updateTrajectoryPreview, hideTrajectoryPreview, disposePreview,
  applyScreenShake, triggerScreenShake,
  getGrenadeParams, setGrenadeParams,
  getGrenadeExplosionVfx, setGrenadeExplosionVfx, resetGrenadeExplosionVfx,
  spawnGrenadeDrop, updateGrenadeDrops, disposeAllGrenadeDrops,
  preloadGrenadeAssets,
  PROJECTILE_FLASHBANG,
} from "@/lib/Grenade";
import { groundSupportFromLevel } from "@/lib/GroundSupport";
import {
  setColliderDebug,
  updateColliderDebugOverlay,
} from "@/lib/ColliderDebug.js";
import { warmupGameGpu, resetGameGpuWarmup } from "@/lib/GpuWarmup";
import {
  applyTargetHit,
  applyTargetPose,
  activateTargetAt,
  deactivateTarget,
  DEFAULT_TARGET_POSE,
  disposeAllTargetHealthBars,
  disposeAllHpOrbs,
  pickRandomSpawnPosition,
  resolveAuthoredSpawnPosition,
  renderTargetHealthBarsPass,
  setHealthBarOccluders,
  setHitDebug,
  setHitzoneOverlay,
  spawnHpOrb,
  startDeathAnimation,
  updateDeathAnimations,
  updateHitDebugMarkers,
  updateHpOrbs,
  preloadHpOrbAssets,
  updateLiveTargetsFloorHoles,
  updateTargetsRepair,
  updateTargetHealthBars,
  blindTargetFromFlashbang,
  updateFlashbangBlindVisuals,
  getFlashbangBlindDurationSec,
  FLASHBANG_BLIND_FULL_SEC,
  FLASHBANG_BLIND_FADE_SEC,
  FLASHBANG_BLIND_FULL_OPACITY,
} from "@/lib/Targets";
import {
  disposeAllBloodSplatters,
  spawnBloodSplatter,
  spawnBloodMarkOnTarget,
  updateBloodSplatters,
} from "@/lib/BloodParticles";
import {
  applyBulletSurfaceHit,
  collectLevelHitMeshes,
  disposeAllBulletHoles,
  preloadBulletHoleTextures,
  updateBulletHoles,
} from "@/lib/BulletHoles";
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
import StairWalkTunePanel from "@/components/StairWalkTunePanel";
import HudBarTunePanel from "@/components/HudBarTunePanel";
import TargetPoseTunePanel from "@/components/TargetPoseTunePanel";
import LevelObjectTunePanel from "@/components/LevelObjectTunePanel";
import {
  shouldDropAmmoCrate,
  loadAmmoDropSpareThreshold,
  saveAmmoDropSpareThreshold,
  AMMO_DROP_SPARE_THRESHOLD_MAX,
  DEFAULT_AMMO_DROP_SPARE_THRESHOLD,
} from "@/lib/RewardDropSettings";
import HudCompass from "@/components/HudCompass";
import HudBarCompass from "@/components/HudBarCompass";
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
import {
  DEFAULT_STAIR_WALK_TUNING,
  loadStairWalkTuneEnabled,
  loadStairWalkTuning,
  normalizeStairWalkTuning,
  saveStairWalkTuneEnabled,
  saveStairWalkTuning,
} from "@/lib/StairWalkTuning";
import {
  DEFAULT_HUD_BAR_TUNING,
  loadHudBarTuneEnabled,
  loadHudBarTuning,
  normalizeHudBarTuning,
  saveHudBarTuneEnabled,
  saveHudBarTuning,
} from "@/lib/HudBarTuning";
import ControlsPanel from "@/components/ControlsPanel";
import {
  isBindingDown,
  loadBindings,
  saveBindings,
  wasBindingPressed,
} from "@/lib/KeyBindings";

const _radarScratch = new Array(64);

const WEAPON_SLOT_IDS = [1, 2, 3, 4];
const GRENADE_WEAPON_SLOT = 1;
const FLASHBANG_WEAPON_SLOT = 2;
const DEFAULT_FLASHBANG_COUNT = 4;

/** HUD-only secondary weapons (gameplay not wired yet). */
const SECONDARY_WEAPON_UI = {
  [GRENADE_WEAPON_SLOT]: {
    label: "GRANADE",
    icon: "/ui/grenade.png",
  },
  [FLASHBANG_WEAPON_SLOT]: {
    label: "FLASHBANG",
    icon: "/ui/grenade.png",
  },
};

/** TEMP — every kill drops HP + ammo + grenade for pickup sound testing. */
const DEV_DROP_ALL_REWARDS = false;

const DEFAULT_WEAPON_STACK_TUNE = {
  1: { x: -39, y: -137, scale: 0.8 },
  2: { x: -21, y: -94, scale: 0.8 },
  3: { x: -12, y: -52, scale: 0.8 },
};

/** Steps from selected slot forward in cyclic order 1→2→3→4→1. */
function getWeaponStackDepth(slotId, selectedSlot) {
  if (slotId === selectedSlot) return 0;
  let depth = 0;
  let current = selectedSlot;
  while (current !== slotId) {
    current = current === 4 ? 1 : current + 1;
    depth += 1;
  }
  return depth;
}

function getWeaponStackFrameStyle(slotId, selectedSlot, tune) {
  const depth = getWeaponStackDepth(slotId, selectedSlot);
  if (depth === 0) {
    return {
      "--slot-x": "0px",
      "--slot-y": "0px",
      "--slot-scale": "1",
      "--slot-z": 4,
    };
  }
  const t = tune[depth];
  return {
    "--slot-x": `${t.x}px`,
    "--slot-y": `${t.y}px`,
    "--slot-scale": String(t.scale),
    "--slot-z": 4 - depth,
  };
}

const INVERT_Y_KEY = "fps-invert-y";
const KEYBOARD_LOOK_KEY = "fps-keyboard-look";
const KEYBOARD_EASE_KEY = "fps-keyboard-ease";
const MOUSE_LOOK_KEY = "fps-mouse-look";
const MOUSE_EASE_KEY = "fps-mouse-ease";
const LOOK_MAX_RATE_KEY = "fps-look-max-rate";
const SUN_TUNE_ENABLED_KEY = "fps-sun-tune-enabled";
const HEMI_TUNE_ENABLED_KEY = "fps-hemi-tune-enabled";
const STAIRS_TUNE_ENABLED_KEY = "fps-stairs-tune-enabled";
const GRENADE_TUNE_ENABLED_KEY = "fps-grenade-tune-enabled";
const GRENADE_EXPLOSION_TUNE_ENABLED_KEY = "fps-grenade-explosion-tune-enabled";
const LEGACY_LOOK_SPEED_KEY = "fps-look-speed";
const LEGACY_LOOK_EASE_KEY = "fps-look-ease";
const RENDER_SCALE_KEY = "fps-render-scale";
const PLAYER_HEIGHT_KEY = "fps-player-height";
const SHOW_FPS_KEY = "fps-show-counter";
const SHOW_PLAYER_COORDS_KEY = "fps-show-player-coords";
const MUSIC_ENABLED_KEY = "fps-music-enabled";
const DEFAULT_LOOK = 7;
const DEFAULT_MOUSE_EASE = 0;
const DEFAULT_MAX_LOOK_RATE = 2.5;
const DEFAULT_PLAYER_HEIGHT = 1.65;
/** Multiplier on `min(devicePixelRatio, 2)` — 1.0 = full quality, 0.5 = quarter pixel count. */
const DEFAULT_RENDER_SCALE = 0.4;
const MIN_RENDER_SCALE = 0.25;
const MAX_RENDER_SCALE = 1.0;

/** Survives React Fast Refresh so a dev reload keeps in-level state (music, overlay). */
let gameSessionStarted = false;

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

function loadMusicEnabled() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(MUSIC_ENABLED_KEY) !== "false";
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
/** Shrink HUD ammo digits when a stat exceeds two digits. */
function hudAmmoValueClass(value) {
  return value >= 100 ? " hudAmmoValueCompact" : "";
}
const BURST_SHOT_COUNT = 3;
const BURST_INTERVAL = 0.085;
const AUTO_FIRE_INTERVAL = 0.1;
const FIRE_MODE_ORDER = ["auto", "burst", "single"];
/** Grenade drop chance when player has 0, 1, 2, 3, 4, or 5+ grenades. */
const GRENADE_DROP_CHANCE_BY_COUNT = [0.7, 0.5, 0.3, 0.25, 0.05, 0];

function rollGrenadeDrop(grenadeCount) {
  const idx = Math.min(
    Math.max(0, grenadeCount),
    GRENADE_DROP_CHANCE_BY_COUNT.length - 1
  );
  return Math.random() < GRENADE_DROP_CHANCE_BY_COUNT[idx];
}

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

/** CSS overlay: 3s full blind → smooth fade out. HUD stays above (z-index 15+). */
function getFlashbangOverlayOpacity(elapsedSec) {
  const fullEnd = FLASHBANG_BLIND_FULL_SEC;
  const total = getFlashbangBlindDurationSec();
  if (elapsedSec >= total) return 0;
  if (elapsedSec < fullEnd) return FLASHBANG_BLIND_FULL_OPACITY;
  const fadeT = Math.min(1, (elapsedSec - fullEnd) / FLASHBANG_BLIND_FADE_SEC);
  const eased = fadeT * fadeT * (3 - 2 * fadeT);
  return FLASHBANG_BLIND_FULL_OPACITY * (1 - eased);
}

function updateFlashbangOverlay(el, blindStartMs) {
  if (!el) return;
  if (!blindStartMs) {
    el.style.opacity = "0";
    el.style.visibility = "hidden";
    return;
  }
  const elapsed = (performance.now() - blindStartMs) / 1000;
  const opacity = getFlashbangOverlayOpacity(elapsed);
  el.style.visibility = opacity > 0 ? "visible" : "hidden";
  el.style.opacity = String(opacity);
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

/** Low-health red ring — driven from the game loop, not CSS animation. */
function updateDamageVignette(el, hp, visible) {
  if (!el) return;
  if (!visible || hp <= 0 || hp > 25) {
    el.style.opacity = "0";
    el.style.visibility = "hidden";
    return;
  }
  el.style.visibility = "visible";
  const base = 0.5 + 0.5 * ((25 - hp) / 25);
  const flicker = 0.88 + Math.sin(performance.now() * 0.01) * 0.12;
  el.style.opacity = String(base * flicker);
}

function updateWalkPowerHud(el, stamina, staminaMax, playerHealth, visible) {
  if (!el) return;
  if (!visible || playerHealth <= 0) {
    el.style.visibility = "hidden";
    return;
  }
  el.style.visibility = "visible";

  const radioactive = playerHealth > 100;
  const overload = playerHealth > 150;
  const pct = staminaMax > 0 ? Math.min(1, Math.max(0, stamina / staminaMax)) : 0;
  const displayMax = radioactive ? playerHealth : 100;
  const displayVal = Math.round(pct * displayMax);
  let greenOp = 0;
  if (radioactive && displayMax > 100 && displayVal > 100) {
    greenOp = Math.min(1, (displayVal - 100) / (displayMax - 100));
  }

  const track = el.querySelector(".hudStaminaTrack");
  if (track) {
    track.classList.toggle("hudWalkPowerRadioactive", greenOp > 0.01);
    track.classList.toggle("hudWalkPowerOverload", overload && greenOp > 0.01);
    if (greenOp > 0.01) {
      if (overload) {
        track.style.setProperty(
          "--shake-speed",
          `${Math.max(0.15, 0.6 - (Math.min(playerHealth, 190) - 150) * 0.01125)}s`
        );
      } else {
        track.style.removeProperty("--shake-speed");
      }
    } else {
      track.style.removeProperty("--shake-speed");
    }
  }

  const fill = el.querySelector(".hudWalkPowerFill");
  if (fill) {
    fill.style.width = `${pct * 100}%`;
    let orangeOp = 0;
    let redOp = 0;
    if (displayVal <= 100) {
      if (displayVal <= 50) orangeOp = 1;
      if (displayVal <= 25) redOp = 1;
    } else if (!radioactive) {
      if (pct <= 0.5) orangeOp = 1;
      if (pct <= 0.25) redOp = 1;
    }
    fill.style.setProperty("--orange-op", orangeOp);
    fill.style.setProperty("--red-op", redOp);
  }

  const radioLayer = el.querySelector(".hudWalkPowerRadioactiveLayer");
  if (radioLayer) {
    radioLayer.style.opacity = String(greenOp);
  }

  const label = `${displayVal}%`;
  const textWhite = el.querySelector(".hudStaminaTextWhite");
  const textBlack = el.querySelector(".hudStaminaTextBlack");
  if (textWhite) textWhite.textContent = label;
  if (textBlack) {
    textBlack.textContent = label;
    textBlack.style.width = `${pct * 100}%`;
  }
}

const WeaponSlotStack = memo(function WeaponSlotStack({
  grenadeCount,
  flashbangCount,
  selectedWeaponSlot,
  weaponStackTune,
  frameX,
  frameY,
  layoutStyle,
}) {
  return (
    <div
      className="hudSecondWeapon"
      style={{
        "--grenade-frame-x": `${frameX}px`,
        "--grenade-frame-y": `${frameY}px`,
        ...layoutStyle,
      }}
    >
      <div className="hudWeaponSlots">
        {WEAPON_SLOT_IDS.map((slotId) => {
          const weaponUi = SECONDARY_WEAPON_UI[slotId];
          const isSelected = slotId === selectedWeaponSlot;
          const count = weaponUi
            ? slotId === GRENADE_WEAPON_SLOT
              ? grenadeCount
              : slotId === FLASHBANG_WEAPON_SLOT
                ? flashbangCount
                : 0
            : 0;
          const isEmpty = weaponUi ? count === 0 : true;

          return (
            <div
              key={slotId}
              className={[
                "hudSecondWeaponFrame",
                isSelected ? "hudSecondWeaponFrame--selected" : "",
                isEmpty ? "hudSecondWeaponEmpty" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={getWeaponStackFrameStyle(
                slotId,
                selectedWeaponSlot,
                weaponStackTune
              )}
            >
              <span className="hudSecondWeaponKey">{slotId}</span>
              <div className="hudSecondWeaponBody">
                {weaponUi ? (
                  <img
                    src={weaponUi.icon}
                    className="hudSecondWeaponIcon"
                    alt=""
                  />
                ) : (
                  <span
                    className="hudSecondWeaponIcon hudSecondWeaponIcon--placeholder"
                    aria-hidden="true"
                  />
                )}
                <span className="hudSecondWeaponLabel">
                  {weaponUi?.label ?? "EMPTY"}
                </span>
                <span className="hudSecondWeaponCount">
                  {weaponUi ? String(count).padStart(2, "0") : "00"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default function FpsGame() {
  const canvasRef = useRef(null);
  const crosshairRef = useRef(null);
  const fpsRef = useRef(null);
  const playerCoordsMenuRef = useRef(null);
  const playerCoordsHudRef = useRef(null);
  const showDevOverlayRef = useRef(false);
  const showPlayerCoordsRef = useRef(false);
  const compassTapeRef = useRef(null);
  const compassViewportRef = useRef(null);
  const compassMarkersRef = useRef(null);
  const radarRef = useRef(null);
  const radarSweepRef = useRef(null);
  const radarDotsRef = useRef(null);
  const deathOverlayRef = useRef(null);
  const flashbangOverlayRef = useRef(null);
  const flashbangBlindStartRef = useRef(0);
  const damageVignetteRef = useRef(null);
  const walkPowerRef = useRef(null);
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
  const soundsRef = useRef(null);
  const [keyboardLook, setKeyboardLook] = useState(DEFAULT_LOOK);
  const [keyboardEase, setKeyboardEase] = useState(DEFAULT_LOOK);
  const [mouseLook, setMouseLook] = useState(DEFAULT_LOOK);
  const [mouseEase, setMouseEase] = useState(DEFAULT_MOUSE_EASE);
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
  const initialStairWalkTuning = loadStairWalkTuning();
  const [stairX, setStairX] = useState(initialStairTuning.position.x);
  const [stairY, setStairY] = useState(initialStairTuning.position.y);
  const [stairZ, setStairZ] = useState(initialStairTuning.position.z);
  const [stairRotationY, setStairRotationY] = useState(initialStairTuning.rotationY);
  const [arenaHasStairs, setArenaHasStairs] = useState(false);
  const [levelMeta, setLevelMeta] = useState({
    number: 1,
    id: "level1",
    name: "Level 1",
    objective: "HOLD ZONE",
  });
  const [stairsTuneEnabled, setStairsTuneEnabled] = useState(false);
  const [walkBobTuneEnabled, setWalkBobTuneEnabled] = useState(false);
  const [stairWalkTuneEnabled, setStairWalkTuneEnabled] = useState(false);
  const [hudBarTuneEnabled, setHudBarTuneEnabled] = useState(false);
  const [hudBarLayout, setHudBarLayout] = useState(() => loadHudBarTuning());
  const [oilBarrelTuneEnabled, setOilBarrelTuneEnabled] = useState(false);
  const [oilBarrelTuning, setOilBarrelTuning] = useState(() =>
    loadOilBarrelTuning()
  );
  const [walkBobTuning, setWalkBobTuning] = useState(initialWalkBobTuning);
  const [stairWalkTuning, setStairWalkTuning] = useState(initialStairWalkTuning);
  const [sunTuneEnabled, setSunTuneEnabled] = useState(false);
  const [hemiTuneEnabled, setHemiTuneEnabled] = useState(false);
  const [floorDeckY, setFloorDeckY] = useState(0);
  const [catwalkDeckY, setCatwalkDeckY] = useState(4.13);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadAssetLabel, setLoadAssetLabel] = useState("Initializing…");
  const [assetsReady, setAssetsReady] = useState(false);
  const [loadDone, setLoadDone] = useState(() => gameSessionStarted);
  const loadDoneRef = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [showFps, setShowFps] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const musicEnabledRef = useRef(true);
  const [ammoDropSpareThreshold, setAmmoDropSpareThreshold] = useState(
    DEFAULT_AMMO_DROP_SPARE_THRESHOLD
  );
  const ammoDropSpareThresholdRef = useRef(DEFAULT_AMMO_DROP_SPARE_THRESHOLD);
  const loadingMusicTrackIdRef = useRef(loadStoredLoadingTrackId());
  const levelMusicTrackIdRef = useRef(DEFAULT_LEVEL_TRACK_ID);
  const [showDevOverlay, setShowDevOverlay] = useState(() => window.localStorage.getItem("fps-show-dev-overlay") === "true");
  const [showPlayerCoords, setShowPlayerCoords] = useState(
    () => window.localStorage.getItem(SHOW_PLAYER_COORDS_KEY) === "true"
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
  const [hudBarCompassX, setHudBarCompassX] = useState(92);
  const [hudBarCompassY, setHudBarCompassY] = useState(21);
  const [hudBarCompassSize, setHudBarCompassSize] = useState(6.3);
  const [hbCorner, setHbCorner] = useState(3);
  const [radarInnerX] = useState(52);
  const [radarInnerY] = useState(50);
  const [radarInnerSize] = useState(80);
  const [radarLeft] = useState(1.5);
  const [radarBottom] = useState(1.5);
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
  const [colliderDebugEnabled, setColliderDebugEnabled] = useState(false);
  const colliderDebugEnabledRef = useRef(false);
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
  const mouseEaseRef = useRef(DEFAULT_MOUSE_EASE);
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
  const stairWalkTuningRef = useRef(initialStairWalkTuning);
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
  const [fireMode, setFireMode] = useState("auto");
  const [roundsInMag, setRoundsInMag] = useState(MAGAZINE_SIZE);
  const [spareMags, setSpareMags] = useState(SPARE_MAGAZINES);
  const [playerHealth, setPlayerHealth] = useState(100);
  const pickupFlashLayerRef = useRef(null);
  const hudSyncPendingRef = useRef(false);
  const scheduleGameplayHudSyncRef = useRef(() => {});
  const [grenadeCount, setGrenadeCount] = useState(
    () => getGrenadeParams().grenadeCount
  );
  const grenadeCountRef = useRef(getGrenadeParams().grenadeCount);
  const [flashbangCount, setFlashbangCount] = useState(DEFAULT_FLASHBANG_COUNT);
  const flashbangCountRef = useRef(DEFAULT_FLASHBANG_COUNT);
  const [grenadeTuneEnabled, setGrenadeTuneEnabled] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem(GRENADE_TUNE_ENABLED_KEY) === "true"
  );
  const [grenadeParams, setGrenadeParamsState] = useState(() => getGrenadeParams());
  const [grenadeExplosionTuneEnabled, setGrenadeExplosionTuneEnabled] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem(GRENADE_EXPLOSION_TUNE_ENABLED_KEY) === "true"
  );
  const [explosionVfx, setExplosionVfxState] = useState(() => getGrenadeExplosionVfx());
  const patchExplosionVfx = (patch) => {
    setExplosionVfxState(setGrenadeExplosionVfx(patch));
  };
  const [grenadeWidgetTuneEnabled, setGrenadeWidgetTuneEnabled] = useState(
    () => window.localStorage.getItem("fps-grenade-widget-tune") === "true"
  );
  const [grenFrameWidthRem, setGrenFrameWidthRem] = useState(12.3);
  const [grenFrameScale, setGrenFrameScale] = useState(1);
  const [grenFrameX, setGrenFrameX] = useState(17);
  const [grenFrameY, setGrenFrameY] = useState(15);
  const [grenHudKeyX, setGrenHudKeyX] = useState(2);
  const [grenHudKeyY, setGrenHudKeyY] = useState(0);
  const [grenHudKeyScale, setGrenHudKeyScale] = useState(1.49);
  const [grenHudIconX, setGrenHudIconX] = useState(11);
  const [grenHudIconY, setGrenHudIconY] = useState(1);
  const [grenHudIconScale, setGrenHudIconScale] = useState(0.91);
  const [grenHudLabelX, setGrenHudLabelX] = useState(-13);
  const [grenHudLabelY, setGrenHudLabelY] = useState(10);
  const [grenHudLabelScale, setGrenHudLabelScale] = useState(1);
  const [grenHudCountX, setGrenHudCountX] = useState(-10);
  const [grenHudCountY, setGrenHudCountY] = useState(-6);
  const [grenHudCountScale, setGrenHudCountScale] = useState(1.15);
  const [weaponStackTune, setWeaponStackTune] = useState(() => ({
    1: { ...DEFAULT_WEAPON_STACK_TUNE[1] },
    2: { ...DEFAULT_WEAPON_STACK_TUNE[2] },
    3: { ...DEFAULT_WEAPON_STACK_TUNE[3] },
  }));
  const [selectedWeaponSlot, setSelectedWeaponSlot] = useState(GRENADE_WEAPON_SLOT);
  const selectedWeaponSlotRef = useRef(GRENADE_WEAPON_SLOT);
  selectedWeaponSlotRef.current = selectedWeaponSlot;
  const [playerLives, setPlayerLives] = useState(3);
  const [hostileCount, setHostileCount] = useState(0);
  const [missionTime, setMissionTime] = useState(0);
  const missionTimeRef = useRef(0);
  const playerHealthRef = useRef(100);
  const playerLivesRef = useRef(3);
  const fireModeRef = useRef("auto");
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
  stairWalkTuningRef.current = stairWalkTuning;
  bindingsRef.current = bindings;
  rebindActionRef.current = rebindAction;
  fireModeRef.current = fireMode;
  loadDoneRef.current = loadDone;
  if (loadDone) gameSessionStarted = true;
  musicEnabledRef.current = musicEnabled;
  ammoDropSpareThresholdRef.current = ammoDropSpareThreshold;
  showDevOverlayRef.current = showDevOverlay;
  showPlayerCoordsRef.current = showPlayerCoords;
  if (showPlayerCoords && !colliderDebugEnabledRef.current) {
    colliderDebugEnabledRef.current = true;
    setColliderDebugEnabled(true);
    if (sceneRef.current) setColliderDebug(sceneRef.current, true);
  }

  scheduleGameplayHudSyncRef.current = () => {
    if (hudSyncPendingRef.current) return;
    hudSyncPendingRef.current = true;
    requestAnimationFrame(() => {
      hudSyncPendingRef.current = false;
      setPlayerHealth(playerHealthRef.current);
      setGrenadeCount(grenadeCountRef.current);
      setRoundsInMag(roundsInMagRef.current);
      setSpareMags(spareMagsRef.current);
    });
  };

  roundsInMagRef.current = roundsInMag;
  spareMagsRef.current = spareMags;
  setAmmoStateRef.current = (rounds, spare) => {
    setRoundsInMag(rounds);
    setSpareMags(spare);
  };

  useEffect(() => {
    const s = soundsRef.current;
    if (!s || !loadDone || !assetsReady) return;
    s.stopLoadingMusic();
    if (musicEnabledRef.current) {
      s.startLevelMusic({ trackId: levelMusicTrackIdRef.current });
    }
  }, [loadDone, assetsReady]);

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
    const mouseEaseFallback = Number.isNaN(legacyEase)
      ? DEFAULT_MOUSE_EASE
      : legacyEase;
    const kbLook = read(KEYBOARD_LOOK_KEY, speedFallback);
    const kbEase = read(KEYBOARD_EASE_KEY, easeFallback);
    const mLook = read(MOUSE_LOOK_KEY, speedFallback);
    const mEase = read(MOUSE_EASE_KEY, mouseEaseFallback);
    const maxRate = read(LOOK_MAX_RATE_KEY, DEFAULT_MAX_LOOK_RATE);
    const tuneEnabled = loadWeaponTuneEnabled();
    const sunEnabled = localStorage.getItem(SUN_TUNE_ENABLED_KEY) === "true";
    const hemiEnabled = localStorage.getItem(HEMI_TUNE_ENABLED_KEY) === "true";
    const stairsEnabled = localStorage.getItem(STAIRS_TUNE_ENABLED_KEY) === "true";
    const walkBobEnabled = loadWalkBobTuneEnabled();
    const stairWalkEnabled = loadStairWalkTuneEnabled();
    const hudBarEnabled = loadHudBarTuneEnabled();
    const oilBarrelEnabled = loadOilBarrelTuneEnabled();
    setInvertYLook(storedInvert);
    const storedScale = loadRenderScale();
    setRenderScale(storedScale);
    renderScaleRef.current = storedScale;
    setShowFps(loadShowFps());
    const storedMusicEnabled = loadMusicEnabled();
    const storedLoadingTrack = loadStoredLoadingTrackId();
    setMusicEnabled(storedMusicEnabled);
    musicEnabledRef.current = storedMusicEnabled;
    const storedAmmoDropThreshold = loadAmmoDropSpareThreshold();
    setAmmoDropSpareThreshold(storedAmmoDropThreshold);
    ammoDropSpareThresholdRef.current = storedAmmoDropThreshold;
    loadingMusicTrackIdRef.current = storedLoadingTrack;
    setWeaponTuneEnabled(tuneEnabled);
    setSunTuneEnabled(sunEnabled);
    setHemiTuneEnabled(hemiEnabled);
    setStairsTuneEnabled(stairsEnabled);
    setWalkBobTuneEnabled(walkBobEnabled);
    setStairWalkTuneEnabled(stairWalkEnabled);
    setHudBarTuneEnabled(hudBarEnabled);
    setHudBarLayout(loadHudBarTuning());
    setOilBarrelTuneEnabled(oilBarrelEnabled);
    const barrelTuning = loadOilBarrelTuning();
    setOilBarrelTuning(barrelTuning);
    applyOilBarrelMaterialTuning(barrelTuning);
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
    applyDayNightRef.current?.(dayNightCurNightnessRef.current);
    refitSunShadowRef.current?.();
    refitMoonShadowRef.current?.();
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
    let hpOrbs = [];
    let ammoDrops = [];
    let collectibleEntries = [];
    let grenades = [];
    let grenadeDrops = [];
    let bloodSplatters = [];
    let gameReady = false;
    let healthRegenTimer = 0;
    const HEALTH_REGEN_INTERVAL = 10;
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
      if (colliderDebugEnabledRef.current) setColliderDebug(scene, true);

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
      const sounds = createSoundManager(camera);
      soundsRef.current = sounds;
      const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

      const reportLoad = (progress, label) => {
        setLoadProgress(progress);
        setLoadAssetLabel(label);
      };

      reportLoad(5, "Renderer & scene");
      reportLoad(8, "Audio — SFX, footsteps + body hits + music");
      await sounds.preload();
      if (!isActive()) return;
      reportLoad(12, "Audio ready");
      if (musicEnabledRef.current) {
        sounds.resume();
        if (loadDoneRef.current) {
          sounds.stopLoadingMusic();
          sounds.startLevelMusic({ trackId: levelMusicTrackIdRef.current });
        } else {
          sounds.startLoadingMusic({ trackId: loadingMusicTrackIdRef.current });
        }
      }

      reportLoad(18, "Arena config");
      const arena = await loadArenaConfig();
      if (!isActive()) return;
      setLevelMeta(getLevelMeta(arena));
      reportLoad(20, "Arena config");

      reportLoad(22, "Level textures");
      levelTextures = await loadLevelTextureLibrary(
        maxAnisotropy,
        collectArenaTextureIds(arena)
      );
      if (!isActive()) return;
      reportLoad(45, "Level textures");

      reportLoad(48, "Grenade pickup model");
      await preloadGrenadeAssets(maxAnisotropy);
      if (!isActive()) return;
      reportLoad(52, "Ammo crate textures");
      await preloadAmmoCrateAssets();
      if (!isActive()) return;
      reportLoad(54, "Oil barrel assets");
      await preloadOilBarrelAssets();
      if (!isActive()) return;
      reportLoad(55, "HP orb textures");
      await preloadHpOrbAssets();
      if (!isActive()) return;
      reportLoad(58, "Pickup assets");
      warmupPickupPreviewEngine();
      if (!isActive()) return;
      reportLoad(59, "Pickup preview ready");

      reportLoad(60, "Building level");
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
      reportLoad(72, "Level geometry");
      targetsRef.current = level.targets;
      levelObjectsRef.current = level.pillarMeshes ?? [];
      preloadBulletHoleTextures();
      const levelHitMeshes = collectLevelHitMeshes(level.group, level.targets);
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
        const hemiIntensity = THREE.MathUtils.lerp(
          dayHemi.intensity,
          nightHemi.intensity,
          nightness
        );
        const shelteredHemiMul = sheltered ? 0.85 : 1;
        applyHemisphereSettings(
          hemiRef.current,
          {
            temperature: THREE.MathUtils.lerp(
              dayHemi.temperature,
              nightHemi.temperature,
              nightness
            ),
            intensity: hemiIntensity * shelteredHemiMul,
          },
          { indoor: sheltered }
        );
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
      const mountLevelCollectibles = () => {
        if (disposed || !level) return;
        const spawnedCollectibles = spawnLevelCollectibles(
          level.pickupsGroup ?? scene,
          arena
        );
        collectibleEntries = spawnedCollectibles.entries;
        if (level.pickupsGroup) enableShadowsOn(level.pickupsGroup);
        refreshLevelPickupShadows(
          level.pickupsGroup ?? scene,
          collectibleEntries.map((e) => e.drop?.mesh),
          level.group
        );
        renderer.shadowMap.needsUpdate = true;
        mountCompassCollectibleMarkers(
          compassMarkersRef.current,
          collectibleEntries
        );
      };
      applyDayNightRef.current(sunIsDayRef.current);
      mountLevelCollectibles();
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
      /** Stable collider list — avoids spreading into a new array on every physics query. */
      const allColliders = [];
      function syncAllColliders() {
        allColliders.length = 0;
        allColliders.push(
          ...level.colliders,
          ...level.stairColliders,
          ...level.ceilingColliders
        );
      }
      syncAllColliders();
      rebuildStairsRef.current = (params) => {
        if (!level?.rebuildStairs) return;
        level.rebuildStairs(params);
        syncAllColliders();
      };

      player = createPlayerController(camera, level.bounds, level.floorY, {
        getColliders: () => allColliders,
        getGroundSurfaces: () => level.groundSurfaces,
        getFloorHoles: () => level.floorHoles ?? [],
        getFloorBounds: () => level.floorBounds,
        arenaBounds: level.arenaBounds,
        wallStandoff: arena.wallStandoff ?? 0.5,
        getDoorwayPassages: () => level.doorwayPassages ?? [],
        getAttachWall: () => level.attachWall ?? "north",
        getIsInRoom: (x, z) =>
          isPointInsideAnyRoom(
            x,
            z,
            level.rooms ?? [],
            arenaHalf,
            level.attachWall ?? attachWall
          ),
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
        getStairWalkTuning: () =>
          normalizeStairWalkTuning(stairWalkTuningRef.current),
        getStaminaMax: () => {
          const hp = playerHealthRef.current;
          return hp > 100 ? hp / 100 : 1;
        },
        onFootstep: ({ speed, crouching, sprinting, onStairs }) => {
          if (!loadDoneRef.current) return;
          const t = resolveWalkBobTuning(walkBobTuningRef.current);
          const speedNorm = speed / Math.max(t.walkSpeed, 0.1);
          const playbackRate = THREE.MathUtils.clamp(
            0.94 + (speedNorm - 1) * 0.06,
            0.9,
            1.08
          );
          let volume = 0.5;
          if (crouching) volume *= 0.5;
          else if (sprinting) volume *= 1.08;
          if (onStairs) volume *= stairWalkTuningRef.current.footstepVolumeScale;
          sounds.playFootstep({ volume, playbackRate });
        },
      });

      respawnCallbackRef.current = () => {
        player.respawn();
      };

      const shootRaycaster = new THREE.Raycaster();
      shootRaycaster.layers.enable(WORLD_LAYER);
      shootRaycaster.layers.enable(ROOM_INTERIOR_LAYER);
      const hitRaycaster = new THREE.Raycaster();
      const screenCenter = new THREE.Vector2(0, 0);
      const currentWeaponLoad = ++weaponLoadId;
      reportLoad(74, "View weapon (rifle GLTF)");
      const weaponPromise = loadViewWeapon(camera, scene, undefined, { maxAnisotropy })
        .then((loaded) => {
          if (disposed || currentWeaponLoad !== weaponLoadId) {
            loaded.dispose();
            return null;
          }
          weapon = loaded;
          weaponRef.current = loaded;
          weapon.update(camera, 0, 0, weaponTuningRef);
          return loaded;
        })
        .catch((err) => {
          console.error("Rifle model failed to load:", err);
          return null;
        });
      bulletPool = createBulletPool();
      bullets = [];
      hpOrbs = [];
      ammoDrops = [];
      grenades = [];
      grenadeDrops = [];
      bloodSplatters = [];
      let grenadeHeld = false;
      let simTime = 0;
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

      const flashbangLosRaycaster = new THREE.Raycaster();
      flashbangLosRaycaster.layers.enable(WORLD_LAYER);
      flashbangLosRaycaster.layers.enable(ROOM_INTERIOR_LAYER);
      const _flashBlindPos = new THREE.Vector3();
      const _flashBlindDir = new THREE.Vector3();
      const _flashBlindNdc = new THREE.Vector3();

      /** True when the blast is on-screen and not blocked by level geometry. */
      function canFlashbangBlindPlayer(explosionPos) {
        const blindRadius = getGrenadeParams().flashbangBlindRadius ?? 18;
        _flashBlindPos.copy(explosionPos);
        _flashBlindPos.y += 0.35;

        const dist = camera.position.distanceTo(_flashBlindPos);
        if (dist > blindRadius) return false;

        _flashBlindNdc.copy(_flashBlindPos).project(camera);
        if (_flashBlindNdc.z > 1) return false;
        if (
          Math.abs(_flashBlindNdc.x) > 1.3 ||
          Math.abs(_flashBlindNdc.y) > 1.3
        ) {
          return false;
        }

        _flashBlindDir.subVectors(_flashBlindPos, camera.position);
        const distLen = _flashBlindDir.length();
        if (distLen < 0.08) return true;

        _flashBlindDir.multiplyScalar(1 / distLen);
        flashbangLosRaycaster.set(camera.position, _flashBlindDir);
        flashbangLosRaycaster.far = distLen + 0.2;
        flashbangLosRaycaster.near = 0.05;

        for (const hit of flashbangLosRaycaster.intersectObjects(
          levelHitMeshes,
          false
        )) {
          if (hit.distance < distLen - 0.45) return false;
        }

        for (const hit of flashbangLosRaycaster.intersectObjects(
          getLiveTargets(),
          true
        )) {
          if (hit.object.isSprite) continue;
          if (hit.distance < distLen - 0.45) return false;
        }

        return true;
      }

      function scheduleRespawn(mesh) {
        const delayMs = targetConfig.respawnDelay * 1000;
        setTimeout(() => {
          if (disposed) return;
          const fixed = mesh.userData.fixedSpawn;
          if (fixed) {
            const pos = resolveAuthoredSpawnPosition(fixed.x, fixed.z, {
              bounds: level.arenaBounds,
              colliders: allColliders,
              targets: level.targets,
              config: targetConfig,
              skip: mesh,
            });
            if (!pos) return;
            activateTargetAt(
              mesh,
              pos.x,
              pos.z,
              targetConfig,
              pos.y ?? fixed.y ?? 0,
              fixed.yaw
            );
            return;
          }
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

      function scheduleKillDrops(deathPos, zone) {
        const rndAngle = Math.random() * Math.PI * 2;
        const rndOff = 0.3 + Math.random() * 0.5;
        const hpDelay = 800 + Math.random() * 400;
        const ammoDelay = 1800 + Math.random() * 400;
        const grenDelay = 2200 + Math.random() * 500;

        const dropAt = (angle, delayMs, spawn) => {
          setTimeout(() => {
            spawn(
              new THREE.Vector3(
                deathPos.x + Math.cos(angle) * rndOff,
                deathPos.y,
                deathPos.z + Math.sin(angle) * rndOff
              )
            );
          }, delayMs);
        };

        if (DEV_DROP_ALL_REWARDS) {
          dropAt(rndAngle, hpDelay, (p) =>
            hpOrbs.push(spawnHpOrb(scene, p, level.floorY))
          );
          dropAt(rndAngle + Math.PI * 0.66, ammoDelay, (p) =>
            ammoDrops.push(spawnAmmoDrop(scene, p, level.floorY))
          );
          dropAt(rndAngle + Math.PI * 1.33, grenDelay, (p) =>
            grenadeDrops.push(spawnGrenadeDrop(scene, p, level.floorY))
          );
          return;
        }

        if (zone === "head" || playerHealthRef.current < 50) {
          dropAt(rndAngle, hpDelay, (p) =>
            hpOrbs.push(spawnHpOrb(scene, p, level.floorY))
          );
        }
        if (shouldDropAmmoCrate(spareMagsRef.current, ammoDropSpareThresholdRef.current)) {
          dropAt(rndAngle + Math.PI, ammoDelay, (p) =>
            ammoDrops.push(spawnAmmoDrop(scene, p, level.floorY))
          );
        }
        if (rollGrenadeDrop(grenadeCountRef.current)) {
          dropAt(rndAngle + Math.PI * 0.5, grenDelay, (p) =>
            grenadeDrops.push(spawnGrenadeDrop(scene, p, level.floorY))
          );
        }
      }

      function scheduleGrenadeKillDrops(deathPos) {
        const rndAngle = Math.random() * Math.PI * 2;
        const rndOff = 0.3 + Math.random() * 0.5;
        const hpDelay = 800 + Math.random() * 400;
        const ammoDelay = 1800 + Math.random() * 400;
        const grenDelay = 2200 + Math.random() * 500;

        const dropAt = (angle, delayMs, spawn) => {
          setTimeout(() => {
            spawn(
              new THREE.Vector3(
                deathPos.x + Math.cos(angle) * rndOff,
                deathPos.y,
                deathPos.z + Math.sin(angle) * rndOff
              )
            );
          }, delayMs);
        };

        if (DEV_DROP_ALL_REWARDS) {
          dropAt(rndAngle, hpDelay, (p) =>
            hpOrbs.push(spawnHpOrb(scene, p, level.floorY))
          );
          dropAt(rndAngle + Math.PI * 0.66, ammoDelay, (p) =>
            ammoDrops.push(spawnAmmoDrop(scene, p, level.floorY))
          );
          dropAt(rndAngle + Math.PI * 1.33, grenDelay, (p) =>
            grenadeDrops.push(spawnGrenadeDrop(scene, p, level.floorY))
          );
          return;
        }

        dropAt(rndAngle, hpDelay, (p) =>
          hpOrbs.push(spawnHpOrb(scene, p, level.floorY))
        );
        if (shouldDropAmmoCrate(spareMagsRef.current, ammoDropSpareThresholdRef.current)) {
          dropAt(rndAngle + Math.PI, ammoDelay, (p) =>
            ammoDrops.push(spawnAmmoDrop(scene, p, level.floorY))
          );
        }
        if (rollGrenadeDrop(grenadeCountRef.current)) {
          dropAt(rndAngle + Math.PI * 0.5, grenDelay, (p) =>
            grenadeDrops.push(spawnGrenadeDrop(scene, p, level.floorY))
          );
        }
      }

      function applyHit(hit, bulletDirection, targetMesh) {
        const mesh = targetMesh ?? hit.object;
        if (targetTuneEnabledRef.current) {
          selectedTargetRef.current = mesh;
        }
        const { killed, zone, damage } = applyTargetHit(mesh, hit.point, bulletDirection);
        if (zone !== "miss") {
          const splatterDamage = Math.max(damage, 4);
          const splatter = spawnBloodSplatter(
            scene,
            hit.point,
            bulletDirection,
            splatterDamage,
          );
          if (splatter) bloodSplatters.push(splatter);
          spawnBloodMarkOnTarget(
            mesh,
            hit.point,
            hit.face,
            bulletDirection,
            splatterDamage,
          );
        }
        if (killed) {
          const deathPos = mesh.position.clone();
          scheduleKillDrops(deathPos, zone);
          startDeathAnimation(mesh, bulletDirection, {
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
          scheduleGrenadeKillDrops(mesh.position.clone());
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
        const radioactive = playerHealthRef.current > 100;
        const bullet = bulletPool.spawn(scene, visualOrigin ?? origin, direction, {
          radioactive,
        });
        bullet.hitOrigin = origin.clone();
        bullet.hitPos = origin.clone();
        bullet.traveled = 0;
        bullet.radioactive = radioactive;
        bullets.push(bullet);
      }

      function flashMuzzle() {
        if (!weapon) return;
        const palette = getLaserPalette(playerHealthRef.current > 100);
        weapon.muzzleFlash.color.setHex(palette.muzzle);
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
        sounds.playSupplyPickup();
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
        sounds.play("laser_shot", { volume: 0.65 });
        const ads = weapon.getAimBlend?.() ?? 0;
        const scale = 1 - ads * 0.45;
        player.addAimRecoil(scale);
        weapon.applyFireKick(ads);
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
          const prevHit = bullet.hitPos;
          _bulletNextHit.copy(prevHit).addScaledVector(bullet.direction, stepLen);

          shootRaycaster.set(prevHit, bullet.direction);
          shootRaycaster.far = stepLen + 0.05;

          const targetHits = shootRaycaster.intersectObjects(targets, true);
          const surfaceHits = shootRaycaster.intersectObjects(
            levelHitMeshes,
            false
          );

          /** @type {THREE.Intersection | null} */
          let bestHit = null;
          for (const hit of targetHits) {
            if (!bestHit || hit.distance < bestHit.distance) bestHit = hit;
          }
          for (const hit of surfaceHits) {
            if (!bestHit || hit.distance < bestHit.distance) bestHit = hit;
          }

          if (bestHit) {
            bullet.mesh.position.copy(bestHit.point);
            let targetNode = bestHit.object;
            while (targetNode && !targetNode.userData?.isTarget) {
              targetNode = targetNode.parent;
            }
            if (targetNode?.userData?.isTarget && targetNode.userData.health > 0) {
              applyHit(bestHit, bullet.direction, targetNode);
            } else {
              applyBulletSurfaceHit(
                bestHit,
                bullet.direction,
                bullet.radioactive
              );
            }
            removeBullet(i);
            continue;
          }

          bullet.mesh.position.addScaledVector(bullet.direction, stepLen);
          bullet.hitPos.copy(_bulletNextHit);
          bullet.traveled += stepLen;

          if (bullet.traveled >= BULLET_MAX_RANGE) {
            removeBullet(i);
          }
        }
      }

      let lastTime = performance.now();
      let fpsSmooth = 60;

      function syncPointerLocked() {
        const locked = document.pointerLockElement === canvas;
        setPointerLocked(locked);
        if (locked) sounds.resume();
      }

      function animate(now) {
        if (disposed || !gameReady || !level?.group) return;
        if (!level.group.parent) scene.add(level.group);
        rafId = requestAnimationFrame(animate);
        try {
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        if (dt > 0) simTime += dt;
        if (dt > 0) {
          fpsSmooth += (1 / dt - fpsSmooth) * 0.12;
          if (fpsRef.current) {
            fpsRef.current.textContent = `${Math.round(fpsSmooth)} FPS`;
          }
          if (player && (settingsOpenRef.current || showPlayerCoordsRef.current)) {
            const yawDeg = (player.getYaw() * 180) / Math.PI;
            const footY = player.getFootY();
            const px = camera.position.x;
            const pz = camera.position.z;
            const text =
              `X ${px.toFixed(3)}  Z ${pz.toFixed(3)}  foot ${footY.toFixed(3)}  eye ${camera.position.y.toFixed(3)}  yaw ${yawDeg.toFixed(1)}°`;
            const json = JSON.stringify({
              x: +px.toFixed(3),
              z: +pz.toFixed(3),
              footY: +footY.toFixed(3),
              eyeY: +camera.position.y.toFixed(3),
              yawDeg: +yawDeg.toFixed(1),
            });
            if (settingsOpenRef.current && playerCoordsMenuRef.current) {
              playerCoordsMenuRef.current.textContent = text;
              playerCoordsMenuRef.current.dataset.coords = json;
            }
            if (showPlayerCoordsRef.current && playerCoordsHudRef.current) {
              playerCoordsHudRef.current.textContent = text;
              playerCoordsHudRef.current.dataset.coords = json;
            }
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
              flashbangBlindStartRef.current = 0;
              updateFlashbangOverlay(flashbangOverlayRef.current, 0);
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
        if (compassTapeRef.current && compassViewportRef.current) {
          const yawDeg = (player.getYaw() * 180) / Math.PI;
          const bearing = (((-yawDeg % 360) + 360) % 360);
          const viewport = compassViewportRef.current;
          const tape = compassTapeRef.current;
          const pxPerDeg = viewport.offsetWidth / 105;
          tape.style.setProperty("--compass-px-per-deg", `${pxPerDeg}px`);
          const center = viewport.offsetWidth * 0.5;
          tape.style.transform = `translateX(${center - bearing * pxPerDeg}px)`;
          if (collectibleEntries.length > 0 && compassMarkersRef.current) {
            ensureCompassCollectibleMarkers(
              compassMarkersRef.current,
              collectibleEntries
            );
            updateCompassCollectibleMarkers(
              collectibleEntries,
              camera.position.x,
              camera.position.z,
              player.getYaw(),
              viewport,
              pxPerDeg
            );
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
          const levelDrops = collectibleEntries
            .filter((e) => !e.collected && e.drop?.mesh?.position)
            .map((e) => e.drop);
          const allDrops = [...hpOrbs, ...ammoDrops, ...grenadeDrops, ...levelDrops]
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
            dot.style.cssText = "position:absolute;width:5px;height:5px;border-radius:50%;background:#3af;transform:translate(-50%,-50%)";
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
            stairWalkTuning: normalizeStairWalkTuning(stairWalkTuningRef.current),
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

        if (
          !frozen &&
          !rebindActionRef.current &&
          !settingsOpenRef.current &&
          !controlsOpenRef.current
        ) {
          for (let slot = 1; slot <= 4; slot++) {
            if (
              input.wasPressed(`Digit${slot}`) ||
              input.wasPressed(`Numpad${slot}`)
            ) {
              setSelectedWeaponSlot(slot);
              break;
            }
          }
        }

        // Grenade / flashbang: hold G to preview, release to throw
        const activeSlot = selectedWeaponSlotRef.current;
        const throwingGrenade = activeSlot === GRENADE_WEAPON_SLOT;
        const throwingFlashbang = activeSlot === FLASHBANG_WEAPON_SLOT;
        const canThrowSecondary =
          (throwingGrenade && grenadeCountRef.current > 0) ||
          (throwingFlashbang && flashbangCountRef.current > 0);
        const gDown = isBindingDown(input, bindingsRef.current, "grenade");
        if (gDown && !grenadeHeld && !frozen && canThrowSecondary) {
          grenadeHeld = true;
        }
        if (grenadeHeld && gDown && !frozen && canThrowSecondary) {
          updateTrajectoryPreview(
            scene,
            camera,
            level.floorY,
            allColliders,
            level.bounds,
            groundSupportFromLevel(level, 0.05)
          );
        } else if (gDown && !canThrowSecondary) {
          hideTrajectoryPreview();
        }
        if (grenadeHeld && !gDown) {
          grenadeHeld = false;
          hideTrajectoryPreview();
          if (!frozen && canThrowSecondary) {
            if (throwingGrenade) {
              grenadeCountRef.current--;
              setGrenadeCount(grenadeCountRef.current);
            } else if (throwingFlashbang) {
              flashbangCountRef.current--;
              setFlashbangCount(flashbangCountRef.current);
            }
            const g = spawnGrenade(
              scene,
              camera,
              level.floorY,
              allColliders,
              level.bounds,
              level.floorHoles ?? [],
              groundSupportFromLevel(level, 0.05),
              throwingFlashbang ? PROJECTILE_FLASHBANG : undefined
            );
            grenades.push(g);
            sounds.playGrenadeWhoosh({ volume: 0.8 });
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
        updateBloodSplatters(bloodSplatters, dt, scene);
        updateBulletHoles(dt);

        updateGrenades(
          grenades,
          dt,
          scene,
          getLiveTargets,
          applyGrenadeHit,
          (mesh, blastDir, opts) => {
            startDeathAnimation(mesh, blastDir, opts);
          },
          {
            scene,
            colliders: allColliders,
            floorY: level.floorY,
            bounds: level.bounds,
            floorHoles: level.floorHoles ?? [],
            groundSupport: groundSupportFromLevel(level, 0.05),
            simTime,
            onBloodSplatter: (splatter) => {
              if (splatter) bloodSplatters.push(splatter);
            },
            onFloorHit: (pos, impact) => {
              sounds.playGrenadeFloorHit(scene, pos, { impact });
            },
            onExplode: (pos) => {
              sounds.playGrenadeExplosion(scene, pos);
              triggerScreenShake(camera.position, pos);
            },
            countdownDuration: sounds.getGrenadeCountdownDuration(),
            onCountdown: (pos, playbackRate) => {
              sounds.playGrenadeCountdown(scene, pos, { playbackRate });
            },
            canFlashbangBlindPlayer,
            onPlayerBlinded: () => {
              flashbangBlindStartRef.current = performance.now();
            },
            onTargetBlinded: (mesh, time) => {
              blindTargetFromFlashbang(mesh, time);
            },
            viewerPos: camera.position,
          }
        );
        for (const g of grenades) {
          if (
            g.justDetonated &&
            g.explosionPos &&
            g.type !== PROJECTILE_FLASHBANG
          ) {
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
        updateFlashbangBlindVisuals(level.targets, simTime);
        updateFlashbangOverlay(
          flashbangOverlayRef.current,
          flashbangBlindStartRef.current
        );
        if (flashbangBlindStartRef.current) {
          const blindElapsed =
            (performance.now() - flashbangBlindStartRef.current) / 1000;
          if (blindElapsed >= getFlashbangBlindDurationSec()) {
            flashbangBlindStartRef.current = 0;
          }
        }

        // Health auto-regen: 1 HP every 10 seconds while below 100
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
        updateLiveTargetsFloorHoles(
          level.targets,
          dt,
          level.floorY,
          level.floorHoles ?? [],
          (mesh) => {
            deactivateTarget(mesh);
            scheduleRespawn(mesh);
          }
        );
        updateTargetHealthBars(level.targets, dt, camera);
        updateHitDebugMarkers(dt);
        if (colliderDebugEnabledRef.current) {
          const shadowCasters = collectibleEntries
            .filter((e) => !e.collected && e.drop?.mesh)
            .map((e) => e.drop.mesh.userData?.pickupShadowCaster)
            .filter(Boolean);
          updateColliderDebugOverlay(
            allColliders,
            {
              x: player.getX(),
              y: player.getY(),
              z: player.getZ(),
              radius: 0.35,
              height: player.getY() - player.getFootY(),
            },
            {
              ...player.getMovementDebugSnapshot?.(),
              shadowCasters,
            }
          );
        }
        updateDeathAnimations(level.targets, dt, (mesh) => {
          deactivateTarget(mesh);
          scheduleRespawn(mesh);
        }, {
          colliders: allColliders,
          floorY: level.floorY,
          bounds: level.bounds,
          floorHoles: level.floorHoles ?? [],
          onBodyFloorHit: (pos, impact) => {
            sounds.playBodyFloorHit(scene, pos, { impact });
          },
        });


        updateHpOrbs(
          hpOrbs, dt, camera.position,
          (value) => {
            playerHealthRef.current += value;
            pickupFlashLayerRef.current?.show("hp");
            sounds.playHpPickup();
            scheduleGameplayHudSyncRef.current();
          },
          allColliders,
          level.bounds,
          level.floorHoles ?? [],
        );

        updateAmmoDrops(
          ammoDrops, dt, camera.position,
          (value, drop) => {
            if (drop?.compassMarkerId) {
              hideCompassCollectibleMarker(collectibleEntries, drop.compassMarkerId);
            }
            roundsInMagRef.current += value;
            pickupFlashLayerRef.current?.show("ammo");
            sounds.playSupplyPickup();
            scheduleGameplayHudSyncRef.current();
          },
          allColliders,
          level.bounds,
          level.floorHoles ?? [],
        );

        updateLevelCollectibles(
          collectibleEntries,
          dt,
          player.getX(),
          player.getFootY(),
          player.getZ(),
          (value, drop, entry) => {
            if (drop?.compassMarkerId) {
              hideCompassCollectibleMarker(collectibleEntries, drop.compassMarkerId);
            }
            const kind = entry?.type ?? drop?.rewardType ?? "ammo";
            if (kind === "hp") {
              playerHealthRef.current = Math.min(
                100,
                playerHealthRef.current + (value ?? 10)
              );
              setPlayerHealth(playerHealthRef.current);
              pickupFlashLayerRef.current?.show("hp");
              sounds.playHpPickup();
            } else if (kind === "grenade") {
              grenadeCountRef.current += value ?? 1;
              setGrenadeCount(grenadeCountRef.current);
              pickupFlashLayerRef.current?.show("grenade");
              sounds.playSupplyPickup();
            } else if (kind === "flashbang") {
              flashbangCountRef.current += value ?? 1;
              setFlashbangCount(flashbangCountRef.current);
              pickupFlashLayerRef.current?.show("grenade");
              sounds.playSupplyPickup();
            } else {
              roundsInMagRef.current += value ?? 10;
              pickupFlashLayerRef.current?.show("ammo");
              sounds.playSupplyPickup();
            }
            scheduleGameplayHudSyncRef.current();
          },
          {
            testRespawn: LEVEL_COLLECTIBLE_TEST_RESPAWN,
            scene: level.pickupsGroup ?? scene,
            arena,
            catwalkDeckY: level.catwalkDeckY,
            compassContainer: compassMarkersRef.current,
          }
        );

        updateGrenadeDrops(
          grenadeDrops,
          dt,
          camera.position,
          (value) => {
            grenadeCountRef.current += value;
            pickupFlashLayerRef.current?.show("grenade");
            sounds.playSupplyPickup();
            scheduleGameplayHudSyncRef.current();
          },
          allColliders,
          level.bounds,
          level.floorHoles ?? []
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

        updateDamageVignette(
          damageVignetteRef.current,
          playerHealthRef.current,
          loadDoneRef.current && !deathStateRef.current
        );
        updateWalkPowerHud(
          walkPowerRef.current,
          player.getStamina(),
          player.getStaminaMax(),
          playerHealthRef.current,
          loadDoneRef.current && !deathStateRef.current
        );

        input.endFrame();
        sun.target.updateMatrixWorld();

        const inRoom = isPlayerInsideRoomForLighting(
          camera.position.x,
          camera.position.z,
          player.getFootY(),
          arena.rooms,
          arenaHalf,
          attachWall,
          level.catwalkDeckY
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
        sounds.resume();
        if (loadDoneRef.current && musicEnabledRef.current) {
          sounds.startLevelMusic({ trackId: levelMusicTrackIdRef.current });
        }
        const ds = deathStateRef.current;
        if (ds && !ds.respawned && performance.now() >= ds.minDisplayEnd) {
          player.respawn();
          ds.respawned = true;
          ds.fadeEndTime = performance.now() + DEATH_FADE_MS;
          playerHealthRef.current = 100;
          setPlayerHealth(100);
          flashbangBlindStartRef.current = 0;
          updateFlashbangOverlay(flashbangOverlayRef.current, 0);
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
      reportLoad(85, "Sky dome textures");
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
      if (!isActive()) return;
      reportLoad(88, "Sky dome");

      await weaponPromise;
      if (!isActive()) return;
      reportLoad(96, "View weapon");

      reportLoad(97, "GPU warmup");
      await warmupGameGpu({
        renderer,
        scene,
        camera,
        level,
        weapon,
        sky,
        bulletPool,
        floorY: level.floorY,
        colliders: allColliders,
        bounds: level.bounds,
      });
      if (!isActive()) return;
      reportLoad(98, "GPU ready");

      gameReady = true;
      reportLoad(100, "Ready");
      setAssetsReady(true);
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
      disposeAllHpOrbs(hpOrbs);
      disposeCompassCollectibleMarkers(collectibleEntries);
      disposeAllAmmoDrops(ammoDrops);
      disposeAllGrenades(grenades, scene);
      disposeAllGrenadeDrops(grenadeDrops);
      disposeAllBloodSplatters(bloodSplatters, scene);
      disposeAllBulletHoles();
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
      soundsRef.current?.dispose();
      soundsRef.current = null;
      respawnCallbackRef.current = null;
      hemiRef.current = null;
      input?.dispose();
      sky?.dispose();
      skyRef.current = null;
      resetViewmodelInteriorAmbient();
      resetRoomInteriorAmbient();
      renderer.dispose();
      rendererRef.current = null;
      resetGameGpuWarmup();
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

  const weaponSlotLayoutStyle = {
    "--grenade-frame-w": `${grenFrameWidthRem}rem`,
    "--grenade-frame-scale": String(grenFrameScale),
    "--grenade-key-x": `${grenHudKeyX}px`,
    "--grenade-key-y": `${grenHudKeyY}px`,
    "--grenade-key-scale": String(grenHudKeyScale),
    "--grenade-icon-x": `${grenHudIconX}px`,
    "--grenade-icon-y": `${grenHudIconY}px`,
    "--grenade-icon-scale": String(grenHudIconScale),
    "--grenade-label-x": `${grenHudLabelX}px`,
    "--grenade-label-y": `${grenHudLabelY}px`,
    "--grenade-label-scale": String(grenHudLabelScale),
    "--grenade-count-x": `${grenHudCountX}px`,
    "--grenade-count-y": `${grenHudCountY}px`,
    "--grenade-count-scale": String(grenHudCountScale),
  };
  const setStackTuneField = (slot, field, value) => {
    setWeaponStackTune((prev) => ({
      ...prev,
      [slot]: { ...prev[slot], [field]: value },
    }));
  };

  const handleMusicEnabledChange = (checked) => {
    setMusicEnabled(checked);
    musicEnabledRef.current = checked;
    localStorage.setItem(MUSIC_ENABLED_KEY, String(checked));
    const s = soundsRef.current;
    if (!s) return;
    if (!checked) {
      s.stopLoadingMusic();
      s.stopLevelMusic();
    } else if (loadDoneRef.current) {
      s.resume();
      s.startLevelMusic({ trackId: levelMusicTrackIdRef.current });
    } else if (!loadDoneRef.current) {
      s.resume();
      s.startLoadingMusic({ trackId: loadingMusicTrackIdRef.current });
    }
  };

  const handleStartGame = () => {
    if (loadDone || !assetsReady) return;
    gameSessionStarted = true;
    soundsRef.current?.resume();
    setLoadDone(true);
    safeRequestPointerLock(canvasRef.current);
  };

  return (
    <div className="gameRoot">
      <div
        className={`loadingOverlay${loadDone ? " loadingDone" : ""}`}
        onClick={() => {
          if (loadDone || assetsReady) return;
          const s = soundsRef.current;
          if (!s) return;
          s.resume();
          if (musicEnabledRef.current && !loadDoneRef.current) {
            s.startLoadingMusic({ trackId: loadingMusicTrackIdRef.current });
          }
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <div className="loadingHeroStack">
          <img src="/ui/logo.png" alt="VX-27" className="loadingLogo" />
          {!loadDone && (
            <LoadingAudioViz
              musicEnabled={musicEnabled}
              onMusicEnabledChange={handleMusicEnabledChange}
              getAnalyser={() => soundsRef.current?.getLoadingAnalyser()}
              getBeatAnalyser={() => soundsRef.current?.getLoadingBeatAnalyser()}
              isMusicPreloaded={() => soundsRef.current?.isMusicPreloaded()}
              isLoadingMusicPlaying={() => soundsRef.current?.isLoadingMusicPlaying()}
              active={!loadDone}
            />
          )}
        </div>
        {assetsReady ? (
          <button
            type="button"
            className="loadingStartBtn"
            onClick={(e) => {
              e.stopPropagation();
              handleStartGame();
            }}
          >
            Start Game
          </button>
        ) : (
          <>
            <div className="loadingBarTrack">
              <div className="loadingBarFill" style={{ width: `${loadProgress}%` }} />
            </div>
            <div className="loadingAssetLabel">{loadAssetLabel}</div>
          </>
        )}
        {!loadDone ? (
          <Link
            href="/credits"
            className="loadingCreditsLink"
            onClick={(e) => e.stopPropagation()}
          >
            Credits
          </Link>
        ) : null}
      </div>
      <canvas ref={canvasRef} className="gameCanvas" />
      <div
        ref={flashbangOverlayRef}
        className="flashbangOverlay"
        aria-hidden="true"
      />
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
          "--hud-bar-compass-x": `${hudBarCompassX}%`,
          "--hud-bar-compass-y": `${hudBarCompassY}%`,
          "--hud-bar-compass-size": `${hudBarCompassSize}vw`,
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
          <span className={`hudAmmoValue${hudAmmoValueClass(roundsInMag)}`}>{String(roundsInMag).padStart(2, "0")}</span>
        </div>

        {/* Centre section — MAG */}
        <div className={`hudAmmoStat hudAmmoStatCenter${roundsInMag === 0 && spareMags === 0 ? " hudAmmoLow" : ""}`}>
          <span className="hudAmmoLabel">MAG</span>
          <span className={`hudAmmoValue${hudAmmoValueClass(MAGAZINE_SIZE)}`}>{String(MAGAZINE_SIZE).padStart(2, "0")}</span>
        </div>

        {/* Right section — MAGS */}
        <div className={`hudAmmoStat hudAmmoStatRight${roundsInMag === 0 && spareMags === 0 ? " hudAmmoLow" : ""}`}>
          <span className="hudAmmoLabel">MAGS</span>
          <span className={`hudAmmoValue${hudAmmoValueClass(spareMags)}`}>{String(spareMags).padStart(2, "0")}</span>
        </div>

        {/* Fire mode indicator — auto | burst | single */}
        <div className="hudFireMode">
          <button
            type="button"
            className={`hudFireModeOption${fireMode === "auto" ? " hudFireModeActive" : ""}`}
            onClick={() => { fireModeRef.current = "auto"; setFireMode("auto"); }}
          >
            <img src={fireMode === "auto" ? "/ui/bullet_selected.png" : "/ui/bullet.png"} className="hudBulletIcon" alt="" />
            <span className="hudFireModeLabel">A</span>
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
            className={`hudFireModeOption${fireMode === "single" ? " hudFireModeActive" : ""}`}
            onClick={() => { fireModeRef.current = "single"; setFireMode("single"); }}
          >
            <img src={fireMode === "single" ? "/ui/bullet_selected.png" : "/ui/bullet.png"} className="hudBulletIcon" alt="" />
          </button>
        </div>

        <HudBarCompass />
      </div>

      {/* Stamina bar — top left */}
      <div
        ref={walkPowerRef}
        className="hudStaminaBar"
        role="status"
        aria-label="Sprint stamina"
        style={{
          "--sb-icon-x": `${hudBarLayout.hbLivesX}%`,
          "--sb-icon-y": `${hudBarLayout.hbLivesY}%`,
          "--sb-bar-x": `${hudBarLayout.sbBarX}%`,
          "--sb-bar-y": `${hudBarLayout.sbBarY}%`,
          "--sb-bar-w": `${hudBarLayout.sbBarW}%`,
          "--sb-bar-h": `${hudBarLayout.sbBarH}%`,
          "--hb-corner": `${hbCorner}px`,
        }}
      >
        <div className="hudStaminaIcon" aria-hidden="true">
          <img src="/ui/stamina-icon.png" className="hudStaminaFist" alt="" />
        </div>
        <div className="hudStaminaTrack">
          <div
            className="hudWalkPowerFill"
            style={{
              width: "100%",
              "--orange-op": 0,
              "--red-op": 0,
              "--hb-corner": `${hbCorner}px`,
            }}
          >
            <div className="hudHealthLayer hudHealthBlue" />
            <div
              className="hudHealthLayer hudHealthOrange"
              style={{ opacity: "var(--orange-op)" }}
            />
            <div
              className="hudHealthLayer hudHealthRed"
              style={{ opacity: "var(--red-op)" }}
            />
            <div
              className="hudHealthLayer hudHealthFillRadioactive hudWalkPowerRadioactiveLayer"
              style={{ opacity: 0 }}
            />
          </div>
          <span className="hudHealthText hudHealthTextWhite hudStaminaTextWhite">100%</span>
          <span
            className="hudHealthText hudHealthTextBlack hudStaminaTextBlack"
            style={{ width: "100%" }}
          >
            100%
          </span>
        </div>
      </div>

      {/* Compass — top centre, aligned with stamina / health bars */}
      <HudCompass
        tapeRef={compassTapeRef}
        viewportRef={compassViewportRef}
        markersRef={compassMarkersRef}
      />

      {/* Radar — bottom left */}
      <div className="hudRadar" ref={radarRef} style={{
        left: `${radarLeft}rem`,
        bottom: `${radarBottom}rem`,
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
          "--hb-lives-x": `${hudBarLayout.hbLivesX}%`,
          "--hb-lives-y": `${hudBarLayout.hbLivesY}%`,
          "--hb-lives-size": `${hudBarLayout.hbLivesSize}vw`,
          "--hb-bar-x": `${hudBarLayout.hbBarX}%`,
          "--hb-bar-y": `${hudBarLayout.hbBarY}%`,
          "--hb-bar-w": `${hudBarLayout.hbBarW}%`,
          "--hb-bar-h": `${hudBarLayout.hbBarH}%`,
          "--hb-corner": `${hbCorner}px`,
        }}
      >
        <div className="hudHealthLives">
          <span className="hudHealthLivesValue">{String(playerLives).padStart(2, "0")}</span>
        </div>
        <div
          className={`hudHealthTrack${playerHealth <= 25 ? " hudHealthCritical" : ""}${playerHealth > 100 ? " hudHealthRadioactive" : ""}${playerHealth > 150 ? " hudHealthOverload" : ""}`}
          style={playerHealth > 150 ? {
            "--shake-speed": `${Math.max(0.15, 0.6 - (Math.min(playerHealth, 190) - 150) * 0.01125)}s`,
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
        <div className="hudMissionLevel">{levelMeta.name}</div>
        <div className="hudMissionObjective">
          OBJECTIVE: {levelMeta.objective ?? "HOLD ZONE"}
        </div>
        <div className="hudMissionStats">
          <span className="hudMissionStat">HOSTILES: <strong>{String(hostileCount).padStart(2, "0")}</strong></span>
          <span className="hudMissionStat">TIMER: <strong>{`${String(Math.floor(missionTime / 60)).padStart(2, "0")}:${String(missionTime % 60).padStart(2, "0")}`}</strong></span>
        </div>
      </div>

      {/* Red vignette when low health — opacity set in game loop */}
      <div ref={damageVignetteRef} className="hudDamageVignette" aria-hidden="true" />

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

            <SettingsSection title="Audio" defaultOpen>
              <label className="settingRow">
                <input
                  type="checkbox"
                  checked={musicEnabled}
                  onChange={(e) => handleMusicEnabledChange(e.target.checked)}
                />
                Music
              </label>
              <p className="settingsHint" style={{ marginTop: 0 }}>
                Background music on the loading screen and in-game. Same
                setting as the loading-screen toggle.
              </p>
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

            <SettingsSection title="Gameplay">
              <label className="sliderRow">
                <span className="sliderLabel">
                  Ammo crate when spare mags ≤{" "}
                  <output>{ammoDropSpareThreshold}</output>
                </span>
                <input
                  type="range"
                  min={0}
                  max={AMMO_DROP_SPARE_THRESHOLD_MAX}
                  step={1}
                  value={ammoDropSpareThreshold}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    setAmmoDropSpareThreshold(value);
                    ammoDropSpareThresholdRef.current = value;
                    saveAmmoDropSpareThreshold(value);
                  }}
                />
              </label>
              <p className="settingsHint">
                Enemies drop an ammo crate on kill when your spare magazine
                count is at or below this value. Default 1 (drops when you have
                one or no spares left). Set to {AMMO_DROP_SPARE_THRESHOLD_MAX}{" "}
                to always drop.
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
                  min="0"
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

            <SettingsSection title="Development">
              <p className="settingsHint" style={{ marginTop: 0 }}>
                Dev tools and tuning panels. Tuning panels open in a bar at the
                top of the screen — toggle each one below.
              </p>
              <p className="settingsGroupLabel">Tuning panels</p>
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
                  checked={hudBarTuneEnabled}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setHudBarTuneEnabled(checked);
                    saveHudBarTuneEnabled(checked);
                  }}
                />
                HUD bar layout tuning
              </label>
              <label className="settingRow">
                <input
                  type="checkbox"
                  checked={oilBarrelTuneEnabled}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setOilBarrelTuneEnabled(checked);
                    saveOilBarrelTuneEnabled(checked);
                  }}
                />
                Oil barrel material tuning
              </label>
              <label className="settingRow">
                <input
                  type="checkbox"
                  checked={stairWalkTuneEnabled}
                  disabled={!arenaHasStairs}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setStairWalkTuneEnabled(checked);
                    saveStairWalkTuneEnabled(checked);
                  }}
                />
                Stair walk tuning
                {!arenaHasStairs && (
                  <span className="settingsHint" style={{ marginLeft: "0.4rem" }}>
                    (no stairs in this arena)
                  </span>
                )}
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
              <label className="settingRow">
                <input
                  type="checkbox"
                  checked={hudTuneEnabled}
                  onChange={(e) => setHudTuneEnabled(e.target.checked)}
                />
                HUD position tuning
              </label>
              <label className="settingRow">
                <input
                  type="checkbox"
                  checked={grenadeWidgetTuneEnabled}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setGrenadeWidgetTuneEnabled(checked);
                    localStorage.setItem("fps-grenade-widget-tune", String(checked));
                  }}
                />
                Grenade widget UI
              </label>
              <label className="settingRow">
                <input
                  type="checkbox"
                  checked={grenadeTuneEnabled}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setGrenadeTuneEnabled(checked);
                    localStorage.setItem(GRENADE_TUNE_ENABLED_KEY, String(checked));
                  }}
                />
                Grenade physics (throw / blast)
              </label>
              <label className="settingRow">
                <input
                  type="checkbox"
                  checked={grenadeExplosionTuneEnabled}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setGrenadeExplosionTuneEnabled(checked);
                    localStorage.setItem(GRENADE_EXPLOSION_TUNE_ENABLED_KEY, String(checked));
                  }}
                />
                Grenade explosion VFX
              </label>
              <p className="settingsHint">
                Toggle layers and tune shockwave / particle look. Throw grenades while
                adjusting — changes apply to the next detonation.
              </p>
              <p className="settingsGroupLabel">Debug tools</p>
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
                  checked={colliderDebugEnabled}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setColliderDebugEnabled(checked);
                    colliderDebugEnabledRef.current = checked;
                    if (sceneRef.current) {
                      setColliderDebug(sceneRef.current, checked);
                    }
                  }}
                />
                Collider wireframe overlay
              </label>
              <p className="settingsHint">
                Bright red = colliders blocking you right now. Red floor rectangle =
                invisible walk clamp. Lighter red = deck pieces. Magenta = ammo
                shadow caster. Green = player capsule. Auto-on with player coords HUD.
              </p>
              <p className="settingsGroupLabel">Player position</p>
              <p className="settingsHint">
                Live readout while settings are open. Stand at a blocked spot and copy
                coordinates below.
              </p>
              <div
                ref={playerCoordsMenuRef}
                className="settingsDevCoords"
                aria-live="polite"
              >
                X —  Z —  foot —
              </div>
              <button
                type="button"
                className="settingsBtn settingsInlineBtn"
                onClick={() => {
                  const json = playerCoordsMenuRef.current?.dataset.coords;
                  if (json) navigator.clipboard?.writeText(json);
                }}
              >
                Copy coordinates JSON
              </button>
              <label className="settingRow">
                <input
                  type="checkbox"
                  checked={showPlayerCoords}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setShowPlayerCoords(checked);
                    localStorage.setItem(SHOW_PLAYER_COORDS_KEY, String(checked));
                  }}
                />
                Show player coordinates HUD (in-game)
              </label>
              <label className="settingRow">
                <input
                  type="checkbox"
                  checked={showDevOverlay}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setShowDevOverlay(checked);
                    localStorage.setItem("fps-show-dev-overlay", String(checked));
                    if (checked) {
                      setHudBarTuneEnabled(true);
                      saveHudBarTuneEnabled(true);
                    }
                  }}
                />
                Show dev overlay (HP demo buttons)
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
      <div className="devTuneStack">
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
        {hudBarTuneEnabled && (
          <HudBarTunePanel
            tuning={hudBarLayout}
            onChange={(key, value) => {
              setHudBarLayout((prev) => {
                const next = normalizeHudBarTuning({ ...prev, [key]: value });
                saveHudBarTuning(next);
                return next;
              });
            }}
            onReset={() => {
              const next = { ...DEFAULT_HUD_BAR_TUNING };
              saveHudBarTuning(next);
              setHudBarLayout(next);
            }}
            onClose={() => {
              setHudBarTuneEnabled(false);
              saveHudBarTuneEnabled(false);
            }}
          />
        )}
        {oilBarrelTuneEnabled && (
          <OilBarrelTunePanel
            tuning={oilBarrelTuning}
            onChange={(key, value) => {
              setOilBarrelTuning((prev) => {
                const next = normalizeOilBarrelTuning({
                  ...prev,
                  [key]: value,
                });
                saveOilBarrelTuning(next);
                applyOilBarrelMaterialTuning(next);
                return next;
              });
            }}
            onReset={() => {
              const next = { ...DEFAULT_OIL_BARREL_TUNING };
              saveOilBarrelTuning(next);
              applyOilBarrelMaterialTuning(next);
              setOilBarrelTuning(next);
            }}
            onCopy={async () => {
              const text = JSON.stringify(oilBarrelTuning, null, 2);
              try {
                await navigator.clipboard.writeText(text);
              } catch {
                /* ignore */
              }
              console.log("Oil barrel tuning:", text);
            }}
            onClose={() => {
              setOilBarrelTuneEnabled(false);
              saveOilBarrelTuneEnabled(false);
            }}
          />
        )}
        {arenaHasStairs && stairWalkTuneEnabled && (
          <StairWalkTunePanel
            tuning={stairWalkTuning}
            onChange={(key, value) => {
              setStairWalkTuning((prev) => {
                const next = normalizeStairWalkTuning({ ...prev, [key]: value });
                saveStairWalkTuning(next);
                stairWalkTuningRef.current = next;
                return next;
              });
            }}
            onReset={() => {
              const next = { ...DEFAULT_STAIR_WALK_TUNING };
              saveStairWalkTuning(next);
              stairWalkTuningRef.current = next;
              setStairWalkTuning(next);
            }}
            onClose={() => {
              setStairWalkTuneEnabled(false);
              saveStairWalkTuneEnabled(false);
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
        {hudTuneEnabled && (
          <div className="hudTunePanel hudTunePanel--inDevStack" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
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
        {grenadeWidgetTuneEnabled && (
        <div
          className="hudTunePanel hudTunePanel--inDevStack"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="hudTuneHeader">
            <span>Grenade Widget UI</span>
            <button type="button" className="hudTuneClose" onClick={() => {
              setGrenadeWidgetTuneEnabled(false);
              localStorage.setItem("fps-grenade-widget-tune", "false");
            }}>×</button>
          </div>
          <div className="hudTuneBody">
            <div className="hudTuneGroup">
              <span className="hudTuneGroupLabel">Frame</span>
              <label className="hudTuneRow">
                <span>Width</span>
                <input type="range" min={7} max={18} step={0.1} value={grenFrameWidthRem} onChange={(e) => setGrenFrameWidthRem(+e.target.value)} />
                <span className="hudTuneVal">{grenFrameWidthRem.toFixed(1)}rem</span>
              </label>
              <label className="hudTuneRow">
                <span>Scale</span>
                <input type="range" min={0.6} max={1.6} step={0.01} value={grenFrameScale} onChange={(e) => setGrenFrameScale(+e.target.value)} />
                <span className="hudTuneVal">{grenFrameScale.toFixed(2)}×</span>
              </label>
              <label className="hudTuneRow">
                <span>X</span>
                <input type="range" min={-60} max={60} step={1} value={grenFrameX} onChange={(e) => setGrenFrameX(+e.target.value)} />
                <span className="hudTuneVal">{grenFrameX}px</span>
              </label>
              <label className="hudTuneRow">
                <span>Y</span>
                <input type="range" min={-60} max={60} step={1} value={grenFrameY} onChange={(e) => setGrenFrameY(+e.target.value)} />
                <span className="hudTuneVal">{grenFrameY}px</span>
              </label>
            </div>
            <div className="hudTuneGroup">
              <span className="hudTuneGroupLabel">Key</span>
              <label className="hudTuneRow">
                <span>X</span>
                <input type="range" min={-30} max={30} step={1} value={grenHudKeyX} onChange={(e) => setGrenHudKeyX(+e.target.value)} />
                <span className="hudTuneVal">{grenHudKeyX}px</span>
              </label>
              <label className="hudTuneRow">
                <span>Y</span>
                <input type="range" min={-30} max={30} step={1} value={grenHudKeyY} onChange={(e) => setGrenHudKeyY(+e.target.value)} />
                <span className="hudTuneVal">{grenHudKeyY}px</span>
              </label>
              <label className="hudTuneRow">
                <span>Size</span>
                <input type="range" min={0.5} max={2} step={0.01} value={grenHudKeyScale} onChange={(e) => setGrenHudKeyScale(+e.target.value)} />
                <span className="hudTuneVal">{grenHudKeyScale.toFixed(2)}×</span>
              </label>
            </div>
            <div className="hudTuneGroup">
              <span className="hudTuneGroupLabel">Icon</span>
              <label className="hudTuneRow">
                <span>X</span>
                <input type="range" min={-30} max={30} step={1} value={grenHudIconX} onChange={(e) => setGrenHudIconX(+e.target.value)} />
                <span className="hudTuneVal">{grenHudIconX}px</span>
              </label>
              <label className="hudTuneRow">
                <span>Y</span>
                <input type="range" min={-30} max={30} step={1} value={grenHudIconY} onChange={(e) => setGrenHudIconY(+e.target.value)} />
                <span className="hudTuneVal">{grenHudIconY}px</span>
              </label>
              <label className="hudTuneRow">
                <span>Size</span>
                <input type="range" min={0.5} max={2} step={0.01} value={grenHudIconScale} onChange={(e) => setGrenHudIconScale(+e.target.value)} />
                <span className="hudTuneVal">{grenHudIconScale.toFixed(2)}×</span>
              </label>
            </div>
            <div className="hudTuneGroup">
              <span className="hudTuneGroupLabel">Label</span>
              <label className="hudTuneRow">
                <span>X</span>
                <input type="range" min={-30} max={30} step={1} value={grenHudLabelX} onChange={(e) => setGrenHudLabelX(+e.target.value)} />
                <span className="hudTuneVal">{grenHudLabelX}px</span>
              </label>
              <label className="hudTuneRow">
                <span>Y</span>
                <input type="range" min={-30} max={30} step={1} value={grenHudLabelY} onChange={(e) => setGrenHudLabelY(+e.target.value)} />
                <span className="hudTuneVal">{grenHudLabelY}px</span>
              </label>
              <label className="hudTuneRow">
                <span>Size</span>
                <input type="range" min={0.5} max={2} step={0.01} value={grenHudLabelScale} onChange={(e) => setGrenHudLabelScale(+e.target.value)} />
                <span className="hudTuneVal">{grenHudLabelScale.toFixed(2)}×</span>
              </label>
            </div>
            <div className="hudTuneGroup">
              <span className="hudTuneGroupLabel">Count</span>
              <label className="hudTuneRow">
                <span>X</span>
                <input type="range" min={-30} max={30} step={1} value={grenHudCountX} onChange={(e) => setGrenHudCountX(+e.target.value)} />
                <span className="hudTuneVal">{grenHudCountX}px</span>
              </label>
              <label className="hudTuneRow">
                <span>Y</span>
                <input type="range" min={-30} max={30} step={1} value={grenHudCountY} onChange={(e) => setGrenHudCountY(+e.target.value)} />
                <span className="hudTuneVal">{grenHudCountY}px</span>
              </label>
              <label className="hudTuneRow">
                <span>Size</span>
                <input type="range" min={0.5} max={2} step={0.01} value={grenHudCountScale} onChange={(e) => setGrenHudCountScale(+e.target.value)} />
                <span className="hudTuneVal">{grenHudCountScale.toFixed(2)}×</span>
              </label>
            </div>
            {[1, 2, 3].map((slot) => (
              <div key={slot} className="hudTuneGroup">
                <span className="hudTuneGroupLabel">Stack slot {slot}</span>
                <label className="hudTuneRow">
                  <span>X</span>
                  <input
                    type="range"
                    min={-120}
                    max={120}
                    step={1}
                    value={weaponStackTune[slot].x}
                    onChange={(e) =>
                      setStackTuneField(slot, "x", +e.target.value)
                    }
                  />
                  <span className="hudTuneVal">{weaponStackTune[slot].x}px</span>
                </label>
                <label className="hudTuneRow">
                  <span>Y</span>
                  <input
                    type="range"
                    min={-200}
                    max={40}
                    step={1}
                    value={weaponStackTune[slot].y}
                    onChange={(e) =>
                      setStackTuneField(slot, "y", +e.target.value)
                    }
                  />
                  <span className="hudTuneVal">{weaponStackTune[slot].y}px</span>
                </label>
                <label className="hudTuneRow">
                  <span>Size</span>
                  <input
                    type="range"
                    min={0.3}
                    max={1}
                    step={0.01}
                    value={weaponStackTune[slot].scale}
                    onChange={(e) =>
                      setStackTuneField(slot, "scale", +e.target.value)
                    }
                  />
                  <span className="hudTuneVal">
                    {weaponStackTune[slot].scale.toFixed(2)}×
                  </span>
                </label>
              </div>
            ))}
          </div>
        </div>
        )}
        {grenadeTuneEnabled && (
        <div
          className="hudTunePanel hudTunePanel--inDevStack hudTunePanel--wide"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="hudTuneHeader">
            <span>Grenade Physics</span>
            <button
              type="button"
              className="hudTuneClose"
              onClick={() => {
                setGrenadeTuneEnabled(false);
                localStorage.setItem(GRENADE_TUNE_ENABLED_KEY, "false");
              }}
            >
              ×
            </button>
          </div>
          <div className="hudTuneBody hudTuneBody--row">
            <div className="hudTuneGroup">
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
            <div className="hudTuneGroup">
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
                <span>Roll stop</span>
                <input type="range" min={4} max={40} step={1}
                  value={grenadeParams.groundRollFriction ?? 16}
                  onChange={(e) => { const p = { ...grenadeParams, groundRollFriction: +e.target.value }; setGrenadeParams(p); setGrenadeParamsState(p); }} />
                <span className="hudTuneVal">{(grenadeParams.groundRollFriction ?? 16).toFixed(0)}</span>
              </label>
              <label className="hudTuneRow">
                <span>Fuse</span>
                <input type="range" min={0.5} max={6} step={0.1}
                  value={grenadeParams.fuseTime}
                  onChange={(e) => { const p = { ...grenadeParams, fuseTime: +e.target.value }; setGrenadeParams(p); setGrenadeParamsState(p); }} />
                <span className="hudTuneVal">{grenadeParams.fuseTime.toFixed(1)}s</span>
              </label>
            </div>
            <div className="hudTuneGroup">
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
      </div>
      {grenadeExplosionTuneEnabled && (
        <div
          className="hudTunePanel hudTunePanel--bottomDock"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="hudTuneHeader">
            <span>Grenade Explosion VFX</span>
            <button
              type="button"
              className="hudTuneClose"
              onClick={() => {
                setGrenadeExplosionTuneEnabled(false);
                localStorage.setItem(GRENADE_EXPLOSION_TUNE_ENABLED_KEY, "false");
              }}
            >
              ×
            </button>
          </div>
          <div className="hudTuneBody hudTuneBody--row">
            <div className="hudTuneGroup hudTuneGroup--layers">
              <span className="hudTuneGroupLabel">Layers</span>
              <div className="hudTuneLayerGrid">
              {[
                ["flash", "Flash light"],
                ["shockRings", "Shockwave rings"],
                ["shockDome", "Shockwave dome"],
                ["sparks", "Sparks"],
                ["embers", "Embers"],
                ["debris", "Debris"],
                ["light", "Explosion light"],
                ["lightning", "Lightning zaps"],
              ].map(([key, label]) => (
                <label key={key} className="settingRow hudTuneLayerRow">
                  <input
                    type="checkbox"
                    checked={!!explosionVfx[key]}
                    onChange={(e) => patchExplosionVfx({ [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
              </div>
              <button
                type="button"
                className="hudTuneReset"
                onClick={() => setExplosionVfxState(resetGrenadeExplosionVfx())}
              >
                Reset VFX defaults
              </button>
            </div>
            <div className="hudTuneGroup">
              <span className="hudTuneGroupLabel">Timing</span>
              <label className="hudTuneRow">
                <span>Duration</span>
                <input
                  type="range"
                  min={0.3}
                  max={3}
                  step={0.05}
                  value={explosionVfx.duration}
                  onChange={(e) => patchExplosionVfx({ duration: +e.target.value })}
                />
                <span className="hudTuneVal">{explosionVfx.duration.toFixed(2)}s</span>
              </label>
              <label className="hudTuneRow">
                <span>Flash time</span>
                <input
                  type="range"
                  min={0.03}
                  max={0.3}
                  step={0.01}
                  value={explosionVfx.flashDuration}
                  onChange={(e) => patchExplosionVfx({ flashDuration: +e.target.value })}
                />
                <span className="hudTuneVal">{explosionVfx.flashDuration.toFixed(2)}s</span>
              </label>
              <label className="hudTuneRow">
                <span>Flash intensity</span>
                <input
                  type="range"
                  min={0.1}
                  max={1.2}
                  step={0.05}
                  value={explosionVfx.flashScaleMul}
                  onChange={(e) => patchExplosionVfx({ flashScaleMul: +e.target.value })}
                />
                <span className="hudTuneVal">{explosionVfx.flashScaleMul.toFixed(2)}</span>
              </label>
            </div>
            <div className="hudTuneGroup">
              <span className="hudTuneGroupLabel">Shockwave</span>
              <label className="hudTuneRow">
                <span>Ring opacity</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={explosionVfx.ringOpacity}
                  onChange={(e) => patchExplosionVfx({ ringOpacity: +e.target.value })}
                />
                <span className="hudTuneVal">{explosionVfx.ringOpacity.toFixed(2)}</span>
              </label>
              <label className="hudTuneRow">
                <span>Ring scale</span>
                <input
                  type="range"
                  min={0.3}
                  max={2}
                  step={0.05}
                  value={explosionVfx.ringScaleMul}
                  onChange={(e) => patchExplosionVfx({ ringScaleMul: +e.target.value })}
                />
                <span className="hudTuneVal">{explosionVfx.ringScaleMul.toFixed(2)}</span>
              </label>
              <label className="hudTuneRow">
                <span>Ring duration</span>
                <input
                  type="range"
                  min={0.1}
                  max={1.2}
                  step={0.02}
                  value={explosionVfx.ringDuration}
                  onChange={(e) => patchExplosionVfx({ ringDuration: +e.target.value })}
                />
                <span className="hudTuneVal">{explosionVfx.ringDuration.toFixed(2)}s</span>
              </label>
              <label className="hudTuneRow">
                <span>Dome scale</span>
                <input
                  type="range"
                  min={0.2}
                  max={1.5}
                  step={0.05}
                  value={explosionVfx.domeScaleMul}
                  onChange={(e) => patchExplosionVfx({ domeScaleMul: +e.target.value })}
                />
                <span className="hudTuneVal">{explosionVfx.domeScaleMul.toFixed(2)}</span>
              </label>
              <label className="hudTuneRow">
                <span>Dome opacity</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={explosionVfx.domeOpacity}
                  onChange={(e) => patchExplosionVfx({ domeOpacity: +e.target.value })}
                />
                <span className="hudTuneVal">{explosionVfx.domeOpacity.toFixed(2)}</span>
              </label>
              <label className="hudTuneRow">
                <span>Dome duration</span>
                <input
                  type="range"
                  min={0.1}
                  max={1.2}
                  step={0.02}
                  value={explosionVfx.domeDuration}
                  onChange={(e) => patchExplosionVfx({ domeDuration: +e.target.value })}
                />
                <span className="hudTuneVal">{explosionVfx.domeDuration.toFixed(2)}s</span>
              </label>
            </div>
            <div className="hudTuneGroup">
              <span className="hudTuneGroupLabel">Particles</span>
              <label className="hudTuneRow">
                <span>Travel spread</span>
                <input
                  type="range"
                  min={0.15}
                  max={1}
                  step={0.05}
                  value={explosionVfx.particleSpread ?? 0.5}
                  onChange={(e) => patchExplosionVfx({ particleSpread: +e.target.value })}
                />
                <span className="hudTuneVal">
                  {(explosionVfx.particleSpread ?? 0.5).toFixed(2)}
                </span>
              </label>
              <label className="hudTuneRow">
                <span>Sparks</span>
                <input
                  type="range"
                  min={0}
                  max={600}
                  step={10}
                  value={explosionVfx.sparkCount}
                  onChange={(e) => patchExplosionVfx({ sparkCount: +e.target.value })}
                />
                <span className="hudTuneVal">{explosionVfx.sparkCount}</span>
              </label>
              <label className="hudTuneRow">
                <span>Spark particle size</span>
                <input
                  type="range"
                  min={0.02}
                  max={0.25}
                  step={0.005}
                  value={explosionVfx.sparkSize}
                  onChange={(e) => patchExplosionVfx({ sparkSize: +e.target.value })}
                />
                <span className="hudTuneVal">{explosionVfx.sparkSize.toFixed(3)}</span>
              </label>
              <label className="hudTuneRow">
                <span>Embers</span>
                <input
                  type="range"
                  min={0}
                  max={400}
                  step={10}
                  value={explosionVfx.emberCount}
                  onChange={(e) => patchExplosionVfx({ emberCount: +e.target.value })}
                />
                <span className="hudTuneVal">{explosionVfx.emberCount}</span>
              </label>
              <label className="hudTuneRow">
                <span>Ember particle size</span>
                <input
                  type="range"
                  min={0.02}
                  max={0.2}
                  step={0.005}
                  value={explosionVfx.emberSize}
                  onChange={(e) => patchExplosionVfx({ emberSize: +e.target.value })}
                />
                <span className="hudTuneVal">{explosionVfx.emberSize.toFixed(3)}</span>
              </label>
              <label className="hudTuneRow">
                <span>Debris</span>
                <input
                  type="range"
                  min={0}
                  max={250}
                  step={10}
                  value={explosionVfx.debrisCount}
                  onChange={(e) => patchExplosionVfx({ debrisCount: +e.target.value })}
                />
                <span className="hudTuneVal">{explosionVfx.debrisCount}</span>
              </label>
              <label className="hudTuneRow">
                <span>Debris particle size</span>
                <input
                  type="range"
                  min={0.02}
                  max={0.15}
                  step={0.005}
                  value={explosionVfx.debrisSize}
                  onChange={(e) => patchExplosionVfx({ debrisSize: +e.target.value })}
                />
                <span className="hudTuneVal">{explosionVfx.debrisSize.toFixed(3)}</span>
              </label>
            </div>
            <div className="hudTuneGroup">
              <span className="hudTuneGroupLabel">Light</span>
              <label className="hudTuneRow">
                <span>Peak intensity</span>
                <input
                  type="range"
                  min={0}
                  max={80}
                  step={1}
                  value={explosionVfx.lightIntensity}
                  onChange={(e) => patchExplosionVfx({ lightIntensity: +e.target.value })}
                />
                <span className="hudTuneVal">{explosionVfx.lightIntensity}</span>
              </label>
              <label className="hudTuneRow">
                <span>Glow duration</span>
                <input
                  type="range"
                  min={0.05}
                  max={1.2}
                  step={0.02}
                  value={explosionVfx.lightDuration ?? 0.32}
                  onChange={(e) => patchExplosionVfx({ lightDuration: +e.target.value })}
                />
                <span className="hudTuneVal">
                  {(explosionVfx.lightDuration ?? 0.32).toFixed(2)}s
                </span>
              </label>
              <label className="hudTuneRow">
                <span>Blue tint</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={explosionVfx.lightBlueMix ?? 0.85}
                  onChange={(e) => patchExplosionVfx({ lightBlueMix: +e.target.value })}
                />
                <span className="hudTuneVal">
                  {(explosionVfx.lightBlueMix ?? 0.85).toFixed(2)}
                </span>
              </label>
              <label className="hudTuneRow">
                <span>Lightning width (px)</span>
                <input
                  type="range"
                  min={1}
                  max={8}
                  step={0.5}
                  value={
                    (explosionVfx.lightningThickness ?? 4) <= 0.25
                      ? 4
                      : explosionVfx.lightningThickness ?? 4
                  }
                  onChange={(e) =>
                    patchExplosionVfx({ lightningThickness: +e.target.value })
                  }
                />
                <span className="hudTuneVal">
                  {(
                    (explosionVfx.lightningThickness ?? 4) <= 0.25
                      ? 4
                      : explosionVfx.lightningThickness ?? 4
                  ).toFixed(1)}
                  px
                </span>
              </label>
              <label className="hudTuneRow">
                <span>Lightning bolts</span>
                <input
                  type="range"
                  min={3}
                  max={16}
                  step={1}
                  value={explosionVfx.lightningBoltCount ?? 10}
                  onChange={(e) =>
                    patchExplosionVfx({ lightningBoltCount: +e.target.value })
                  }
                />
                <span className="hudTuneVal">
                  {explosionVfx.lightningBoltCount ?? 10}
                </span>
              </label>
              <label className="hudTuneRow">
                <span>Lightning length</span>
                <input
                  type="range"
                  min={0.3}
                  max={1.5}
                  step={0.05}
                  value={explosionVfx.lightningLengthMul ?? 1.0}
                  onChange={(e) =>
                    patchExplosionVfx({ lightningLengthMul: +e.target.value })
                  }
                />
                <span className="hudTuneVal">
                  {(explosionVfx.lightningLengthMul ?? 1.0).toFixed(2)}
                </span>
              </label>
              <label className="hudTuneRow">
                <span>Lightning duration</span>
                <input
                  type="range"
                  min={0.08}
                  max={0.8}
                  step={0.01}
                  value={explosionVfx.lightningDuration ?? 0.34}
                  onChange={(e) =>
                    patchExplosionVfx({ lightningDuration: +e.target.value })
                  }
                />
                <span className="hudTuneVal">
                  {(explosionVfx.lightningDuration ?? 0.34).toFixed(2)}s
                </span>
              </label>
            </div>
          </div>
        </div>
      )}
      {showFps && (
        <div className="topRightHud">
          <div ref={fpsRef} className="fpsCounter" aria-live="polite">
            — FPS
          </div>
        </div>
      )}
      {showPlayerCoords && !settingsOpen && (
        <div
          ref={playerCoordsHudRef}
          className="hudPlayerCoords"
          aria-live="polite"
          title="Click to copy JSON"
          onClick={() => {
            const json = playerCoordsHudRef.current?.dataset.coords;
            if (json) navigator.clipboard?.writeText(json);
          }}
        >
          X —  Z —  foot —
        </div>
      )}
      <PickupFlashLayer ref={pickupFlashLayerRef} />
      <WeaponSlotStack
        grenadeCount={grenadeCount}
        flashbangCount={flashbangCount}
        selectedWeaponSlot={selectedWeaponSlot}
        weaponStackTune={weaponStackTune}
        frameX={grenFrameX}
        frameY={grenFrameY}
        layoutStyle={weaponSlotLayoutStyle}
      />
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
            flashbangBlindStartRef.current = 0;
            updateFlashbangOverlay(flashbangOverlayRef.current, 0);
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
