/** Set true to enable screen-space ambient occlusion (off while using baked AO). */
export const ENABLE_SSAO = false;

import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";

/**
 * Screen-space ambient occlusion for the world scene (not the viewmodel).
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {number} width
 * @param {number} height
 */
export function createSsaoPipeline(renderer, scene, camera, width, height) {
  if (!ENABLE_SSAO) return null;
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const ssaoPass = new SSAOPass(scene, camera, width, height);
  ssaoPass.kernelRadius = 10;
  ssaoPass.minDistance = 0.002;
  ssaoPass.maxDistance = 0.1;
  ssaoPass.output = SSAOPass.OUTPUT.Default;
  const outputPass = new OutputPass();

  composer.addPass(renderPass);
  composer.addPass(ssaoPass);
  composer.addPass(outputPass);

  return {
    render() {
      composer.render();
    },
    setSize(w, h) {
      composer.setSize(w, h);
      ssaoPass.setSize(w, h);
    },
    dispose() {
      composer.dispose();
      ssaoPass.dispose();
    },
  };
}
