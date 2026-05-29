"use client";

import { useMemo } from "react";

const CARDINALS = {
  0: "N",
  45: "NE",
  90: "E",
  135: "SE",
  180: "S",
  225: "SW",
  270: "W",
  315: "NW",
};

function labelForDegree(deg) {
  const d = ((deg % 360) + 360) % 360;
  if (CARDINALS[d]) return CARDINALS[d];
  if (d % 15 === 0) return String(d);
  return null;
}

function buildCompassMarks(minDeg = -360, maxDeg = 720, step = 5) {
  const marks = [];
  for (let deg = minDeg; deg <= maxDeg; deg += step) {
    const norm = ((deg % 360) + 360) % 360;
    const isMajor = norm % 15 === 0;
    marks.push({
      deg,
      isMajor,
      label: isMajor ? labelForDegree(norm) : null,
      isCardinal: isMajor && CARDINALS[norm] != null,
    });
  }
  return marks;
}

const COMPASS_MARKS = buildCompassMarks();

export default function HudCompass({ tapeRef, viewportRef, markersRef }) {
  const marks = useMemo(() => COMPASS_MARKS, []);

  return (
    <div className="hudCompass" role="img" aria-label="Compass heading">
      <div className="hudCompassFrame">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/ui/compass-background.png"
          alt=""
          className="hudCompassBg"
          draggable={false}
        />
        <div ref={viewportRef} className="hudCompassViewport">
          <div ref={tapeRef} className="hudCompassTape">
            {marks.map(({ deg, isMajor, label, isCardinal }) => (
              <div
                key={deg}
                className={`hudCompassTick${isMajor ? " hudCompassTickMajor" : ""}${
                  isCardinal ? " hudCompassTickCardinal" : ""
                }`}
                style={{ left: `calc(var(--compass-px-per-deg, 3px) * ${deg})` }}
              >
                <span className="hudCompassTickLine" aria-hidden="true" />
                {label ? (
                  <span
                    className={`hudCompassTickLabel${
                      isCardinal ? " hudCompassTickLabelCardinal" : ""
                    }${label === "N" ? " hudCompassTickLabelNorth" : ""}`}
                  >
                    {label}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
          <div ref={markersRef} className="hudCompassMarkers" aria-hidden="true" />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/ui/compass-pin.png"
          alt=""
          className="hudCompassPin"
          draggable={false}
        />
      </div>
    </div>
  );
}
