"use client";

/**
 * Rotating dial compass embedded in the bottom ammo HUD (right side).
 * Distinct from the top-centre tape compass ({@link HudCompass}).
 */
export default function HudBarCompass({ dialRef, bearingRef, dotsRef }) {
  return (
    <div className="hudBarCompass" role="img" aria-label="Heading dial">
      <div className="hudBarCompassRing">
        <div ref={dialRef} className="hudBarCompassDial">
          <span className="hudBarCompassMark hudBarCompassN">N</span>
          <span className="hudBarCompassMark hudBarCompassE">E</span>
          <span className="hudBarCompassMark hudBarCompassS">S</span>
          <span className="hudBarCompassMark hudBarCompassW">W</span>
        </div>
        <div className="hudBarCompassNeedle" aria-hidden="true" />
        <div ref={dotsRef} className="hudBarCompassDots" aria-hidden="true" />
        <span ref={bearingRef} className="hudBarCompassBearing">
          0°
        </span>
      </div>
    </div>
  );
}

const COMPASS_RANGE = 20;
const COMPASS_DOT_RADIUS = 42;

/**
 * @param {{
 *   dialRef: React.RefObject<HTMLElement | null>,
 *   bearingRef: React.RefObject<HTMLElement | null>,
 *   dotsRef: React.RefObject<HTMLElement | null>,
 *   playerYaw: number,
 *   cameraX: number,
 *   cameraZ: number,
 *   targets?: { visible?: boolean, position: { x: number, z: number }, userData?: { health?: number } }[],
 * }} opts
 */
export function updateHudBarCompass({
  dialRef,
  bearingRef,
  dotsRef,
  playerYaw,
  cameraX,
  cameraZ,
  targets,
}) {
  if (!dialRef.current) return;

  const yawDeg = (playerYaw * 180) / Math.PI;
  dialRef.current.style.transform = `rotate(${yawDeg}deg)`;

  if (bearingRef.current) {
    const bearing = (((-yawDeg % 360) + 360) % 360) | 0;
    bearingRef.current.textContent = `${bearing}°`;
  }

  if (!dotsRef.current || !targets?.length) return;

  const liveTargets = targets.filter((t) => {
    if (!t.visible || (t.userData?.health ?? 1) <= 0) return false;
    const dx = t.position.x - cameraX;
    const dz = t.position.z - cameraZ;
    return dx * dx + dz * dz <= COMPASS_RANGE * COMPASS_RANGE;
  });

  const container = dotsRef.current;
  while (container.children.length > liveTargets.length) {
    container.lastChild.remove();
  }
  while (container.children.length < liveTargets.length) {
    const dot = document.createElement("div");
    dot.className = "hudBarCompassDot";
    container.appendChild(dot);
  }

  for (let i = 0; i < liveTargets.length; i++) {
    const t = liveTargets[i];
    const dx = t.position.x - cameraX;
    const dz = t.position.z - cameraZ;
    const angle = Math.atan2(dx, -dz) + playerYaw;
    const dotX = 50 + Math.sin(angle) * COMPASS_DOT_RADIUS;
    const dotY = 50 - Math.cos(angle) * COMPASS_DOT_RADIUS;
    const dot = container.children[i];
    dot.style.left = `${dotX}%`;
    dot.style.top = `${dotY}%`;
  }
}
