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
  PITCH_SCALE_MAX,
  PITCH_SCALE_MIN,
  PITCH_SCALE_NUDGE,
  PITCH_SCALE_STEP,
  ROLL_SCALE_MAX,
  ROLL_SCALE_MIN,
  ROLL_SCALE_NUDGE,
  ROLL_SCALE_STEP,
  SPRINT_SPEED_MAX,
  SPRINT_SPEED_MIN,
  SPRINT_SPEED_NUDGE,
  SPRINT_SPEED_STEP,
  WALK_SPEED_MAX,
  WALK_SPEED_MIN,
  WALK_SPEED_NUDGE,
  WALK_SPEED_STEP,
  WEAPON_BOB_SCALE_MAX,
  WEAPON_BOB_SCALE_MIN,
  WEAPON_BOB_SCALE_NUDGE,
  WEAPON_BOB_SCALE_STEP,
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

      <p className="walkBobSectionTitle">Movement</p>
      <BobControl
        label="Walk speed"
        value={tuning.walkSpeed}
        min={WALK_SPEED_MIN}
        max={WALK_SPEED_MAX}
        step={WALK_SPEED_STEP}
        nudge={WALK_SPEED_NUDGE}
        format={(v) => `${v.toFixed(1)} m/s`}
        onChange={(value) => onChange("walkSpeed", value)}
      />
      <BobControl
        label="Sprint speed"
        value={tuning.sprintSpeed}
        min={SPRINT_SPEED_MIN}
        max={SPRINT_SPEED_MAX}
        step={SPRINT_SPEED_STEP}
        nudge={SPRINT_SPEED_NUDGE}
        format={(v) => `${v.toFixed(1)} m/s`}
        onChange={(value) => onChange("sprintSpeed", value)}
      />

      <p className="walkBobSectionTitle">Camera bob</p>
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
        label="Cycle duration"
        value={tuning.durationSec}
        min={DURATION_SEC_MIN}
        max={DURATION_SEC_MAX}
        step={DURATION_SEC_STEP}
        nudge={DURATION_SEC_NUDGE}
        format={(v) => `${v.toFixed(2)} s`}
        onChange={(value) => onChange("durationSec", value)}
      />
      <BobControl
        label="Pitch sway"
        value={tuning.pitchScale}
        min={PITCH_SCALE_MIN}
        max={PITCH_SCALE_MAX}
        step={PITCH_SCALE_STEP}
        nudge={PITCH_SCALE_NUDGE}
        format={(v) => `${v.toFixed(2)}×`}
        onChange={(value) => onChange("pitchScale", value)}
      />
      <BobControl
        label="Roll sway"
        value={tuning.rollScale}
        min={ROLL_SCALE_MIN}
        max={ROLL_SCALE_MAX}
        step={ROLL_SCALE_STEP}
        nudge={ROLL_SCALE_NUDGE}
        format={(v) => `${v.toFixed(2)}×`}
        onChange={(value) => onChange("rollScale", value)}
      />

      <p className="walkBobSectionTitle">Weapon bob</p>
      <BobControl
        label="Weapon sway"
        value={tuning.weaponBobScale}
        min={WEAPON_BOB_SCALE_MIN}
        max={WEAPON_BOB_SCALE_MAX}
        step={WEAPON_BOB_SCALE_STEP}
        nudge={WEAPON_BOB_SCALE_NUDGE}
        format={(v) => `${v.toFixed(2)}×`}
        onChange={(value) => onChange("weaponBobScale", value)}
      />

      <p className="stairTuneHint">
        Walk and sprint speeds apply immediately. Bob cycle rate scales with walk
        speed so faster movement keeps a natural step rhythm. Pitch, roll, and
        weapon sway multiply on top of amplitude.
      </p>
    </div>
  );
}
