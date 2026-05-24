import { subtractXInterval } from "./RoomPlacement.js";

/** @typedef {import("./loadArena.js").ArenaDoorway} ArenaDoorway */
/** @typedef {import("./loadArena.js").ArenaConfig} ArenaConfig */

/**
 * @typedef {{
 *   centerX: number,
 *   width: number,
 *   height: number,
 *   left: number,
 *   right: number,
 *   arch: boolean,
 *   radius: number,
 *   rectTop: number,
 * }} DoorOpening
 */

/** @param {ArenaConfig} arena @returns {ArenaDoorway[]} */
export function getArenaDoorways(arena) {
  if (arena.doorways?.length) return arena.doorways;
  if (arena.doorway) return [arena.doorway];
  return [];
}

/** @param {ArenaConfig} arena @returns {"north" | "south"} */
export function getArenaAttachWall(arena) {
  const first = getArenaDoorways(arena)[0];
  return first?.wall === "south" ? "south" : "north";
}

/** @param {ArenaConfig} arena @returns {ArenaDoorway | null} */
export function getPrimaryDoorway(arena) {
  return getArenaDoorways(arena)[0] ?? null;
}

/** @param {ArenaConfig} arena @param {"north" | "south"} side @returns {ArenaDoorway[]} */
export function getDoorwaysOnWall(arena, side) {
  return getArenaDoorways(arena).filter(
    (doorway) => (doorway.wall ?? "north") === side
  );
}

/** @param {ArenaDoorway} doorway @returns {DoorOpening} */
export function resolveDoorOpening(doorway) {
  const width = doorway.width ?? 1.1;
  const height = doorway.height ?? 2.05;
  const centerX = doorway.centerX ?? 0;
  const arch = doorway.top === "arch";
  const radius = arch ? width / 2 : 0;
  const rectTop = arch ? height - radius : height;
  return {
    centerX,
    width,
    height,
    left: centerX - width / 2,
    right: centerX + width / 2,
    arch,
    radius,
    rectTop,
  };
}

/**
 * @param {number} x0
 * @param {number} x1
 * @param {{ minX: number, maxX: number }[]} exclusions
 * @returns {[number, number][]}
 */
export function subtractXIntervals(x0, x1, exclusions) {
  let spans = [[x0, x1]];
  for (const ex of exclusions) {
    const next = [];
    for (const [a, b] of spans) {
      next.push(...subtractXInterval(a, b, ex.minX, ex.maxX));
    }
    spans = next;
  }
  return spans.filter(([a, b]) => b - a > 0.01);
}

/** Semicircle arch height at x (opening is below this Y). */
export function archSillY(opening, x) {
  if (!opening.arch || opening.radius <= 0) return opening.rectTop;
  const dx = x - opening.centerX;
  if (Math.abs(dx) >= opening.radius) return opening.rectTop;
  return opening.rectTop + Math.sqrt(opening.radius * opening.radius - dx * dx);
}

const ARCH_LINTEL_SLICES = 18;

/**
 * @param {(x0: number, x1: number, spanHeight: number, centerY: number) => void} pushSpan
 * @param {DoorOpening} opening
 * @param {number} wallHeight
 */
export function pushDoorLintelSpans(pushSpan, opening, wallHeight) {
  if (opening.arch) {
    const slices = ARCH_LINTEL_SLICES;
    const sliceW = opening.width / slices;
    for (let i = 0; i < slices; i++) {
      const x0 = opening.left + i * sliceW;
      const x1 = opening.left + (i + 1) * sliceW;
      const xMid = (x0 + x1) / 2;
      const sillY = archSillY(opening, xMid);
      const lintelH = wallHeight - sillY;
      if (lintelH > 0.05) {
        pushSpan(x0, x1, lintelH, sillY + lintelH / 2);
      }
    }
    return;
  }

  const lintelH = wallHeight - opening.height;
  if (lintelH > 0.1) {
    pushSpan(opening.left, opening.right, lintelH, opening.height + lintelH / 2);
  }
}

/**
 * @param {(x0: number, x1: number, bottomY: number, topY: number) => void} pushSpan
 * @param {DoorOpening} opening
 * @param {number} wallHeight
 */
export function pushDoorColliders(pushSpan, opening, wallHeight) {
  pushDoorLintelSpans(
    (x0, x1, spanHeight, centerY) =>
      pushSpan(x0, x1, centerY - spanHeight / 2, centerY + spanHeight / 2),
    opening,
    wallHeight
  );
}

/** @param {DoorOpening[]} openings @returns {{ minX: number, maxX: number }[]} */
export function openingsToExclusions(openings) {
  return openings.map((opening) => ({
    minX: opening.left,
    maxX: opening.right,
  }));
}

/** @param {DoorOpening[]} openings */
export function sortOpeningsByX(openings) {
  return [...openings].sort((a, b) => a.left - b.left);
}
