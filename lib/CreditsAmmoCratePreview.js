import * as THREE from "three";
import {
  createCratePreviewMesh,
  disposeCratePreviewMesh,
  preloadAmmoCrateAssets,
} from "@/lib/AmmoCrate";

const VARIANTS = {
  default: { size: 220, fov: 34, cam: [0.52, 0.1, 1.42], rotY: 0.006 },
  cluster: { size: 180, fov: 34, cam: [0.5, 0.08, 1.38], rotY: 0.005 },
};

function fitCrate(mesh, targetSize) {
  const box = new THREE.Box3().setFromObject(mesh);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  mesh.position.sub(center);
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 0) {
    mesh.scale.multiplyScalar(targetSize / maxDim);
  }
}

/**
 * Renders the in-game ammo crate on a canvas for credits screens.
 * @returns {Promise<() => void>}
 */
export async function mountCreditsAmmoCratePreview(canvas, { variant = "default" } = {}) {
  if (!canvas) return () => {};

  const cfg = VARIANTS[variant] ?? VARIANTS.default;
  await preloadAmmoCrateAssets();

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const px = Math.round(cfg.size * dpr);

  canvas.width = px;
  canvas.height = px;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  renderer.setSize(px, px, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(cfg.fov, 1, 0.05, 24);
  camera.position.set(cfg.cam[0], cfg.cam[1], cfg.cam[2]);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xa8c8ff, 0.5));
  const key = new THREE.DirectionalLight(0xd0e8ff, 1.35);
  key.position.set(2.2, 2.8, 3.2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x5eaaff, 0.9);
  rim.position.set(-2.5, 0.4, -1.8);
  scene.add(rim);
  const fill = new THREE.PointLight(0x4060b0, 0.45, 10);
  fill.position.set(0, -0.35, 1.6);
  scene.add(fill);

  const crate = createCratePreviewMesh();
  fitCrate(crate, 0.88);
  crate.rotation.set(0.1, -0.52, 0.06);
  scene.add(crate);

  let rafId = 0;
  const tick = () => {
    crate.rotation.y += cfg.rotY;
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(rafId);
    scene.remove(crate);
    disposeCratePreviewMesh(crate);
    renderer.dispose();
  };
}
