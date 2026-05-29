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
 * @param {number} [climbLocalMotion=0] +1 = moving up the flight (+localZ)
 * @param {number | null} [rampFootY=null] Continuous ramp height at the player
 * @param {boolean} [followingRamp=false] Player support is the stair ramp this frame
 */
export function shouldSkipCollider(
  box,
  footY,
  bodyTop,
  stepUpMax,
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

  // On the catwalk deck, doorway lintels extend slightly above wall height and
  // would otherwise block walking along the north/south perimeter.
  if (
    box.kind === "wall" &&
    supportY != null &&
    supportY > 3.5 &&
    footY >= supportY - 0.2 &&
    isFinite(topY) &&
    footY >= topY - 0.8
  ) {
    return true;
  }

  if (
    box.kind === "deck" &&
    isFinite(topY) &&
    footY >= topY - stepUpMax - 0.08 &&
    footY <= topY + 0.12
  ) {
    return true;
  }

  // Catwalk — feet are on the deck / landing; under-tread stair volumes are below.
  if (
    footY >= 3.15 &&
    box.stairFlight &&
    isFinite(topY) &&
    topY > 2.5
  ) {
    return true;
  }

  if (stairLocal && box.stairFlight) {
    const halfW = box.stairFlight.walkHalfWidth ?? 1.75;
    const zMin = box.stairFlight.ramp?.zMin ?? -0.55;
    const runEnd = box.stairFlight.ramp?.runEnd ?? 5.4;
    const inWalkCorridor =
      Math.abs(stairLocal.localX) <= halfW + 0.06 &&
      stairLocal.localZ >= zMin - 0.06 &&
      stairLocal.localZ <= runEnd + 0.35;

    const onCenterPath = Math.abs(stairLocal.localX) <= halfW + 0.06;
    const onArenaFloor = footY <= 0.12;
    /** Descending off the flight, or stalled on arena floor at the front lip only. */
    const exitingBottom =
      onCenterPath &&
      footY <= 0.28 &&
      ((climbLocalMotion < -0.02 &&
        stairLocal.localZ <= 0.25 &&
        stairLocal.localZ >= -1.35) ||
        (climbLocalMotion <= 0.05 &&
          onArenaFloor &&
          stairLocal.localZ <= 0 &&
          stairLocal.localZ >= -0.25));

    const bulkheadApproachGap =
      climbLocalMotion > 0.25 &&
      stairLocal.localZ > -1.48 &&
      stairLocal.localZ < -1.28;
    const approachingLip =
      climbLocalMotion > 0.25 &&
      stairLocal.localZ > -0.65 &&
      stairLocal.localZ < 0.15;
    const leavingLip =
      exitingBottom ||
      (climbLocalMotion < -0.12 &&
        stairLocal.localZ <= 0.25 &&
        stairLocal.localZ >= -1.35);

    const onRampSurface =
      followingRamp ||
      (rampFootY != null && footY >= rampFootY - 0.22);
    const steppingOntoRamp =
      rampFootY != null &&
      footY >= rampFootY - 0.48 &&
      climbLocalMotion > 0.2;

    if (box.kind === "stairBack") {
      if (stairLocal.localZ >= -0.75) return true;
      if (exitingBottom) return true;
      if (bulkheadApproachGap) return true;
      if (climbLocalMotion > 0.25 && stairLocal.localZ < -0.5) return true;
      return false;
    }

    if (box.kind === "stairRearCurtain") {
      if (stairLocal.localZ >= -0.03) return true;
      if (approachingLip) return true;
      if (leavingLip) return true;
      if (onRampSurface) return true;
      if (exitingBottom) return true;
      return false;
    }

    if (box.kind === "stairBackSlice") {
      if (onRampSurface) return true;
      if (approachingLip) return true;
      if (leavingLip) return true;
      if (steppingOntoRamp) return true;
      if (exitingBottom) return true;
      return false;
    }

    if (box.kind === "stairUnderSoffit" || box.kind === "stairRearWall") {
      if (inWalkCorridor && onRampSurface) return true;
      const forwardZ = box.blockForwardLocalZ ?? -1.0;
      if (stairLocal.localZ >= forwardZ - 0.1) return true;
      return false;
    }

    if (box.kind === "stairStringer" && inWalkCorridor) {
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
