import * as THREE from "three";
import {
  createCratePreviewMesh,
  disposeCratePreviewMesh,
} from "@/lib/AmmoCrate";
import { getCreditsRiflePrototype } from "@/lib/CreditsRiflePreview";
import { disposeGrenadeModel, getGrenadeModel } from "@/lib/Grenade";
import { getOrbGeometry, getOrbMaterials } from "@/lib/Targets";

const WIDTH = 720;
const HEIGHT = 420;

function prepareMesh(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const geo = obj.geometry;
    if (geo && (!geo.attributes.normal || geo.attributes.normal.count === 0)) {
      geo.computeVertexNormals();
    }
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat) continue;
      mat.side = THREE.FrontSide;
      mat.depthTest = true;
      mat.depthWrite = true;
      if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
      if (mat.emissiveMap) mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
    }
  });
}

function fitToSize(object, targetSize) {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  object.position.sub(center);
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 0) {
    object.scale.multiplyScalar(targetSize / maxDim);
  }
}

function disposeObject3D(root) {
  root.traverse((obj) => {
    if (obj.geometry && !obj.geometry.userData?.shared) obj.geometry.dispose();
    const { material } = obj;
    if (!material) return;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material.dispose();
  });
}

/**
 * Multi-model chaos stage for the credits big-bang finale.
 * @returns {Promise<() => void>}
 */
export async function mountCreditsFinalePreview(canvas) {
  if (!canvas) return () => {};

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pxW = Math.round(WIDTH * dpr);
  const pxH = Math.round(HEIGHT * dpr);

  canvas.width = pxW;
  canvas.height = pxH;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  renderer.setSize(pxW, pxH, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, WIDTH / HEIGHT, 0.05, 30);
  camera.position.set(0, 0.12, 2.35);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0x88aaff, 0.45));
  const key = new THREE.DirectionalLight(0xe0f0ff, 1.5);
  key.position.set(2, 3, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x5eaaff, 1.1);
  rim.position.set(-3, 1, -2);
  scene.add(rim);
  const boom = new THREE.PointLight(0x46c8ff, 0, 12);
  boom.position.set(0, 0.2, 1);
  scene.add(boom);

  const actors = [];
  const grenades = [];

  const rifleProto = await getCreditsRiflePrototype();
  const rifle = rifleProto.clone(true);
  prepareMesh(rifle);
  rifle.position.set(0, 0.08, 0);
  rifle.rotation.set(0.15, Math.PI * 0.25, 0);
  scene.add(rifle);
  actors.push({
    obj: rifle,
    spinY: 0.011,
    spinX: 0.002,
    bob: 0.025,
    bobSpeed: 1.4,
  });

  for (const [pos, spinZ] of [
    [[-0.72, -0.08, 0.15], 0.022],
    [[0.78, 0.02, -0.1], -0.018],
    [[-0.42, -0.32, 0.25], 0.026],
  ]) {
    const grenade = getGrenadeModel();
    prepareMesh(grenade);
    fitToSize(grenade, 0.28);
    grenade.position.set(...pos);
    grenade.rotation.x = Math.PI / 2;
    scene.add(grenade);
    grenades.push(grenade);
    actors.push({
      obj: grenade,
      baseY: pos[1],
      spinZ,
      spinX: 0.008,
      bob: 0.035,
      bobSpeed: 2 + Math.random(),
      phase: Math.random() * Math.PI * 2,
    });
  }

  const crate = createCratePreviewMesh();
  fitToSize(crate, 0.42);
  crate.position.set(0.62, -0.22, 0.05);
  crate.rotation.y = -0.4;
  scene.add(crate);
  actors.push({
    obj: crate,
    baseY: -0.22,
    spinY: -0.009,
    bob: 0.04,
    bobSpeed: 1.8,
    phase: 1.2,
  });

  const orb = new THREE.Mesh(getOrbGeometry(), getOrbMaterials());
  prepareMesh(orb);
  fitToSize(orb, 0.32);
  orb.position.set(-0.58, -0.2, 0);
  scene.add(orb);
  const orbBaseScale = orb.scale.clone();
  actors.push({
    obj: orb,
    spinY: 0.018,
    pulse: 0.04,
    pulseSpeed: 2.6,
    phase: 0.5,
    orbBaseScale,
  });

  let rafId = 0;
  let t = 0;

  const tick = () => {
    t += 1 / 60;
    boom.intensity = 2.2 + Math.sin(t * 4.5) * 1.8 + Math.sin(t * 11) * 0.6;

    for (const a of actors) {
      if (a.spinY) a.obj.rotation.y += a.spinY;
      if (a.spinX) a.obj.rotation.x += a.spinX;
      if (a.spinZ) a.obj.rotation.z += a.spinZ;
      if (a.baseY !== undefined && a.bob) {
        a.obj.position.y =
          a.baseY + Math.sin(t * a.bobSpeed + (a.phase ?? 0)) * a.bob;
      }
      if (a.pulse && a.orbBaseScale) {
        const s = 1 + Math.sin(t * a.pulseSpeed + (a.phase ?? 0)) * a.pulse;
        a.obj.scale.set(
          a.orbBaseScale.x * s,
          a.orbBaseScale.y * s,
          a.orbBaseScale.z * s,
        );
      }
    }

    camera.position.x = Math.sin(t * 0.35) * 0.06;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(rafId);
    disposeObject3D(rifle);
    for (const g of grenades) disposeGrenadeModel(g);
    disposeCratePreviewMesh(crate);
    disposeObject3D(orb);
    renderer.dispose();
  };
}
