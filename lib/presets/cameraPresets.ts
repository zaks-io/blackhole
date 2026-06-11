export interface CameraPreset {
  name: string;
  position: { x: number; y: number; z: number };
  lookAt: { x: number; y: number; z: number };
  duration?: number;
  ease?: string;
}

export const CAMERA_PRESETS: Record<string, CameraPreset> = {
  far: {
    name: 'Far',
    position: { x: -25, y: 5, z: 45 },
    lookAt: { x: 0, y: 0, z: 0 },
    duration: 3,
  },
  default: {
    name: 'Default',
    position: { x: 0, y: 1, z: 20 },
    lookAt: { x: 0, y: 0, z: 0 },
    duration: 2,
  },
  accretionDisk: {
    name: 'Accretion Disk',
    position: { x: 8, y: 2, z: 8 },
    lookAt: { x: -3, y: -2, z: 0 },
    duration: 3,
  },
  topDown: {
    name: 'Top Down',
    position: { x: 0, y: 25, z: 1 },
    lookAt: { x: 0, y: 0, z: 0 },
    duration: 3,
  },
  edgeOn: {
    name: 'Edge On',
    position: { x: 20, y: 0.1, z: 0 },
    lookAt: { x: 0, y: 0, z: 0 },
    duration: 3,
  },
  eht: {
    name: 'EHT View',
    position: { x: 30, y: 50, z: 0 },
    lookAt: { x: 0, y: 0, z: 0 },
    duration: 2.5,
    ease: 'power2.inOut',
  },
  photonSphere: {
    name: 'Photon Sphere',
    position: { x: 2, y: 1.5, z: 5 },
    lookAt: { x: 0, y: 0, z: 0 },
    duration: 2.5,
  },
};

/**
 * Kebab-case URL slugs mapped to camera preset keys, so direct-view routes
 * (e.g. `/accretion-disk`) share one source of truth with the presets.
 */
export const VIEW_SLUGS: Record<string, keyof typeof CAMERA_PRESETS> = {
  far: 'far',
  default: 'default',
  'accretion-disk': 'accretionDisk',
  'top-down': 'topDown',
  'edge-on': 'edgeOn',
  eht: 'eht',
  'photon-sphere': 'photonSphere',
};
