"use client";

import { useEffect, useRef } from "react";
import { mountCreditsRiflePreview } from "@/lib/CreditsRiflePreview";

export default function CreditsRiflePreview({ variant = "hero", className = "" }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cleanup = () => {};
    let cancelled = false;

    mountCreditsRiflePreview(canvas, { variant }).then((dispose) => {
      if (cancelled) dispose();
      else cleanup = dispose;
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [variant]);

  return (
    <div
      className={`creditsRifleFrame creditsRifleFrame--${variant}${className ? ` ${className}` : ""}`}
      aria-hidden
    >
      <canvas ref={canvasRef} className="creditsRifleCanvas" />
    </div>
  );
}
