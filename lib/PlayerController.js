import * as THREE from "three";
import { isBindingDown, wasBindingPressed } from "./KeyBindings.js";
import {
  resolveBoxCollider,
  rotatedBoxOverlapsCircle,
  shouldSkipCollider,
  pointInDoorwayPassage,
  pointInFloorHole,
} from "./Collision.js";
import { STAIRS_STEP_RUN } from "./LevelStairs.js";
import { sampleStairRampFootY, sampleStairRampFootYRaw } from "./StairRamp.js";
import { DEFAULT_WALK_BOB_SIMPLE, resolveWalkBobTuning } from "./WalkBobTuning.js";
import {
  DEFAULT_STAIR_WALK_TUNING,
  normalizeStairWalkTuning,
} from "./StairWalkTuning.js";

const MOUSE_SENS_BASE = 0.0022;
const ARROW_MAX_SPEED_BASE = 2.2;
const ARROW_ACCEL_BASE = 5.6;
const MOUSE_ACCEL_BASE = 5.6;
const LOOK_DAMP = 5.5;
const AIM_RECOIL_PITCH = 0.014;
const AIM_RECOIL_YAW = 0.004;

const CROUCH_SPEED = 2.5;
const GRAVITY = -22;
const JUMP_VELOCITY = 8.5;
/** Base sprint pool (~5s drain at 100%); max scales with radioactive HP above 100. */
const SPRINT_STAMINA_BASE = 1;
/** Full sprint drain in ~3.75s at base stamina (33% faster than 5s). */
const SPRINT_DRAIN_PER_SEC = (1 / 5) * 1.33;
/** Refill in 4× the drain duration (~15s at base stamina). */
const SPRINT_RECOVER_PER_SEC = SPRINT_DRAIN_PER_SEC / 4;
const DEFAULT_STAND_EYE = 1.65;
const DEFAULT_CROUCH_EYE = 0.85;
const CROUCH_RATIO = DEFAULT_CROUCH_EYE / DEFAULT_STAND_EYE;
const CROUCH_LERP = 12;
const PLAYER_RADIUS = 0.35;
/** Max distance below a flat surface the player can still land on it. */
const FLAT_LAND_REACH = 2.5;
/** Vertical slack required to leave crouch — slightly larger than to enter it, to avoid oscillation at a ceiling exactly at standing height. */
const STAND_CLEARANCE_MARGIN = 0.05;

/** @typedef {{ minX: number, maxX: number, minZ: number, maxZ: number, y: number }} GroundSurface */

export function createPlayerController(camera, bounds, floorY, options = {}) {
  const colliders = options.colliders ?? [];
  /** @type {GroundSurface[]} */
  const groundSurfaces = options.groundSurfaces ?? [];
  const getGroundSurfaces =
    options.getGroundSurfaces ?? (() => groundSurfaces);
  const getColliders = options.getColliders ?? (() => colliders);
  /** Circular cutouts in the arena floor — at points inside any hole the
   *  implicit `floorY` support is suppressed so the player falls through. */
  const getFloorHoles = options.getFloorHoles ?? (() => []);
  /** Rectangular area where the implicit `floorY` applies. Outside these
   *  bounds the player has no implicit floor and will fall unless a
   *  groundSurface supports them. */
  const getFloorBounds = options.getFloorBounds ?? (() => null);
  /** Uniform arena inset on all four walls (same distance from inner wall faces). */
  const arenaBounds = options.arenaBounds ?? null;
  const wallStandoff = options.wallStandoff ?? 0.5;
  const getDoorwayPassages = options.getDoorwayPassages ?? (() => []);
  const getAttachWall = options.getAttachWall ?? (() => "north");
  const getIsInRoom = options.getIsInRoom ?? (() => false);
  const STEP_UP_MAX = 0.42;
  const getInvertYLook = options.getInvertYLook ?? (() => false);
  const getKeyboardLookSpeed = options.getKeyboardLookSpeed ?? (() => 7);
  const getKeyboardLookEase = options.getKeyboardLookEase ?? (() => 7);
  const getMouseLookSpeed = options.getMouseLookSpeed ?? (() => 7);
  const getMouseLookEase = options.getMouseLookEase ?? (() => 7);
  /** Max look velocity in rad/s (caps quick mouse flicks and arrow spam). */
  const getMaxLookRate = options.getMaxLookRate ?? (() => 8);
  const getStandEyeHeight = options.getStandEyeHeight ?? (() => DEFAULT_STAND_EYE);
  const getBindings = options.getBindings ?? (() => ({}));
  const getWalkBobTuning =
    options.getWalkBobTuning ??
    (() => resolveWalkBobTuning(DEFAULT_WALK_BOB_SIMPLE));
  const getStairWalkTuning =
    options.getStairWalkTuning ??
    (() => normalizeStairWalkTuning(DEFAULT_STAIR_WALK_TUNING));
  /** 1 at normal HP; HP/100 when radioactive (e.g. 120 HP → 1.2 pool). */
  const getStaminaMax =
    options.getStaminaMax ?? (() => SPRINT_STAMINA_BASE);
  const onFootstep = options.onFootstep ?? null;
  /** Spawn point used by `respawn()` after a death-fall. Defaults to the
   *  legacy player start so existing levels behave the same. */
  const initialPosition = options.initialPosition
    ? new THREE.Vector3(
        options.initialPosition.x ?? 0,
        options.initialPosition.y ?? DEFAULT_STAND_EYE,
        options.initialPosition.z ?? 6
      )
    : new THREE.Vector3(0, DEFAULT_STAND_EYE, 6);
  const initialYaw = options.initialYaw ?? 0;
  const position = initialPosition.clone();
  const velocity = new THREE.Vector3();
  const stairLocalScratch = new THREE.Vector3();
  let yaw = initialYaw;
  let pitch = 0;
  let eyeHeight = DEFAULT_STAND_EYE;
  let grounded = true;
  let prevSupportY = floorY;
  let stepBobY = 0;
  let stepBobVel = 0;
  let walkBobPhase = 0;
  let walkBobY = 0;
  let walkBobPitch = 0;
  let walkBobRoll = 0;
  let walkBobActivity = 0;
  let stamina = SPRINT_STAMINA_BASE;
  let isSprinting = false;
  let lastStaminaMax = SPRINT_STAMINA_BASE;
  let onStairs = false;
  const arrowLookVel = { yaw: 0, pitch: 0 };
  const mouseLookVel = { yaw: 0, pitch: 0 };

  camera.position.copy(position);

  function updateArrowLook(input, dt) {
    const bindings = getBindings();
    const invert = getInvertYLook();
    const wantYaw =
      (isBindingDown(input, bindings, "lookRight") ? 1 : 0) -
      (isBindingDown(input, bindings, "lookLeft") ? 1 : 0);
    const rawPitch =
      (isBindingDown(input, bindings, "lookUp") ? 1 : 0) -
      (isBindingDown(input, bindings, "lookDown") ? 1 : 0);
    const wantPitch = rawPitch * (invert ? 1 : -1);

    const arrowAccel = ARROW_ACCEL_BASE / getKeyboardLookEase();
    const arrowMaxSpeed = ARROW_MAX_SPEED_BASE * getKeyboardLookSpeed();

    const targetYaw = wantYaw * arrowMaxSpeed;
    const targetPitch = wantPitch * arrowMaxSpeed;

    const ease = 1 - Math.exp(-arrowAccel * dt);
    arrowLookVel.yaw += (targetYaw - arrowLookVel.yaw) * ease;
    arrowLookVel.pitch += (targetPitch - arrowLookVel.pitch) * ease;

    const damp = Math.exp(-LOOK_DAMP * dt);
    if (wantYaw === 0) arrowLookVel.yaw *= damp;
    if (wantPitch === 0) arrowLookVel.pitch *= damp;

  }

  function applyMouseLook(input, dt) {
    const { dx, dy } = input.getMouseDelta();
    if (!input.isLocked()) {
      mouseLookVel.yaw = 0;
      mouseLookVel.pitch = 0;
      arrowLookVel.yaw = 0;
      arrowLookVel.pitch = 0;
      return;
    }

    const mouseSens = MOUSE_SENS_BASE * getMouseLookSpeed();
    const mousePitchSign = getInvertYLook() ? -1 : 1;
    const easeSetting = getMouseLookEase();
    const mouseAccel =
      easeSetting > 0 ? MOUSE_ACCEL_BASE / easeSetting : Number.POSITIVE_INFINITY;
    const invDt = 1 / Math.max(dt, 0.001);

    const targetYaw = dx * mouseSens * invDt;
    const targetPitch = dy * mouseSens * mousePitchSign * invDt;

    if (easeSetting <= 0) {
      mouseLookVel.yaw = targetYaw;
      mouseLookVel.pitch = targetPitch;
    } else {
      const ease = 1 - Math.exp(-mouseAccel * dt);
      mouseLookVel.yaw += (targetYaw - mouseLookVel.yaw) * ease;
      mouseLookVel.pitch += (targetPitch - mouseLookVel.pitch) * ease;

      const damp = Math.exp(-LOOK_DAMP * dt);
      if (dx === 0) mouseLookVel.yaw *= damp;
      if (dy === 0) mouseLookVel.pitch *= damp;
    }

  }

  function clampPitch() {
    const limit = Math.PI / 2 - 0.05;
    pitch = THREE.MathUtils.clamp(pitch, -limit, limit);
  }

  function clampLookVelocities() {
    const maxRate = Math.max(0.5, getMaxLookRate());
    mouseLookVel.yaw = THREE.MathUtils.clamp(mouseLookVel.yaw, -maxRate, maxRate);
    mouseLookVel.pitch = THREE.MathUtils.clamp(
      mouseLookVel.pitch,
      -maxRate,
      maxRate
    );
    arrowLookVel.yaw = THREE.MathUtils.clamp(arrowLookVel.yaw, -maxRate, maxRate);
    arrowLookVel.pitch = THREE.MathUtils.clamp(
      arrowLookVel.pitch,
      -maxRate,
      maxRate
    );
  }

  function applyLookVelocities(dt) {
    const maxDelta = Math.max(0.5, getMaxLookRate()) * dt;
    yaw -= THREE.MathUtils.clamp(mouseLookVel.yaw * dt, -maxDelta, maxDelta);
    yaw -= THREE.MathUtils.clamp(arrowLookVel.yaw * dt, -maxDelta, maxDelta);
    pitch -= THREE.MathUtils.clamp(mouseLookVel.pitch * dt, -maxDelta, maxDelta);
    pitch -= THREE.MathUtils.clamp(arrowLookVel.pitch * dt, -maxDelta, maxDelta);
  }

  function syncCamera() {
    camera.position.set(
      position.x,
      position.y + stepBobY + walkBobY,
      position.z
    );
    const euler = new THREE.Euler(
      pitch + walkBobPitch,
      yaw,
      walkBobRoll,
      "YXZ"
    );
    camera.quaternion.setFromEuler(euler);
  }

  function updateWalkBob(horizontalSpeed, crouching, aiming, dt) {
    const t = getWalkBobTuning();
    const stairWalk = getStairWalkTuning();
    const fade = Math.exp(-10 * dt);
    const bobEase = 1 - Math.exp(-t.walkSmooth * dt);
    const moving = horizontalSpeed > 0.15;
    const airborne = !grounded && velocity.y > 0.35;
    const activityTarget = moving && !airborne ? 1 : 0;

    const bobFreq = onStairs
      ? Math.max(
          stairWalk.bobFreqMin,
          (horizontalSpeed / STAIRS_STEP_RUN) * stairWalk.bobFreqSpeedScale
        )
      : t.walkFreqBase + horizontalSpeed * t.walkFreqPerSpeed;

    const canStep = moving && !airborne && grounded;

    walkBobActivity +=
      (activityTarget - walkBobActivity) *
      (1 - Math.exp(-t.walkFade * dt));

    if (walkBobActivity < 0.01) {
      walkBobY *= fade;
      walkBobPitch *= fade;
      walkBobRoll *= fade;
      return;
    }

    const speedFactor = THREE.MathUtils.clamp(
      horizontalSpeed / Math.max(t.walkSpeed, 0.1),
      0.4,
      1.2
    );
    const crouchFactor = crouching ? 0.55 : 1;
    const aimFactor = aiming ? 0.45 : 1;
    const intensity = speedFactor * crouchFactor * aimFactor * walkBobActivity;

    const phaseBefore = walkBobPhase;
    walkBobPhase += dt * bobFreq * Math.PI * 2 * walkBobActivity;

    if (onFootstep && canStep && walkBobActivity > 0.35) {
      const beforeHalf = Math.floor(phaseBefore / Math.PI);
      const afterHalf = Math.floor(walkBobPhase / Math.PI);
      for (let half = beforeHalf + 1; half <= afterHalf; half++) {
        onFootstep({
          speed: horizontalSpeed,
          crouching,
          sprinting: isSprinting,
          onStairs,
        });
      }
    }

    if (onStairs) {
      const amp = t.walkAmp * intensity * stairWalk.cameraBobScale;
      const targetY = Math.sin(walkBobPhase) * amp;
      const targetPitch =
        Math.cos(walkBobPhase) *
        t.walkPitch *
        intensity *
        stairWalk.cameraBobPitchScale;
      const targetRoll =
        Math.sin(walkBobPhase * 0.5) *
        t.walkRoll *
        intensity *
        stairWalk.cameraBobRollScale;

      walkBobY += (targetY - walkBobY) * bobEase;
      walkBobPitch += (targetPitch - walkBobPitch) * bobEase;
      walkBobRoll += (targetRoll - walkBobRoll) * bobEase;
      return;
    }

    const amp = t.walkAmp * intensity;

    const targetY = Math.sin(walkBobPhase) * amp;
    const targetPitch = Math.cos(walkBobPhase) * t.walkPitch * intensity;
    const targetRoll = Math.sin(walkBobPhase * 0.5) * t.walkRoll * intensity;

    walkBobY += (targetY - walkBobY) * bobEase;
    walkBobPitch += (targetPitch - walkBobPitch) * bobEase;
    walkBobRoll += (targetRoll - walkBobRoll) * bobEase;
  }

  function springStepBob(value, velocity, stiffness, damping, dt) {
    velocity += (-value * stiffness - velocity * damping) * dt;
    value += velocity * dt;
    return { value, velocity };
  }

  function isCatwalkSurface(surf, footY, ySlack) {
    return (
      !surf.stairFlight &&
      !surf.stairRamp &&
      surf.y != null &&
      Math.abs(surf.y - footY) <= ySlack &&
      surf.minX != null &&
      (surf.arenaCatwalkDeck || surf.catwalkWalk)
    );
  }

  /** True when the player capsule stands on real deck geometry at catwalk height. */
  function onArenaCatwalkDeck(footY, x, z) {
    const ySlack = 0.15;
    const r = PLAYER_RADIUS;
    for (const surf of getGroundSurfaces()) {
      if (!surf.arenaCatwalkDeck || surf.y == null) continue;
      if (Math.abs(surf.y - footY) > ySlack) continue;
      if (capsuleOverlapsSurface(x, z, r, surf)) return true;
    }
    return false;
  }

  /** Highest arena deck slab under the foot capsule (L-cut pieces unioned). */
  function arenaCatwalkDeckSupportY(x, z) {
    let best = Number.NEGATIVE_INFINITY;
    const r = PLAYER_RADIUS;
    for (const surf of getGroundSurfaces()) {
      if (!surf.arenaCatwalkDeck || surf.y == null) continue;
      if (!capsuleOverlapsSurface(x, z, r, surf)) continue;
      best = Math.max(best, surf.y);
    }
    return Number.isFinite(best) ? best : null;
  }

  /** Wall tops (y = wall height) must not pull deck support down to y ≈ 4.0. */
  function stabilizeCatwalkSupport(x, z, footY, supportY) {
    if (!Number.isFinite(supportY) || !onArenaCatwalkDeck(footY, x, z)) {
      return supportY;
    }
    const deckY = arenaCatwalkDeckSupportY(x, z);
    return deckY != null ? Math.max(supportY, deckY) : supportY;
  }

  function finishSupportInfo(x, z, footY, supportY, onStairs, stairRamp) {
    return {
      supportY: stabilizeCatwalkSupport(x, z, footY, supportY),
      onStairs,
      stairRamp,
    };
  }

  /** True when standing on the flat top of a stair stringer side wall. */
  function onStairSideWalk(footY, x, z) {
    const ySlack = 0.15;
    const r = PLAYER_RADIUS;
    for (const surf of getGroundSurfaces()) {
      if (!surf.stairSideWalk || surf.y == null) continue;
      if (Math.abs(surf.y - footY) > ySlack) continue;
      if (capsuleOverlapsSurface(x, z, r, surf)) return true;
    }
    return false;
  }

  function isStairSideWalkSurface(surf, footY, ySlack) {
    return (
      surf.stairSideWalk &&
      surf.y != null &&
      Math.abs(surf.y - footY) <= ySlack &&
      surf.minX != null
    );
  }

  function capsuleOverlapsSurface(x, z, radius, surf) {
    return (
      x >= surf.minX - radius &&
      x <= surf.maxX + radius &&
      z >= surf.minZ - radius &&
      z <= surf.maxZ + radius
    );
  }

  function findCatwalkWalkBounds(footY, x, z) {
    if (footY <= floorY + 0.5) return null;

    const ySlack = 0.15;
    const r = PLAYER_RADIUS;
    const surfaces = getGroundSurfaces();

    const onDeck = onArenaCatwalkDeck(footY, x, z);
    const onSideWalk = onStairSideWalk(footY, x, z);
    const onStairAtCatwalk = onStairs && footY >= floorY + 3 - ySlack;

    let onCatwalk = onDeck || onSideWalk || onStairAtCatwalk;
    if (!onCatwalk) {
      for (const surf of surfaces) {
        if (!isCatwalkSurface(surf, footY, ySlack) || surf.arenaCatwalkDeck) continue;
        if (pointInSurfaceBounds(x, z, surf)) {
          onCatwalk = true;
          break;
        }
      }
    }
    if (!onCatwalk) return null;

    // On the arena deck or climbing off the stair top — union every deck piece so
    // L-cut seams (e.g. x ≈ cutout.maxX beside the stairs) do not clamp movement.
    const unionAllArenaDeck = onDeck || onStairAtCatwalk;

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let edgeStandoff = null;

    for (const surf of surfaces) {
      if (
        !isCatwalkSurface(surf, footY, ySlack) &&
        !isStairSideWalkSurface(surf, footY, ySlack)
      ) {
        continue;
      }

      const include =
        (unionAllArenaDeck && surf.arenaCatwalkDeck) ||
        (onSideWalk && surf.stairSideWalk) ||
        capsuleOverlapsSurface(x, z, r, surf) ||
        pointInSurfaceBounds(x, z, surf);
      if (!include) continue;

      minX = Math.min(minX, surf.minX);
      maxX = Math.max(maxX, surf.maxX);
      minZ = Math.min(minZ, surf.minZ);
      maxZ = Math.max(maxZ, surf.maxZ);
      if (surf.edgeStandoff && surf.arenaCatwalkDeck) {
        edgeStandoff = surf.edgeStandoff;
      }
    }

    if (!Number.isFinite(minX)) return null;
    return { minX, maxX, minZ, maxZ, edgeStandoff };
  }

  function computeResolvedWalkBounds(x, z, footY) {
    const r = PLAYER_RADIUS;
    let minX = bounds.minX + r;
    let maxX = bounds.maxX - r;
    let minZ = bounds.minZ + r;
    let maxZ = bounds.maxZ - r;

    const inRoom = arenaBounds ? getIsInRoom(x, z) : false;
    const catwalkBounds =
      !inRoom ? findCatwalkWalkBounds(footY, x, z) : null;

    if (catwalkBounds) {
      const es = catwalkBounds.edgeStandoff;
      minX = Math.max(bounds.minX + r, catwalkBounds.minX + r);
      maxX = Math.min(bounds.maxX - r, catwalkBounds.maxX - r);
      minZ = Math.max(bounds.minZ + r, catwalkBounds.minZ + r);
      maxZ = Math.min(bounds.maxZ - r, catwalkBounds.maxZ - r);
      if (es) {
        if (es.west > 0) minX += es.west;
        if (es.east > 0) maxX -= es.east;
        if (es.north > 0) minZ += es.north;
        if (es.south > 0) maxZ -= es.south;
        if (es.west === 0) minX = bounds.minX + r;
      }
    } else if (arenaBounds && !inRoom) {
      minX = Math.max(minX, arenaBounds.minX + r);
      maxX = Math.min(maxX, arenaBounds.maxX - r);

      const inPassage = pointInDoorwayPassage(x, z, getDoorwayPassages());
      const attachWall = getAttachWall();
      const onCatwalkHeight = footY >= floorY + 3;

      if (attachWall === "south") {
        minZ = Math.max(minZ, arenaBounds.minZ + r);
        if (!inPassage && !onCatwalkHeight) {
          maxZ = Math.min(maxZ, arenaBounds.maxZ - r);
        }
      } else {
        if (!inPassage && !onCatwalkHeight) {
          minZ = Math.max(minZ, arenaBounds.minZ + r);
        }
        maxZ = Math.min(maxZ, arenaBounds.maxZ - r);
      }
    }

    return { minX, maxX, minZ, maxZ, catwalkBounds, inRoom };
  }

  function resolveBounds() {
    const footY = position.y - eyeHeight;
    const walk = computeResolvedWalkBounds(position.x, position.z, footY);
    position.x = THREE.MathUtils.clamp(position.x, walk.minX, walk.maxX);
    position.z = THREE.MathUtils.clamp(position.z, walk.minZ, walk.maxZ);
  }

  function worldToStairLocal(stairFlight, x, z) {
    stairLocalScratch.set(x, 0, z);
    stairLocalScratch.applyMatrix4(stairFlight.inverseMatrix);
    return { localX: stairLocalScratch.x, localZ: stairLocalScratch.z };
  }

  function sampleStairLocalZ(x, z) {
    for (const surf of getGroundSurfaces()) {
      if (!surf.stairFlight?.inverseMatrix) continue;
      stairLocalScratch.set(x, 0, z);
      stairLocalScratch.applyMatrix4(surf.stairFlight.inverseMatrix);
      return stairLocalScratch.z;
    }
    return null;
  }

  function stairClimbLocalMotion(stairFlight) {
    const speed = Math.hypot(velocity.x, velocity.z);
    if (speed < 0.05) return 0;
    const yawRad = stairFlight.rotationY ?? 0;
    return (
      (velocity.x * Math.sin(yawRad) + velocity.z * Math.cos(yawRad)) / speed
    );
  }

  function sampleRawRampFootY(x, z) {
    for (const surf of getGroundSurfaces()) {
      if (!surf.stairRamp || !surf.stairFlight?.ramp) continue;
      const y = sampleStairRampFootYRaw(
        surf.stairFlight,
        x,
        z,
        stairLocalScratch
      );
      if (y != null) return y;
    }
    return null;
  }

  function sampleRampSupportY(x, z, footY) {
    const stepUpReach = onStairs ? STEP_UP_MAX + 0.12 : STEP_UP_MAX;
    for (const surf of getGroundSurfaces()) {
      if (!surf.stairRamp || !surf.stairFlight?.ramp) continue;
      const y = sampleStairRampFootY(
        surf.stairFlight,
        x,
        z,
        stairLocalScratch,
        footY,
        stepUpReach,
        onStairs
      );
      if (y != null) return y;
    }
    return null;
  }

  function pointInSurfaceBounds(x, z, surf) {
    return (
      x >= surf.minX &&
      x <= surf.maxX &&
      z >= surf.minZ &&
      z <= surf.maxZ
    );
  }

  /** High surfaces — arena deck uses capsule overlap so L-cut seams stay smooth. */
  function elevatedSurfaceSupportsBody(x, z, surf) {
    if (surf.arenaCatwalkDeck || surf.stairSideWalk) {
      return capsuleOverlapsSurface(x, z, PLAYER_RADIUS, surf);
    }
    if (surf.catwalkWalk) {
      return pointInSurfaceBounds(x, z, surf);
    }
    return pointInSurfaceBounds(x, z, surf);
  }

  function hasImplicitFloorSupport(x, z) {
    const fb = getFloorBounds();
    if (fb && (x < fb.minX || x > fb.maxX || z < fb.minZ || z > fb.maxZ)) {
      return false;
    }
    return !pointInFloorHole(x, z, getFloorHoles(), PLAYER_RADIUS);
  }

  /** Deck ground surfaces still cover hole cutouts — ignore floor-level support there. */
  function flatSurfaceBlockedByHole(x, z, surfY) {
    return (
      surfY <= floorY + 0.02 &&
      pointInFloorHole(x, z, getFloorHoles(), PLAYER_RADIUS)
    );
  }

  function pointOnFlatSurface(x, z, footY, surf) {
    if (!pointInSurfaceBounds(x, z, surf)) return false;
    if (surf.y <= footY + STEP_UP_MAX) return true;
    // Catch falls — once support glitches, footY drops below STEP_UP_MAX and
    // the old check never allowed landing on y=0 again.
    return footY <= surf.y + 0.05 && footY >= surf.y - FLAT_LAND_REACH;
  }

  /** Collider tops within step-up reach (rocks, curbs, props without ground surfaces). */
  function sampleColliderLedgeTop(sx, sz, footY, bodyTop, minSupportY) {
    let best = Number.NEGATIVE_INFINITY;
    for (const box of getColliders()) {
      if (box.active === false || !Number.isFinite(box.topY)) continue;
      if (!rotatedBoxOverlapsCircle(box, sx, sz, PLAYER_RADIUS)) continue;
      const topY = box.topY;
      if (topY < minSupportY) continue;
      if (topY - footY > STEP_UP_MAX + 0.06) continue;
      if (bodyTop <= topY + 0.02) continue;
      if (topY <= footY + STEP_UP_MAX + 0.02) {
        best = Math.max(best, topY);
      }
    }
    return best;
  }

  /** Sample support under the whole foot circle — center-only checks miss edges at walls. */
  function bestFlatSupportAt(x, z, footY) {
    let bestAtOrBelow = Number.NEGATIVE_INFINITY;
    let bestStepUp = Number.NEGATIVE_INFINITY;
    let bestFallReach = Number.NEGATIVE_INFINITY;
    const bodyTop = footY + eyeHeight;
    const minSupportY = onArenaCatwalkDeck(footY, x, z)
      ? (arenaCatwalkDeckSupportY(x, z) ?? footY) - 0.1
      : Number.NEGATIVE_INFINITY;
    const surfaces = getGroundSurfaces();
    const samples = [
      [0, 0],
      [PLAYER_RADIUS * 0.85, 0],
      [-PLAYER_RADIUS * 0.85, 0],
      [0, PLAYER_RADIUS * 0.85],
      [0, -PLAYER_RADIUS * 0.85],
    ];
    for (const [dx, dz] of samples) {
      const sx = x + dx;
      const sz = z + dz;
      if (hasImplicitFloorSupport(sx, sz)) {
        if (footY <= floorY + 0.02) {
          bestAtOrBelow = Math.max(bestAtOrBelow, floorY);
        } else if (footY <= floorY + STEP_UP_MAX && footY < floorY + 2) {
          bestStepUp = Math.max(bestStepUp, floorY);
        } else if (
          footY <= floorY + 0.05 &&
          footY >= floorY - FLAT_LAND_REACH
        ) {
          bestFallReach = Math.max(bestFallReach, floorY);
        }
      }
      for (const surf of surfaces) {
        if (surf.stairFlight || surf.stairRamp) continue;
        if (surf.y != null && surf.y < minSupportY) continue;
        // Catwalk / deck — body (or capsule on arena deck pieces) must be over
        // the surface, not just a foot sample on the lip (prevents hovering
        // over stair cutouts; arenaCatwalkDeck allows smooth L-cut seams).
        if (surf.y > floorY + 2 && !elevatedSurfaceSupportsBody(x, z, surf)) {
          continue;
        }
        if (!pointInSurfaceBounds(sx, sz, surf)) continue;
        if (flatSurfaceBlockedByHole(sx, sz, surf.y)) continue;
        if (surf.y <= footY + 0.02) {
          bestAtOrBelow = Math.max(bestAtOrBelow, surf.y);
        } else if (surf.y <= footY + STEP_UP_MAX) {
          bestStepUp = Math.max(bestStepUp, surf.y);
        } else if (
          footY <= surf.y + 0.05 &&
          footY >= surf.y - FLAT_LAND_REACH
        ) {
          bestFallReach = Math.max(bestFallReach, surf.y);
        }
      }
      const ledgeY = sampleColliderLedgeTop(sx, sz, footY, bodyTop, minSupportY);
      if (Number.isFinite(ledgeY)) {
        if (ledgeY <= footY + 0.02) {
          bestAtOrBelow = Math.max(bestAtOrBelow, ledgeY);
        } else if (ledgeY <= footY + STEP_UP_MAX) {
          bestStepUp = Math.max(bestStepUp, ledgeY);
        } else if (
          footY <= ledgeY + 0.05 &&
          footY >= ledgeY - FLAT_LAND_REACH
        ) {
          bestFallReach = Math.max(bestFallReach, ledgeY);
        }
      }
    }
    if (Number.isFinite(bestAtOrBelow)) return bestAtOrBelow;
    if (Number.isFinite(bestStepUp)) return bestStepUp;
    return bestFallReach;
  }

  /** Highest flat surface within step-up reach — used for catwalk transitions. */
  function highestStepUpFlat(x, z, footY) {
    let best = Number.NEGATIVE_INFINITY;
    const bodyTop = footY + eyeHeight;
    const minSupportY = onArenaCatwalkDeck(footY, x, z)
      ? (arenaCatwalkDeckSupportY(x, z) ?? footY) - 0.1
      : Number.NEGATIVE_INFINITY;
    const surfaces = getGroundSurfaces();
    const samples = [
      [0, 0],
      [PLAYER_RADIUS * 0.85, 0],
      [-PLAYER_RADIUS * 0.85, 0],
      [0, PLAYER_RADIUS * 0.85],
      [0, -PLAYER_RADIUS * 0.85],
    ];
    for (const [dx, dz] of samples) {
      const sx = x + dx;
      const sz = z + dz;
      if (hasImplicitFloorSupport(sx, sz) && floorY <= footY + STEP_UP_MAX && footY < floorY + 2) {
        best = Math.max(best, floorY);
      }
      for (const surf of surfaces) {
        if (surf.stairFlight || surf.stairRamp) continue;
        if (surf.y != null && surf.y < minSupportY) continue;
        // Catwalk / deck — body (or capsule on arena deck pieces) must be over
        // the surface, not just a foot sample on the lip.
        if (surf.y > floorY + 2 && !elevatedSurfaceSupportsBody(x, z, surf)) {
          continue;
        }
        if (!pointInSurfaceBounds(sx, sz, surf)) continue;
        if (flatSurfaceBlockedByHole(sx, sz, surf.y)) continue;
        if (surf.y <= footY + STEP_UP_MAX) {
          best = Math.max(best, surf.y);
        }
      }
      const ledgeY = sampleColliderLedgeTop(sx, sz, footY, bodyTop, minSupportY);
      if (Number.isFinite(ledgeY)) {
        best = Math.max(best, ledgeY);
      }
    }
    return best;
  }

  function getSupportInfo(x, z, footY) {
    const rampY = sampleRampSupportY(x, z, footY);
    let bestFlat = bestFlatSupportAt(x, z, footY);
    const stepUpFlat = highestStepUpFlat(x, z, footY);

    let climbLocalMotion = 0;
    for (const surf of getGroundSurfaces()) {
      if (surf.stairFlight) {
        climbLocalMotion = stairClimbLocalMotion(surf.stairFlight);
        break;
      }
    }

    if (
      rampY == null &&
      Number.isFinite(stepUpFlat) &&
      Number.isFinite(bestFlat) &&
      stepUpFlat > bestFlat + 0.01 &&
      footY >= stepUpFlat - STEP_UP_MAX
    ) {
      bestFlat = stepUpFlat;
    }

    if (rampY != null) {
      const deckY =
        Number.isFinite(stepUpFlat) && stepUpFlat > rampY + 0.01
          ? stepUpFlat
          : null;
      if (deckY != null) {
        const canStepToDeck =
          footY >= deckY - STEP_UP_MAX &&
          rampY >= deckY - 0.15 &&
          footY < deckY - 0.01;
        if (canStepToDeck) {
          return finishSupportInfo(x, z, footY, deckY, false, false);
        }

        const rampBelowDeck = rampY < deckY - 0.005;
        const onStairTopFlat =
          !rampBelowDeck && footY >= deckY - 0.08 && footY <= deckY + 0.08;
        if (
          onStairTopFlat &&
          Number.isFinite(stepUpFlat) &&
          stepUpFlat >= deckY - 0.02
        ) {
          return finishSupportInfo(x, z, footY, stepUpFlat, false, false);
        }

        const shouldFollowRamp =
          rampBelowDeck &&
          (footY > rampY + 0.008 || footY >= deckY - 0.04);
        if (shouldFollowRamp) {
          return finishSupportInfo(x, z, footY, rampY, true, true);
        }

        if (footY >= deckY - 0.05 && !rampBelowDeck) {
          return finishSupportInfo(x, z, footY, deckY, false, false);
        }
      }

      const stairLocalZ = sampleStairLocalZ(x, z);
      if (
        stairLocalZ != null &&
        stairLocalZ <= 0.2 &&
        stairLocalZ >= -0.45 &&
        rampY <= floorY + 0.12 &&
        climbLocalMotion <= 0.12 &&
        Number.isFinite(bestFlat) &&
        bestFlat <= floorY + 0.02 &&
        footY <= floorY + 0.1
      ) {
        return finishSupportInfo(x, z, footY, bestFlat, false, false);
      }

      return finishSupportInfo(x, z, footY, rampY, true, true);
    }

    if (!Number.isFinite(bestFlat) && hasImplicitFloorSupport(x, z) && footY <= floorY + FLAT_LAND_REACH) {
      bestFlat = floorY;
    }

    return finishSupportInfo(x, z, footY, bestFlat, false, false);
  }

  function getSupportY(x, z, footY) {
    return getSupportInfo(x, z, footY).supportY;
  }


  /**
   * Does the player have enough vertical clearance at (x, z) to occupy a body
   * of `desiredHeight` standing on `footY`? Returns false when any active
   * bounded collider straddles the desired vertical span AND overlaps the
   * player's XZ circle. Unbounded colliders (full-height walls) are ignored —
   * they're handled by the normal push-out resolver, not the ceiling check.
   *
   * Used to gate stand-up and jump so the player can't uncrouch into the
   * underside of a step / overhang or jump up into one.
   *
   * @param {number} x
   * @param {number} z
   * @param {number} footY
   * @param {number} desiredHeight
   */
  function hasHeadroom(x, z, footY, desiredHeight) {
    const wantTop = footY + desiredHeight;
    for (const box of getColliders()) {
      if (box.active === false) continue;
      if (box.bottomY == null && box.topY == null) continue;
      if (
        box.kind === "stairRearWall" ||
        box.kind === "stairUnderSoffit" ||
        box.kind === "stairSideInner" ||
        box.kind === "stairSideOuter" ||
        box.kind === "stairSideTop" ||
        box.kind === "stairBack" ||
        box.kind === "stairRearCurtain" ||
        box.kind === "stairBackSlice"
      ) {
        continue;
      }
      const bottom = box.bottomY ?? -Infinity;
      const top = box.topY ?? Infinity;
      if (wantTop <= bottom + 0.005) continue;
      if (footY >= top - 0.005) continue;
      if (rotatedBoxOverlapsCircle(box, x, z, PLAYER_RADIUS)) {
        return false;
      }
    }
    return true;
  }

  function resolveColliders() {
    const footY = position.y - eyeHeight;
    const bodyTop = position.y;
    const rampFootY = sampleRawRampFootY(position.x, position.z);
    const supportInfo = getSupportInfo(position.x, position.z, footY);
    const supportY = supportInfo.supportY;
    let climbLocalMotion = 0;
    for (const box of getColliders()) {
      if (box.stairFlight) {
        climbLocalMotion = stairClimbLocalMotion(box.stairFlight);
        break;
      }
    }
    for (const box of getColliders()) {
      if (box.active === false) continue;

      const stairLocal = box.stairFlight
        ? worldToStairLocal(box.stairFlight, position.x, position.z)
        : null;
      const boxClimb = box.stairFlight
        ? stairClimbLocalMotion(box.stairFlight)
        : climbLocalMotion;

      if (
        shouldSkipCollider(
          box,
          footY,
          bodyTop,
          STEP_UP_MAX,
          supportY,
          stairLocal,
          boxClimb,
          rampFootY,
          supportInfo.stairRamp
        )
      ) {
        continue;
      }
      resolveBoxCollider(position, PLAYER_RADIUS, box);
    }
  }

  return {
    update(input, dt) {
      applyMouseLook(input, dt);
      updateArrowLook(input, dt);
      clampLookVelocities();
      applyLookVelocities(dt);
      clampPitch();

      const bindings = getBindings();
      const wantCrouch = isBindingDown(input, bindings, "crouch");
      // Test stand-up clearance from where the player actually is right now —
      // before this frame's eyeHeight lerp / movement integration.
      const headroomFootY = position.y - eyeHeight;
      const canStand = hasHeadroom(
        position.x,
        position.z,
        headroomFootY,
        getStandEyeHeight() + STAND_CLEARANCE_MARGIN
      );
      const forceCrouch = !canStand;
      const crouching = wantCrouch || forceCrouch;
      const wantsSprint =
        isBindingDown(input, bindings, "sprint") && !crouching;
      const standEye = getStandEyeHeight();
      const targetEye = crouching ? standEye * CROUCH_RATIO : standEye;
      eyeHeight += (targetEye - eyeHeight) * (1 - Math.exp(-CROUCH_LERP * dt));

      const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        yaw
      );
      const up = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(forward, up).normalize();

      const aiming = isBindingDown(input, bindings, "aim");

      let moveX = 0;
      let moveZ = 0;
      if (isBindingDown(input, bindings, "forward")) moveZ += 1;
      if (isBindingDown(input, bindings, "backward")) moveZ -= 1;
      if (!aiming && isBindingDown(input, bindings, "strafeLeft")) moveX -= 1;
      if (isBindingDown(input, bindings, "strafeRight")) moveX += 1;

      const moveDir = new THREE.Vector3();
      if (moveX !== 0 || moveZ !== 0) {
        moveDir
          .addScaledVector(right, moveX)
          .addScaledVector(forward, moveZ)
          .normalize();
      }
      const isMoving = moveX !== 0 || moveZ !== 0;

      const staminaMax = Math.max(SPRINT_STAMINA_BASE, getStaminaMax());
      if (staminaMax > lastStaminaMax) {
        stamina = Math.min(staminaMax, stamina + (staminaMax - lastStaminaMax));
      }
      lastStaminaMax = staminaMax;
      stamina = Math.min(stamina, staminaMax);

      isSprinting = wantsSprint && isMoving && stamina > 0.001;

      if (isSprinting) {
        stamina = Math.max(0, stamina - SPRINT_DRAIN_PER_SEC * dt);
      } else {
        stamina = Math.min(
          staminaMax,
          stamina + SPRINT_RECOVER_PER_SEC * dt
        );
      }

      const bobTuning = getWalkBobTuning();
      let speed = crouching
        ? CROUCH_SPEED
        : isSprinting
          ? bobTuning.sprintSpeed
          : bobTuning.walkSpeed;
      if (aiming) speed *= 0.5;

      velocity.x = moveDir.x * speed;
      velocity.z = moveDir.z * speed;

      if (
        grounded &&
        !forceCrouch &&
        wasBindingPressed(input, bindings, "jump")
      ) {
        velocity.y = JUMP_VELOCITY;
        grounded = false;
      }

      velocity.y += GRAVITY * dt;
      position.x += velocity.x * dt;
      resolveColliders();
      resolveBounds();
      position.z += velocity.z * dt;
      resolveColliders();
      resolveBounds();
      position.y += velocity.y * dt;

      const wasGrounded = grounded;
      const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
      const footY = position.y - eyeHeight;
      const supportInfo = getSupportInfo(position.x, position.z, footY);
      const supportY = supportInfo.supportY;
      onStairs = supportInfo.onStairs;
      const groundLevel = supportY + eyeHeight;

      if (supportInfo.stairRamp && wasGrounded && Number.isFinite(supportY)) {
        position.y = groundLevel;
        velocity.y = 0;
        grounded = true;
      } else if (position.y <= groundLevel) {
        const riseNeeded = groundLevel - position.y;
        const isStepUp =
          wasGrounded &&
          riseNeeded > 0.015 &&
          riseNeeded <= STEP_UP_MAX &&
          (horizontalSpeed > 0.15 || riseNeeded <= 0.1);

        if (isStepUp) {
          position.y +=
            riseNeeded * (1 - Math.exp(-bobTuning.stepUpSmooth * dt));
          if (Math.abs(groundLevel - position.y) < 0.002) {
            position.y = groundLevel;
          }
        } else {
          position.y = groundLevel;
        }
        velocity.y = 0;
        grounded = true;
      } else {
        grounded = false;
      }

      if (
        grounded &&
        !onStairs &&
        horizontalSpeed > 0.35 &&
        supportY - prevSupportY > 0.04 &&
        supportY - prevSupportY <= STEP_UP_MAX &&
        !onArenaCatwalkDeck(footY, position.x, position.z) &&
        !onStairSideWalk(footY, position.x, position.z) &&
        prevSupportY <= floorY + 1
      ) {
        // Spring bob fires on one-off curb / wall step-ups for a satisfying
        // weight transfer. It's skipped on stairs because each tread would
        // re-trigger it and stack into a per-step bounce — walkBob's
        // stair-specific amplitude already provides the right rhythm there.
        const stepHeight = supportY - prevSupportY;
        stepBobY = -Math.min(bobTuning.stepDip, stepHeight * 0.22);
        stepBobVel = stepHeight * bobTuning.stepKick;
      }

      if (grounded) {
        prevSupportY = supportY;
      }

      if (onStairs) {
        stepBobY = 0;
        stepBobVel = 0;
      } else {
        const bob = springStepBob(
          stepBobY,
          stepBobVel,
          bobTuning.stepStiffness,
          bobTuning.stepDamping,
          dt
        );
        stepBobY = bob.value;
        stepBobVel = bob.velocity;
      }
      if (!grounded && Math.abs(stepBobY) < 0.0005 && Math.abs(stepBobVel) < 0.0005) {
        stepBobY = 0;
        stepBobVel = 0;
      }

      updateWalkBob(horizontalSpeed, crouching, aiming, dt);

      resolveColliders();
      resolveBounds();
      syncCamera();
    },

    getHorizontalSpeed() {
      return Math.hypot(velocity.x, velocity.z);
    },

    getStamina() {
      return stamina;
    },

    getStaminaMax() {
      return Math.max(SPRINT_STAMINA_BASE, getStaminaMax());
    },

    isSprinting() {
      return isSprinting;
    },

    isOnStairs() {
      return onStairs;
    },

    /** Current camera-relative Y of the player's eyes (= world Y of the camera). */
    getY() {
      return position.y;
    },

    getX() {
      return position.x;
    },

    getZ() {
      return position.z;
    },

    getFootY() {
      return position.y - eyeHeight;
    },

    getEyeHeight() {
      return eyeHeight;
    },

    /**
     * Reset the player to the spawn point and zero out velocity / step-bob /
     * stair state. Called from the death-fall handler when the player drops
     * below the world's kill threshold.
     */
    respawn() {
      position.copy(initialPosition);
      velocity.set(0, 0, 0);
      yaw = initialYaw;
      pitch = 0;
      eyeHeight = getStandEyeHeight();
      grounded = true;
      onStairs = false;
      prevSupportY = floorY;
      stepBobY = 0;
      stepBobVel = 0;
      walkBobPhase = 0;
      walkBobY = 0;
      walkBobPitch = 0;
      walkBobRoll = 0;
      walkBobActivity = 0;
      stamina = SPRINT_STAMINA_BASE;
      isSprinting = false;
      lastStaminaMax = getStaminaMax();
      arrowLookVel.yaw = 0;
      arrowLookVel.pitch = 0;
      mouseLookVel.yaw = 0;
      mouseLookVel.pitch = 0;
      syncCamera();
    },

    /** Nudge aim upward so the player must re-center (strength 0–1). */
    addAimRecoil(strength = 1) {
      const s = Math.max(0, strength);
      pitch += AIM_RECOIL_PITCH * s * (0.85 + Math.random() * 0.3);
      yaw += (Math.random() - 0.5) * 2 * AIM_RECOIL_YAW * s;
      clampPitch();
      syncCamera();
    },

    /** Horizontal look angle (rad); 0 = facing world −Z (north). */
    getYaw() {
      return yaw;
    },

    getAimDirection() {
      return new THREE.Vector3(0, 0, -1)
        .applyQuaternion(camera.quaternion)
        .normalize();
    },

    getShootRay(origin) {
      const from = origin ?? camera.position;
      return new THREE.Raycaster(from.clone(), this.getAimDirection());
    },

    /** Dev overlay — walk clamp, deck pieces, and colliders blocking movement right now. */
    getMovementDebugSnapshot() {
      const footY = position.y - eyeHeight;
      const bodyTop = position.y;
      const x = position.x;
      const z = position.z;
      const walk = computeResolvedWalkBounds(x, z, footY);
      const rampFootY = sampleRawRampFootY(x, z);
      const supportInfo = getSupportInfo(x, z, footY);
      const supportY = supportInfo.supportY;

      let climbLocalMotion = 0;
      for (const box of getColliders()) {
        if (box.stairFlight) {
          climbLocalMotion = stairClimbLocalMotion(box.stairFlight);
          break;
        }
      }

      /** @type {import("./Collision.js").ColliderBox[]} */
      const blockingColliders = [];
      for (const box of getColliders()) {
        if (box.active === false) continue;
        if (!rotatedBoxOverlapsCircle(box, x, z, PLAYER_RADIUS)) continue;
        const stairLocal = box.stairFlight
          ? worldToStairLocal(box.stairFlight, x, z)
          : null;
        const boxClimb = box.stairFlight
          ? stairClimbLocalMotion(box.stairFlight)
          : climbLocalMotion;
        if (
          shouldSkipCollider(
            box,
            footY,
            bodyTop,
            STEP_UP_MAX,
            supportY,
            stairLocal,
            boxClimb,
            rampFootY,
            supportInfo.stairRamp
          )
        ) {
          continue;
        }
        blockingColliders.push(box);
      }

      const ySlack = 0.15;
      const deckPieces = [];
      for (const surf of getGroundSurfaces()) {
        if (!surf.arenaCatwalkDeck || surf.y == null) continue;
        if (Math.abs(surf.y - footY) > ySlack) continue;
        deckPieces.push({
          minX: surf.minX,
          maxX: surf.maxX,
          minZ: surf.minZ,
          maxZ: surf.maxZ,
          y: surf.y,
        });
      }

      return {
        footY,
        walkClamp: {
          minX: walk.minX,
          maxX: walk.maxX,
          minZ: walk.minZ,
          maxZ: walk.maxZ,
        },
        catwalkUnion: walk.catwalkBounds,
        onArenaDeck: onArenaCatwalkDeck(footY, x, z),
        blockingColliders,
        deckPieces,
      };
    },
  };
}
