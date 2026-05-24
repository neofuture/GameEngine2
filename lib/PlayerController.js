import * as THREE from "three";
import { isBindingDown, wasBindingPressed } from "./KeyBindings.js";
import {
  resolveBoxCollider,
  shouldSkipCollider,
} from "./Collision.js";
import { STAIRS_STEP_RUN } from "./LevelStairs.js";
import { DEFAULT_WALK_BOB_SIMPLE, resolveWalkBobTuning } from "./WalkBobTuning.js";

const MOUSE_SENS_BASE = 0.0022;
const ARROW_MAX_SPEED_BASE = 2.2;
const ARROW_ACCEL_BASE = 5.6;
const MOUSE_ACCEL_BASE = 5.6;
const LOOK_DAMP = 5.5;

const WALK_SPEED = 5;
const SPRINT_SPEED = 9;
const CROUCH_SPEED = 2.5;
const GRAVITY = -22;
const JUMP_VELOCITY = 8.5;
const STAND_EYE = 1.65;
const CROUCH_EYE = 0.85;
const CROUCH_LERP = 12;
const PLAYER_RADIUS = 0.35;

/** @typedef {{ minX: number, maxX: number, minZ: number, maxZ: number, y: number }} GroundSurface */

export function createPlayerController(camera, bounds, floorY, options = {}) {
  const colliders = options.colliders ?? [];
  /** @type {GroundSurface[]} */
  const groundSurfaces = options.groundSurfaces ?? [];
  const getGroundSurfaces =
    options.getGroundSurfaces ?? (() => groundSurfaces);
  const getColliders = options.getColliders ?? (() => colliders);
  const STEP_UP_MAX = 0.42;
  const getInvertYLook = options.getInvertYLook ?? (() => false);
  const getKeyboardLookSpeed = options.getKeyboardLookSpeed ?? (() => 7);
  const getKeyboardLookEase = options.getKeyboardLookEase ?? (() => 7);
  const getMouseLookSpeed = options.getMouseLookSpeed ?? (() => 7);
  const getMouseLookEase = options.getMouseLookEase ?? (() => 7);
  /** Max look velocity in rad/s (caps quick mouse flicks and arrow spam). */
  const getMaxLookRate = options.getMaxLookRate ?? (() => 8);
  const getBindings = options.getBindings ?? (() => ({}));
  const getWalkBobTuning =
    options.getWalkBobTuning ??
    (() => resolveWalkBobTuning(DEFAULT_WALK_BOB_SIMPLE));
  const position = new THREE.Vector3(0, STAND_EYE, 6);
  const velocity = new THREE.Vector3();
  const stairLocalScratch = new THREE.Vector3();
  let yaw = 0;
  let pitch = 0;
  let eyeHeight = STAND_EYE;
  let grounded = true;
  let prevSupportY = floorY;
  let stepBobY = 0;
  let stepBobVel = 0;
  let walkBobPhase = 0;
  let walkBobY = 0;
  let walkBobPitch = 0;
  let walkBobRoll = 0;
  let walkBobActivity = 0;
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
    if (!input.isLocked()) return;

    const mouseSens = MOUSE_SENS_BASE * getMouseLookSpeed();
    const mousePitchSign = getInvertYLook() ? -1 : 1;
    const mouseAccel = MOUSE_ACCEL_BASE / getMouseLookEase();
    const invDt = 1 / Math.max(dt, 0.001);

    const targetYaw = dx * mouseSens * invDt;
    const targetPitch = dy * mouseSens * mousePitchSign * invDt;

    const ease = 1 - Math.exp(-mouseAccel * dt);
    mouseLookVel.yaw += (targetYaw - mouseLookVel.yaw) * ease;
    mouseLookVel.pitch += (targetPitch - mouseLookVel.pitch) * ease;

    const damp = Math.exp(-LOOK_DAMP * dt);
    if (dx === 0) mouseLookVel.yaw *= damp;
    if (dy === 0) mouseLookVel.pitch *= damp;

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
    const fade = Math.exp(-10 * dt);
    const bobEase = 1 - Math.exp(-t.walkSmooth * dt);
    const moving = horizontalSpeed > 0.15;
    const airborne = !grounded && velocity.y > 0.35;
    const activityTarget = moving && !airborne ? 1 : 0;

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
      horizontalSpeed / WALK_SPEED,
      0.4,
      1.2
    );
    const crouchFactor = crouching ? 0.55 : 1;
    const aimFactor = aiming ? 0.45 : 1;
    const intensity = speedFactor * crouchFactor * aimFactor * walkBobActivity;

    const bobFreq = onStairs
      ? Math.max(2.1, horizontalSpeed / STAIRS_STEP_RUN)
      : t.walkFreqBase + horizontalSpeed * t.walkFreqPerSpeed;
    walkBobPhase += dt * bobFreq * Math.PI * 2 * walkBobActivity;

    const amp =
      (onStairs ? t.walkAmpStairs : t.walkAmp) * intensity;

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
    position.x = THREE.MathUtils.clamp(
      position.x,
      bounds.minX + PLAYER_RADIUS,
      bounds.maxX - PLAYER_RADIUS
    );
    position.z = THREE.MathUtils.clamp(
      position.z,
      bounds.minZ + PLAYER_RADIUS,
      bounds.maxZ - PLAYER_RADIUS
    );
  }

  function worldToStairLocal(stairFlight, x, z) {
    stairLocalScratch.set(x, 0, z);
    stairLocalScratch.applyMatrix4(stairFlight.inverseMatrix);
    return { localX: stairLocalScratch.x, localZ: stairLocalScratch.z };
  }

  /**
   * Stair surfaces behave like normal floor patches — a tread is just a thin
   * rectangle in the flight's local frame, plus a player-radius approach zone
   * in front of it so support stays continuous between treads.
   *
   *   - "standing": the tread is at-or-below the player's foot within step-up
   *     range, so it can hold us up. Picking the highest such tread covers
   *     walking, stopping, and stepping down to a lower tread.
   *   - "stepUp": the tread is above us within step-up range and we're moving
   *     forward — climb onto it.
   *
   * Each tread is independent, so the player can stop on any one. Stairs
   * never pull you upward unless the tread is physically beside your feet.
   */
  function classifyStairSurface(x, z, footY, surf, allowStepUp) {
    const { localX, localZ } = worldToStairLocal(surf.stairFlight, x, z);
    const halfX = surf.halfX + 0.05;
    if (Math.abs(localX - surf.localX) > halfX) return null;

    const treadZ = surf.treadLocalZ ?? surf.localZ;
    const treadFront = treadZ - surf.halfZ;
    const treadRear = treadZ + surf.halfZ;
    const approachBack = treadFront - PLAYER_RADIUS - 0.05;
    if (localZ > treadRear || localZ < approachBack) return null;

    if (surf.y <= footY + 0.08 && surf.y >= footY - STEP_UP_MAX) {
      return "standing";
    }

    if (
      allowStepUp &&
      surf.y > footY + 0.08 &&
      surf.y <= footY + STEP_UP_MAX
    ) {
      return "stepUp";
    }

    return null;
  }

  function pointOnFlatSurface(x, z, footY, surf) {
    return (
      x >= surf.minX &&
      x <= surf.maxX &&
      z >= surf.minZ &&
      z <= surf.maxZ &&
      surf.y <= footY + STEP_UP_MAX
    );
  }

  function getSupportInfo(x, z, footY, horizontalSpeed = 0) {
    const allowStepUp = horizontalSpeed > 0.35 && grounded;
    let bestFlat = floorY;
    let currentTreadY = null;
    let nextStepUpY = null;
    let sawStairs = false;

    for (const surf of getGroundSurfaces()) {
      if (surf.stairFlight) {
        const hit = classifyStairSurface(x, z, footY, surf, allowStepUp);
        if (hit == null) continue;
        sawStairs = true;
        if (hit === "standing") {
          if (currentTreadY == null || surf.y > currentTreadY) {
            currentTreadY = surf.y;
          }
        } else if (hit === "stepUp") {
          if (nextStepUpY == null || surf.y < nextStepUpY) {
            nextStepUpY = surf.y;
          }
        }
      } else if (pointOnFlatSurface(x, z, footY, surf)) {
        if (surf.y >= bestFlat) bestFlat = surf.y;
      }
    }

    // When the player is on a tread but is already inside the next tread's
    // approach zone (treads are deeper than the player radius), advance to
    // the next one — otherwise the next tread's solid box stays in front of
    // the player and blocks them from climbing, which made stairs unwalkable.
    // We only advance when the next surface is genuinely a step *up* and
    // within the step-up budget so we never get yanked to a far-away tread.
    if (currentTreadY != null) {
      if (
        nextStepUpY != null &&
        nextStepUpY > currentTreadY + 0.015 &&
        nextStepUpY - currentTreadY <= STEP_UP_MAX
      ) {
        return { supportY: nextStepUpY, onStairs: true };
      }
      return { supportY: currentTreadY, onStairs: true };
    }

    if (nextStepUpY != null) {
      return { supportY: nextStepUpY, onStairs: true };
    }

    return { supportY: bestFlat, onStairs: sawStairs };
  }

  function getSupportY(x, z, footY) {
    return getSupportInfo(x, z, footY).supportY;
  }


  function resolveColliders() {
    const footY = position.y - eyeHeight;
    const bodyTop = position.y;
    const supportY = getSupportY(position.x, position.z, footY);
    for (const box of getColliders()) {
      if (box.active === false) continue;

      const stairLocal = box.stairFlight
        ? worldToStairLocal(box.stairFlight, position.x, position.z)
        : null;

      if (
        shouldSkipCollider(
          box,
          footY,
          bodyTop,
          STEP_UP_MAX,
          supportY,
          stairLocal
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
      const crouching = isBindingDown(input, bindings, "crouch");
      const sprinting = isBindingDown(input, bindings, "sprint") && !crouching;
      const targetEye = crouching ? CROUCH_EYE : STAND_EYE;
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

      let speed = crouching
        ? CROUCH_SPEED
        : sprinting
          ? SPRINT_SPEED
          : WALK_SPEED;
      if (aiming) speed *= 0.5;

      velocity.x = moveDir.x * speed;
      velocity.z = moveDir.z * speed;

      if (grounded && wasBindingPressed(input, bindings, "jump")) {
        velocity.y = JUMP_VELOCITY;
        grounded = false;
      }

      velocity.y += GRAVITY * dt;
      position.x += velocity.x * dt;
      position.z += velocity.z * dt;
      position.y += velocity.y * dt;

      const wasGrounded = grounded;
      const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
      const bobTuning = getWalkBobTuning();
      const footY = position.y - eyeHeight;
      const supportInfo = getSupportInfo(
        position.x,
        position.z,
        footY,
        horizontalSpeed
      );
      const supportY = supportInfo.supportY;
      onStairs = supportInfo.onStairs;
      const groundLevel = supportY + eyeHeight;

      if (position.y <= groundLevel) {
        const riseNeeded = groundLevel - position.y;
        const isStepUp =
          wasGrounded &&
          riseNeeded > 0.015 &&
          riseNeeded <= STEP_UP_MAX &&
          horizontalSpeed > 0.35;

        if (isStepUp) {
          position.y +=
            riseNeeded * (1 - Math.exp(-bobTuning.stepUpSmooth * dt));
          if (groundLevel - position.y < 0.002) {
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
        horizontalSpeed > 0.35 &&
        supportY - prevSupportY > 0.04 &&
        supportY - prevSupportY <= STEP_UP_MAX
      ) {
        const stepHeight = supportY - prevSupportY;
        stepBobY = -Math.min(bobTuning.stepDip, stepHeight * 0.22);
        stepBobVel = stepHeight * bobTuning.stepKick;
      }

      if (grounded) {
        prevSupportY = supportY;
      }

      const bob = springStepBob(
        stepBobY,
        stepBobVel,
        bobTuning.stepStiffness,
        bobTuning.stepDamping,
        dt
      );
      stepBobY = bob.value;
      stepBobVel = bob.velocity;
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

    isOnStairs() {
      return onStairs;
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
