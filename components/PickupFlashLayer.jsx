"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import pickupPreviewEngine from "@/lib/PickupPreviewEngine";

const PICKUP_DISPLAY_MS = 2000;
const PICKUP_FADE_MS = 550;

function getPickupLabel(type) {
  if (type === "ammo") return "10 Ammo Rounds";
  if (type === "grenade") return "+1 Grenade";
  return "10 Hit Points";
}

function PickupOverlay({ type, flashId, onRemove }) {
  const containerRef = useRef(null);
  const onRemoveRef = useRef(onRemove);
  const [phase, setPhase] = useState("enter");
  const [gone, setGone] = useState(false);

  onRemoveRef.current = onRemove;

  useEffect(() => {
    const frameId = requestAnimationFrame(() => setPhase("visible"));
    const hideTimer = setTimeout(() => setPhase("exit"), PICKUP_DISPLAY_MS);
    const removeTimer = setTimeout(() => {
      setGone(true);
      onRemoveRef.current(flashId);
    }, PICKUP_DISPLAY_MS + PICKUP_FADE_MS);
    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(hideTimer);
      clearTimeout(removeTimer);
    };
  }, [flashId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const canvas = document.createElement("canvas");
    el.appendChild(canvas);
    pickupPreviewEngine.add(flashId, type, canvas);

    return () => {
      pickupPreviewEngine.remove(flashId);
      canvas.remove();
    };
  }, [flashId, type]);

  if (gone) return null;

  return (
    <div
      className={`pickupOverlayCard pickupOverlayCard--${phase}`}
      aria-hidden="true"
    >
      <div className="pickupOverlay3DLabel">{getPickupLabel(type)}</div>
      <div ref={containerRef} className="pickupOverlay3DCanvas" />
    </div>
  );
}

const PickupFlashLayer = forwardRef(function PickupFlashLayer(_props, ref) {
  const [flashes, setFlashes] = useState([]);
  const idRef = useRef(0);

  const removeFlash = useCallback((flashId) => {
    setFlashes((prev) => prev.filter((p) => p.id !== flashId));
  }, []);

  useImperativeHandle(ref, () => ({
    show(type) {
      const id = ++idRef.current;
      setFlashes((prev) => [...prev, { id, type }]);
    },
  }));

  if (flashes.length === 0) return null;

  return (
    <div
      className={`pickupOverlayRow${
        flashes.length === 1 ? " pickupOverlayRow--single" : " pickupOverlayRow--multi"
      }`}
      aria-hidden="true"
    >
      {flashes.map((flash) => (
        <PickupOverlay
          key={flash.id}
          flashId={flash.id}
          type={flash.type}
          onRemove={removeFlash}
        />
      ))}
    </div>
  );
});

export default PickupFlashLayer;
