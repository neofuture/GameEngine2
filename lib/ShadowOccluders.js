import * as THREE from "three";
import { setWorldLayer } from "./LightingLayers.js";

let shadowOccluderMaterial = null;
let shadowDepthMaterial = null;

/** Invisible in the color pass; still writes depth into the sun shadow map. */
export function getShadowOccluderMaterial() {
  if (!shadowOccluderMaterial) {
    shadowOccluderMaterial = new THREE.MeshBasicMaterial();
    shadowOccluderMaterial.colorWrite = false;
    // Must not write depth in the main pass — invisible occluders only affect the shadow map.
    shadowOccluderMaterial.depthWrite = false;
  }
  return shadowOccluderMaterial;
}

/** Solid depth for the shadow-map pass (colorWrite:false occluders need this explicitly). */
export function getShadowDepthMaterial() {
  if (!shadowDepthMaterial) {
    shadowDepthMaterial = new THREE.MeshDepthMaterial();
    shadowDepthMaterial.depthTest = true;
    shadowDepthMaterial.depthWrite = true;
  }
  return shadowDepthMaterial;
}

function attachShadowMapDepth(mesh) {
  mesh.customDepthMaterial = getShadowDepthMaterial();
}

/**
 * World-layer box that blocks directional sun shadows only (not lit in room pass).
 * @param {THREE.Group} group
 */
export function addShadowOccluderBox(group, width, height, depth, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    getShadowOccluderMaterial()
  );
  mesh.position.set(x, y, z);
  mesh.userData.isShadowOccluder = true;
  mesh.userData.shadowCast = true;
  mesh.userData.shadowReceive = false;
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  attachShadowMapDepth(mesh);
  setWorldLayer(mesh);
  group.add(mesh);
  return mesh;
}

export function disposeShadowOccluderMaterial() {
  shadowOccluderMaterial?.dispose();
  shadowOccluderMaterial = null;
  shadowDepthMaterial?.dispose();
  shadowDepthMaterial = null;
}
