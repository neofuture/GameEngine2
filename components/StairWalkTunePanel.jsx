"use client";

import {
  BOB_FREQ_MIN_MAX,
  BOB_FREQ_MIN_MIN,
  BOB_FREQ_MIN_NUDGE,
  BOB_FREQ_MIN_STEP,
  BOB_FREQ_SPEED_SCALE_MAX,
  BOB_FREQ_SPEED_SCALE_MIN,
  BOB_FREQ_SPEED_SCALE_NUDGE,
  BOB_FREQ_SPEED_SCALE_STEP,
  CAMERA_AXIS_MULT_MAX,
  CAMERA_AXIS_MULT_MIN,
  CAMERA_AXIS_MULT_NUDGE,
  CAMERA_AXIS_MULT_STEP,
  CAMERA_BOB_SCALE_MAX,
  CAMERA_BOB_SCALE_MIN,
  CAMERA_BOB_SCALE_NUDGE,
  CAMERA_BOB_SCALE_STEP,
  DEFAULT_STAIR_WALK_TUNING,
  FOOTSTEP_STRIDE_SCALE_MAX,
  FOOTSTEP_STRIDE_SCALE_MIN,
  FOOTSTEP_STRIDE_SCALE_NUDGE,
  FOOTSTEP_STRIDE_SCALE_STEP,
  FOOTSTEP_VOLUME_SCALE_MAX,
  FOOTSTEP_VOLUME_SCALE_MIN,
  FOOTSTEP_VOLUME_SCALE_NUDGE,
  FOOTSTEP_VOLUME_SCALE_STEP,
  WEAPON_AXIS_MULT_MAX,
  WEAPON_AXIS_MULT_MIN,
  WEAPON_AXIS_MULT_NUDGE,
  WEAPON_AXIS_MULT_STEP,
  WEAPON_BOB_SCALE_MAX,
  WEAPON_BOB_SCALE_MIN,
  WEAPON_BOB_SCALE_NUDGE,
  WEAPON_BOB_SCALE_STEP,
} from "@/lib/StairWalkTuning";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function TuneControl({ label, value, min, max, step, nudge, format, onChange }) {
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

/** @param {{ tuning: import("@/lib/StairWalkTuning").StairWalkTuning, onChange: (key: keyof import("@/lib/StairWalkTuning").StairWalkTuning, value: number) => void, onReset: () => void, onClose?: () => void }} props */
export default function StairWalkTunePanel({ tuning, onChange, onReset, onClose }) {
  return (
    <div
      className="stairWalkTunePanel stairTunePanel"
      role="group"
      aria-label="Stair walk tuning"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="tunePanelHeader">
        <p className="stairTuneTitle">Stair walk</p>
        <div className="tunePanelHeaderActions">
          <button type="button" className="tunePanelHeaderBtn" onClick={onReset}>
            Reset
          </button>
          {onClose && (
            <button
              type="button"
              className="tunePanelClose"
              aria-label="Close stair walk tuning"
              onClick={onClose}
            >
              ×
            </button>
          )}
        </div>
      </div>

      <p className="walkBobSectionTitle">Weapon bob on stairs</p>
      <TuneControl
        label="Overall bounce"
        value={tuning.weaponBobScale}
        min={WEAPON_BOB_SCALE_MIN}
        max={WEAPON_BOB_SCALE_MAX}
        step={WEAPON_BOB_SCALE_STEP}
        nudge={WEAPON_BOB_SCALE_NUDGE}
        format={(v) => `${v.toFixed(2)}×`}
        onChange={(value) => onChange("weaponBobScale", value)}
      />
      <TuneControl
        label="Vertical sway"
        value={tuning.weaponBobY}
        min={WEAPON_AXIS_MULT_MIN}
        max={WEAPON_AXIS_MULT_MAX}
        step={WEAPON_AXIS_MULT_STEP}
        nudge={WEAPON_AXIS_MULT_NUDGE}
        format={(v) => `${v.toFixed(2)}×`}
        onChange={(value) => onChange("weaponBobY", value)}
      />
      <TuneControl
        label="Lateral sway"
        value={tuning.weaponBobX}
        min={WEAPON_AXIS_MULT_MIN}
        max={WEAPON_AXIS_MULT_MAX}
        step={WEAPON_AXIS_MULT_STEP}
        nudge={WEAPON_AXIS_MULT_NUDGE}
        format={(v) => `${v.toFixed(2)}×`}
        onChange={(value) => onChange("weaponBobX", value)}
      />
      <TuneControl
        label="Roll sway"
        value={tuning.weaponBobRoll}
        min={WEAPON_AXIS_MULT_MIN}
        max={WEAPON_AXIS_MULT_MAX}
        step={WEAPON_AXIS_MULT_STEP}
        nudge={WEAPON_AXIS_MULT_NUDGE}
        format={(v) => `${v.toFixed(2)}×`}
        onChange={(value) => onChange("weaponBobRoll", value)}
      />
      <TuneControl
        label="Min bob rate"
        value={tuning.bobFreqMin}
        min={BOB_FREQ_MIN_MIN}
        max={BOB_FREQ_MIN_MAX}
        step={BOB_FREQ_MIN_STEP}
        nudge={BOB_FREQ_MIN_NUDGE}
        format={(v) => `${v.toFixed(2)} Hz`}
        onChange={(value) => onChange("bobFreqMin", value)}
      />
      <TuneControl
        label="Speed bob rate"
        value={tuning.bobFreqSpeedScale}
        min={BOB_FREQ_SPEED_SCALE_MIN}
        max={BOB_FREQ_SPEED_SCALE_MAX}
        step={BOB_FREQ_SPEED_SCALE_STEP}
        nudge={BOB_FREQ_SPEED_SCALE_NUDGE}
        format={(v) => `${v.toFixed(2)}×`}
        onChange={(value) => onChange("bobFreqSpeedScale", value)}
      />

      <p className="walkBobSectionTitle">Camera walk bob on stairs</p>
      <TuneControl
        label="Overall bob"
        value={tuning.cameraBobScale}
        min={CAMERA_BOB_SCALE_MIN}
        max={CAMERA_BOB_SCALE_MAX}
        step={CAMERA_BOB_SCALE_STEP}
        nudge={CAMERA_BOB_SCALE_NUDGE}
        format={(v) => `${v.toFixed(2)}×`}
        onChange={(value) => onChange("cameraBobScale", value)}
      />
      <TuneControl
        label="Pitch sway"
        value={tuning.cameraBobPitchScale}
        min={CAMERA_AXIS_MULT_MIN}
        max={CAMERA_AXIS_MULT_MAX}
        step={CAMERA_AXIS_MULT_STEP}
        nudge={CAMERA_AXIS_MULT_NUDGE}
        format={(v) => `${v.toFixed(2)}×`}
        onChange={(value) => onChange("cameraBobPitchScale", value)}
      />
      <TuneControl
        label="Roll sway"
        value={tuning.cameraBobRollScale}
        min={CAMERA_AXIS_MULT_MIN}
        max={CAMERA_AXIS_MULT_MAX}
        step={CAMERA_AXIS_MULT_STEP}
        nudge={CAMERA_AXIS_MULT_NUDGE}
        format={(v) => `${v.toFixed(2)}×`}
        onChange={(value) => onChange("cameraBobRollScale", value)}
      />

      <p className="walkBobSectionTitle">Footsteps on stairs</p>
      <TuneControl
        label="Step spacing"
        value={tuning.footstepStrideScale}
        min={FOOTSTEP_STRIDE_SCALE_MIN}
        max={FOOTSTEP_STRIDE_SCALE_MAX}
        step={FOOTSTEP_STRIDE_SCALE_STEP}
        nudge={FOOTSTEP_STRIDE_SCALE_NUDGE}
        format={(v) => `${v.toFixed(2)}×`}
        onChange={(value) => onChange("footstepStrideScale", value)}
      />
      <TuneControl
        label="Step volume"
        value={tuning.footstepVolumeScale}
        min={FOOTSTEP_VOLUME_SCALE_MIN}
        max={FOOTSTEP_VOLUME_SCALE_MAX}
        step={FOOTSTEP_VOLUME_SCALE_STEP}
        nudge={FOOTSTEP_VOLUME_SCALE_NUDGE}
        format={(v) => `${v.toFixed(2)}×`}
        onChange={(value) => onChange("footstepVolumeScale", value)}
      />

      <p className="stairTuneHint">
        Applies on stairs only. Weapon, camera bob, and footsteps share the min /
        speed bob rate above. Values reset to the baked defaults from the stair
        walk wizard.
      </p>
    </div>
  );
}
