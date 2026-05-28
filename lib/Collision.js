/** @typedef {{ x: number, z: number, halfX: number, halfZ: number, bottomY?: number, topY?: number, rotationY?: number, active?: boolean, kind?: string }} ColliderBox */

/**
 * @param {ColliderBox[]} colliders
 * @param {Omit<ColliderBox, "active">} box
 */
export function pushCollider(colliders, box) {
  colliders.push({ ...box, active: true });
}

/**
 * @param {number} footY
 * @param {number} bodyTop
 * @param {ColliderBox} box
 */
export function verticalOverlap(footY, bodyTop, box) {
  const bottom = box.bottomY ?? -Infinity;
  const top = box.topY ?? Infinity;
  return footY < top && bodyTop > bottom;
}

/**
 * Generic skip rule used by every solid level box, including stair treads.
 * A box is treated as non-colliding only when:
 *   - the player is standing on top of it (foot at or above topY), or
 *   - the player's whole body is below it (bodyTop ≤ bottomY — hide under), or
 *   - the box is the current step-up target (supportY matches its top, so the
 *     player is actively rising onto it).
 *
 * Otherwise the box is solid and {@link resolveBoxCollider} pushes the player
 * back along the box's local axes. This is what makes stairs behave like
 * regular level geometry — every step is just a solid block.
 *
 * @param {ColliderBox} box
 * @param {number} footY
 * @param {number} bodyTop
 * @param {number} _stepUpMax
 * @param {number} [supportY]
 * @param {{ localX: number, localZ: number } | null} [_stairLocal]
 * @param {number} [climbLocalMotion=0] +1 = moving up the flight (+localZ), −1 = down
 * @param {number | null} [rampFootY=null] Continuous ramp height at the player (no foot gate)
 * @param {boolean} [followingRamp=false] Player support is the stair ramp this frame
 */
export function shouldSkipCollider(
  box,
  footY,
  bodyTop,
  _stepUpMax,
  supportY,
  stairLocal = null,
  climbLocalMotion = 0,
  rampFootY = null,
  followingRamp = false
) {
  if (box.bottomY == null && box.topY == null) return false;

  const bottomY = box.bottomY ?? -Infinity;
  const topY = box.topY ?? Infinity;

  if (!verticalOverlap(footY, bodyTop, box)) return true;
  if (bodyTop <= bottomY + 0.01) return true;
  if (footY >= topY - 0.05) return true;

  if (stairLocal) {
    /** Deep-behind bulkhead bypass — narrow gap if the player clips the rear face. */
    const bulkheadApproachGap =
      climbLocalMotion > 0.25 &&
      stairLocal.localZ > -1.48 &&
      stairLocal.localZ < -1.28;
    /** Floor-level walk up to the bottom tread lip (front only — bulkhead blocks deep behind). */
    const approachingLip =
      climbLocalMotion > 0.25 &&
      stairLocal.localZ > -0.65 &&
      stairLocal.localZ < 0.15;
    const leavingLip =
      climbLocalMotion < -0.35 &&
      stairLocal.localZ > -0.15 &&
      stairLocal.localZ <= 0.2;

    /** Feet on the ramp slope — not walking under it at floor height. */
    const onRampSurface =
      followingRamp ||
      (rampFootY != null && footY >= rampFootY - 0.22);
    /** Stepping onto the lip / slope from the floor in front of the flight. */
    const withinStepUpOfRamp =
      rampFootY != null && footY >= rampFootY - 0.48;

    if (box.kind === "stairBack") {
      if (stairLocal.localZ >= -0.75) return true;
      if (bulkheadApproachGap) return true;
      if (climbLocalMotion > 0.25 && stairLocal.localZ < -0.5) return true;
    }

    if (box.kind === "stairRearCurtain") {
      if (stairLocal.localZ >= -0.03) return true;
      if (approachingLip) return true;
      if (leavingLip) return true;
      if (onRampSurface) return true;
    }

    if (
      box.kind === "stairBackSlice" &&
      (onRampSurface || withinStepUpOfRamp)
    ) {
      return true;
    }
  }

  if (
    supportY != null &&
    isFinite(topY) &&
    Math.abs(supportY - topY) < 0.05 &&
    footY <= topY + 0.05
  ) {
    return true;
  }

  return false;
}

/**
 * Project (x, z) into the box's local frame (taking rotationY into account).
 * Three.js Y-rotation: world = R(θ)·local where R(θ)·(x,z) = (c·x+s·z, −s·x+c·z).
 * To go world→local we apply the inverse R(−θ), i.e. (c·dx−s·dz, s·dx+c·dz).
 *
 * @param {ColliderBox} box
 * @param {number} x
 * @param {number} z
 * @returns {{ lx: number, lz: number }}
 */
export function worldToBoxLocal(box, x, z) {
  const dx = x - box.x;
  const dz = z - box.z;
  if (!box.rotationY) return { lx: dx, lz: dz };
  const c = Math.cos(box.rotationY);
  const s = Math.sin(box.rotationY);
  return { lx: c * dx - s * dz, lz: s * dx + c * dz };
}

/**
 * True if a circle of `radius` at world (x, z) overlaps the box's XZ footprint
 * (rotation-aware). Use when only intersection — not push-out — is needed.
 *
 * @param {ColliderBox} box
 * @param {number} x
 * @param {number} z
 * @param {number} radius
 */
export function rotatedBoxOverlapsCircle(box, x, z, radius) {
  const { lx, lz } = worldToBoxLocal(box, x, z);
  if (Math.abs(lx) < box.halfX && Math.abs(lz) < box.halfZ) return true;
  const closestX = Math.min(Math.max(lx, -box.halfX), box.halfX);
  const closestZ = Math.min(Math.max(lz, -box.halfZ), box.halfZ);
  const diffX = lx - closestX;
  const diffZ = lz - closestZ;
  return diffX * diffX + diffZ * diffZ < radius * radius;
}

/**
 * @param {{ x: number, z: number }} position
 * @param {number} radius
 * @param {ColliderBox} box
 */
export function resolveBoxCollider(position, radius, box) {
  const { lx, lz } = worldToBoxLocal(box, position.x, position.z);
  let pushX = 0;
  let pushZ = 0;

  if (Math.abs(lx) < box.halfX && Math.abs(lz) < box.halfZ) {
    const pushLeft = lx + box.halfX + radius;
    const pushRight = box.halfX - lx + radius;
    const pushBack = lz + box.halfZ + radius;
    const pushForward = box.halfZ - lz + radius;
    const min = Math.min(pushLeft, pushRight, pushBack, pushForward);
    if (min === pushLeft) pushX = -pushLeft;
    else if (min === pushRight) pushX = pushRight;
    else if (min === pushBack) pushZ = -pushBack;
    else pushZ = pushForward;
  } else {
    const closestX = Math.min(Math.max(lx, -box.halfX), box.halfX);
    const closestZ = Math.min(Math.max(lz, -box.halfZ), box.halfZ);
    const diffX = lx - closestX;
    const diffZ = lz - closestZ;
    const distSq = diffX * diffX + diffZ * diffZ;
    const rSq = radius * radius;
    if (distSq >= rSq || distSq < 1e-10) return;

    const dist = Math.sqrt(distSq);
    const push = (radius - dist) / dist;
    pushX = diffX * push;
    pushZ = diffZ * push;
  }

  if (box.rotationY) {
    const c = Math.cos(box.rotationY);
    const s = Math.sin(box.rotationY);
    position.x += c * pushX + s * pushZ;
    position.z += -s * pushX + c * pushZ;
  } else {
    position.x += pushX;
    position.z += pushZ;
  }
}

/**
 * Push a circle out of solid colliders (rotation-aware). Skips boxes the body
 * is standing on / above when footY and bodyTop are supplied.
 *
 * @param {number} x
 * @param {number} z
 * @param {number} radius
 * @param {ColliderBox[]} colliders
 * @param {{ footY?: number, bodyTop?: number, skipTargetMeshes?: boolean }} [opts]
 * @returns {{ x: number, z: number }}
 */
export function pushCircleOutOfColliders(x, z, radius, colliders, opts = {}) {
  const pos = { x, z };
  const { footY, bodyTop } = opts;
  const skipTargetMeshes = opts.skipTargetMeshes !== false;
  for (const box of colliders) {
    if (box.active === false) continue;
    if (skipTargetMeshes && box.targetMesh) continue;
    if (
      footY != null &&
      bodyTop != null &&
      shouldSkipCollider(box, footY, bodyTop, Infinity, footY)
    ) {
      continue;
    }
    resolveBoxCollider(pos, radius, box);
  }
  return pos;
}

/**
 * True when a body at (x, z) with the given vertical span intersects solid
 * collider volume (same rules as the player — stair tread faces block spawns).
 *
 * @param {number} x
 * @param {number} z
 * @param {number} footY
 * @param {number} bodyTop
 * @param {number} radius
 * @param {ColliderBox[]} colliders
 */
export function spawnBlockedAt(x, z, footY, bodyTop, radius, colliders) {
  for (const box of colliders) {
    if (box.active === false) continue;
    if (!rotatedBoxOverlapsCircle(box, x, z, radius)) continue;
    if (shouldSkipCollider(box, footY, bodyTop, Infinity, footY)) continue;
    return true;
  }
  return false;
}

/**
 * Highest walkable foot Y at (x, z) — arena floor or stair tread tops only.
 *
 * @param {number} x
 * @param {number} z
 * @param {number} height
 * @param {number} radius
 * @param {ColliderBox[]} colliders
 * @returns {number | null}
 */
export function resolveSpawnFootY(x, z, height, radius, colliders) {
  const candidates = [0];
  for (const box of colliders) {
    if (
      box.kind === "stairTread" &&
      box.topY != null &&
      rotatedBoxOverlapsCircle(box, x, z, radius)
    ) {
      candidates.push(box.topY);
    }
  }
  candidates.sort((a, b) => b - a);
  for (const footY of candidates) {
    const bodyTop = footY + height;
    if (!spawnBlockedAt(x, z, footY, bodyTop, radius, colliders)) return footY;
  }
  return null;
}

/** Gravity while an entity falls through a floor hole (matches player / ragdoll). */
export const HOLE_FALL_GRAVITY = 20;
/** World units below floorY before the entity is removed. */
export const HOLE_FALL_REMOVE_DEPTH = 12;

/**
 * @param {number} x
 * @param {number} z
 * @param {{ x: number, z: number, radius?: number }[]} [floorHoles]
 * @param {number} [inset=0] Shrink hole radius — use entity radius so the body must overlap the hole.
 */
export function pointInFloorHole(x, z, floorHoles, inset = 0) {
  if (!floorHoles?.length) return false;
  for (const h of floorHoles) {
    const dx = x - h.x;
    const dz = z - h.z;
    const r = Math.max(0, (h.radius ?? 0) - inset);
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

/**
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number }[]} cutouts
 * @param {number} [inset=0]
 */
/** @param {{ minX: number, maxX: number, minZ: number, maxZ: number }[]} passages */
export function pointInDoorwayPassage(x, z, passages) {
  if (!passages?.length) return false;
  for (const p of passages) {
    if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ) return true;
  }
  return false;
}

export function pointInRectFloorCutout(x, z, cutouts, inset = 0) {
  if (!cutouts?.length) return false;
  for (const r of cutouts) {
    if (
      x >= r.minX + inset &&
      x <= r.maxX - inset &&
      z >= r.minZ + inset &&
      z <= r.maxZ - inset
    ) {
      return true;
    }
  }
  return false;
}

/** @param {{ fallingThroughHole?: boolean, holeFallVelY?: number, settled?: boolean }} entity */
export function beginHoleFall(entity, velY = -2) {
  entity.fallingThroughHole = true;
  entity.holeFallVelY = velY;
  if ("settled" in entity) entity.settled = false;
}

/**
 * @param {{ fallingThroughHole?: boolean, holeFallVelY?: number }} entity
 * @param {number} y
 * @param {number} floorY
 * @param {number} dt
 * @returns {{ nextY: number, remove: boolean }}
 */
export function tickHoleFallY(entity, y, floorY, dt) {
  if (!entity.fallingThroughHole) return { nextY: y, remove: false };
  entity.holeFallVelY = (entity.holeFallVelY ?? -2) - HOLE_FALL_GRAVITY * dt;
  const nextY = y + entity.holeFallVelY * dt;
  return { nextY, remove: nextY < floorY - HOLE_FALL_REMOVE_DEPTH };
}

/**
 * @param {{ fallingThroughHole?: boolean, holeFallVelY?: number, settled?: boolean }} entity
 * @returns {{ y: number, remove: boolean, falling: boolean }}
 */
export function updateEntityForFloorHole(entity, x, z, y, floorY, dt, floorHoles, inset = 0) {
  if (!floorHoles?.length) {
    return { y, remove: false, falling: !!entity.fallingThroughHole };
  }
  if (!entity.fallingThroughHole && pointInFloorHole(x, z, floorHoles, inset)) {
    beginHoleFall(entity);
  }
  if (!entity.fallingThroughHole) return { y, remove: false, falling: false };
  const result = tickHoleFallY(entity, y, floorY, dt);
  return { y: result.nextY, remove: result.remove, falling: true };
}
