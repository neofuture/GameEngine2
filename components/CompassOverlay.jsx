"use client";

const CARDINALS = [
  { label: "N", className: "compassN" },
  { label: "E", className: "compassE" },
  { label: "S", className: "compassS" },
  { label: "W", className: "compassW" },
];

export default function CompassOverlay({ dialRef }) {
  return (
    <div className="compassOverlay" role="img" aria-label="Compass">
      <div ref={dialRef} className="compassDial">
        {CARDINALS.map(({ label, className }) => (
          <span key={label} className={`compassMark ${className}`}>
            {label}
          </span>
        ))}
      </div>
      <div className="compassHeading" aria-hidden="true" />
    </div>
  );
}
