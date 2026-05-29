/** List ground surfaces supporting a world point. Run: node scripts/deck-support-test.mjs */
import * as THREE from "three";
import { readFileSync } from "node:fs";
import { createLevelFromArena } from "../lib/Level.js";
import { getDefaultStairPlacement } from "../lib/StairTuning.js";

const raw = JSON.parse(
  readFileSync(new URL("../public/levels/level1.json", import.meta.url), "utf8")
);
raw.stairs = getDefaultStairPlacement();

const scene = new THREE.Scene();
const level = createLevelFromArena(scene, raw);

const x = -3.809;
const z = -9.524;
const footY = 4.35;

console.log("catwalkDeckY:", level.catwalkDeckY);
console.log("Point:", { x, z, footY });

let anyMatch = false;
for (const surf of level.groundSurfaces) {
  if (surf.stairFlight || surf.stairRamp) continue;
  if (surf.y == null || Math.abs(surf.y - footY) > 0.15) continue;
  if (surf.minX == null) continue;
  if (x >= surf.minX && x <= surf.maxX && z >= surf.minZ && z <= surf.maxZ) {
    anyMatch = true;
    console.log("MATCH:", {
      y: surf.y,
      arenaCatwalkDeck: !!surf.arenaCatwalkDeck,
      bounds: [surf.minX, surf.maxX, surf.minZ, surf.maxZ].map((v) =>
        v.toFixed(2)
      ),
    });
  }
}

console.log(anyMatch ? "\nBUG: still supported in void" : "\nOK: no catwalk support in void");

console.log("\nArena catwalk pieces:");
for (const surf of level.groundSurfaces.filter((s) => s.arenaCatwalkDeck)) {
  console.log(
    `  x[${surf.minX.toFixed(1)},${surf.maxX.toFixed(1)}] z[${surf.minZ.toFixed(1)},${surf.maxZ.toFixed(1)}]`
  );
}
