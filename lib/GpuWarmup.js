import * as THREE from "three";
import {
  spawnAmmoDrop,
  resyncPickupShadowCaster,
  disposeAmmoPickupMeshShadow,
  disposeOrphanedPickupShadowCasters,
} from "./AmmoCrate.js";
import { spawnBloodSplatter, disposeAllBloodSplatters } from "./BloodParticles.js";
import {
  spawnGrenadeDrop,
  disposeGrenadeModel,
  warmupGrenadeThrow,
  clearExplosionPool,
} from "./Grenade.js";
import { spawnHpOrb } from "./Targets.js";

let _gameGpuWarmed = false;
let _warmupStage = null;
const _warmForward = new THREE.Vector3();

export function resetGameGpuWarmup() {
  _gameGpuWarmed = false;
  clearExplosionPool();
  if (_warmupStage) {
    _warmupStage.parent?.remove(_warmupStage);
    _warmupStage = null;
  }
}

function ensureWarmupStage(scene, camera) {
  if (!_warmupStage) {
    _warmupStage = new THREE.Group();
    _warmupStage.name = "GpuWarmupStage";
    _warmupStage.frustumCulled = false;
    scene.add(_warmupStage);
  }
  camera.getWorldDirection(_warmForward);
  _warmupStage.position.copy(camera.position).addScaledVector(_warmForward, 6);
  _warmupStage.quaternion.copy(camera.quaternion);
  return _warmupStage;
}

/** Warmup position in front of the camera — objects here actually hit the GPU during render. */
export function getWarmupWorldPos(camera, slot = 0) {
  camera.getWorldDirection(_warmForward);
  const dist = 5.5 + (slot % 6) * 0.35;
  const lateral = (slot % 5) - 2;
  const vertical = ((slot / 5) | 0) % 3 - 1;
  return camera.position
    .clone()
    .addScaledVector(_warmForward, dist)
    .add(new THREE.Vector3(lateral * 0.4, vertical * 0.35, 0));
}

export function setWarmupDrawFlags(object, visible = true) {
  if (!object) return;
  object.visible = visible;
  object.frustumCulled = false;
  object.traverse((child) => {
    child.visible = visible;
    child.frustumCulled = false;
  });
}

/** Compile shaders then render several frames so buffers upload while objects are in view. */
export async function compileAndRender(renderer, object, camera, scene, opts = {}) {
  const frames = opts.frames ?? 5;
  if (!object || !renderer || !camera || !scene) return;

  setWarmupDrawFlags(object, true);

  if (typeof renderer.compile === "function") {
    renderer.compile(object, camera, scene);
  }

  for (let i = 0; i < frames; i += 1) {
    renderer.render(scene, camera);
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/** Reparent object in front of the camera for a visible draw, then restore. */
export async function warmObjectInView(renderer, scene, camera, object, slot = 0) {
  if (!object) return;

  const originalParent = object.parent;
  const caster = object.userData?.pickupShadowCaster;
  if (caster?.parent) {
    caster.parent.remove(caster);
  }
  if (caster) caster.castShadow = false;

  const stage = ensureWarmupStage(scene, camera);
  const holder = new THREE.Group();
  holder.frustumCulled = false;
  holder.position.set(
    (slot % 5 - 2) * 0.35,
    ((((slot / 5) | 0) % 3) - 1) * 0.3,
    0
  );
  holder.add(object);
  stage.add(holder);

  await compileAndRender(renderer, object, camera, scene);

  stage.remove(holder);
  if (object.parent === holder) holder.remove(object);

  // Restore scene graph — level pickups live here; discarding them orphans the mesh.
  if (originalParent) {
    originalParent.attach(object);
    if (caster) {
      originalParent.add(caster);
      caster.castShadow = true;
    }
  }
  resyncPickupShadowCaster(object);
}

/**
 * Warm the main renderer with every gameplay mesh type once the level is live
 * (shadows, lights, layers) so first use of each system doesn't hitch.
 */
export async function warmupGameGpu({
  renderer,
  scene,
  camera,
  level,
  weapon,
  sky,
  bulletPool,
  floorY,
  colliders,
  bounds,
  levelCollectibleMeshes = [],
}) {
  if (!renderer || !scene || !camera) return;

  let warmSlot = 0;
  const warmPos = (slot = warmSlot++) => getWarmupWorldPos(camera, slot);
  const warm = (object) => warmObjectInView(renderer, scene, camera, object, warmSlot++);

  if (!_gameGpuWarmed) {
    if (level?.group) {
      setWarmupDrawFlags(level.group);
      await compileAndRender(renderer, level.group, camera, scene);
    }

    if (level?.targets?.length) {
      for (const target of level.targets.slice(0, 3)) {
        setWarmupDrawFlags(target);
        await compileAndRender(renderer, target, camera, scene, { frames: 3 });
      }
    }

    if (sky?.mesh) {
      setWarmupDrawFlags(sky.mesh);
      await compileAndRender(renderer, sky.mesh, camera, scene);
    }

    if (weapon?.holder) {
      weapon.holder.visible = true;
      setWarmupDrawFlags(weapon.holder);
      await compileAndRender(renderer, weapon.holder, camera, scene);
    }

    if (floorY != null) {
      const orb = spawnHpOrb(scene, warmPos(), floorY);
      orb.mesh.position.set(0, 0, 0);
      await warm(orb.mesh);
      orb.mesh.parent?.remove(orb.mesh);

      const ammo = spawnAmmoDrop(scene, warmPos(), floorY);
      ammo.mesh.position.set(0, 0, 0);
      await warm(ammo.mesh);
      disposeAmmoPickupMeshShadow(ammo.mesh);
      ammo.mesh.parent?.remove(ammo.mesh);
      if (ammo.ownMats) {
        for (const m of ammo.mesh.material) m.dispose();
      }

      for (const mesh of levelCollectibleMeshes) {
        if (!mesh) continue;
        await warm(mesh);
      }

      const grenDrop = spawnGrenadeDrop(scene, warmPos(), floorY);
      grenDrop.mesh.position.set(0, 0, 0);
      await warm(grenDrop.mesh);
      disposeGrenadeModel(grenDrop.mesh);
    }

    const splatters = [];
    const splatter = spawnBloodSplatter(
      scene,
      warmPos(),
      new THREE.Vector3(0, 0, -1),
      50
    );
    if (splatter) {
      splatters.push(splatter);
      splatter.points.position.set(0, 0, 0);
      await warm(splatter.points);
      disposeAllBloodSplatters(splatters, scene);
    }

    if (bulletPool) {
      const bullet = bulletPool.spawn(
        scene,
        warmPos(),
        new THREE.Vector3(0, 0, -1)
      );
      bullet.mesh.position.set(0, 0, 0);
      await warm(bullet.mesh);
      bullet.mesh.parent?.remove(bullet.mesh);

      const radBullet = bulletPool.spawn(
        scene,
        warmPos(),
        new THREE.Vector3(0, 0, -1),
        { radioactive: true }
      );
      radBullet.mesh.position.set(0, 0, 0);
      await warm(radBullet.mesh);
      radBullet.mesh.parent?.remove(radBullet.mesh);
    }

    setWarmupDrawFlags(scene);
    await compileAndRender(renderer, scene, camera, scene, { frames: 4 });

    _gameGpuWarmed = true;
  }

  await warmupGrenadeThrow(renderer, scene, camera, {
    warmInView: warm,
    compileInPlace: (object) => compileAndRender(renderer, object, camera, scene),
    getWarmupPos: warmPos,
    floorY,
    colliders,
    bounds,
  });

  if (_warmupStage) {
    _warmupStage.parent?.remove(_warmupStage);
    _warmupStage = null;
  }

  disposeOrphanedPickupShadowCasters(scene);
}
