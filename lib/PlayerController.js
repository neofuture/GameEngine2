import * as THREE from "three";
import { isBindingDown, wasBindingPressed } from "./KeyBindings.js";

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

export function createPlayerController(camera, bounds, floorY, options = {}) {
  const colliders = options.colliders ?? [];
  const getInvertYLook = options.getInvertYLook ?? (() => false);
  const getKeyboardLookSpeed = options.getKeyboardLookSpeed ?? (() => 7);
  const getKeyboardLookEase = options.getKeyboardLookEase ?? (() => 7);
  const getMouseLookSpeed = options.getMouseLookSpeed ?? (() => 7);
  const getMouseLookEase = options.getMouseLookEase ?? (() => 7);
  /** Max look velocity in rad/s (caps quick mouse flicks and arrow spam). */
  const getMaxLookRate = options.getMaxLookRate ?? (() => 8);
  const getBindings = options.getBindings ?? (() => ({}));
  const position = new THREE.Vector3(0, STAND_EYE, 6);
  const velocity = new THREE.Vector3();
  let yaw = 0;
  let pitch = 0;
  let eyeHeight = STAND_EYE;
  let grounded = true;
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
    camera.position.set(position.x, position.y, position.z);
    const euler = new THREE.Euler(pitch, yaw, 0, "YXZ");
    camera.quaternion.setFromEuler(euler);
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

  function resolveColliders() {
    for (const box of colliders) {
      if (box.active === false) continue;
      const dx = position.x - box.x;
      const dz = position.z - box.z;

      if (Math.abs(dx) < box.halfX && Math.abs(dz) < box.halfZ) {
        const pushLeft = dx + box.halfX + PLAYER_RADIUS;
        const pushRight = box.halfX - dx + PLAYER_RADIUS;
        const pushBack = dz + box.halfZ + PLAYER_RADIUS;
        const pushForward = box.halfZ - dz + PLAYER_RADIUS;
        const min = Math.min(pushLeft, pushRight, pushBack, pushForward);
        if (min === pushLeft) position.x -= pushLeft;
        else if (min === pushRight) position.x += pushRight;
        else if (min === pushBack) position.z -= pushBack;
        else position.z += pushForward;
        continue;
      }

      const closestX = THREE.MathUtils.clamp(dx, -box.halfX, box.halfX);
      const closestZ = THREE.MathUtils.clamp(dz, -box.halfZ, box.halfZ);
      const diffX = dx - closestX;
      const diffZ = dz - closestZ;
      const distSq = diffX * diffX + diffZ * diffZ;
      const rSq = PLAYER_RADIUS * PLAYER_RADIUS;
      if (distSq >= rSq) continue;

      if (distSq < 1e-10) continue;

      const dist = Math.sqrt(distSq);
      const push = (PLAYER_RADIUS - dist) / dist;
      position.x += diffX * push;
      position.z += diffZ * push;
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

      const groundLevel = floorY + eyeHeight;
      if (position.y <= groundLevel) {
        position.y = groundLevel;
        velocity.y = 0;
        grounded = true;
      } else {
        grounded = false;
      }

      resolveColliders();
      resolveBounds();
      syncCamera();
    },

    getHorizontalSpeed() {
      return Math.hypot(velocity.x, velocity.z);
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
