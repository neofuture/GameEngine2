"use client";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function BarControl({ label, value, min, max, step, nudge, format, onChange }) {
  const apply = (next) => onChange(clamp(next, min, max));
  const inputDecimals = step < 0.05 ? 2 : 1;

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

/** @param {{ tuning: import("@/lib/HudBarTuning").HudBarTuning, onChange: (key: keyof import("@/lib/HudBarTuning").HudBarTuning, value: number) => void, onReset: () => void, onClose?: () => void }} props */
export default function HudBarTunePanel({ tuning, onChange, onReset, onClose }) {
  const pct = (v) => `${v.toFixed(1)}%`;
  const vw = (v) => `${v.toFixed(2)}vw`;

  return (
    <div
      className="hudBarTunePanel stairTunePanel"
      role="group"
      aria-label="HUD bar layout tuning"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="tunePanelHeader">
        <p className="stairTuneTitle">HUD bars</p>
        <div className="tunePanelHeaderActions">
          <button type="button" className="tunePanelHeaderBtn" onClick={onReset}>
            Reset
          </button>
          {onClose && (
            <button
              type="button"
              className="tunePanelClose"
              aria-label="Close HUD bar tuning"
              onClick={onClose}
            >
              ×
            </button>
          )}
        </div>
      </div>

      <p className="walkBobSectionTitle">Health — top right</p>
      <BarControl
        label="Bar X (left)"
        value={tuning.hbBarX}
        min={0}
        max={40}
        step={0.1}
        nudge={0.5}
        format={pct}
        onChange={(v) => onChange("hbBarX", v)}
      />
      <BarControl
        label="Bar Y"
        value={tuning.hbBarY}
        min={0}
        max={70}
        step={0.1}
        nudge={0.5}
        format={pct}
        onChange={(v) => onChange("hbBarY", v)}
      />
      <BarControl
        label="Bar width"
        value={tuning.hbBarW}
        min={40}
        max={90}
        step={0.1}
        nudge={0.5}
        format={pct}
        onChange={(v) => onChange("hbBarW", v)}
      />
      <BarControl
        label="Bar height"
        value={tuning.hbBarH}
        min={10}
        max={50}
        step={0.1}
        nudge={0.5}
        format={pct}
        onChange={(v) => onChange("hbBarH", v)}
      />
      <BarControl
        label="Lives X (right)"
        value={tuning.hbLivesX}
        min={0}
        max={20}
        step={0.1}
        nudge={0.5}
        format={pct}
        onChange={(v) => onChange("hbLivesX", v)}
      />
      <BarControl
        label="Lives Y"
        value={tuning.hbLivesY}
        min={0}
        max={40}
        step={0.1}
        nudge={0.5}
        format={pct}
        onChange={(v) => onChange("hbLivesY", v)}
      />
      <BarControl
        label="Lives size"
        value={tuning.hbLivesSize}
        min={0.5}
        max={3}
        step={0.05}
        nudge={0.1}
        format={vw}
        onChange={(v) => onChange("hbLivesSize", v)}
      />

      <p className="walkBobSectionTitle">Stamina — top left</p>
      <BarControl
        label="Bar X"
        value={tuning.sbBarX}
        min={0}
        max={40}
        step={0.1}
        nudge={0.5}
        format={pct}
        onChange={(v) => onChange("sbBarX", v)}
      />
      <BarControl
        label="Bar Y"
        value={tuning.sbBarY}
        min={0}
        max={70}
        step={0.1}
        nudge={0.5}
        format={pct}
        onChange={(v) => onChange("sbBarY", v)}
      />
      <BarControl
        label="Bar width"
        value={tuning.sbBarW}
        min={40}
        max={90}
        step={0.1}
        nudge={0.5}
        format={pct}
        onChange={(v) => onChange("sbBarW", v)}
      />
      <BarControl
        label="Bar height"
        value={tuning.sbBarH}
        min={10}
        max={50}
        step={0.1}
        nudge={0.5}
        format={pct}
        onChange={(v) => onChange("sbBarH", v)}
      />
    </div>
  );
}
