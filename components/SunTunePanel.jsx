"use client";

import {
  MOON_INTENSITY_MAX,
  MOON_INTENSITY_MIN,
  MOON_INTENSITY_STEP,
} from "@/lib/MoonLightTuning";
import {
  SUN_AZIMUTH_MAX,
  SUN_AZIMUTH_MIN,
  SUN_BOWL_INSET,
  SUN_BOWL_RADIUS,
  SUN_ELEVATION_MAX,
  SUN_ELEVATION_MIN,
} from "@/lib/SunLightTuning";

export default function SunTunePanel({
  isDay,
  onDayNightChange,
  azimuth,
  elevation,
  onAzimuthChange,
  onElevationChange,
  moonAzimuth,
  moonElevation,
  moonIntensity,
  onMoonAzimuthChange,
  onMoonElevationChange,
  onMoonIntensityChange,
  onClose,
}) {
  return (
    <div
      className="sunTunePanel"
      role="group"
      aria-label="Sun and moon lighting"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="tunePanelHeader">
        <p className="sunTuneTitle">Sun / Moon</p>
        {onClose && (
          <button
            type="button"
            className="tunePanelClose"
            aria-label="Close sun and moon tuning"
            onClick={onClose}
          >
            ×
          </button>
        )}
      </div>
      <div className="sunDayNightTabs" role="group" aria-label="Day or night">
        <button
          type="button"
          className={`sunDayNightTab${isDay ? " active" : ""}`}
          aria-pressed={isDay}
          onClick={() => onDayNightChange(true)}
        >
          Day
        </button>
        <button
          type="button"
          className={`sunDayNightTab${!isDay ? " active" : ""}`}
          aria-pressed={!isDay}
          onClick={() => onDayNightChange(false)}
        >
          Night
        </button>
      </div>
      {isDay ? (
        <>
          <label className="sliderRow">
            <span className="sliderLabel">
              Sun rotation <output>{Math.round(azimuth)}°</output>
            </span>
            <input
              type="range"
              min={SUN_AZIMUTH_MIN}
              max={SUN_AZIMUTH_MAX}
              step="1"
              value={azimuth}
              onChange={(e) => onAzimuthChange(parseFloat(e.target.value))}
            />
          </label>
          <label className="sliderRow">
            <span className="sliderLabel">
              Sun elevation <output>{Math.round(elevation)}°</output>
            </span>
            <input
              type="range"
              min={SUN_ELEVATION_MIN}
              max={SUN_ELEVATION_MAX}
              step="1"
              value={elevation}
              onChange={(e) => onElevationChange(parseFloat(e.target.value))}
            />
          </label>
          <p className="sunTuneHint">
            Sun on sky bowl (r {SUN_BOWL_RADIUS}, {SUN_BOWL_INSET} m inset)
          </p>
        </>
      ) : (
        <>
          <label className="sliderRow">
            <span className="sliderLabel">
              Moon rotation <output>{Math.round(moonAzimuth)}°</output>
            </span>
            <input
              type="range"
              min={SUN_AZIMUTH_MIN}
              max={SUN_AZIMUTH_MAX}
              step="1"
              value={moonAzimuth}
              onChange={(e) => onMoonAzimuthChange(parseFloat(e.target.value))}
            />
          </label>
          <label className="sliderRow">
            <span className="sliderLabel">
              Moon elevation <output>{Math.round(moonElevation)}°</output>
            </span>
            <input
              type="range"
              min={SUN_ELEVATION_MIN}
              max={SUN_ELEVATION_MAX}
              step="1"
              value={moonElevation}
              onChange={(e) => onMoonElevationChange(parseFloat(e.target.value))}
            />
          </label>
          <label className="sliderRow">
            <span className="sliderLabel">
              Moon intensity <output>{moonIntensity.toFixed(2)}</output>
            </span>
            <input
              type="range"
              min={MOON_INTENSITY_MIN}
              max={MOON_INTENSITY_MAX}
              step={MOON_INTENSITY_STEP}
              value={moonIntensity}
              onChange={(e) => onMoonIntensityChange(parseFloat(e.target.value))}
            />
          </label>
          <p className="sunTuneHint">
            Moon sits on the same sky bowl as the sun, with softer blurred shadows.
          </p>
        </>
      )}
    </div>
  );
}
