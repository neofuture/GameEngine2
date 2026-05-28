import * as THREE from "three";

/**
 * Per-face world UVs for north/south perimeter walls (wide in X, thin in Z).
 * Main faces map X×Y; jambs map Z×Y; lintel caps map X×Z — so the texture wraps
 * through the doorway instead of extruding a single column of pixels.
 *
 * Works with material repeat (arenaSize/tile × wallHeight/tile).
 *
 * @param {THREE.BufferGeometry} geometry World-space positions (e.g. after translate).
 * @param {number} arenaHalf
 * @param {number} arenaSize
 * @param {number} wallHeight
 * @param {number} wallThickness
 * @param {number} wallCenterZ World Z of the wall box center
 */
export function applyArenaWallUVs(
  geometry,
  arenaHalf,
  arenaSize,
  wallHeight,
  wallThickness,
  wallCenterZ
) {
  const pos = geometry.attributes.position;
  const norm = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  const zMin = wallCenterZ - wallThickness * 0.5;
  const zMax = wallCenterZ + wallThickness * 0.5;

  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i);
    const wy = pos.getY(i);
    const wz = pos.getZ(i);
    const nx = norm.getX(i);
    const ny = norm.getY(i);
    const nz = norm.getZ(i);

    const ax = Math.abs(nx);
    const ay = Math.abs(ny);
    const az = Math.abs(nz);

    let u;
    let v;

    if (az >= ax && az >= ay) {
      // ±Z — primary wall surface (X horizontal, Y vertical)
      u = (wx + arenaHalf) / arenaSize;
      v = wy / wallHeight;
    } else if (ax >= ay && ax >= az) {
      // ±X — doorway jambs / wall sides (Z through thickness, Y vertical)
      u = nx < 0 ? (zMax - wz) / arenaSize : (wz - zMin) / arenaSize;
      v = wy / wallHeight;
    } else {
      // ±Y — lintel underside / top (X horizontal, Z through thickness)
      u = (wx + arenaHalf) / arenaSize;
      v = ny < 0 ? (zMax - wz) / arenaSize : (wz - zMin) / arenaSize;
    }

    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
}

/**
 * @param {number} width
 * @param {number} height
 * @param {number} depth
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} centerZ
 * @param {number} arenaHalf
 * @param {number} arenaSize
 * @param {number} wallHeight
 * @returns {THREE.BoxGeometry}
 */
export function createArenaWallBoxGeometry(
  width,
  height,
  depth,
  centerX,
  centerY,
  centerZ,
  arenaHalf,
  arenaSize,
  wallHeight
) {
  const geo = new THREE.BoxGeometry(width, height, depth);
  geo.translate(centerX, centerY, centerZ);
  applyArenaWallUVs(
    geo,
    arenaHalf,
    arenaSize,
    wallHeight,
    depth,
    centerZ
  );
  return geo;
}

/**
 * Per-face UVs matching Three.js BoxGeometry axis conventions, scaled to tile
 * metres so repeat 1×1 tiles correctly on every face (no stretch on long sides).
 *
 * @param {THREE.BufferGeometry} geometry
 * @param {number} width X extent
 * @param {number} height Y extent
 * @param {number} depth Z extent
 * @param {number} tileSizeMeters
 */
export function applyCentredBoxWorldUVs(
  geometry,
  width,
  height,
  depth,
  tileSizeMeters
) {
  const pos = geometry.attributes.position;
  const norm = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  const halfW = width / 2;
  const halfH = height / 2;
  const halfD = depth / 2;
  const tile = tileSizeMeters;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = norm.getX(i);
    const ny = norm.getY(i);
    const nz = norm.getZ(i);
    const ax = Math.abs(nx);
    const ay = Math.abs(ny);
    const az = Math.abs(nz);

    let u;
    let v;
    if (ax >= ay && ax >= az) {
      // ±X — u along Z, v along Y (BoxGeometry px / nx)
      u = nx > 0 ? (halfD - z) / tile : (z + halfD) / tile;
      v = (halfH - y) / tile;
    } else if (az >= ax && az >= ay) {
      // ±Z — u along X, v along Y (BoxGeometry pz / nz)
      u = nz > 0 ? (x + halfW) / tile : (halfW - x) / tile;
      v = (halfH - y) / tile;
    } else {
      // ±Y — u along X, v along Z (BoxGeometry py / ny)
      u = (x + halfW) / tile;
      v = ny > 0 ? (halfD - z) / tile : (z + halfD) / tile;
    }
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
}

/**
 * Position-based UVs in tile metres — tiles correctly on every face (including
 * long sides) and stays continuous around vertical corners. u = (x − z) matches
 * Three.js box face directions so hazard diagonals align with arena pillars.
 *
 * @param {THREE.BufferGeometry} geometry
 * @param {number} height Y extent
 * @param {number} tileSizeMeters
 */
export function applyContinuousBoxWorldUVs(geometry, height, tileSizeMeters) {
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const halfH = height / 2;
  const tile = tileSizeMeters;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    uv.setXY(i, (x - z) / tile, (halfH - y) / tile);
  }
  uv.needsUpdate = true;
}
