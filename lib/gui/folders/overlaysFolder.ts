import GUI from 'lil-gui';
import { LensingPass } from '@/lib/passes';

export interface OverlaysFolderConfig {
  lensingPass: LensingPass;
}

export function createOverlaysFolder(gui: GUI, config: OverlaysFolderConfig): void {
  const { lensingPass } = config;

  const folder = gui.addFolder('Overlays');
  folder.close();

  const overlayParams = {
    isco: 0,
    eventHorizon: 0,
    scale: 0,
    doppler: 0,
    showLabels: false,
  };

  const dispatchOverlayChange = (key: string, value: boolean) => {
    window.dispatchEvent(
      new CustomEvent('dev-overlay-change', {
        detail: { key, value },
      })
    );
  };

  folder
    .add(overlayParams, 'isco', { Off: 0, On: 1 })
    .name('ISCO (3 rs)')
    .onChange((value: number) => {
      lensingPass.updateParams({ overlayIsco: value });
      dispatchOverlayChange('isco', value === 1);
    });

  folder
    .add(overlayParams, 'eventHorizon', { Off: 0, On: 1 })
    .name('Event Horizon')
    .onChange((value: number) => {
      lensingPass.updateParams({ overlayEventHorizon: value });
      dispatchOverlayChange('eventHorizon', value === 1);
    });

  folder
    .add(overlayParams, 'scale', { Off: 0, On: 1 })
    .name('Scale Rings')
    .onChange((value: number) => {
      lensingPass.updateParams({ overlayScale: value });
      dispatchOverlayChange('scale', value === 1);
    });

  folder
    .add(overlayParams, 'doppler', { Off: 0, On: 1 })
    .name('Doppler Shift')
    .onChange((value: number) => {
      lensingPass.updateParams({ overlayDoppler: value });
      dispatchOverlayChange('doppler', value === 1);
    });

  folder
    .add(overlayParams, 'showLabels')
    .name('Show Labels')
    .onChange((value: boolean) => {
      const labelsContainer = document.getElementById('dev-overlay-labels');
      if (labelsContainer) {
        labelsContainer.style.display = value ? 'block' : 'none';
      }
    });
}
