"use client";

import { DEFAULT_TARGET_POSE } from "@/lib/Targets";

const RAD_TO_DEG = 180 / Math.PI;

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function Slider({ label, value, min, max, step, format, onChange }) {
  const apply = (n) => onChange(clamp(n, min, max));
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
        <button type="button" className="poseNudgeBtn" onClick={() => apply(value - step)}>−</button>
        <input
          type="number"
          className="poseNumber"
          min={min}
          max={max}
          step={step}
          value={parseFloat((value * RAD_TO_DEG).toFixed(1))}
          onChange={(e) => {
            const deg = parseFloat(e.target.value);
            if (!Number.isNaN(deg)) apply((deg * Math.PI) / 180);
          }}
        />
        <button type="button" className="poseNudgeBtn" onClick={() => apply(value + step)}>+</button>
      </div>
    </div>
  );
}

export default function TargetPoseTunePanel({ pose, onChange, applyToAll, onApplyToAllChange, onClose }) {
  const update = (key, value) => onChange({ ...pose, [key]: value });

  const handleCopy = async () => {
    const text = JSON.stringify(pose, null, 2);
    try { await navigator.clipboard.writeText(text); } catch { /* */ }
    console.log("Target pose:", text);
  };

  const handleReset = () => onChange({ ...DEFAULT_TARGET_POSE });

  return (
    <div
      className="weaponTunePanel"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="tunePanelHeader">
        <p className="weaponTuneTitle">Target pose</p>
        {onClose && (
          <button type="button" className="tunePanelClose" aria-label="Close" onClick={onClose}>×</button>
        )}
      </div>

      <p className="settingsGroup">Arms</p>
      <Slider
        label="Arm angle"
        value={pose.armAngle}
        min={0}
        max={1.57}
        step={0.01}
        format={(v) => `${(v * RAD_TO_DEG).toFixed(1)}°`}
        onChange={(v) => update("armAngle", v)}
      />
      <Slider
        label="Elbow bend"
        value={pose.elbowBend}
        min={0}
        max={2.36}
        step={0.01}
        format={(v) => `${(v * RAD_TO_DEG).toFixed(1)}°`}
        onChange={(v) => update("elbowBend", v)}
      />
      <Slider
        label="Arm offset"
        value={pose.armOffset}
        min={0.05}
        max={0.25}
        step={0.005}
        format={(v) => `${(v * 100).toFixed(1)}%h`}
        onChange={(v) => update("armOffset", v)}
      />

      <p className="settingsGroup">Legs</p>
      <Slider
        label="Leg angle"
        value={pose.legAngle}
        min={0}
        max={0.52}
        step={0.005}
        format={(v) => `${(v * RAD_TO_DEG).toFixed(1)}°`}
        onChange={(v) => update("legAngle", v)}
      />
      <Slider
        label="Leg offset"
        value={pose.legOffset}
        min={0.02}
        max={0.12}
        step={0.002}
        format={(v) => `${(v * 100).toFixed(1)}%h`}
        onChange={(v) => update("legOffset", v)}
      />

      <label className="settingRow" style={{ marginTop: 8 }}>
        <input type="checkbox" checked={applyToAll} onChange={(e) => onApplyToAllChange(e.target.checked)} />
        Apply to all targets
      </label>

      <div className="weaponTuneActions">
        <button type="button" className="settingsBtn" onClick={handleCopy}>Copy pose</button>
        <button type="button" className="settingsBtn" onClick={handleReset}>Reset</button>
      </div>
      <p className="settingsHint">
        Click a target while this panel is open to select it.
        Angles are in degrees in the number field.
      </p>
    </div>
  );
}
