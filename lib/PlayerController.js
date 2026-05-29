import * as THREE from "three";
import { isBindingDown, wasBindingPressed } from "./KeyBindings.js";
import {
  clampStairUnderForward,
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
  let footstepDistance = 0;
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
    if (onFootstep && canStep) {
      const strideLength = onStairs
        ? STAIRS_STEP_RUN * 2 * stairWalk.footstepStrideScale
        : (() => {
            const cycleHz =
              t.walkFreqBase + horizontalSpeed * t.walkFreqPerSpeed;
            const halfCycleSec = 1 / (2 * Math.max(cycleHz, 0.5));
            let stride = horizontalSpeed * halfCycleSec;
            if (crouching) stride *= 0.82;
            return Math.max(stride, 0.35);
          })();

      footstepDistance += horizontalSpeed * dt;
      while (footstepDistance >= strideLength) {
        footstepDistance -= strideLength;
        onFootstep({
          speed: horizontalSpeed,
          crouching,
          sprinting: isSprinting,
          onStairs,
        });
      }
    } else {
      footstepDistance = 0;
    }

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

    walkBobPhase += dt * bobFreq * Math.PI * 2 * walkBobActivity;

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

  function resolveBounds() {
    const r = PLAYER_RADIUS;
    let minX = bounds.minX + r;
    let maxX = bounds.maxX - r;
    let minZ = bounds.minZ + r;
    let maxZ = bounds.maxZ - r;

    if (arenaBounds) {
      const inRoom = getIsInRoom(position.x, position.z);
      if (!inRoom) {
        minX = Math.max(minX, arenaBounds.minX + r);
        maxX = Math.min(maxX, arenaBounds.maxX - r);

        const inPassage = pointInDoorwayPassage(
          position.x,
          position.z,
          getDoorwayPassages()
        );
        const attachWall = getAttachWall();

        if (attachWall === "south") {
          minZ = Math.max(minZ, arenaBounds.minZ + r);
          if (!inPassage) {
            maxZ = Math.min(maxZ, arenaBounds.maxZ - r);
          }
        } else {
          if (!inPassage) {
            minZ = Math.max(minZ, arenaBounds.minZ + r);
          }
          maxZ = Math.min(maxZ, arenaBounds.maxZ - r);
        }
      }
    }

    position.x = THREE.MathUtils.clamp(position.x, minX, maxX);
    position.z = THREE.MathUtils.clamp(position.z, minZ, maxZ);
  }

  function worldToStairLocal(stairFlight, x, z) {
    stairLocalScratch.set(x, 0, z);
    stairLocalScratch.applyMatrix4(stairFlight.inverseMatrix);
    return { localX: stairLocalScratch.x, localZ: stairLocalScratch.z };
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

  /** Sample support under the whole foot circle — center-only checks miss edges at walls. */
  function bestFlatSupportAt(x, z, footY) {
    let bestAtOrBelow = Number.NEGATIVE_INFINITY;
    let bestStepUp = Number.NEGATIVE_INFINITY;
    let bestFallReach = Number.NEGATIVE_INFINITY;
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
        if (floorY <= footY + 0.02) {
          bestAtOrBelow = Math.max(bestAtOrBelow, floorY);
        } else if (floorY <= footY + STEP_UP_MAX) {
          bestStepUp = Math.max(bestStepUp, floorY);
        } else if (footY <= floorY + 0.05 && footY >= floorY - FLAT_LAND_REACH) {
          bestFallReach = Math.max(bestFallReach, floorY);
        }
      }
      for (const surf of surfaces) {
        if (surf.stairFlight || surf.stairRamp) continue;
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
    }
    if (Number.isFinite(bestAtOrBelow)) return bestAtOrBelow;
    if (Number.isFinite(bestStepUp)) return bestStepUp;
    return bestFallReach;
  }

  /** Highest flat surface within step-up reach — used for catwalk transitions. */
  function highestStepUpFlat(x, z, footY) {
    let best = Number.NEGATIVE_INFINITY;
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
      if (hasImplicitFloorSupport(sx, sz) && floorY <= footY + STEP_UP_MAX) {
        best = Math.max(best, floorY);
      }
      for (const surf of surfaces) {
        if (surf.stairFlight || surf.stairRamp) continue;
        if (!pointInSurfaceBounds(sx, sz, surf)) continue;
        if (flatSurfaceBlockedByHole(sx, sz, surf.y)) continue;
        if (surf.y <= footY + STEP_UP_MAX) {
          best = Math.max(best, surf.y);
        }
      }
    }
    return best;
  }

  function getSupportInfo(x, z, footY) {
    const rampY = sampleRampSupportY(x, z, footY);
    let bestFlat = bestFlatSupportAt(x, z, footY);
    const stepUpFlat = highestStepUpFlat(x, z, footY);

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
          return { supportY: deckY, onStairs: false, stairRamp: false };
        }

        const rampBelowDeck = rampY < deckY - 0.005;
        const shouldFollowRamp =
          rampBelowDeck &&
          (footY > rampY + 0.008 || footY >= deckY - 0.04);
        if (shouldFollowRamp) {
          return { supportY: rampY, onStairs: true, stairRamp: true };
        }

        if (footY >= deckY - 0.05 && !rampBelowDeck) {
          return { supportY: deckY, onStairs: false, stairRamp: false };
        }
      }

      return { supportY: rampY, onStairs: true, stairRamp: true };
    }

    if (!Number.isFinite(bestFlat) && hasImplicitFloorSupport(x, z)) {
      bestFlat = floorY;
    }

    return { supportY: bestFlat, onStairs: false, stairRamp: false };
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

  function stairClimbLocalMotion(stairFlight) {
    const speed = Math.hypot(velocity.x, velocity.z);
    if (speed < 0.05) return 0;
    const yawRad = stairFlight.rotationY ?? 0;
    return (
      (velocity.x * Math.sin(yawRad) + velocity.z * Math.cos(yawRad)) / speed
    );
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
        : 0;

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
          supportInfo.stairRamp,
          floorY
        )
      ) {
        continue;
      }
      resolveBoxCollider(position, PLAYER_RADIUS, box);
    }
    clampStairUnderForward(
      position,
      PLAYER_RADIUS,
      getColliders(),
      footY,
      bodyTop,
      floorY,
      climbLocalMotion,
      rampFootY,
      supportInfo.stairRamp,
      supportY,
      worldToStairLocal,
      stairLocalScratch
    );
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
          horizontalSpeed > 0.35;

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
        supportY - prevSupportY <= STEP_UP_MAX
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
      footstepDistance = 0;
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
  };
}
