import GUI from 'lil-gui';
import { LensingPass } from '@/lib/passes';
import { SimulationParams } from '@/lib/simulation';

export interface DiskFolderConfig {
  lensingPass: LensingPass;
  params: SimulationParams;
}

export function createDiskFolder(gui: GUI, config: DiskFolderConfig): void {
  const { lensingPass, params } = config;

  const folder = gui.addFolder('Accretion Disk');
  folder.close();

  // Geometry subfolder
  const geomFolder = folder.addFolder('Geometry');

  geomFolder
    .add(params, 'diskInnerRadius', 1.5, 6.0, 0.1)
    .name('Inner Radius (rs)')
    .onChange((value: number) => {
      lensingPass.updateParams({ diskInnerRadius: value });
    });

  geomFolder
    .add(params, 'diskOuterRadius', 6.0, 20.0, 0.5)
    .name('Outer Radius (rs)')
    .onChange((value: number) => {
      lensingPass.updateParams({ diskOuterRadius: value });
    });

  geomFolder
    .add(params, 'thickDiskEnabled', { Off: 0, On: 1 })
    .name('3D Thickness')
    .onChange((value: number) => {
      lensingPass.updateParams({ thickDiskEnabled: value });
    });

  geomFolder
    .add(params, 'thickDiskHalfThickness', 0.1, 1.0, 0.05)
    .name('Thickness (rs)')
    .onChange((value: number) => {
      lensingPass.updateParams({ thickDiskHalfThickness: value });
    });

  geomFolder
    .add(params, 'thickDiskPuffiness', 0.1, 0.8, 0.05)
    .name('Puffiness')
    .onChange((value: number) => {
      lensingPass.updateParams({ thickDiskPuffiness: value });
    });

  geomFolder
    .add(params, 'diskFlare', 0.0, 0.2, 0.005)
    .name('Flare (H/r)')
    .onChange((value: number) => {
      lensingPass.updateParams({ diskFlare: value });
    });

  geomFolder
    .add(params, 'diskVerticalShear', 0.0, 2.0, 0.05)
    .name('Vertical Shear')
    .onChange((value: number) => {
      lensingPass.updateParams({ diskVerticalShear: value });
    });

  // Appearance subfolder
  const appearFolder = folder.addFolder('Appearance');

  appearFolder
    .add(params, 'diskTemperatureInner', 5000, 20000, 500)
    .name('Peak Temp (K)')
    .onChange((value: number) => {
      lensingPass.updateParams({ diskTemperatureInner: value });
    });

  appearFolder
    .add(params, 'diskTemperatureOuter', 1000, 8000, 200)
    .name('Outer Temp (K, binary)')
    .onChange((value: number) => {
      lensingPass.updateParams({ diskTemperatureOuter: value });
    });

  appearFolder
    .add(params, 'diskAtmosphereCool', 0.0, 0.8, 0.05)
    .name('Atmosphere Cooling')
    .onChange((value: number) => {
      lensingPass.updateParams({ diskAtmosphereCool: value });
    });

  appearFolder
    .add(params, 'diskLuminanceCompression', 0.0, 0.5, 0.01)
    .name('Artistic Compression')
    .onChange((value: number) => {
      lensingPass.updateParams({ diskLuminanceCompression: value });
    });

  appearFolder
    .add(params, 'diskTextureContrast', 0.0, 2.0, 0.1)
    .name('Artistic Contrast')
    .onChange((value: number) => {
      lensingPass.updateParams({ diskTextureContrast: value });
    });

  const diskOpacityControl = appearFolder
    .add(params, 'diskOpacity', 0.0, 1.0, 0.05)
    .name('Opacity')
    .onChange((value: number) => {
      lensingPass.updateParams({ diskOpacity: value });
    });

  const diskActions = {
    hideDisk: () => {
      params.diskOpacity = 0;
      lensingPass.updateParams({ diskOpacity: 0 });
      diskOpacityControl.updateDisplay();
    },
  };
  appearFolder.add(diskActions, 'hideDisk').name('Hide Disk');

  // Motion subfolder
  const motionFolder = folder.addFolder('Motion');

  motionFolder
    .add(params, 'diskMaterialSpeed', 0.0, 50.0, 1.0)
    .name('Orbital Speed')
    .onChange((value: number) => {
      lensingPass.updateParams({ diskMaterialSpeed: value });
    });

  motionFolder
    .add(params, 'diskEccentricity', 0.0, 0.4, 0.01)
    .name('Eccentricity')
    .onChange((value: number) => {
      lensingPass.updateParams({ diskEccentricity: value });
    });

  motionFolder
    .add(params, 'diskEccentricityPrecessionSpeed', 0.0, 10.0, 0.1)
    .name('Precession Speed')
    .onChange((value: number) => {
      lensingPass.updateParams({ diskEccentricityPrecessionSpeed: value });
    });
}
