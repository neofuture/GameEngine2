"use client";

import { OIL_BARREL_TUNING_LIMITS as L } from "@/lib/OilBarrelTuning";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function BarControl({ label, value, min, max, step, nudge, format, onChange }) {
  const apply = (next) => onChange(clamp(next, min, max));
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
        <button type="button" className="poseNudgeBtn" onClick={() => apply(value - nudge)}>
          −
        </button>
        <input
          type="number"
          className="poseNumber"
          min={min}
          max={max}
          step={step}
          value={parseFloat(value.toFixed(3))}
          onChange={(e) => {
            const parsed = parseFloat(e.target.value);
            if (!Number.isNaN(parsed)) apply(parsed);
          }}
        />
        <button type="button" className="poseNudgeBtn" onClick={() => apply(value + nudge)}>
          +
        </button>
      </div>
    </div>
  );
}

/** @param {{
 *   tuning: import("@/lib/OilBarrelTuning").OilBarrelTuning,
 *   onChange: (key: keyof import("@/lib/OilBarrelTuning").OilBarrelTuning, value: number) => void,
 *   onReset: () => void,
 *   onCopy?: () => void,
 *   onClose?: () => void,
 * }} props */
export default function OilBarrelTunePanel({
  tuning,
  onChange,
  onReset,
  onCopy,
  onClose,
}) {
  return (
    <div
      className="hudBarTunePanel stairTunePanel"
      role="group"
      aria-label="Oil barrel material tuning"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="tunePanelHeader">
        <p className="stairTuneTitle">Oil barrel (textured)</p>
        <div className="tunePanelHeaderActions">
          {onCopy && (
            <button type="button" className="tunePanelHeaderBtn" onClick={onCopy}>
              Copy JSON
            </button>
          )}
          <button type="button" className="tunePanelHeaderBtn" onClick={onReset}>
            Reset
          </button>
          {onClose && (
            <button
              type="button"
              className="tunePanelClose"
              aria-label="Close"
              onClick={onClose}
            >
              ×
            </button>
          )}
        </div>
      </div>

      <p className="settingsGroup">Cylinder wall</p>
      <BarControl
        label="Body brightness"
        value={tuning.bodyBrightness}
        min={L.bodyBrightness.min}
        max={L.bodyBrightness.max}
        step={L.bodyBrightness.step}
        nudge={L.bodyBrightness.nudge}
        format={(v) => v.toFixed(2)}
        onChange={(v) => onChange("bodyBrightness", v)}
      />

      <p className="settingsGroup">Top / bottom caps</p>
      <BarControl
        label="Cap brightness"
        value={tuning.capBrightness}
        min={L.capBrightness.min}
        max={L.capBrightness.max}
        step={L.capBrightness.step}
        nudge={L.capBrightness.nudge}
        format={(v) => v.toFixed(2)}
        onChange={(v) => onChange("capBrightness", v)}
      />
      <BarControl
        label="Cap contrast"
        value={tuning.capContrast}
        min={L.capContrast.min}
        max={L.capContrast.max}
        step={L.capContrast.step}
        nudge={L.capContrast.nudge}
        format={(v) => v.toFixed(2)}
        onChange={(v) => onChange("capContrast", v)}
      />
      <BarControl
        label="Cap normal strength"
        value={tuning.capNormalScale}
        min={L.capNormalScale.min}
        max={L.capNormalScale.max}
        step={L.capNormalScale.step}
        nudge={L.capNormalScale.nudge}
        format={(v) => v.toFixed(2)}
        onChange={(v) => onChange("capNormalScale", v)}
      />
      <p className="settingsGroup">Shared</p>
      <BarControl
        label="Warmth (G)"
        value={tuning.warmth}
        min={L.warmth.min}
        max={L.warmth.max}
        step={L.warmth.step}
        nudge={L.warmth.nudge}
        format={(v) => v.toFixed(2)}
        onChange={(v) => onChange("warmth", v)}
      />
      <BarControl
        label="Blue tint (B)"
        value={tuning.blueTint}
        min={L.blueTint.min}
        max={L.blueTint.max}
        step={L.blueTint.step}
        nudge={L.blueTint.nudge}
        format={(v) => v.toFixed(2)}
        onChange={(v) => onChange("blueTint", v)}
      />
      <BarControl
        label="Roughness"
        value={tuning.roughness}
        min={L.roughness.min}
        max={L.roughness.max}
        step={L.roughness.step}
        nudge={L.roughness.nudge}
        format={(v) => v.toFixed(2)}
        onChange={(v) => onChange("roughness", v)}
      />
      <BarControl
        label="Emissive lights"
        value={tuning.emissiveIntensity}
        min={L.emissiveIntensity.min}
        max={L.emissiveIntensity.max}
        step={L.emissiveIntensity.step}
        nudge={L.emissiveIntensity.nudge}
        format={(v) => v.toFixed(1)}
        onChange={(v) => onChange("emissiveIntensity", v)}
      />
      <BarControl
        label="Normal strength"
        value={tuning.normalScale}
        min={L.normalScale.min}
        max={L.normalScale.max}
        step={L.normalScale.step}
        nudge={L.normalScale.nudge}
        format={(v) => v.toFixed(2)}
        onChange={(v) => onChange("normalScale", v)}
      />

      <p className="settingsHint">
        Cap contrast adjusts the endcap albedo in code — no new PNG needed for tuning.
        Re-export textures only if you need different art (layout, symbols, resolution).
      </p>
    </div>
  );
}
