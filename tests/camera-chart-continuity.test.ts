import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';

import { CameraController, type CameraSequence } from '@/lib/camera/CameraController';
import { CONFIG } from '@/lib/config';
import { LensingPass } from '@/lib/passes/LensingPass';
import { CAMERA_SEQUENCES } from '@/lib/presets/cameraSequences';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

function makeController(): {
  camera: THREE.PerspectiveCamera;
  controller: CameraController;
} {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(9, 8, 7);
  camera.lookAt(0, 0, 0);
  const controls = {
    enabled: true,
    target: new THREE.Vector3(),
    update() {},
  } as unknown as OrbitControls;
  return { camera, controller: new CameraController(camera, controls) };
}

describe('camera chart continuity', () => {
  test('resending an enabled wormhole does not reset a crossed chart', () => {
    const pass = new LensingPass(new THREE.Texture(), 4);
    const target = new THREE.Vector3();
    const before = new THREE.Vector3(0, 0, 5);
    const after = new THREE.Vector3(0, 0, -5);

    pass.updateParams({ wormholeEnabled: 1 });
    pass.updateWormholeCameraChart(before);
    pass.updateWormholeCameraChart(after);
    const farSideTarget = pass.getWormholeFarBhApparentPos(target, after).clone();
    expect(farSideTarget.length()).toBeGreaterThan(3);

    pass.updateParams({ wormholeEnabled: 1, overlayEventHorizon: 1 });
    expect(pass.getWormholeFarBhApparentPos(target, after).distanceTo(farSideTarget)).toBeLessThan(
      1e-12
    );

    pass.dispose();
  });

  test('the exact-center frame keeps the physical crossing axis', () => {
    const pass = new LensingPass(new THREE.Texture(), 4);
    const entry = new THREE.Vector3(18.9, 13.5, -38.5).normalize();

    pass.updateParams({ wormholeEnabled: 1 });
    pass.updateWormholeCameraChart(entry);
    const before = (pass.uniforms['wormholeCameraAxis'].value as THREE.Vector3).clone();

    pass.updateWormholeCameraChart(new THREE.Vector3());
    const atCenter = pass.uniforms['wormholeCameraAxis'].value as THREE.Vector3;
    expect(atCenter.distanceTo(before)).toBeLessThan(1e-12);

    pass.updateWormholeCameraChart(entry.clone().negate());
    const after = pass.uniforms['wormholeCameraAxis'].value as THREE.Vector3;
    expect(after.distanceTo(before)).toBeLessThan(1e-12);

    pass.dispose();
  });

  test('the transit holds one look direction through the throat center', () => {
    const steps = CAMERA_SEQUENCES.wormholeTransit.steps;
    const approach = steps.at(-3)!;
    const crossing = steps.at(-2)!;
    const farFlight = steps.at(-1)!;
    if (
      !approach.position ||
      !crossing.position ||
      !crossing.lookAt ||
      typeof crossing.lookAt === 'string' ||
      !farFlight.position ||
      !farFlight.lookAt ||
      typeof farFlight.lookAt === 'string'
    ) {
      throw new Error('Wormhole transit dive must use concrete positions and look targets');
    }

    const forward = new THREE.Vector3()
      .fromArray(CONFIG.wormhole.farBlackHolePosition)
      .normalize()
      .negate();
    const startPosition = new THREE.Vector3(
      approach.position.x,
      approach.position.y,
      approach.position.z
    );
    const endPosition = new THREE.Vector3(
      crossing.position.x,
      crossing.position.y,
      crossing.position.z
    );
    const farTarget = new THREE.Vector3(crossing.lookAt.x, crossing.lookAt.y, crossing.lookAt.z);

    // moveTo tweens position and lookAt with the same eased progress. The
    // previous aligned anchor is the throat center, so interpolate from zero.
    for (const progress of [0, 0.1, 0.25, 0.5, 0.75, 1]) {
      const position = startPosition.clone().lerp(endPosition, progress);
      const target = farTarget.clone().multiplyScalar(progress);
      const direction = target.sub(position).normalize();
      expect(direction.angleTo(forward)).toBeLessThan(1e-6);
    }

    expect(farFlight.lookAt).toEqual(crossing.lookAt);
  });

  test('sequence snap and near-universe re-anchor are synchronous', async () => {
    const { camera, controller } = makeController();
    let cameraPositionAtReanchor: number[] | null = null;
    controller.setNearUniverseReanchorListener(() => {
      cameraPositionAtReanchor = camera.position.toArray();
    });

    const sequence: CameraSequence = {
      name: 'atomic snap',
      steps: [
        {
          type: 'snapTo',
          position: { x: 1, y: 2, z: 3 },
          lookAt: { x: 0, y: 0, z: 0 },
        },
      ],
    };

    const finished = controller.runSequence(sequence);
    expect(camera.position.toArray()).toEqual([1, 2, 3]);
    expect(cameraPositionAtReanchor as number[] | null).toEqual([1, 2, 3]);
    await finished;
  });

  test('near-universe move re-anchors only at its final pose', async () => {
    const { camera, controller } = makeController();
    let cameraPositionAtReanchor: number[] | null = null;
    controller.setNearUniverseReanchorListener(() => {
      cameraPositionAtReanchor = camera.position.toArray();
    });

    const finished = controller.moveToNearUniverse(
      {
        position: { x: 4, y: 5, z: 6 },
        lookAt: { x: 0, y: 0, z: 0 },
      },
      { duration: 0.001, ease: 'none' }
    );

    expect(cameraPositionAtReanchor).toBeNull();
    await finished;
    expect(camera.position.toArray()).toEqual([4, 5, 6]);
    expect(cameraPositionAtReanchor as number[] | null).toEqual([4, 5, 6]);
  });
});
