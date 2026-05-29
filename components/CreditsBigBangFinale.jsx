"use client";

import { useEffect, useRef } from "react";
import { mountCreditsFinalePreview } from "@/lib/CreditsFinalePreview";

const BURST_COUNT = 24;

export default function CreditsBigBangFinale({ titleRef }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cleanup = () => {};
    let cancelled = false;

    mountCreditsFinalePreview(canvas).then((dispose) => {
      if (cancelled) dispose();
      else cleanup = dispose;
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  return (
    <div className="creditsBigBang" aria-hidden>
      <div className="creditsBigBangGlow" />
      <div className="creditsBigBangRing creditsBigBangRing--1" />
      <div className="creditsBigBangRing creditsBigBangRing--2" />
      <div className="creditsBigBangRing creditsBigBangRing--3" />

      <div className="creditsBigBangBursts">
        {Array.from({ length: BURST_COUNT }, (_, i) => (
          <span
            key={i}
            className="creditsBigBangBurst"
            style={{ "--burst-i": i, "--burst-n": BURST_COUNT }}
          />
        ))}
      </div>

      <div className="creditsBigBangStage">
        <canvas ref={canvasRef} className="creditsFinaleCanvas" />
        <div className="creditsBigBangText">
          <p className="creditsBigBangPre">VX-27</p>
          <h2 ref={titleRef} className="creditsBigBangTitle">
            THE END
          </h2>
          <p className="creditsBigBangName">Carl Fearby</p>
          <p className="creditsBigBangTag">Thanks for playing · Now go touch grass</p>
        </div>
      </div>
    </div>
  );
}
