"use client";

import { useState } from "react";

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function Slider({ label, value, min, max, step, format, numValue, numToValue, onChange }) {
  const apply = (n) => onChange(clamp(n, min, max));
  const displayNum = numValue != null ? numValue : value;
  const fromNum = numToValue ?? ((v) => v);
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
          step={step}
          value={parseFloat(displayNum.toFixed(4))}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            if (!Number.isNaN(n)) apply(fromNum(n));
          }}
        />
        <button type="button" className="poseNudgeBtn" onClick={() => apply(value + step)}>+</button>
      </div>
    </div>
  );
}

export default function LevelObjectTunePanel({ mesh, onCopyAll, onClose }) {
  if (!mesh) return null;

  const lo = mesh.userData.levelObject;
  const mat = mesh.material;
  const label = `${lo.type} #${lo.index}`;

  const [rotY, setRotY] = useState(mesh.rotation.y);
  const [posX, setPosX] = useState(mesh.position.x);
  const [posZ, setPosZ] = useState(mesh.position.z);

  const applyRotY = (v) => { setRotY(v); mesh.rotation.y = v; };
  const applyPosX = (v) => { setPosX(v); mesh.position.x = v; };
  const applyPosZ = (v) => { setPosZ(v); mesh.position.z = v; };

  const handleCopy = async () => {
    const def = { ...lo.def };
    if (posX !== lo.def.x) def.x = parseFloat(posX.toFixed(3));
    if (posZ !== lo.def.z) def.z = parseFloat(posZ.toFixed(3));
    if (rotY) def.rotationY = parseFloat(rotY.toFixed(4));
    const text = JSON.stringify(def, null, 2);
    try { await navigator.clipboard.writeText(text); } catch { /* */ }
    console.log(`Level object ${label}:`, text);
  };

  const handleReset = () => {
    const dr = lo.def.rotationY ?? 0;
    setRotY(dr); setPosX(lo.def.x); setPosZ(lo.def.z);
    mesh.rotation.y = dr;
    mesh.position.x = lo.def.x;
    mesh.position.z = lo.def.z;
  };

  return (
    <div
      className="weaponTunePanel"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="tunePanelHeader">
        <p className="weaponTuneTitle">Level: {label}</p>
        {onClose && (
          <button type="button" className="tunePanelClose" aria-label="Close" onClick={onClose}>×</button>
        )}
      </div>

      <p className="settingsGroup">Rotation</p>
      <Slider
        label="Y rotation"
        value={rotY}
        min={-Math.PI}
        max={Math.PI}
        step={0.01}
        format={(v) => `${(v * RAD_TO_DEG).toFixed(1)}°`}
        numValue={parseFloat((rotY * RAD_TO_DEG).toFixed(1))}
        numToValue={(deg) => deg * DEG_TO_RAD}
        onChange={applyRotY}
      />

      <p className="settingsGroup">Position</p>
      <Slider label="X" value={posX} min={-20} max={20} step={0.05}
        format={(v) => v.toFixed(2)} onChange={applyPosX} />
      <Slider label="Z" value={posZ} min={-20} max={20} step={0.05}
        format={(v) => v.toFixed(2)} onChange={applyPosZ} />

      <div className="weaponTuneActions">
        <button type="button" className="settingsBtn" onClick={handleCopy}>Copy JSON</button>
        {onCopyAll && <button type="button" className="settingsBtn" onClick={onCopyAll}>Copy all pillars</button>}
        <button type="button" className="settingsBtn" onClick={handleReset}>Reset</button>
      </div>
      <p className="settingsHint">
        Shoot a pillar to select it. Copy JSON to paste into your level file.
      </p>
    </div>
  );
}
