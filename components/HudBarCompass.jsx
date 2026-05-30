"use client";

/** Reserved slot on the bottom ammo HUD — content TBD. */
export default function HudBarCompass() {
  return (
    <div className="hudBarCompass" aria-hidden="true">
      <div className="hudBarCompassRing" />
    </div>
  );
}
