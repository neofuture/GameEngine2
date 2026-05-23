import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const geometryCache = new Map();

/**
 * @param {"box" | "rounded"} shape
 * @param {number} width
 * @param {number} height
 * @param {number} depth
 * @param {{ cornerRadius?: number, cornerSegments?: number }} [options]
 */
export function getPillarGeometry(shape, width, height, depth, options = {}) {
  const cornerRadius = options.cornerRadius ?? width * 0.1;
  const cornerSegments = options.cornerSegments ?? 4;
  const key = `${shape}|${width}|${height}|${depth}|${cornerRadius}|${cornerSegments}`;
  const cached = geometryCache.get(key);
  if (cached) return cached;

  let geometry;
  if (shape === "rounded") {
    geometry = new RoundedBoxGeometry(
      width,
      height,
      depth,
      cornerSegments,
      cornerRadius
    );
  } else {
    geometry = new THREE.BoxGeometry(width, height, depth);
  }

  geometryCache.set(key, geometry);
  return geometry;
}

/** @param {import("./loadArena.js").ArenaPillar} pillarDef @param {import("./loadArena.js").ArenaConfig} arena */
export function resolvePillarShape(pillarDef, arena) {
  const defaults = arena.pillarDefaults ?? {};
  const shape = pillarDef.shape ?? defaults.shape ?? "box";
  return {
    shape: shape === "rounded" ? "rounded" : "box",
    cornerRadius:
      pillarDef.cornerRadius ??
      defaults.cornerRadius ??
      arena.pillarSize * 0.1,
    cornerSegments: pillarDef.cornerSegments ?? defaults.cornerSegments ?? 4,
  };
}
