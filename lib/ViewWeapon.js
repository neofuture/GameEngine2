import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { setViewmodelLayer } from "./LightingLayers.js";
import { renderViewmodelPass } from "./SceneEnvironment.js";

/** Full Meshy export (~39MB). Do not use quantum_assault_rifle_small.glb — it drops geometry. */
export const RIFLE_MODEL_URL =
  "/models/quantum_assault_rifle.glb?v=39152580";

const TARGET_WEAPON_LENGTH = 0.62;
const AIM_BLEND_SPEED = 12;
/** @deprecated Import from ./LightingLayers.js */
export { VIEWMODEL_LAYER } from "./LightingLayers.js";
const VIEWMODEL_RENDER_ORDER = 1000;

/** Spring return — lower = longer, smoother settle after look flicks. */
const SWAY_ROT_STIFFNESS = 28;
const SWAY_ROT_DAMPING = 4.2;
const SWAY_ROT_KICK = 1.05;
const SWAY_POS_STIFFNESS = 32;
const SWAY_POS_DAMPING = 4.8;
const SWAY_POS_KICK = 0.038;
const BOB_LERP = 6.5;
const BOB_ACTIVITY_LERP = 3.2;
const BOB_FREQ_BASE = 2.1;
const BOB_FREQ_PER_SPEED = 0.48;
const BOB_POS_Y = 0.03;
const BOB_POS_X = 0.014;
const BOB_POS_Z = 0.009;
const BOB_ROLL = 0.022;
const ADS_SWAY_MULT = 0.22;
/**
 * Hip-only body vs eye parallax (off when ADS). Level = tuned hip pose.
 * Look up / down apply along camera up + forward (tune amounts on weapon panel).
 */
const BODY_LEVEL_LOOK_UP_Y = 0.28;
const BODY_LEVEL_LOOK_UP_Z = 0.05;
const BODY_LEVEL_LOOK_DOWN_Y = 0.34;
const BODY_LEVEL_LOOK_DOWN_Z = 0.08;
/** Ease back toward level at the horizon (lower = softer). Tilting in tracks pitch immediately. */
const BODY_LOOK_RELEASE_SPEED = 4.5;

function readParallaxAmount(tuningRef, key) {
  const v = tuningRef.current[key];
  if (typeof v !== "number" || Number.isNaN(v)) return 0;
  return Math.max(0, v);
}

/** Track pitch when tilting in; ease only when returning toward the horizon. */
function blendParallaxScalar(current, target, dt, releaseSpeed) {
  if (Math.abs(target) >= Math.abs(current)) return target;
  const ease = 1 - Math.exp(-releaseSpeed * dt);
  return current + (target - current) * ease;
}

const _cameraEuler = new THREE.Euler(0, 0, 0, "YXZ");
const _camUp = new THREE.Vector3();
const _camForward = new THREE.Vector3();

function wrapAngle(delta) {
  if (delta > Math.PI) return delta - Math.PI * 2;
  if (delta < -Math.PI) return delta + Math.PI * 2;
  return delta;
}

function disposeObject3D(root) {
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    const { material } = obj;
    if (!material) return;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material.dispose();
  });
}

const TEXTURE_KEYS = [
  "map",
  "normalMap",
  "metalnessMap",
  "roughnessMap",
  "emissiveMap",
  "aoMap",
];

function enhanceWeaponTextures(material, maxAnisotropy) {
  for (const key of TEXTURE_KEYS) {
    const tex = material[key];
    if (!tex) continue;
    tex.anisotropy = maxAnisotropy;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    if (key === "map" || key === "emissiveMap") {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    tex.needsUpdate = true;
  }
}

function prepareViewMaterials(root, maxAnisotropy = 16) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = false;
    obj.receiveShadow = false;
    obj.frustumCulled = false;
    obj.renderOrder = VIEWMODEL_RENDER_ORDER;

    const geo = obj.geometry;
    if (geo) {
      if (!geo.attributes.normal || geo.attributes.normal.count === 0) {
        geo.computeVertexNormals();
      }
      geo.computeBoundingSphere();
    }

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat) continue;
      mat.side = THREE.DoubleSide;
      mat.depthTest = false;
      mat.depthWrite = false;
      mat.transparent = false;
      mat.alphaTest = 0;
      if ("envMapIntensity" in mat) mat.envMapIntensity = 1.15;
      if ("normalScale" in mat && mat.normalMap) {
        mat.normalScale.set(1, 1);
      }
      enhanceWeaponTextures(mat, maxAnisotropy);
    }
  });
}

/** Center mesh and uniform scale only — rotation comes from tuning sliders. */
function fitRifleModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  model.position.sub(center);

  if (size.x > 0) {
    model.scale.setScalar(TARGET_WEAPON_LENGTH / size.x);
  }

  model.rotation.set(0, 0, 0);
  model.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(model);
}

/** Local axis that points out the barrel (matches fitRifleModel length along X). */
const BARREL_LOCAL = new THREE.Vector3(1, 0, 0);

/** Muzzle at the forward tip of the barrel so hip/ADS spawn from the correct end. */
function placeMuzzle(model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const muzzle = new THREE.Object3D();
  // Barrel runs along X (see fitRifleModel); tip is +X after centering.
  if (size.x >= size.y && size.x >= size.z) {
    muzzle.position.set(box.max.x + 0.04, center.y, center.z);
  } else if (size.z >= size.y) {
    muzzle.position.set(center.x, center.y, box.max.z + 0.04);
  } else {
    muzzle.position.set(center.x, box.max.y + 0.04, center.z);
  }
  model.add(muzzle);

  const muzzleFlash = new THREE.PointLight(0x66ccff, 0, 12);
  muzzle.add(muzzleFlash);

  return { muzzle, muzzleFlash };
}

function lerpPose(a, b, t) {
  return {
    posX: THREE.MathUtils.lerp(a.posX, b.posX, t),
    posY: THREE.MathUtils.lerp(a.posY, b.posY, t),
    posZ: THREE.MathUtils.lerp(a.posZ, b.posZ, t),
    rotX: THREE.MathUtils.lerp(a.rotX, b.rotX, t),
    rotY: THREE.MathUtils.lerp(a.rotY, b.rotY, t),
    rotZ: THREE.MathUtils.lerp(a.rotZ, b.rotZ, t),
    scale: THREE.MathUtils.lerp(a.scale, b.scale, t),
  };
}

function applyPose(pivot, pose) {
  pivot.rotation.set(pose.rotX, pose.rotY, pose.rotZ, "YXZ");
  pivot.scale.setScalar(pose.scale);
}

/**
 * @param {import("./WeaponTuning.js").WeaponPose} hip
 * @param {import("./WeaponTuning.js").WeaponPose} ads
 */
function getBlendedPose(hip, ads, aimBlend) {
  return aimBlend <= 0 ? hip : aimBlend >= 1 ? ads : lerpPose(hip, ads, aimBlend);
}

export async function loadViewWeapon(
  camera,
  scene,
  url = RIFLE_MODEL_URL,
  options = {}
) {
  const maxAnisotropy = options.maxAnisotropy ?? 16;

  const holder = new THREE.Group();
  holder.name = "view_weapon";
  scene.add(holder);

  const sway = new THREE.Group();
  holder.add(sway);

  const pivot = new THREE.Group();
  sway.add(pivot);

  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene;
  prepareViewMaterials(model, maxAnisotropy);

  pivot.add(model);
  fitRifleModel(model);
  const { muzzle, muzzleFlash } = placeMuzzle(model);
  holder.traverse(setViewmodelLayer);

  const currentOffset = new THREE.Vector3();
  const offsetWorld = new THREE.Vector3();
  const _muzzleQuat = new THREE.Quaternion();
  const _camForward = new THREE.Vector3();
  let aimBlend = 0;
  let prevPitch = 0;
  let prevYaw = 0;
  let swayPitch = 0;
  let swayYaw = 0;
  let swayPitchVel = 0;
  let swayYawVel = 0;
  let swayPosX = 0;
  let swayPosY = 0;
  let swayPosXVel = 0;
  let swayPosYVel = 0;
  let bobPhase = 0;
  let bobActivity = 0;
  let smoothBobY = 0;
  let smoothBobX = 0;
  let smoothBobZ = 0;
  let smoothBobRoll = 0;
  let lookInitialized = false;
  let smoothParallaxY = 0;
  let smoothParallaxZ = 0;

  function springStep(value, velocity, stiffness, damping, dt) {
    velocity += (-value * stiffness - velocity * damping) * dt;
    value += velocity * dt;
    return { value, velocity };
  }

  return {
    holder,
    sway,
    pivot,
    model,
    muzzle,
    muzzleFlash,
    ready: true,
    getAimBlend() {
      return aimBlend;
    },
    /** World-space muzzle position and shoot direction (camera forward when ADS). */
    getMuzzleWorld(outPosition, outDirection, camera) {
      holder.updateMatrixWorld(true);
      model.updateMatrixWorld(true);
      muzzle.getWorldPosition(outPosition);

      model.getWorldQuaternion(_muzzleQuat);
      outDirection.copy(BARREL_LOCAL).applyQuaternion(_muzzleQuat).normalize();

      if (camera) {
        _camForward.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
        if (aimBlend > 0.5) {
          outDirection.copy(_camForward);
        } else if (outDirection.dot(_camForward) < 0.25) {
          outDirection.copy(_camForward);
        }
      }
    },
    /**
     * @param {number} aimTarget 0 = hip, 1 = ADS
     * @param {{ current: { hip: import("./WeaponTuning.js").WeaponPose, ads: import("./WeaponTuning.js").WeaponPose } }} tuningRef
     * @param {{ snapAim?: boolean, moveSpeed?: number }} [options]
     */
    update(camera, aimTarget, dt, tuningRef, options = {}) {
      const blend = options.snapAim
        ? 1
        : 1 - Math.exp(-AIM_BLEND_SPEED * dt);
      aimBlend += (aimTarget - aimBlend) * blend;

      const { hip, ads } = tuningRef.current;
      const pose = getBlendedPose(hip, ads, aimBlend);

      _cameraEuler.setFromQuaternion(camera.quaternion, "YXZ");
      const pitch = _cameraEuler.x;
      const pitchLimit = Math.PI / 2 - 0.05;
      const pitchNorm = THREE.MathUtils.clamp(pitch / pitchLimit, -1, 1);
      const hipParallax = 1 - aimBlend;

      const lookUpAmount = readParallaxAmount(tuningRef, "bodyLookUpAmount");
      const lookDownAmount = readParallaxAmount(tuningRef, "bodyLookDownAmount");

      // PlayerController: pitch > 0 = look up, pitch < 0 = look down (YXZ euler.x)
      let targetParallaxY = 0;
      let targetParallaxZ = 0;
      if (pitchNorm > 0 && lookUpAmount > 0) {
        targetParallaxY =
          pitchNorm * lookUpAmount * hipParallax * BODY_LEVEL_LOOK_UP_Y;
        targetParallaxZ =
          pitchNorm * lookUpAmount * hipParallax * BODY_LEVEL_LOOK_UP_Z;
      } else if (pitchNorm < 0 && lookDownAmount > 0) {
        const downBlend = -pitchNorm * lookDownAmount * hipParallax;
        targetParallaxY = downBlend * BODY_LEVEL_LOOK_DOWN_Y;
        targetParallaxZ = downBlend * BODY_LEVEL_LOOK_DOWN_Z;
      }

      smoothParallaxY = blendParallaxScalar(
        smoothParallaxY,
        targetParallaxY,
        dt,
        BODY_LOOK_RELEASE_SPEED
      );
      smoothParallaxZ = blendParallaxScalar(
        smoothParallaxZ,
        targetParallaxZ,
        dt,
        BODY_LOOK_RELEASE_SPEED
      );

      currentOffset.set(pose.posX, pose.posY, pose.posZ);
      applyPose(pivot, pose);
      const yaw = _cameraEuler.y;
      if (!lookInitialized) {
        prevPitch = pitch;
        prevYaw = yaw;
        lookInitialized = true;
      }
      const deltaPitch = wrapAngle(pitch - prevPitch);
      const deltaYaw = wrapAngle(yaw - prevYaw);
      prevPitch = pitch;
      prevYaw = yaw;

      const swayScale = THREE.MathUtils.lerp(1, ADS_SWAY_MULT, aimBlend);

      // Hip: parallax sliders own vertical pitch; no pitch kick sway until ADS
      swayPitchVel += -deltaPitch * SWAY_ROT_KICK * aimBlend;
      swayYawVel += -deltaYaw * SWAY_ROT_KICK;
      swayPosXVel += -deltaYaw * SWAY_POS_KICK;
      swayPosYVel += deltaPitch * SWAY_POS_KICK * aimBlend;

      let s = springStep(
        swayPitch,
        swayPitchVel,
        SWAY_ROT_STIFFNESS,
        SWAY_ROT_DAMPING,
        dt
      );
      swayPitch = s.value;
      swayPitchVel = s.velocity;

      s = springStep(swayYaw, swayYawVel, SWAY_ROT_STIFFNESS, SWAY_ROT_DAMPING, dt);
      swayYaw = s.value;
      swayYawVel = s.velocity;

      s = springStep(
        swayPosX,
        swayPosXVel,
        SWAY_POS_STIFFNESS,
        SWAY_POS_DAMPING,
        dt
      );
      swayPosX = s.value;
      swayPosXVel = s.velocity;

      s = springStep(
        swayPosY,
        swayPosYVel,
        SWAY_POS_STIFFNESS,
        SWAY_POS_DAMPING,
        dt
      );
      swayPosY = s.value;
      swayPosYVel = s.velocity;

      const moveSpeed = options.moveSpeed ?? 0;
      const activityTarget = moveSpeed > 0.35 ? 1 : 0;
      bobActivity +=
        (activityTarget - bobActivity) *
        (1 - Math.exp(-BOB_ACTIVITY_LERP * dt));

      const speedFactor = THREE.MathUtils.clamp(moveSpeed / 5, 0, 1);
      const bobIntensity = (1 - aimBlend) * bobActivity * speedFactor;

      if (bobIntensity > 0.01) {
        bobPhase +=
          dt *
          (BOB_FREQ_BASE + moveSpeed * BOB_FREQ_PER_SPEED) *
          Math.PI *
          2 *
          bobIntensity;
      }

      const targetBobY = Math.sin(bobPhase) * BOB_POS_Y * bobIntensity;
      const targetBobX =
        Math.sin(bobPhase * 0.5 + Math.PI * 0.2) * BOB_POS_X * bobIntensity;
      const targetBobZ =
        Math.cos(bobPhase) * BOB_POS_Z * bobIntensity;
      const targetBobRoll =
        Math.sin(bobPhase * 0.5) * BOB_ROLL * bobIntensity;

      const bobEase = 1 - Math.exp(-BOB_LERP * dt);
      smoothBobY += (targetBobY - smoothBobY) * bobEase;
      smoothBobX += (targetBobX - smoothBobX) * bobEase;
      smoothBobZ += (targetBobZ - smoothBobZ) * bobEase;
      smoothBobRoll += (targetBobRoll - smoothBobRoll) * bobEase;

      sway.rotation.set(
        (swayPitch + smoothBobRoll) * swayScale,
        swayYaw * swayScale,
        0,
        "YXZ"
      );
      sway.position.set(
        (swayPosX + smoothBobX) * swayScale,
        (swayPosY + smoothBobY) * swayScale,
        smoothBobZ * swayScale
      );

      offsetWorld.copy(currentOffset).applyQuaternion(camera.quaternion);
      holder.position.copy(camera.position).add(offsetWorld);

      if (
        hipParallax > 0.001 &&
        (Math.abs(smoothParallaxY) > 0.0005 || Math.abs(smoothParallaxZ) > 0.0005)
      ) {
        _camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
        _camForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
        holder.position.addScaledVector(_camUp, -smoothParallaxY);
        holder.position.addScaledVector(_camForward, -smoothParallaxZ);
      }

      holder.quaternion.copy(camera.quaternion);
      holder.updateMatrixWorld(true);
    },
    /** Lit by world/room lights on VIEWMODEL_LAYER (see syncLightLayersForZone). */
    renderViewmodel(renderer, worldScene, camera) {
      renderViewmodelPass(renderer, worldScene, camera);
    },
    dispose() {
      scene.remove(holder);
      disposeObject3D(model);
    },
  };
}

const LASER_LENGTH = 1.15;
const LASER_MUZZLE_CLEARANCE = 0.12;
const LASER_FORWARD = new THREE.Vector3(0, 0, 1);
const _spawnOffset = new THREE.Vector3();

function createLaserGeometry(length, radiusTop, radiusBottom) {
  const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 10);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, length / 2);
  return geo;
}

function makeLaserMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
}

export function createBulletPool() {
  const coreGeo = createLaserGeometry(LASER_LENGTH, 0.028, 0.04);
  const glowGeo = createLaserGeometry(LASER_LENGTH * 1.05, 0.07, 0.1);
  const coreMat = makeLaserMaterial(0x66eeff, 1);
  const glowMat = makeLaserMaterial(0x1155ff, 0.45);

  return {
    spawn(scene, origin, direction) {
      const dir = direction.clone().normalize();
      _spawnOffset.copy(dir).multiplyScalar(LASER_MUZZLE_CLEARANCE);
      const root = new THREE.Group();
      const glow = new THREE.Mesh(glowGeo, glowMat.clone());
      const core = new THREE.Mesh(coreGeo, coreMat.clone());
      for (const part of [glow, core]) {
        part.frustumCulled = false;
        part.renderOrder = 100;
      }
      root.add(glow);
      root.add(core);
      root.position.copy(origin).add(_spawnOffset);
      root.quaternion.setFromUnitVectors(LASER_FORWARD, dir);
      root.frustumCulled = false;
      root.renderOrder = 100;
      scene.add(root);
      return {
        mesh: root,
        core,
        glow,
        direction: dir,
        traveled: 0,
      };
    },
    dispose() {
      coreGeo.dispose();
      glowGeo.dispose();
      coreMat.dispose();
      glowMat.dispose();
    },
  };
}
