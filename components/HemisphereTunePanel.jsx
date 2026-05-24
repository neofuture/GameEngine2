"use client";

import {
  HEMI_INTENSITY_MAX,
  HEMI_INTENSITY_MIN,
  HEMI_INTENSITY_STEP,
  HEMI_TEMPERATURE_MAX,
  HEMI_TEMPERATURE_MIN,
  HEMI_TEMPERATURE_STEP,
} from "@/lib/HemisphereTuning";

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function HemiSliders({ settings, onChange }) {
  const update = (key, raw) => {
    const next = { ...settings, [key]: raw };
    if (key === "temperature") {
      next.temperature = clamp(raw, HEMI_TEMPERATURE_MIN, HEMI_TEMPERATURE_MAX);
    } else if (key === "intensity") {
      next.intensity = clamp(raw, HEMI_INTENSITY_MIN, HEMI_INTENSITY_MAX);
    }
    onChange(next);
  };

  return (
    <>
      <label className="sliderRow">
        <span className="sliderLabel">
          Temperature <output>{Math.round(settings.temperature)} K</output>
        </span>
        <input
          type="range"
          min={HEMI_TEMPERATURE_MIN}
          max={HEMI_TEMPERATURE_MAX}
          step={HEMI_TEMPERATURE_STEP}
          value={settings.temperature}
          onChange={(e) => update("temperature", parseFloat(e.target.value))}
        />
      </label>
      <label className="sliderRow">
        <span className="sliderLabel">
          Intensity <output>{settings.intensity.toFixed(2)}</output>
        </span>
        <input
          type="range"
          min={HEMI_INTENSITY_MIN}
          max={HEMI_INTENSITY_MAX}
          step={HEMI_INTENSITY_STEP}
          value={settings.intensity}
          onChange={(e) => update("intensity", parseFloat(e.target.value))}
        />
      </label>
    </>
  );
}

export default function HemisphereTunePanel({
  isDay,
  onDayNightChange,
  day,
  night,
  onDayChange,
  onNightChange,
  onResetDay,
  onResetNight,
  onClose,
}) {
  const settings = isDay ? day : night;
  const onSettingsChange = isDay ? onDayChange : onNightChange;
  const onReset = isDay ? onResetDay : onResetNight;

  return (
    <div
      className="sunTunePanel hemiTunePanel"
      role="group"
      aria-label="Hemisphere light"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="tunePanelHeader">
        <p className="sunTuneTitle">Sky fill</p>
        <div className="tunePanelHeaderActions">
          <button
            type="button"
            className="settingsBtn tunePanelHeaderBtn"
            onClick={onReset}
          >
            Reset
          </button>
          {onClose && (
            <button
              type="button"
              className="tunePanelClose"
              aria-label="Close sky fill tuning"
              onClick={onClose}
            >
              ×
            </button>
          )}
        </div>
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
      <HemiSliders settings={settings} onChange={onSettingsChange} />
      <p className="sunTuneHint">
        Hemisphere light is always on. Day / Night here is shared with Sun
        settings — flipping it here swaps the world to that mode and reveals its
        sliders.
      </p>
    </div>
  );
}
