import { enableShadowsOn } from "./SceneEnvironment.js";
import {
  oilBarrelCollider,
  spawnLevelOilBarrels,
} from "./OilBarrel.js";

/**
 * @param {THREE.Group} group
 * @param {import("./loadArena.js").ArenaConfig} arena
 * @param {import("./Collision.js").ColliderBox[]} colliders
 */
export function spawnLevelProps(group, arena, colliders) {
  const barrels = spawnLevelOilBarrels(group, arena);
  for (const barrel of barrels) enableShadowsOn(barrel);

  const floorY = arena.floorY ?? 0;
  for (const def of arena.props ?? []) {
    if (def.type === "oilBarrel") {
      colliders.push(oilBarrelCollider(def, floorY));
    }
  }

  return { barrels };
}
