import { getShootCodes } from "./KeyBindings.js";

export function createInput(canvas, getBindings) {
  const keys = new Set();
  const justPressed = new Set();
  let pointerLocked = false;
  let mouseDeltaX = 0;
  let mouseDeltaY = 0;
  let shootPressed = false;
  let shootJustPressed = false;

  function shootCodes() {
    return getBindings ? getShootCodes(getBindings()) : ["Enter"];
  }

  const onKeyDown = (e) => {
    if (e.repeat) return;
    if (!keys.has(e.code)) justPressed.add(e.code);
    keys.add(e.code);
    if (shootCodes().includes(e.code)) {
      shootJustPressed = true;
      shootPressed = true;
    }
  };

  const onKeyUp = (e) => {
    keys.delete(e.code);
    if (shootCodes().includes(e.code)) shootPressed = false;
  };

  const onMouseMove = (e) => {
    if (!pointerLocked) return;
    mouseDeltaX += e.movementX;
    mouseDeltaY += e.movementY;
  };

  const onMouseDown = (e) => {
    if (e.button === 0 && pointerLocked) {
      shootJustPressed = true;
      shootPressed = true;
    }
  };

  const onMouseUp = (e) => {
    if (e.button === 0) shootPressed = false;
  };

  function resetAllInput() {
    keys.clear();
    justPressed.clear();
    shootPressed = false;
    shootJustPressed = false;
    mouseDeltaX = 0;
    mouseDeltaY = 0;
  }

  const onPointerLockChange = () => {
    const wasLocked = pointerLocked;
    pointerLocked = document.pointerLockElement === canvas;
    if (!wasLocked && pointerLocked) {
      shootJustPressed = false;
      shootPressed = false;
    }
    if (wasLocked && !pointerLocked) {
      // Pointer was released (typically via Escape) — drop any held inputs so
      // the player isn't still walking / sprinting / aiming once focus leaves
      // the canvas. Physical keyup events won't fire if they release the keys
      // outside the window.
      resetAllInput();
    }
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp);
  document.addEventListener("pointerlockchange", onPointerLockChange);

  return {
    requestPointerLock() {
      canvas.requestPointerLock();
    },
    isLocked() {
      return pointerLocked;
    },
    isDown(code) {
      return keys.has(code);
    },
    wasPressed(code) {
      return justPressed.has(code);
    },
    consumeShoot() {
      const v = shootJustPressed;
      shootJustPressed = false;
      return v;
    },
    isShootHeld() {
      return shootPressed;
    },
    getMouseDelta() {
      const dx = mouseDeltaX;
      const dy = mouseDeltaY;
      mouseDeltaX = 0;
      mouseDeltaY = 0;
      return { dx, dy };
    },
    endFrame() {
      justPressed.clear();
    },
    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
    },
  };
}
