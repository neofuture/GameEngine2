import * as THREE from "three";
import { spawnAmmoDrop } from "./AmmoCrate.js";
import { spawnBloodSplatter, disposeAllBloodSplatters } from "./BloodParticles.js";
import {
  spawnGrenadeDrop,
  disposeGrenadeModel,
  warmupGrenadeThrow,
} from "./Grenade.js";
import { spawnHpOrb } from "./Targets.js";

let _gameGpuWarmed = false;

/** Compile shaders and upload GPU buffers for one object subtree. */
export async function compileAndRender(renderer, object, camera, scene) {
  if (!object || !renderer || !camera || !scene) return;
  if (typeof renderer.compileAsync === "function") {
    await renderer.compileAsync(object, camera, scene);
  } else if (typeof renderer.compile === "function") {
    renderer.compile(object, camera, scene);
  }
  renderer.render(scene, camera);
}

const WARM_POS = new THREE.Vector3(0, -500, 0);

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
}) {
  if (_gameGpuWarmed || !renderer || !scene || !camera) return;

  if (level?.group) {
    await compileAndRender(renderer, level.group, camera, scene);
  }

  if (sky?.mesh) {
    await compileAndRender(renderer, sky.mesh, camera, scene);
  }

  if (weapon?.holder) {
    weapon.holder.visible = true;
    await compileAndRender(renderer, weapon.holder, camera, scene);
  }

  if (floorY != null) {
    const orb = spawnHpOrb(scene, WARM_POS, floorY);
    orb.mesh.position.set(0, -500, 0);
    await compileAndRender(renderer, orb.mesh, camera, scene);
    orb.mesh.parent?.remove(orb.mesh);

    const ammo = spawnAmmoDrop(scene, WARM_POS, floorY);
    ammo.mesh.position.set(0, -510, 0);
    await compileAndRender(renderer, ammo.mesh, camera, scene);
    ammo.mesh.parent?.remove(ammo.mesh);

    const grenDrop = spawnGrenadeDrop(scene, WARM_POS, floorY);
    grenDrop.mesh.position.set(0, -520, 0);
    await compileAndRender(renderer, grenDrop.mesh, camera, scene);
    disposeGrenadeModel(grenDrop.mesh);
  }

  const splatters = [];
  const splatter = spawnBloodSplatter(
    scene,
    new THREE.Vector3(0, -530, 0),
    new THREE.Vector3(0, 0, -1),
    50
  );
  if (splatter) {
    splatters.push(splatter);
    await compileAndRender(renderer, splatter.points, camera, scene);
    disposeAllBloodSplatters(splatters, scene);
  }

  if (bulletPool) {
    const bullet = bulletPool.spawn(
      scene,
      new THREE.Vector3(0, -540, 0),
      new THREE.Vector3(0, 0, -1)
    );
    await compileAndRender(renderer, bullet.mesh, camera, scene);
    bullet.mesh.parent?.remove(bullet.mesh);

    const radBullet = bulletPool.spawn(
      scene,
      new THREE.Vector3(0, -545, 0),
      new THREE.Vector3(0, 0, -1),
      { radioactive: true }
    );
    await compileAndRender(renderer, radBullet.mesh, camera, scene);
    radBullet.mesh.parent?.remove(radBullet.mesh);
  }

  await warmupGrenadeThrow(renderer, scene, camera, compileAndRender, {
    floorY,
    colliders,
    bounds,
  });

  _gameGpuWarmed = true;
}
