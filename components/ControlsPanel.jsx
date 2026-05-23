"use client";

import {
  BINDING_ROWS,
  formatBindingValue,
  resetBindings,
} from "@/lib/KeyBindings";

export default function ControlsPanel({
  onClose,
  onReleasePointer,
  bindings,
  onBindingsChange,
  rebindAction,
  onRebindActionChange,
}) {
  const releasePointer = () => onReleasePointer?.();

  return (
    <div
      className="settingsBackdrop"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClose}
    >
      <div
        className="settingsModal"
        role="dialog"
        aria-labelledby="controls-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settingsHeader">
          <h2 id="controls-title">Controls</h2>
          <button type="button" className="settingsClose" onClick={onClose}>
            Close
          </button>
        </div>

        {rebindAction && (
          <p className="rebindPrompt">
            Press a key for{" "}
            <strong>
              {BINDING_ROWS.find((r) => r.id === rebindAction)?.label}
            </strong>
            … (Esc to cancel)
          </p>
        )}
        <ul className="bindingsList">
          {BINDING_ROWS.map((row) => (
            <li key={row.id} className="bindingRow">
              <span className="bindingLabel">{row.label}</span>
              <button
                type="button"
                className={
                  rebindAction === row.id
                    ? "bindingKey bindingKeyActive"
                    : "bindingKey"
                }
                onClick={() => {
                  releasePointer();
                  onRebindActionChange(row.id);
                }}
              >
                {rebindAction === row.id
                  ? "…"
                  : formatBindingValue(bindings[row.id])}
              </button>
            </li>
          ))}
          <li className="bindingRow bindingRowFixed">
            <span className="bindingLabel">Look (mouse)</span>
            <span className="bindingKey bindingKeyFixed">Mouse</span>
          </li>
          <li className="bindingRow bindingRowFixed">
            <span className="bindingLabel">Close controls</span>
            <span className="bindingKey bindingKeyFixed">Esc</span>
          </li>
        </ul>
        <button
          type="button"
          className="settingsBtn bindingsReset"
          onClick={() => {
            const next = resetBindings();
            onBindingsChange(next);
            onRebindActionChange(null);
          }}
        >
          Reset bindings to default
        </button>
      </div>
    </div>
  );
}
