import GUI from 'lil-gui';
import { LensingPass } from '@/lib/passes';
import { PostProcessingPipeline, SimulationParams } from '@/lib/simulation';

export interface PostProcessingFolderConfig {
  lensingPass: LensingPass;
  pipeline: PostProcessingPipeline;
  params: SimulationParams;
}

export function createPostProcessingFolder(gui: GUI, config: PostProcessingFolderConfig): void {
  const { lensingPass, pipeline, params } = config;

  const folder = gui.addFolder('Post-Processing');
  folder.close();

  // Bloom subfolder
  const bloomFolder = folder.addFolder('Bloom');

  bloomFolder
    .add(params, 'bloomThreshold', 0.0, 1.0, 0.05)
    .name('Threshold')
    .onChange((value: number) => {
      pipeline.updateBloom(value, params.bloomStrength, params.bloomRadius);
    });

  bloomFolder
    .add(params, 'bloomStrength', 0.0, 3.0, 0.1)
    .name('Strength')
    .onChange((value: number) => {
      pipeline.updateBloom(params.bloomThreshold, value, params.bloomRadius);
    });

  bloomFolder
    .add(params, 'bloomRadius', 0.0, 1.0, 0.05)
    .name('Radius')
    .onChange((value: number) => {
      pipeline.updateBloom(params.bloomThreshold, params.bloomStrength, value);
    });

  // Anti-Aliasing subfolder
  const aaFolder = folder.addFolder('Anti-Aliasing');

  aaFolder
    .add(params, 'fxaaEnabled')
    .name('FXAA')
    .onChange((value: boolean) => {
      pipeline.setFxaaEnabled(value);
    });

  aaFolder
    .add(params, 'supersampleLevel', {
      'Off (1x)': 1,
      '2x2 (4 samples)': 2,
      '4x4 (16 samples)': 4,
    })
    .name('Supersampling')
    .onChange((value: number) => {
      lensingPass.updateParams({ supersampleLevel: value });
    });

  aaFolder
    .add(params, 'bhEdgeSoftness', 0.0, 1.0, 0.05)
    .name('Edge Softness')
    .onChange((value: number) => {
      lensingPass.updateParams({ bhEdgeSoftness: value });
    });

  // EHT Blur subfolder
  const ehtFolder = folder.addFolder('EHT Telescope Blur');

  ehtFolder
    .add(params, 'ehtBlurEnabled')
    .name('Enable')
    .onChange((value: boolean) => {
      pipeline.ehtBlurController.setEnabled(value);
    });

  ehtFolder
    .add(params, 'ehtBlurStrength', 0.5, 5.0, 0.25)
    .name('Strength')
    .onChange((value: number) => {
      pipeline.setEhtBlurStrength(value);
    });
}
