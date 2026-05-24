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
 */
export function shouldSkipCollider(
  box,
  footY,
  bodyTop,
  _stepUpMax,
  supportY,
  _stairLocal = null
) {
  if (box.bottomY == null && box.topY == null) return false;

  const bottomY = box.bottomY ?? -Infinity;
  const topY = box.topY ?? Infinity;

  if (!verticalOverlap(footY, bodyTop, box)) return true;
  if (bodyTop <= bottomY + 0.01) return true;
  if (footY >= topY - 0.05) return true;

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
