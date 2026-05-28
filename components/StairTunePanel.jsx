"use client";

import {
  STAIRS_STEP_COUNT,
  STAIRS_STEP_RISE,
  STAIRS_STEP_RUN,
  STAIRS_TOTAL_RISE,
  STAIRS_EFFECTIVE_TOTAL_RISE,
  STAIRS_TOTAL_RUN,
  STAIRS_WIDTH,
  STAIR_POS_MAX,
  STAIR_POS_MIN,
  STAIR_ROTATION_MAX,
  STAIR_ROTATION_MIN,
  STAIR_ROTATION_NUDGE,
  STAIR_ROTATION_STEP,
  STAIR_SLIDER_STEP,
  STAIR_NUDGE_STEP,
  STAIR_Y_MAX,
  STAIR_Y_MIN,
} from "@/lib/StairTuning";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function StairAxisControl({
  label,
  value,
  min,
  max,
  sliderStep,
  nudgeStep,
  format,
  onChange,
  extraAction = null,
}) {
  const apply = (next) => onChange(clamp(next, min, max));
  const inputDecimals = sliderStep < 0.01 ? 4 : 3;

  return (
    <div className="poseControl">
      <span className="sliderLabel">
        {label} <output>{format(value)}</output>
      </span>
      <input
        type="range"
        className="poseRange"
        min={min}
        max={max}
        step={sliderStep}
        value={value}
        onChange={(e) => apply(parseFloat(e.target.value))}
      />
      <div className={`poseNudgeRow${extraAction ? " poseNudgeRowWithExtra" : ""}`}>
        <button
          type="button"
          className="poseNudgeBtn"
          aria-label={`Decrease ${label}`}
          onClick={() => apply(value - nudgeStep)}
        >
          −
        </button>
        <input
          type="number"
          className="poseNumber"
          min={min}
          max={max}
          step={sliderStep}
          value={parseFloat(value.toFixed(inputDecimals))}
          onChange={(e) => {
            const parsed = parseFloat(e.target.value);
            if (!Number.isNaN(parsed)) apply(parsed);
          }}
        />
        <button
          type="button"
          className="poseNudgeBtn"
          aria-label={`Increase ${label}`}
          onClick={() => apply(value + nudgeStep)}
        >
          +
        </button>
        {extraAction}
      </div>
    </div>
  );
}

export default function StairTunePanel({
  floorDeckY,
  catwalkDeckY,
  x,
  y,
  z,
  rotationY,
  onXChange,
  onYChange,
  onZChange,
  onRotationChange,
  onClose,
}) {
  return (
    <div
      className="stairTunePanel"
      role="group"
      aria-label="Stairway placement"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="tunePanelHeader">
        <p className="stairTuneTitle">Stairway</p>
        {onClose && (
          <button
            type="button"
            className="tunePanelClose"
            aria-label="Close stairway tuning"
            onClick={onClose}
          >
            ×
          </button>
        )}
      </div>
      <StairAxisControl
        label="X"
        value={x}
        min={STAIR_POS_MIN}
        max={STAIR_POS_MAX}
        sliderStep={STAIR_SLIDER_STEP}
        nudgeStep={STAIR_NUDGE_STEP}
        format={(v) => v.toFixed(4)}
        onChange={onXChange}
      />
      <StairAxisControl
        label="Y"
        value={y}
        min={STAIR_Y_MIN}
        max={STAIR_Y_MAX}
        sliderStep={STAIR_SLIDER_STEP}
        nudgeStep={STAIR_NUDGE_STEP}
        format={(v) => v.toFixed(4)}
        onChange={onYChange}
        extraAction={
          <button
            type="button"
            className="poseNudgeBtn stairDeckSnapBtn"
            title="Snap bottom of first tread to arena floor deck"
            onClick={() => onYChange(floorDeckY)}
          >
            Deck
          </button>
        }
      />
      <StairAxisControl
        label="Z"
        value={z}
        min={STAIR_POS_MIN}
        max={STAIR_POS_MAX}
        sliderStep={STAIR_SLIDER_STEP}
        nudgeStep={STAIR_NUDGE_STEP}
        format={(v) => v.toFixed(4)}
        onChange={onZChange}
      />
      <StairAxisControl
        label="Rotation"
        value={rotationY}
        min={STAIR_ROTATION_MIN}
        max={STAIR_ROTATION_MAX}
        sliderStep={STAIR_ROTATION_STEP}
        nudgeStep={STAIR_ROTATION_NUDGE}
        format={(v) => `${v.toFixed(2)}°`}
        onChange={onRotationChange}
      />
      <p className="stairTuneHint">
        Fixed flight · {STAIRS_STEP_COUNT} steps · {STAIRS_WIDTH.toFixed(2)} m wide · rise{" "}
        {STAIRS_EFFECTIVE_TOTAL_RISE.toFixed(2)} m ({STAIRS_TOTAL_RISE.toFixed(2)} m steps + top) · run{" "}
        {STAIRS_TOTAL_RUN.toFixed(2)} m · anchor = bottom
        of first tread · 0° faces +Z · floor Y ≈ {floorDeckY.toFixed(3)} m · catwalk ≈{" "}
        {catwalkDeckY.toFixed(3)} m · ± nudge{" "}
        {STAIR_NUDGE_STEP} m / {STAIR_ROTATION_NUDGE}°
      </p>
    </div>
  );
}
