/** node scripts/stair-edge-probe.mjs */
import * as THREE from "three";
import { buildStairFlight, getStairCeilingCutout } from "../lib/LevelStairs.js";
import { getDefaultStairPlacement, getArenaCatwalkDeckY } from "../lib/StairTuning.js";
import { shouldSkipCollider, rotatedBoxOverlapsCircle } from "../lib/Collision.js";

function deckRectPieces(fullMinX, fullMaxX, fullMinZ, fullMaxZ, hole) {
  if (!hole) return [{ minX: fullMinX, maxX: fullMaxX, minZ: fullMinZ, maxZ: fullMaxZ }];
  const { minX: hx0, maxX: hx1, minZ: hz0, maxZ: hz1 } = hole;
  const pieces = [];
  const gap = 0.01;
  if (fullMinZ < hz0 - gap)
    pieces.push({ minX: fullMinX, maxX: fullMaxX, minZ: fullMinZ, maxZ: Math.min(fullMaxZ, hz0) });
  if (hz1 + gap < fullMaxZ)
    pieces.push({ minX: fullMinX, maxX: fullMaxX, minZ: Math.max(fullMinZ, hz1), maxZ: fullMaxZ });
  const zMid0 = Math.max(fullMinZ, hz0);
  const zMid1 = Math.min(fullMaxZ, hz1);
  if (zMid1 > zMid0 + gap) {
    if (fullMinX < hx0 - gap)
      pieces.push({ minX: fullMinX, maxX: Math.min(fullMaxX, hx0), minZ: zMid0, maxZ: zMid1 });
    if (hx1 + gap < fullMaxX)
      pieces.push({ minX: Math.max(fullMinX, hx1), maxX: fullMaxX, minZ: zMid0, maxZ: zMid1 });
  }
  return pieces;
}

const arena = { size: 28, wallHeight: 4, wallThickness: 0.5, ceilingThickness: 0.35 };
const placement = getDefaultStairPlacement();
const catwalkY = getArenaCatwalkDeckY(arena);
const cutout = getStairCeilingCutout(placement);
const edgeStandoff = { west: 0, east: 0.5, north: 0.5, south: 0.5 };

const group = new THREE.Group();
const mat = new THREE.MeshStandardMaterial({ color: 0x888888 });
const built = buildStairFlight(group, placement, mat, mat, {
  catwalkDeckY: catwalkY,
  catwalkEdgeStandoff: edgeStandoff,
});
const stairFlight = built.groundSurfaces.find((s) => s.stairFlight)?.stairFlight;
const colliders = [...built.colliders];

const fullWidth = 29.5;
const fullMinX = 0;
const fullMaxX = 14.75;
const deckPieces = deckRectPieces(fullMinX, fullMaxX, -fullWidth / 2, fullWidth / 2, cutout);
const groundSurfaces = [];
for (const p of deckPieces) {
  colliders.push({
    x: (p.minX + p.maxX) / 2,
    z: (p.minZ + p.maxZ) / 2,
    halfX: (p.maxX - p.minX) / 2,
    halfZ: (p.maxZ - p.minZ) / 2,
    bottomY: catwalkY - 0.35,
    topY: catwalkY,
    kind: "deck",
  });
  groundSurfaces.push({ ...p, y: catwalkY, edgeStandoff, arenaCatwalkDeck: true });
}
for (const s of built.groundSurfaces) {
  if (s.minX != null && s.catwalkWalk) groundSurfaces.push(s);
}

const scratch = new THREE.Vector3();
function worldToLocal(x, z) {
  scratch.set(x, 0, z);
  scratch.applyMatrix4(stairFlight.inverseMatrix);
  return { localX: scratch.x, localZ: scratch.z };
}

const footY = 4.35;
const bodyTop = footY + 1.65;
const R = 0.35;

function supportAt(px, pz) {
  for (const surf of groundSurfaces) {
    if (surf.stairRamp) continue;
    if (surf.y == null || Math.abs(surf.y - footY) > 0.15) continue;
    if (surf.minX == null) continue;
    if (px >= surf.minX && px <= surf.maxX && pz >= surf.minZ && pz <= surf.maxZ) return "yes";
  }
  return "NO";
}

function probe(px, pz) {
  console.log(`\n(${px.toFixed(3)}, ${pz.toFixed(3)}) local`, worldToLocal(px, pz), "support:", supportAt(px, pz));
  for (const box of colliders) {
    if (!rotatedBoxOverlapsCircle(box, px, pz, R)) continue;
    if (!shouldSkipCollider(box, footY, bodyTop, 0.42, footY, worldToLocal(px, pz), 0, null, false)) {
      console.log("  BLOCK", box.kind);
    }
  }
}

console.log("cutout", cutout);
console.log("landing", built.groundSurfaces.find((s) => s.catwalkWalk));
probe(6.929, -3.908);
for (const pz of [-3.908, -4.2, -4.5, -5.0, -5.5, -5.908]) {
  probe(6.929, pz);
}
for (const px of [6.929, 6, 5.5, 5.2, 5.0]) probe(px, -3.908);
