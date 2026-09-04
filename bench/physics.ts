import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { CONFIG, buildLensingParams } from '../lib/config';
import { LensingPass } from '../lib/passes/LensingPass';
import { schwarzschildCriticalImpactParameter } from '../lib/physics/schwarzschild';

/** Check the real fragment shader against the analytic shadow, without emission. */
export function verifyBlackHoleShadow(renderer: THREE.WebGLRenderer): number {
  const sky = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  sky.needsUpdate = true;
  const pass = new LensingPass(sky, 64);
  const quad = new FullScreenQuad(pass.material);
  const target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, stencilBuffer: false });
  const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 1000);
  const pixel = new Uint8Array(4);
  const previousTarget = renderer.getRenderTarget();
  const rs = CONFIG.rs;
  const critical = schwarzschildCriticalImpactParameter(rs);
  let checks = 0;
  try {
    pass.updateParams({
      ...buildLensingParams(),
      diskOpacity: 0,
      coronaEnabled: 0,
      jetsEnabled: 0,
      photonSphereIntensity: 0,
      bhEdgeSoftness: 0,
      supersampleLevel: 1,
    });
    pass.updateResolution(1, 1);
    pass.setStarfieldExposure(1);
    pass.updateTime(10);
    for (const maxSteps of [CONFIG.rayMarching.maxSteps, CONFIG.rayMarching.autoStepsMin]) {
      pass.updateParams({ maxSteps });
      for (const radius of [1.2, 3, 5, 10, 20]) {
        for (const radialSign of [-1, 1]) {
          for (const ratio of [0.98, 1.02]) {
            const r = radius * rs;
            const sine = (critical * ratio * Math.sqrt(1 - rs / r)) / r;
            camera.position.set(0, 0, r);
            camera.lookAt(sine, 0, r + radialSign * Math.sqrt(1 - sine * sine));
            camera.updateMatrixWorld(true);
            pass.updateCamera(camera);
            renderer.setRenderTarget(target);
            quad.render(renderer);
            renderer.readRenderTargetPixels(target, 0, 0, 1, 1, pixel);
            const captured = pixel[0] < 128;
            const error = renderer.getContext().getError();
            const expectedCapture =
              radius < 1.5 ? radialSign < 0 || ratio > 1 : radialSign < 0 && ratio < 1;
            if (error !== 0 || captured !== expectedCapture) {
              throw new Error(
                `GPU shadow mismatch at r=${radius} rs, b/bcrit=${ratio}: ` +
                  `radialSign=${radialSign}, maxSteps=${maxSteps}, RGBA=${Array.from(pixel)}, GL error=${error}`
              );
            }
            checks++;
          }
        }
      }
    }
  } finally {
    renderer.setRenderTarget(previousTarget);
    quad.dispose();
    pass.dispose();
    target.dispose();
    sky.dispose();
  }
  return checks;
}
