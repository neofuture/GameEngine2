import * as THREE from "three";

/* ── Tuneable defaults ────────────────────────────────────────────── */

const defaults = {
  width: 1.325,
  height: 0.9,
  depth: 1.0,
  cornerSize: 0.114,
  bodyU: 0.705,
  bodyV: 0.924,
  bodyClip: 0.151,
  topU: 0.736,
  topV: 0.755,
  topClip: -0.208,
  endU: 1.0,
  endV: 1.0,
};

let _params = { ...defaults };
let _geo = null;
let _mats = null;
let _frontTex = null;
let _topTex = null;
let _endTex = null;

const _loader = new THREE.TextureLoader();

const MAT_BODY = 0;
const MAT_TOP = 1;
const MAT_END = 2;

const UV_Y      = 0;
const UV_Y_FLIP = 1;
const UV_Z      = 2;

/* ── Helpers ──────────────────────────────────────────────────────── */

function loadTex(path) {
  const tex = _loader.load(path);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 16;
  return tex;
}

function configureCrateTex(tex) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 16;
  return tex;
}

function ensureTextures() {
  if (!_frontTex) _frontTex = loadTex("/ui/crate/front.png");
  if (!_topTex) _topTex = loadTex("/ui/crate/top.png");
  if (!_endTex) _endTex = loadTex("/ui/crate/endcap.png");
}

let _cratePreloadPromise = null;

/** Decode ammo-crate UI textures before first pickup spawn. */
export function preloadAmmoCrateAssets() {
  if (_frontTex && _topTex && _endTex) return Promise.resolve();
  if (_cratePreloadPromise) return _cratePreloadPromise;
  _cratePreloadPromise = Promise.all([
    _loader.loadAsync("/ui/crate/front.png"),
    _loader.loadAsync("/ui/crate/top.png"),
    _loader.loadAsync("/ui/crate/endcap.png"),
  ])
    .then(([front, top, end]) => {
      _frontTex = configureCrateTex(front);
      _topTex = configureCrateTex(top);
      _endTex = configureCrateTex(end);
      if (_mats) applyTextureParams(_params);
    })
    .catch((err) => {
      _cratePreloadPromise = null;
      throw err;
    });
  return _cratePreloadPromise;
}

/* ── Geometry ─────────────────────────────────────────────────────── */

function buildGeometry(p) {
  const { width: W, height: H, depth: D, cornerSize: r } = p;
  const hw = W / 2, hh = H / 2, hd = D / 2;
  const cs = Math.max(0, Math.min(r, hh - 0.001, hd - 0.001));

  const profile = [
    { z: -hd + cs, y: -hh      },  // 0
    { z:  hd - cs, y: -hh      },  // 1
    { z:  hd,      y: -hh + cs },  // 2
    { z:  hd,      y:  hh - cs },  // 3
    { z:  hd - cs, y:  hh      },  // 4
    { z: -hd + cs, y:  hh      },  // 5
    { z: -hd,      y:  hh - cs },  // 6
    { z: -hd,      y: -hh + cs },  // 7
  ];

  const mid34 = { y: (profile[3].y + profile[4].y) / 2, z: (profile[3].z + profile[4].z) / 2 };
  const mid56 = { y: (profile[5].y + profile[6].y) / 2, z: (profile[5].z + profile[6].z) / 2 };
  const mid70 = { y: (profile[7].y + profile[0].y) / 2, z: (profile[7].z + profile[0].z) / 2 };
  const mid12 = { y: (profile[1].y + profile[2].y) / 2, z: (profile[1].z + profile[2].z) / 2 };

  const sideFaceDefs = [
    { p0: profile[0], p1: profile[1], mat: MAT_BODY, uv: UV_Z },
    { p0: profile[1], p1: mid12,      mat: MAT_BODY, uv: UV_Z,      bleedEnd: 1, clipKey: "bodyClip" },
    { p0: mid12,      p1: profile[2], mat: MAT_BODY, uv: UV_Y_FLIP, bleedEnd: 0, clipKey: "bodyClip" },
    { p0: profile[2], p1: profile[3], mat: MAT_BODY, uv: UV_Y_FLIP },
    { p0: profile[3], p1: mid34,      mat: MAT_BODY, uv: UV_Y_FLIP, bleedEnd: 1, clipKey: "bodyClip" },
    { p0: mid34,      p1: profile[4], mat: MAT_TOP,  uv: UV_Z,      bleedEnd: 0, clipKey: "topClip" },
    { p0: profile[4], p1: profile[5], mat: MAT_TOP,  uv: UV_Z },
    { p0: profile[5], p1: mid56,      mat: MAT_TOP,  uv: UV_Z,      bleedEnd: 1, clipKey: "topClip" },
    { p0: mid56,      p1: profile[6], mat: MAT_BODY, uv: UV_Y,      bleedEnd: 0, clipKey: "bodyClip" },
    { p0: profile[6], p1: profile[7], mat: MAT_BODY, uv: UV_Y },
    { p0: profile[7], p1: mid70,      mat: MAT_BODY, uv: UV_Y,      bleedEnd: 1, clipKey: "bodyClip" },
    { p0: mid70,      p1: profile[0], mat: MAT_BODY, uv: UV_Z,      bleedEnd: 0, clipKey: "bodyClip" },
  ];

  const activeSides = [];
  for (const fd of sideFaceDefs) {
    const len = Math.sqrt((fd.p1.z - fd.p0.z) ** 2 + (fd.p1.y - fd.p0.y) ** 2);
    if (len > 0.0001) activeSides.push(fd);
  }

  const ec = cs * 0.4; // end chamfer depth along X
  const sideQuadCount = activeSides.length;
  const n = profile.length;
  // Per cap: n chamfer quads (4 verts, 6 idx each) + n fan tris (3 verts, 3 idx each)
  const capQuadVerts = n * 4;
  const capQuadIdx   = n * 6;
  const capFanVerts  = n * 3;
  const capFanIdx    = n * 3;
  const perCap = capQuadVerts + capFanVerts;
  const perCapIdx = capQuadIdx + capFanIdx;

  const totalVerts = sideQuadCount * 4 + perCap * 2;
  const totalIdx   = sideQuadCount * 6 + perCapIdx * 2;

  const positions = new Float32Array(totalVerts * 3);
  const normals   = new Float32Array(totalVerts * 3);
  const uvs       = new Float32Array(totalVerts * 2);
  const indices   = new Uint32Array(totalIdx);
  const geo = new THREE.BufferGeometry();

  let vi = 0, ii = 0, groupIdx = 0;

  const calcUV = (uvMode, x, y, z) => {
    switch (uvMode) {
      case UV_Y:      return [ -x, y ];
      case UV_Y_FLIP: return [ x, y ];
      case UV_Z:      return [ x, -z ];
    }
  };

  // ── Side faces ──
  for (let f = 0; f < sideQuadCount; f++) {
    const face = activeSides[f];
    const { p0, p1, mat, uv: uvMode, bleedEnd, clipKey } = face;

    let fy0 = p0.y, fz0 = p0.z;
    let fy1 = p1.y, fz1 = p1.z;

    if (clipKey !== undefined) {
      const clip = p[clipKey];
      if (bleedEnd === 1) {
        fy1 = p1.y + (p0.y - p1.y) * clip;
        fz1 = p1.z + (p0.z - p1.z) * clip;
      } else {
        fy0 = p0.y + (p1.y - p0.y) * clip;
        fz0 = p0.z + (p1.z - p0.z) * clip;
      }
    }

    const dy = fy1 - fy0, dz = fz1 - fz0;
    const len = Math.sqrt(dy * dy + dz * dz);
    const ny = len > 0.0001 ? -dz / len : 0;
    const nz = len > 0.0001 ?  dy / len : 0;

    const base = vi;

    const setVert = (px, py, pz, u, v) => {
      positions[vi * 3]     = px;
      positions[vi * 3 + 1] = py;
      positions[vi * 3 + 2] = pz;
      normals[vi * 3]       = 0;
      normals[vi * 3 + 1]   = ny;
      normals[vi * 3 + 2]   = nz;
      uvs[vi * 2]     = u;
      uvs[vi * 2 + 1] = v;
      vi++;
    };

    const [u0, v0] = calcUV(uvMode, -hw, fy0, fz0);
    const [u1, v1] = calcUV(uvMode,  hw, fy0, fz0);
    const [u2, v2] = calcUV(uvMode,  hw, fy1, fz1);
    const [u3, v3] = calcUV(uvMode, -hw, fy1, fz1);

    setVert(-hw, fy0, fz0, u0, v0);
    setVert( hw, fy0, fz0, u1, v1);
    setVert( hw, fy1, fz1, u2, v2);
    setVert(-hw, fy1, fz1, u3, v3);

    indices[ii++] = base;
    indices[ii++] = base + 1;
    indices[ii++] = base + 2;
    indices[ii++] = base;
    indices[ii++] = base + 2;
    indices[ii++] = base + 3;

    geo.addGroup(groupIdx, 6, mat);
    groupIdx += 6;
  }

  // ── End caps with chamfer ──
  // Each end has:
  //   1. Chamfer quads connecting outer profile edge (at hw) to inset profile (at hw - ec)
  //   2. Flat fan filling the inset octagon
  // The inset profile scales Y/Z inward by ec to create the bevel.
  for (const side of [-1, 1]) {
    const xOuter = side * hw;
    const xInner = side * (hw - ec);
    const nxCap = side;

    // Build inset profile (shrink toward centre by ec)
    const inset = profile.map(pt => {
      const len = Math.sqrt(pt.y * pt.y + pt.z * pt.z);
      if (len < 0.0001) return { y: pt.y, z: pt.z };
      const s = Math.max(0, (len - ec)) / len;
      return { y: pt.y * s, z: pt.z * s };
    });

    // Chamfer quads
    const chamStart = ii;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = profile[i], b = profile[j];
      const ai = inset[i], bi = inset[j];

      const base = vi;
      const setV = (px, py, pz, snx, sny, snz, su, sv) => {
        positions[vi*3] = px; positions[vi*3+1] = py; positions[vi*3+2] = pz;
        normals[vi*3] = snx; normals[vi*3+1] = sny; normals[vi*3+2] = snz;
        uvs[vi*2] = su; uvs[vi*2+1] = sv;
        vi++;
      };

      // Chamfer face normal: average of outward X and outward profile edge normal
      const emy = (a.y + b.y) / 2;
      const emz = (a.z + b.z) / 2;
      const eLen = Math.sqrt(emy * emy + emz * emz);
      const eny = eLen > 0 ? emy / eLen : 0;
      const enz = eLen > 0 ? emz / eLen : 0;
      const cnx = nxCap * 0.707, cny = eny * 0.707, cnz = enz * 0.707;

      // outer a, outer b, inner b, inner a
      setV(xOuter, a.y,  a.z,  cnx, cny, cnz, -side * a.z,  a.y);
      setV(xOuter, b.y,  b.z,  cnx, cny, cnz, -side * b.z,  b.y);
      setV(xInner, bi.y, bi.z, cnx, cny, cnz, -side * bi.z, bi.y);
      setV(xInner, ai.y, ai.z, cnx, cny, cnz, -side * ai.z, ai.y);

      if (side === 1) {
        indices[ii++] = base;     indices[ii++] = base + 1; indices[ii++] = base + 2;
        indices[ii++] = base;     indices[ii++] = base + 2; indices[ii++] = base + 3;
      } else {
        indices[ii++] = base;     indices[ii++] = base + 2; indices[ii++] = base + 1;
        indices[ii++] = base;     indices[ii++] = base + 3; indices[ii++] = base + 2;
      }
    }
    geo.addGroup(groupIdx, ii - chamStart, MAT_END);
    groupIdx = ii;

    // Flat inset fan
    const fanStart = ii;
    for (let i = 0; i < n; i++) {
      const a = inset[i];
      const b = inset[(i + 1) % n];
      const base = vi;

      positions[vi*3] = xInner; positions[vi*3+1] = 0; positions[vi*3+2] = 0;
      normals[vi*3] = nxCap; normals[vi*3+1] = 0; normals[vi*3+2] = 0;
      uvs[vi*2] = 0; uvs[vi*2+1] = 0;
      vi++;

      positions[vi*3] = xInner; positions[vi*3+1] = a.y; positions[vi*3+2] = a.z;
      normals[vi*3] = nxCap; normals[vi*3+1] = 0; normals[vi*3+2] = 0;
      uvs[vi*2] = -side * a.z; uvs[vi*2+1] = a.y;
      vi++;

      positions[vi*3] = xInner; positions[vi*3+1] = b.y; positions[vi*3+2] = b.z;
      normals[vi*3] = nxCap; normals[vi*3+1] = 0; normals[vi*3+2] = 0;
      uvs[vi*2] = -side * b.z; uvs[vi*2+1] = b.y;
      vi++;

      if (side === 1) {
        indices[ii++] = base; indices[ii++] = base + 1; indices[ii++] = base + 2;
      } else {
        indices[ii++] = base; indices[ii++] = base + 2; indices[ii++] = base + 1;
      }
    }
    geo.addGroup(groupIdx, ii - fanStart, MAT_END);
    groupIdx = ii;
  }

  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal",   new THREE.BufferAttribute(normals, 3));
  geo.setAttribute("uv",       new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));

  return geo;
}

/* ── Textures ─────────────────────────────────────────────────────── */

function applyTextureParams(p) {
  if (!_mats) return;
  const bodyMat = _mats[MAT_BODY];
  const topMat  = _mats[MAT_TOP];
  const endMat  = _mats[MAT_END];

  if (bodyMat.map) {
    bodyMat.map.repeat.set(p.bodyU, p.bodyV);
    bodyMat.map.offset.set(0.5, 0.5);
    bodyMat.map.needsUpdate = true;
  }
  if (topMat.map) {
    topMat.map.repeat.set(p.topU, p.topV);
    topMat.map.offset.set(0.5, 0.5);
    topMat.map.needsUpdate = true;
  }
  if (endMat.map) {
    endMat.map.repeat.set(p.endU, p.endV);
    endMat.map.offset.set(0.5, 0.5);
    endMat.map.needsUpdate = true;
  }
}

export function getMaterials() {
  if (!_mats) {
    ensureTextures();
    _mats = [
      new THREE.MeshStandardMaterial({
        map: _frontTex,
        metalness: 0.6, roughness: 0.45,
      }),
      new THREE.MeshStandardMaterial({
        map: _topTex,
        metalness: 0.6, roughness: 0.4,
      }),
      new THREE.MeshStandardMaterial({
        map: _endTex,
        metalness: 0.3, roughness: 0.5,
        side: THREE.DoubleSide,
      }),
    ];
    applyTextureParams(_params);
  }
  return _mats;
}

export function getGeometry() {
  if (!_geo) _geo = buildGeometry(_params);
  return _geo;
}

/* ── Public API ───────────────────────────────────────────────────── */

export function setCrateParams(newParams) {
  const needsRebuild =
    newParams.width !== _params.width ||
    newParams.height !== _params.height ||
    newParams.depth !== _params.depth ||
    newParams.cornerSize !== _params.cornerSize ||
    newParams.bodyClip !== _params.bodyClip ||
    newParams.topClip !== _params.topClip;

  Object.assign(_params, newParams);

  if (needsRebuild && _geo) {
    const old = _geo;
    _geo = buildGeometry(_params);
    old.dispose();
  }

  applyTextureParams(_params);

  return needsRebuild ? _geo : null;
}

export function getCrateParams() {
  return { ..._params };
}

export function createDisplayAmmoCrate(scene, x, y, z, scale = 1) {
  const mesh = new THREE.Mesh(getGeometry(), getMaterials());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.scale.setScalar(scale);
  mesh.position.set(x, y, z);
  scene.add(mesh);
  return mesh;
}

/* ── Ammo drop pickup system ─────────────────────────────────────── */

const AMMO_DROP_VALUE = 10;
const AMMO_DROP_SCALE = 0.25;
const AMMO_DROP_GRAVITY = 12;
const AMMO_DROP_BOUNCE = 0.5;
const AMMO_DROP_FRICTION = 3;
const AMMO_DROP_COLLECT_RADIUS = 1.2;
const AMMO_DROP_LIFETIME = 20;
const AMMO_DROP_FADE = 1.5;
const AMMO_DROP_SPIN = 2.5;
const AMMO_DROP_BOB_SPEED = 2.0;
const AMMO_DROP_BOB_HEIGHT = 0.06;
const AMMO_DROP_SETTLE_Y = (_params.height * AMMO_DROP_SCALE) / 2 + 0.02;

export function spawnAmmoDrop(scene, position, floorY) {
  const mesh = new THREE.Mesh(getGeometry(), getMaterials());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.scale.setScalar(AMMO_DROP_SCALE);

  const spawnY = Math.max(position.y, floorY + 0.5);
  mesh.position.set(position.x, spawnY, position.z);
  scene.add(mesh);

  const angle = Math.random() * Math.PI * 2;
  const hSpeed = 1.5 + Math.random() * 1.5;

  return {
    mesh,
    velX: Math.sin(angle) * hSpeed,
    velY: 3.0 + Math.random() * 2.0,
    velZ: Math.cos(angle) * hSpeed,
    floorY,
    time: 0,
    settled: false,
    settledTime: 0,
    collected: false,
    value: AMMO_DROP_VALUE,
    type: "ammo",
  };
}

export function updateAmmoDrops(drops, dt, playerPos, onCollect, colliders, bounds) {
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.time += dt;

    if (!d.settled) {
      d.velY -= AMMO_DROP_GRAVITY * dt;
      d.mesh.position.x += d.velX * dt;
      d.mesh.position.y += d.velY * dt;
      d.mesh.position.z += d.velZ * dt;

      if (d.mesh.position.y <= d.floorY + AMMO_DROP_SETTLE_Y) {
        d.mesh.position.y = d.floorY + AMMO_DROP_SETTLE_Y;
        if (Math.abs(d.velY) < 0.3) {
          d.velY = 0; d.velX = 0; d.velZ = 0;
          d.settled = true;
          d.settledTime = d.time;
          d.settleBlend = 0;
        } else {
          d.velY *= -AMMO_DROP_BOUNCE;
          d.velX *= 0.7;
          d.velZ *= 0.7;
        }
      }

      d.velX *= Math.max(0, 1 - AMMO_DROP_FRICTION * dt);
      d.velZ *= Math.max(0, 1 - AMMO_DROP_FRICTION * dt);

      if (colliders) {
        for (const c of colliders) {
          const px = d.mesh.position.x, pz = d.mesh.position.z;
          const r = 0.15;
          const cx = Math.max(c.minX, Math.min(c.maxX, px));
          const cz = Math.max(c.minZ, Math.min(c.maxZ, pz));
          const ddx = px - cx, ddz = pz - cz;
          if (ddx * ddx + ddz * ddz < r * r) {
            const len = Math.sqrt(ddx * ddx + ddz * ddz) || 0.001;
            d.mesh.position.x = cx + (ddx / len) * r;
            d.mesh.position.z = cz + (ddz / len) * r;
            d.velX *= -0.4; d.velZ *= -0.4;
          }
        }
      }
      if (bounds) {
        d.mesh.position.x = Math.max(bounds.minX + 0.15, Math.min(bounds.maxX - 0.15, d.mesh.position.x));
        d.mesh.position.z = Math.max(bounds.minZ + 0.15, Math.min(bounds.maxZ - 0.15, d.mesh.position.z));
      }
    } else {
      d.settleBlend = Math.min(1, (d.settleBlend ?? 0) + dt * 1.8);
      const ease = d.settleBlend * d.settleBlend * (3 - 2 * d.settleBlend);
      const hoverY = d.floorY + AMMO_DROP_SETTLE_Y + 0.12;
      const groundY = d.floorY + AMMO_DROP_SETTLE_Y;
      const baseY = groundY + (hoverY - groundY) * ease;
      const bob = Math.sin((d.time - d.settledTime) * AMMO_DROP_BOB_SPEED) * AMMO_DROP_BOB_HEIGHT * ease;
      d.mesh.position.y = baseY + bob;
    }

    d.mesh.rotation.y += AMMO_DROP_SPIN * dt;

    if (!d.collected) {
      const dx = d.mesh.position.x - playerPos.x;
      const dz = d.mesh.position.z - playerPos.z;
      if (dx * dx + dz * dz < AMMO_DROP_COLLECT_RADIUS * AMMO_DROP_COLLECT_RADIUS) {
        d.collected = true;
        d.collectTime = d.time;
        onCollect(d.value);
      }
    }

    let remove = false;
    if (d.collected) {
      if (!d.ownMats) {
        d.ownMats = true;
        d.mesh.material = getMaterials().map(m => m.clone());
        for (const m of d.mesh.material) m.transparent = true;
      }
      const since = d.time - d.collectTime;
      const scale = Math.max(0, 1 - since / 0.25);
      d.mesh.scale.setScalar(AMMO_DROP_SCALE * scale);
      for (const m of d.mesh.material) m.opacity = scale;
      d.mesh.position.y += dt * 3;
      if (scale <= 0) remove = true;
    } else if (d.time > AMMO_DROP_LIFETIME) {
      if (!d.ownMats) {
        d.ownMats = true;
        d.mesh.material = getMaterials().map(m => m.clone());
        for (const m of d.mesh.material) m.transparent = true;
      }
      const fadeT = (d.time - AMMO_DROP_LIFETIME) / AMMO_DROP_FADE;
      const op = Math.max(0, 1 - fadeT);
      for (const m of d.mesh.material) m.opacity = op;
      if (fadeT >= 1) remove = true;
    }

    if (remove) {
      d.mesh.parent?.remove(d.mesh);
      if (d.ownMats) for (const m of d.mesh.material) m.dispose();
      drops.splice(i, 1);
    }
  }
}

export function disposeAllAmmoDrops(drops) {
  for (const d of drops) {
    d.mesh.parent?.remove(d.mesh);
    if (d.ownMats) for (const m of d.mesh.material) m.dispose();
  }
  drops.length = 0;
}
