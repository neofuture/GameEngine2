"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createLevelFromArena, disposeLevelGroup } from "@/lib/Level";
import { collectArenaTextureIds, loadArenaConfig } from "@/lib/loadArena";
import { loadLevelTextureLibrary } from "@/lib/LevelTextures";
import {
  createSkyDome,
  DEFAULT_SKY_DOME_SCALE,
  SKY_DOME_SCALE_MIN,
  SKY_DOME_SCALE_MAX,
  addRoomLights,
  createOutdoorLights,
  enableShadowsOn,
  disableInteriorCastShadows,
  fitDirectionalLightShadow,
  renderSceneWithLayeredLighting,
  resetCameraRenderLayers,
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
const SKY_DOME_SCALE_KEY = "fps-sky-dome-scale";
const LEGACY_LOOK_SPEED_KEY = "fps-look-speed";
const LEGACY_LOOK_EASE_KEY = "fps-look-ease";
const DEFAULT_LOOK = 7;
const DEFAULT_MAX_LOOK_RATE = 2.5;
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
  const [skyDomeScale, setSkyDomeScale] = useState(DEFAULT_SKY_DOME_SCALE);
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
  const skyDomeScaleRef = useRef(DEFAULT_SKY_DOME_SCALE);
  const skyRef = useRef(null);
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
    const skyScale = read(SKY_DOME_SCALE_KEY, DEFAULT_SKY_DOME_SCALE);
    const tuneEnabled = loadWeaponTuneEnabled();
    setInvertYLook(storedInvert);
    setWeaponTuneEnabled(tuneEnabled);
    setKeyboardLook(kbLook);
    setKeyboardEase(kbEase);
    setMouseLook(mLook);
    setMouseEase(mEase);
    setMaxLookRate(maxRate);
    setSkyDomeScale(skyScale);
    invertYRef.current = storedInvert;
    keyboardLookRef.current = kbLook;
    keyboardEaseRef.current = kbEase;
    mouseLookRef.current = mLook;
    mouseEaseRef.current = mEase;
    maxLookRateRef.current = maxRate;
    skyDomeScaleRef.current = skyScale;
  }, []);

  invertYRef.current = invertYLook;
  keyboardLookRef.current = keyboardLook;
  keyboardEaseRef.current = keyboardEase;
  mouseLookRef.current = mouseLook;
  mouseEaseRef.current = mouseEase;
  maxLookRateRef.current = maxLookRate;
  skyDomeScaleRef.current = skyDomeScale;
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
      renderer.setClearColor(0xb8daf0, 1);

      scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0xb8daf0, 45, 95);

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

      const { sun, outdoorLights } = createOutdoorLights(scene, {
        sheltered: (arena.ceilingThickness ?? 0) > 0,
      });
      const attachWall = arena.doorway?.wall === "north" ? "north" : "south";
      const arenaHalf = arena.size / 2;
      const roomLights = addRoomLights(scene, arena.rooms, arenaHalf, attachWall);
      syncLightLayersForZone(scene, false, outdoorLights, roomLights);
      level = createLevelFromArena(scene, arena, levelTextures);
      if (!isActive()) {
        if (level?.group) disposeLevelGroup(level.group);
        levelTextures?.dispose();
        return;
      }
      enableShadowsOn(level.group);
      assignWorldLayers(level.group);
      disableInteriorCastShadows(level.group);
      setHealthBarOccluders(level.group);
      fitDirectionalLightShadow(sun, level.group, {
        arenaSize: arena.size,
      });
      sun.updateMatrixWorld(true);
      sun.target.updateMatrixWorld(true);
      input = createInput(canvas, () => bindingsRef.current);
      player = createPlayerController(camera, level.bounds, level.floorY, {
        colliders: level.colliders,
        getBindings: () => bindingsRef.current,
        getInvertYLook: () => invertYRef.current,
        getKeyboardLookSpeed: () => keyboardLookRef.current,
        getKeyboardLookEase: () => keyboardEaseRef.current,
        getMouseLookSpeed: () => mouseLookRef.current,
        getMouseLookEase: () => mouseEaseRef.current,
        getMaxLookRate: () => maxLookRateRef.current,
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

        player.update(input, dt);
        if (compassDialRef.current) {
          const yawDeg = (player.getYaw() * 180) / Math.PI;
          compassDialRef.current.style.transform = `rotate(${-yawDeg}deg)`;
        }
        camera.updateMatrixWorld(true);

        weapon?.update(camera, aimTarget, dt, weaponTuningRef, {
          snapAim: !locked,
          moveSpeed: player.getHorizontalSpeed(),
        });

        const aimBlend = weapon?.getAimBlend() ?? 0;
        const targetFov = THREE.MathUtils.lerp(HIP_FOV, ADS_FOV, aimBlend);
        camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-12 * dt));
        camera.updateProjectionMatrix();

        const canUseWeapons =
          !rebindActionRef.current &&
          !settingsOpenRef.current &&
          !controlsOpenRef.current;
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
        renderSceneWithLayeredLighting(renderer, scene, camera);
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
      gameReady = true;
      syncPointerLocked();
      rafId = requestAnimationFrame(animate);

      createSkyDome(scene, skyDomeScaleRef.current)
        .then((loaded) => {
          if (!isActive()) {
            loaded.dispose();
            return;
          }
          sky = loaded;
          skyRef.current = loaded;
          loaded.update(camera);
        })
        .catch((err) => console.error("Sky dome failed to load:", err));
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
      input?.dispose();
      sky?.dispose();
      skyRef.current = null;
      resetViewmodelInteriorAmbient();
      renderer.dispose();
      safeExitPointerLock();
    };
  }, []);

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

            <p className="settingsGroup">Environment</p>
            <label className="sliderRow">
              <span className="sliderLabel">
                Sky dome size <output>{Math.round(skyDomeScale)}</output>
              </span>
              <input
                type="range"
                min={SKY_DOME_SCALE_MIN}
                max={SKY_DOME_SCALE_MAX}
                step="25"
                value={skyDomeScale}
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
                  setSkyDomeScale(value);
                  skyDomeScaleRef.current = value;
                  skyRef.current?.setScale(value);
                  localStorage.setItem(SKY_DOME_SCALE_KEY, String(value));
                }}
              />
            </label>
            <p className="settingsHint">
              Higher values show more of the sky panorama (less zoomed-in wrap).
            </p>

            <p className="settingsGroup">Keyboard</p>
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
            <p className="settingsGroup">Mouse</p>
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
        />
      )}
      <div ref={fpsRef} className="fpsCounter" aria-live="polite">
        — FPS
      </div>
      <div ref={crosshairRef} className="crosshair crosshairVisible" />
      <CompassOverlay dialRef={compassDialRef} />
    </div>
  );
}
