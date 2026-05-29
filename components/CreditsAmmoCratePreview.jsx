"use client";

import { useEffect, useRef } from "react";
import { mountCreditsAmmoCratePreview } from "@/lib/CreditsAmmoCratePreview";

export default function CreditsAmmoCratePreview({ variant = "default", className = "" }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cleanup = () => {};
    let cancelled = false;

    mountCreditsAmmoCratePreview(canvas, { variant }).then((dispose) => {
      if (cancelled) dispose();
      else cleanup = dispose;
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [variant]);

  return (
    <canvas
      ref={canvasRef}
      className={`creditsAmmoCrateCanvas${className ? ` ${className}` : ""}`}
    />
  );
}
