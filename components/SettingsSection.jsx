"use client";

import { useState } from "react";

function Chevron({ open }) {
  return (
    <span className="settingsSectionChevron" aria-hidden>
      {open ? "▾" : "▸"}
    </span>
  );
}

export function SettingsSection({
  title,
  defaultOpen = false,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="settingsSection">
      <button
        type="button"
        className="settingsSectionHeader"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{title}</span>
        <Chevron open={open} />
      </button>
      {open && <div className="settingsSectionBody">{children}</div>}
    </section>
  );
}

export function SettingsSubSection({
  title,
  defaultOpen = false,
  headerAction,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="settingsSubSection">
      <div className="settingsSubSectionHeader">
        <button
          type="button"
          className="settingsSubSectionToggle"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span>{title}</span>
          <Chevron open={open} />
        </button>
        {headerAction}
      </div>
      {open && <div className="settingsSubSectionBody">{children}</div>}
    </div>
  );
}
