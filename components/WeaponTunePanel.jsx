"use client";

import {
  DEFAULT_ADS_POSE,
  DEFAULT_HIP_POSE,
  formatPoseForCopy,
  radToDeg,
  saveBodyLookDownAmount,
  saveBodyLookUpAmount,
  saveWeaponTuning,
} from "@/lib/WeaponTuning";

const POS_MIN = -2;
const POS_MAX = 2;
const ROT_MIN = -3.14159;
const ROT_MAX = 3.14159;
const SCALE_MIN = 0.25;
const SCALE_MAX = 2.5;
const POS_STEP = 0.001;
const ROT_STEP = 0.001;
const SCALE_STEP = 0.001;
const NUDGE_POS = 0.001;
const NUDGE_ROT = 0.001;
const NUDGE_SCALE = 0.001;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function PoseControl({
  label,
  value,
  min,
  max,
  step,
  nudgeStep,
  format,
  onChange,
  toInput = (v) => v,
  fromInput = (n) => n,
  inputMin,
  inputMax,
  inputStep,
}) {
  const apply = (next) => onChange(clamp(next, min, max));
  const numMin = inputMin ?? min;
  const numMax = inputMax ?? max;
  const numStep = inputStep ?? step;
  const inputDecimals = inputStep != null && inputStep < 0.01 ? 4 : inputStep != null && inputStep < 0.1 ? 2 : 3;
  const inputDisplay = parseFloat(toInput(value).toFixed(inputDecimals));

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
          onClick={() => apply(value - nudgeStep)}
        >
          −
        </button>
        <input
          type="number"
          className="poseNumber"
          min={numMin}
          max={numMax}
          step={numStep}
          value={inputDisplay}
          onChange={(e) => {
            const parsed = parseFloat(e.target.value);
            if (!Number.isNaN(parsed)) apply(fromInput(parsed));
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
      </div>
    </div>
  );
}

const MAX_LOOK_RATE_MIN = 2;
const MAX_LOOK_RATE_MAX = 24;
const MAX_LOOK_RATE_STEP = 0.5;
const LOOK_PARALLAX_AMOUNT_MIN = 0;
const LOOK_PARALLAX_AMOUNT_MAX = 1.5;
const LOOK_PARALLAX_AMOUNT_STEP = 0.05;

export default function WeaponTunePanel({
  poseMode,
  onPoseModeChange,
  onReleasePointer,
  hipPose,
  adsPose,
  onHipChange,
  onAdsChange,
  maxLookRate,
  onMaxLookRateChange,
  bodyLookUpAmount,
  onBodyLookUpAmountChange,
  bodyLookDownAmount,
  onBodyLookDownAmountChange,
  onClose,
}) {
  const releasePointer = () => onReleasePointer?.();

  const selectMode = (mode) => {
    releasePointer();
    onPoseModeChange(mode);
  };
  const pose = poseMode === "ads" ? adsPose : hipPose;
  const setPose = poseMode === "ads" ? onAdsChange : onHipChange;

  const update = (field, value) => {
    const next = { ...pose, [field]: value };
    setPose(next);
    const hip = poseMode === "hip" ? next : hipPose;
    const ads = poseMode === "ads" ? next : adsPose;
    saveWeaponTuning(hip, ads);
  };

  const handleCopy = async () => {
    const text = formatPoseForCopy(pose);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
    console.log(`Weapon ${poseMode} pose:`, text);
  };

  const handleReset = () => {
    const defaults = poseMode === "ads" ? DEFAULT_ADS_POSE : DEFAULT_HIP_POSE;
    setPose({ ...defaults });
    const hip = poseMode === "hip" ? defaults : hipPose;
    const ads = poseMode === "ads" ? defaults : adsPose;
    saveWeaponTuning(hip, ads);
  };

  return (
    <div
      className="weaponTunePanel"
      onMouseDown={(e) => {
        e.stopPropagation();
        releasePointer();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="tunePanelHeader">
        <p className="weaponTuneTitle">Weapon tune</p>
        {onClose && (
          <button
            type="button"
            className="tunePanelClose"
            aria-label="Close weapon tuning"
            onClick={onClose}
          >
            ×
          </button>
        )}
      </div>
      <div className="weaponTuneTabs">
        <button
          type="button"
          className={poseMode === "hip" ? "weaponTuneTab active" : "weaponTuneTab"}
          onClick={() => selectMode("hip")}
        >
          Hip
        </button>
        <button
          type="button"
          className={poseMode === "ads" ? "weaponTuneTab active" : "weaponTuneTab"}
          onClick={() => selectMode("ads")}
        >
          Aim (Z)
        </button>
      </div>

      <p className="settingsGroup">Look</p>
      <PoseControl
        label="Max turn speed"
        value={maxLookRate}
        min={MAX_LOOK_RATE_MIN}
        max={MAX_LOOK_RATE_MAX}
        step={MAX_LOOK_RATE_STEP}
        nudgeStep={MAX_LOOK_RATE_STEP}
        format={(v) => `${((v * 180) / Math.PI).toFixed(0)}°/s`}
        onChange={onMaxLookRateChange}
      />
      <p className="settingsHint">
        Caps rotation speed on quick mouse flicks (2.5 rad/s ≈ 143°/s is a good start).
      </p>
      <PoseControl
        label="Look-up shift"
        value={bodyLookUpAmount}
        min={LOOK_PARALLAX_AMOUNT_MIN}
        max={LOOK_PARALLAX_AMOUNT_MAX}
        step={LOOK_PARALLAX_AMOUNT_STEP}
        nudgeStep={LOOK_PARALLAX_AMOUNT_STEP}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => {
          onBodyLookUpAmountChange(v);
          saveBodyLookUpAmount(v);
        }}
      />
      <PoseControl
        label="Look-down shift"
        value={bodyLookDownAmount}
        min={LOOK_PARALLAX_AMOUNT_MIN}
        max={LOOK_PARALLAX_AMOUNT_MAX}
        step={LOOK_PARALLAX_AMOUNT_STEP}
        nudgeStep={LOOK_PARALLAX_AMOUNT_STEP}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => {
          onBodyLookDownAmountChange(v);
          saveBodyLookDownAmount(v);
        }}
      />
      <p className="settingsHint">
        Hip only: how much the gun shifts when looking up or down (0% = locked
        hip pose that direction). Aim stays on the sight.
      </p>

      <p className="settingsGroup">Position (±{NUDGE_POS} nudge)</p>
      <PoseControl
        label="X"
        value={pose.posX}
        min={POS_MIN}
        max={POS_MAX}
        step={POS_STEP}
        nudgeStep={NUDGE_POS}
        format={(v) => v.toFixed(3)}
        onChange={(v) => update("posX", v)}
      />
      <PoseControl
        label="Y"
        value={pose.posY}
        min={POS_MIN}
        max={POS_MAX}
        step={POS_STEP}
        nudgeStep={NUDGE_POS}
        format={(v) => v.toFixed(3)}
        onChange={(v) => update("posY", v)}
      />
      <PoseControl
        label="Z"
        value={pose.posZ}
        min={POS_MIN}
        max={POS_MAX}
        step={POS_STEP}
        nudgeStep={NUDGE_POS}
        format={(v) => v.toFixed(3)}
        onChange={(v) => update("posZ", v)}
      />

      <p className="settingsGroup">Rotation (±{NUDGE_ROT} rad nudge)</p>
      <PoseControl
        label="Rot X"
        value={pose.rotX}
        min={ROT_MIN}
        max={ROT_MAX}
        step={ROT_STEP}
        nudgeStep={NUDGE_ROT}
        toInput={radToDeg}
        fromInput={(deg) => (deg * Math.PI) / 180}
        inputMin={-180}
        inputMax={180}
        inputStep={0.1}
        format={(v) => `${radToDeg(v).toFixed(1)}°`}
        onChange={(v) => update("rotX", v)}
      />
      <PoseControl
        label="Rot Y"
        value={pose.rotY}
        min={ROT_MIN}
        max={ROT_MAX}
        step={ROT_STEP}
        nudgeStep={NUDGE_ROT}
        toInput={radToDeg}
        fromInput={(deg) => (deg * Math.PI) / 180}
        inputMin={-180}
        inputMax={180}
        inputStep={0.1}
        format={(v) => `${radToDeg(v).toFixed(1)}°`}
        onChange={(v) => update("rotY", v)}
      />
      <PoseControl
        label="Rot Z"
        value={pose.rotZ}
        min={ROT_MIN}
        max={ROT_MAX}
        step={ROT_STEP}
        nudgeStep={NUDGE_ROT}
        toInput={radToDeg}
        fromInput={(deg) => (deg * Math.PI) / 180}
        inputMin={-180}
        inputMax={180}
        inputStep={0.1}
        format={(v) => `${radToDeg(v).toFixed(1)}°`}
        onChange={(v) => update("rotZ", v)}
      />

      <p className="settingsGroup">Scale</p>
      <PoseControl
        label="Scale"
        value={pose.scale}
        min={SCALE_MIN}
        max={SCALE_MAX}
        step={SCALE_STEP}
        nudgeStep={NUDGE_SCALE}
        format={(v) => v.toFixed(3)}
        onChange={(v) => update("scale", v)}
      />

      <div className="weaponTuneActions">
        <button type="button" className="settingsBtn" onClick={handleCopy}>
          Copy pose
        </button>
        <button type="button" className="settingsBtn" onClick={handleReset}>
          Reset
        </button>
      </div>
      <p className="settingsHint">
        <strong>Aim</strong> tab shows ADS pose (mouse free). Use ± buttons or type values for
        fine placement (0.001 / 0.1° steps). Hold <kbd>Z</kbd> in-game to aim.
      </p>
    </div>
  );
}
