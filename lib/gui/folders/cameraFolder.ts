import GUI from 'lil-gui';
import * as THREE from 'three';
import { CameraController } from '@/lib/camera';
import { CONFIG } from '@/lib/config';
import { CAMERA_PRESETS, CAMERA_SEQUENCES } from '@/lib/presets';

export interface CameraFolderConfig {
  camera: THREE.PerspectiveCamera;
  cameraController: CameraController;
}

export function createCameraFolder(gui: GUI, config: CameraFolderConfig): void {
  const { camera, cameraController } = config;

  const folder = gui.addFolder('Camera');
  folder.close();

  const cameraInfo = {
    get distance() {
      return camera.position.length().toFixed(1) + ' rs';
    },
    get mode() {
      return cameraController.getMode();
    },
  };

  folder.add(cameraInfo, 'distance').name('Distance').listen().disable();
  folder.add(cameraInfo, 'mode').name('Mode').listen().disable();

  // Orbit controls subfolder
  const orbitFolder = folder.addFolder('Orbit Mode');
  const orbitParams = {
    distance: 20,
    height: 1,
    speed: 1,
    startOrbit: () => {
      cameraController.startOrbit({
        distance: orbitParams.distance * CONFIG.rs,
        height: orbitParams.height * CONFIG.rs,
        speed: orbitParams.speed,
      });
    },
    stopOrbit: () => {
      cameraController.stopOrbit();
    },
    returnToManual: () => {
      cameraController.returnToManual();
    },
  };

  orbitFolder.add(orbitParams, 'distance', 10, 50, 1).name('Distance (rs)');
  orbitFolder.add(orbitParams, 'height', -10, 20, 1).name('Height (rs)');
  orbitFolder.add(orbitParams, 'speed', 1, 60, 1).name('Speed (°/s)');
  orbitFolder.add(orbitParams, 'startOrbit').name('Start Orbit');
  orbitFolder.add(orbitParams, 'stopOrbit').name('Stop Orbit');
  orbitFolder.add(orbitParams, 'returnToManual').name('Manual Control');

  // Presets subfolder
  const presetFolder = folder.addFolder('Presets');
  const presets = {
    accretionDisk: () => {
      cameraController.moveToNearUniverse(
        {
          position: CAMERA_PRESETS.accretionDisk.position,
          lookAt: CAMERA_PRESETS.accretionDisk.lookAt,
        },
        { duration: CAMERA_PRESETS.accretionDisk.duration }
      );
    },
    topDown: () => {
      cameraController.moveToNearUniverse(
        {
          position: CAMERA_PRESETS.topDown.position,
          lookAt: CAMERA_PRESETS.topDown.lookAt,
        },
        { duration: CAMERA_PRESETS.topDown.duration }
      );
    },
    edgeOn: () => {
      cameraController.moveToNearUniverse(
        {
          position: CAMERA_PRESETS.edgeOn.position,
          lookAt: CAMERA_PRESETS.edgeOn.lookAt,
        },
        { duration: CAMERA_PRESETS.edgeOn.duration }
      );
    },
    eht: () => {
      cameraController.moveToNearUniverse(
        {
          position: CAMERA_PRESETS.eht.position,
          lookAt: CAMERA_PRESETS.eht.lookAt,
        },
        {
          duration: CAMERA_PRESETS.eht.duration,
          ease: CAMERA_PRESETS.eht.ease,
        }
      );
    },
    resetDefault: () => {
      cameraController
        .moveToNearUniverse(
          {
            position: {
              x: 0,
              y: 1 * CONFIG.rs,
              z: CONFIG.camera.initialDistance,
            },
            lookAt: { x: 0, y: 0, z: 0 },
          },
          { duration: 2 }
        )
        .then(() => {
          cameraController.returnToManual();
        });
    },
  };

  presetFolder.add(presets, 'accretionDisk').name('Accretion Disk');
  presetFolder.add(presets, 'topDown').name('Top Down');
  presetFolder.add(presets, 'edgeOn').name('Edge On');
  presetFolder.add(presets, 'eht').name('EHT View');
  presetFolder.add(presets, 'resetDefault').name('Reset Default');

  // Sequences subfolder
  const sequenceFolder = folder.addFolder('Sequences');
  const sequences = {
    fallIn: () => {
      cameraController.runSequence(CAMERA_SEQUENCES.fallIn);
    },
    warpingTour: () => {
      cameraController.runSequence(CAMERA_SEQUENCES.warpingTour);
    },
    shadowExplore: () => {
      cameraController.runSequence(CAMERA_SEQUENCES.shadowExplore);
    },
    cancelSequence: () => {
      cameraController.cancelSequence();
    },
  };

  sequenceFolder.add(sequences, 'fallIn').name('Fall In');
  sequenceFolder.add(sequences, 'warpingTour').name('Warping Tour');
  sequenceFolder.add(sequences, 'shadowExplore').name('Shadow Explore');
  sequenceFolder.add(sequences, 'cancelSequence').name('Cancel');
}
