import GUI from 'lil-gui';
import * as THREE from 'three';
import { LensingPass } from '@/lib/passes';
import { StarfieldManager } from '@/lib/simulation';
import { HDRSupport } from '@/lib/display';
import { STARFIELD_BACKGROUNDS, StarfieldKey } from '@/lib/presets';
import { CONFIG } from '@/lib/config';

export interface EnvironmentFolderConfig {
  renderer: THREE.WebGLRenderer;
  lensingPass: LensingPass;
  starfieldManager: StarfieldManager;
  hdrSupport: HDRSupport;
}

export function createEnvironmentFolder(gui: GUI, config: EnvironmentFolderConfig): void {
  const { renderer, lensingPass, starfieldManager, hdrSupport } = config;

  const folder = gui.addFolder('Environment');
  const defaultBg = 'milkyWay' as StarfieldKey;

  const envParams = {
    background: defaultBg,
    starfieldExposure: STARFIELD_BACKGROUNDS[defaultBg].exposure,
    hdrOutput: hdrSupport.hdr,
    masterExposure: CONFIG.renderer.toneMappingExposure,
  };

  const backgroundOptions = Object.fromEntries(
    Object.entries(STARFIELD_BACKGROUNDS).map(([key, val]) => [val.name, key])
  );

  const exposureController = folder
    .add(envParams, 'starfieldExposure', 0.01, 10.0, 0.05)
    .name('Starfield Exposure')
    .onChange((value: number) => {
      lensingPass.setStarfieldExposure(value);
    });

  folder
    .add(envParams, 'background', backgroundOptions)
    .name('Background')
    .onChange((key: StarfieldKey) => {
      starfieldManager.crossfadeTo(key, lensingPass, (exp) => {
        exposureController.setValue(exp);
      });
    });

  folder
    .add(envParams, 'masterExposure', 0.1, 5.0, 0.1)
    .name('Master Exposure')
    .onChange((value: number) => {
      renderer.toneMappingExposure = value;
    });

  const hdrLabel = hdrSupport.hdr
    ? `HDR Output (${hdrSupport.colorGamut})`
    : 'HDR Output (unsupported)';

  folder
    .add(envParams, 'hdrOutput')
    .name(hdrLabel)
    .onChange((value: boolean) => {
      if (value) {
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      } else {
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
      }
    });
}
