import * as THREE from "three";
import {
  getGeometry as getCrateGeo,
  getMaterials as getCrateMats,
} from "@/lib/AmmoCrate";
import { disposeGrenadeModel, getGrenadeModel } from "@/lib/Grenade";
import { getOrbGeometry, getOrbMaterials } from "@/lib/Targets";

const PREVIEW_SIZE = 360;

function createPreviewMesh(type) {
  let mesh;
  if (type === "ammo") {
    mesh = new THREE.Mesh(getCrateGeo(), getCrateMats());
    mesh.scale.setScalar(0.25);
  } else if (type === "grenade") {
    mesh = getGrenadeModel();
    mesh.scale.setScalar(0.8);
    mesh.rotation.x = Math.PI / 2;
  } else {
    mesh = new THREE.Mesh(getOrbGeometry(), getOrbMaterials());
    mesh.rotation.z = Math.PI / 2;
    mesh.scale.setScalar(1.0);
  }

  const box = new THREE.Box3().setFromObject(mesh);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  mesh.scale.multiplyScalar(0.9 / maxDim);
  box.setFromObject(mesh);
  const center = new THREE.Vector3();
  box.getCenter(center);
  mesh.position.sub(center);

  return { mesh, center };
}

function createPreviewScene(type) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 20);
  camera.position.set(0, 0.15, 1.8);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(2, 3, 4);
  scene.add(dir);

  const { mesh, center } = createPreviewMesh(type);
  scene.add(mesh);

  return { scene, camera, mesh, center, type };
}

class PickupPreviewEngine {
  constructor() {
    this.instances = new Map();
    this.rafId = 0;
    this.running = false;
    this.offscreen = null;
    this.renderer = null;
  }

  ensureRenderer() {
    if (this.renderer) return;
    this.offscreen = document.createElement("canvas");
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.offscreen,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(PREVIEW_SIZE, PREVIEW_SIZE, false);
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  add(id, type, displayCanvas) {
    this.ensureRenderer();
    const ctx = displayCanvas.getContext("2d");
    if (!ctx) return;

    displayCanvas.width = PREVIEW_SIZE;
    displayCanvas.height = PREVIEW_SIZE;

    const preview = createPreviewScene(type);
    preview.ctx = ctx;
    preview.t = 0;
    preview.startY = -2.0;
    preview.endY = 0;
    preview.zoomDuration = 0.6;
    preview.mesh.position.y += preview.startY;

    this.instances.set(id, preview);
    this.startLoop();
  }

  remove(id) {
    const preview = this.instances.get(id);
    if (!preview) return;

    if (preview.type === "grenade") {
      disposeGrenadeModel(preview.mesh);
    }

    this.instances.delete(id);
    if (this.instances.size === 0) this.stopLoop();
  }

  startLoop() {
    if (this.running) return;
    this.running = true;

    const tick = () => {
      if (this.instances.size === 0) {
        this.stopLoop();
        return;
      }

      for (const preview of this.instances.values()) {
        preview.t += 1 / 60;
        if (preview.type === "grenade") preview.mesh.rotation.z -= 0.008;
        else preview.mesh.rotation.y += 0.008;

        const zoomT = Math.min(1, preview.t / preview.zoomDuration);
        const ease = 1 - Math.pow(1 - zoomT, 3);
        const offsetY = preview.startY + (preview.endY - preview.startY) * ease;
        preview.mesh.position.y = -preview.center.y + offsetY;

        this.renderer.render(preview.scene, preview.camera);
        preview.ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
        preview.ctx.drawImage(this.offscreen, 0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
      }

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  stopLoop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.running = false;
  }
}

const pickupPreviewEngine = new PickupPreviewEngine();

const PREVIEW_TYPES = ["hp", "ammo", "grenade"];
let _previewGpuWarmed = false;

/** Create the offscreen renderer and compile pickup preview shaders during load. */
export function warmupPickupPreviewEngine() {
  if (_previewGpuWarmed) return;
  pickupPreviewEngine.ensureRenderer();
  const renderer = pickupPreviewEngine.renderer;
  for (const type of PREVIEW_TYPES) {
    const preview = createPreviewScene(type);
    if (typeof renderer.compile === "function") {
      renderer.compile(preview.mesh, preview.camera, preview.scene);
    }
    renderer.render(preview.scene, preview.camera);
    if (type === "grenade") {
      disposeGrenadeModel(preview.mesh);
    }
  }
  _previewGpuWarmed = true;
}

export default pickupPreviewEngine;
