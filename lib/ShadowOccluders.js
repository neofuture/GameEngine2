import * as THREE from "three";
import { setWorldLayer } from "./LightingLayers.js";

let shadowOccluderMaterial = null;

/** Invisible in the color pass; still writes depth into the sun shadow map. */
export function getShadowOccluderMaterial() {
  if (!shadowOccluderMaterial) {
    shadowOccluderMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    shadowOccluderMaterial.colorWrite = false;
  }
  return shadowOccluderMaterial;
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
  setWorldLayer(mesh);
  group.add(mesh);
  return mesh;
}

export function disposeShadowOccluderMaterial() {
  shadowOccluderMaterial?.dispose();
  shadowOccluderMaterial = null;
}
