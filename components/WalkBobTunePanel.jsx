"use client";

import {
  AMPLITUDE_CM_MAX,
  AMPLITUDE_CM_MIN,
  AMPLITUDE_CM_NUDGE,
  AMPLITUDE_CM_STEP,
  DURATION_SEC_MAX,
  DURATION_SEC_MIN,
  DURATION_SEC_NUDGE,
  DURATION_SEC_STEP,
} from "@/lib/WalkBobTuning";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function BobControl({ label, value, min, max, step, nudge, format, onChange }) {
  const apply = (next) => onChange(clamp(next, min, max));
  const inputDecimals = step < 0.01 ? 3 : step < 0.1 ? 2 : 1;

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
        step={step}
        value={value}
        onChange={(e) => apply(parseFloat(e.target.value))}
      />
      <div className="poseNudgeRow">
        <button
          type="button"
          className="poseNudgeBtn"
          aria-label={`Decrease ${label}`}
          onClick={() => apply(value - nudge)}
        >
          −
        </button>
        <input
          type="number"
          className="poseNumber"
          min={min}
          max={max}
          step={step}
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
          onClick={() => apply(value + nudge)}
        >
          +
        </button>
      </div>
    </div>
  );
}

/** @param {{ tuning: import("@/lib/WalkBobTuning").WalkBobSimpleTuning, onChange: (key: keyof import("@/lib/WalkBobTuning").WalkBobSimpleTuning, value: number) => void, onReset: () => void, onClose?: () => void }} props */
export default function WalkBobTunePanel({ tuning, onChange, onReset, onClose }) {
  return (
    <div
      className="walkBobTunePanel stairTunePanel"
      role="group"
      aria-label="Walk bob tuning"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="tunePanelHeader">
        <p className="stairTuneTitle">Walk bob</p>
        <div className="tunePanelHeaderActions">
          <button type="button" className="tunePanelHeaderBtn" onClick={onReset}>
            Reset
          </button>
          {onClose && (
            <button
              type="button"
              className="tunePanelClose"
              aria-label="Close walk bob tuning"
              onClick={onClose}
            >
              ×
            </button>
          )}
        </div>
      </div>

      <BobControl
        label="Amplitude"
        value={tuning.amplitudeCm}
        min={AMPLITUDE_CM_MIN}
        max={AMPLITUDE_CM_MAX}
        step={AMPLITUDE_CM_STEP}
        nudge={AMPLITUDE_CM_NUDGE}
        format={(v) => `${v.toFixed(1)} cm`}
        onChange={(value) => onChange("amplitudeCm", value)}
      />
      <BobControl
        label="Duration"
        value={tuning.durationSec}
        min={DURATION_SEC_MIN}
        max={DURATION_SEC_MAX}
        step={DURATION_SEC_STEP}
        nudge={DURATION_SEC_NUDGE}
        format={(v) => `${v.toFixed(2)} s`}
        onChange={(value) => onChange("durationSec", value)}
      />

      <p className="stairTuneHint">
        Amplitude = how high the bob goes. Duration = time for one full up-down
        cycle while walking. Pitch, roll, and stair step motion scale with
        amplitude; smoothness scales with duration.
      </p>
    </div>
  );
}
