"use client";

import { useEffect, useState } from "react";
import AudioSpectrumViz from "@/components/AudioSpectrumViz";

const SKELETON_BARS = 20;

function LoadingAudioVizSkeleton() {
  return (
    <div className="loadingAudioVizSkeleton" aria-hidden="true">
      <div className="loadingAudioVizSkeletonBars">
        {Array.from({ length: SKELETON_BARS }, (_, i) => (
          <span
            key={i}
            className="loadingAudioVizSkeletonBar"
            style={{ animationDelay: `${i * 0.08}s` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function LoadingAudioViz({
  getAnalyser,
  getBeatAnalyser,
  isMusicPreloaded,
  isLoadingMusicPlaying,
  musicEnabled,
  onMusicEnabledChange,
  active,
}) {
  const [vizLive, setVizLive] = useState(false);

  useEffect(() => {
    if (!active || !musicEnabled) {
      setVizLive(false);
      return;
    }

    let rafId = 0;
    const tick = () => {
      const live =
        !!isMusicPreloaded?.() &&
        !!getAnalyser?.() &&
        !!isLoadingMusicPlaying?.();
      setVizLive((prev) => (prev === live ? prev : live));
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [
    active,
    musicEnabled,
    getAnalyser,
    isMusicPreloaded,
    isLoadingMusicPlaying,
  ]);

  return (
    <div className="loadingAudioBar">
      <div className="loadingAudioVizHeader">
        <label className="loadingMusicToggle">
          <input
            type="checkbox"
            checked={musicEnabled}
            onChange={(e) => {
              e.stopPropagation();
              onMusicEnabledChange?.(e.target.checked);
            }}
          />
          Music
        </label>
      </div>
      <div className="loadingAudioVizWrap">
        {vizLive ? (
          <AudioSpectrumViz
            getAnalyser={getAnalyser}
            getBeatAnalyser={getBeatAnalyser}
            musicEnabled={musicEnabled}
            active={active}
            resetKey="loading"
            canvasClassName="loadingAudioViz"
            synthFallback={false}
          />
        ) : musicEnabled ? (
          <LoadingAudioVizSkeleton />
        ) : (
          <div className="loadingAudioVizIdle" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
