"use client";

import { useEffect, useState } from "react";
import AudioSpectrumViz from "@/components/AudioSpectrumViz";

const SKELETON_BARS = 14;

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
  tracks,
  selectedTrackId,
  onTrackSelect,
  getAnalyser,
  getBeatAnalyser,
  isMusicPreloaded,
  isLoadingMusicPlaying,
  musicEnabled,
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
    selectedTrackId,
    getAnalyser,
    isMusicPreloaded,
    isLoadingMusicPlaying,
  ]);

  return (
    <div className="loadingAudioBar">
      <div className="loadingAudioVizWrap loadingAudioVizHalf">
        {vizLive ? (
          <AudioSpectrumViz
            getAnalyser={getAnalyser}
            getBeatAnalyser={getBeatAnalyser}
            musicEnabled={musicEnabled}
            active={active}
            resetKey={selectedTrackId}
            canvasClassName="loadingAudioViz"
            synthFallback={false}
          />
        ) : musicEnabled ? (
          <LoadingAudioVizSkeleton />
        ) : (
          <div className="loadingAudioVizIdle" aria-hidden="true" />
        )}
      </div>
      <div className="loadingAudioTrackPane">
        <span className="loadingAudioTrackLabel">Track</span>
        <div className="loadingTrackRow" role="radiogroup" aria-label="Music track">
          {tracks.map((track) => (
            <button
              key={track.id}
              type="button"
              role="radio"
              aria-checked={selectedTrackId === track.id}
              className={`loadingTrackBtn${selectedTrackId === track.id ? " loadingTrackBtnActive" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onTrackSelect(track.id);
              }}
            >
              {track.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
