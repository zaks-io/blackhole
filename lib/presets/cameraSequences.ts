import { CameraSequence } from '@/lib/camera';

export const CAMERA_SEQUENCES: Record<string, CameraSequence> = {
  fallIn: {
    name: 'Fall In',
    steps: [
      {
        type: 'snapTo',
        position: { x: 0, y: 10, z: 40 },
        lookAt: { x: 0, y: 0, z: 0 },
      },
      {
        type: 'moveTo',
        position: { x: 1.3, y: 1.3, z: 0 },
        lookAt: { x: 0, y: 0, z: 0 },
        duration: 6,
        ease: 'power2.in',
      },
      {
        type: 'moveTo',
        position: { x: 1.3, y: 1.3, z: 8 },
        lookAt: { x: 0, y: 0, z: 0 },
        duration: 4,
        ease: 'power2.out',
      },
    ],
  },

  warpingTour: {
    name: 'Warping Tour',
    steps: [
      {
        type: 'snapTo',
        position: { x: 4, y: 1, z: 3 },
        lookAt: { x: 0, y: 0, z: 0 },
      },
      {
        type: 'moveTo',
        position: { x: 2, y: 1, z: 2 },
        lookAt: { x: 1.6, y: 0, z: 0 },
        duration: 4,
        ease: 'power1.inOut',
      },
      {
        type: 'moveTo',
        position: { x: 1.5, y: 0.3, z: 1.5 },
        lookAt: { x: 0, y: 0.3, z: 0 },
        duration: 4,
        ease: 'power1.in',
      },
      {
        type: 'moveTo',
        position: { x: 1.5, y: 0.01, z: 1.5 },
        lookAt: { x: -40, y: 0.01, z: 40 },
        duration: 8,
        ease: 'power1.out',
      },
      {
        type: 'moveTo',
        position: { x: 1.5, y: 10, z: 1.5 },
        lookAt: { x: -0.1, y: 0.01, z: 0.01 },
        duration: 16,
        ease: 'power1.inOut',
      },
    ],
  },

  shadowExplore: {
    name: 'Shadow Explore',
    steps: [
      {
        type: 'snapTo',
        position: { x: 0, y: 0.3, z: 5 },
        lookAt: { x: 0, y: 0, z: 0 },
      },
      {
        type: 'moveTo',
        position: { x: 2, y: 1, z: 2 },
        lookAt: { x: 1.6, y: 0, z: 0 },
        duration: 6,
        ease: 'power1.inOut',
      },
      {
        type: 'moveTo',
        position: { x: 0, y: 0.01, z: 3 },
        lookAt: { x: 1.6, y: 0.01, z: 1.6 },
        duration: 6,
        ease: 'power1.inOut',
      },
      {
        type: 'moveTo',
        position: { x: 0, y: 0.3, z: 5 },
        lookAt: { x: 0, y: 0, z: 0 },
        duration: 6,
        ease: 'power1.inOut',
      },
    ],
  },

  // Wormhole mode only. The dive runs exactly along the z-axis through the
  // origin: universe-crossing detection flips on the frame the position
  // vector reverses, which only happens for a path through the throat center.
  // Pacing: decelerate to a near-stop at the throat lip so the lensing morph
  // is visible, cross gently, then swing out sideways. The lookAt targets
  // after the crossing stay well away from the camera path: tweening the
  // lookAt point past the camera whips the view around in a single frame.
  wormholeTransit: {
    name: 'Wormhole Transit',
    steps: [
      {
        type: 'snapTo',
        position: { x: 0, y: 4, z: 30 },
        lookAt: { x: 0, y: 0, z: 0 },
      },
      {
        type: 'moveTo',
        position: { x: 0, y: 0, z: 10 },
        lookAt: { x: 0, y: 0, z: 0 },
        duration: 4,
        ease: 'power2.in',
      },
      {
        type: 'moveTo',
        position: { x: 0, y: 0, z: 1.2 },
        lookAt: { x: 0, y: 0, z: -40 },
        duration: 5,
        ease: 'power2.out',
      },
      {
        type: 'moveTo',
        position: { x: 0, y: 0, z: -10 },
        lookAt: { x: 0, y: 0, z: -40 },
        duration: 7,
        ease: 'power1.inOut',
      },
      {
        type: 'moveTo',
        position: { x: 9, y: 2.5, z: -17 },
        lookAt: { x: -20, y: -4, z: -24 },
        duration: 6,
        ease: 'power1.inOut',
      },
      {
        type: 'moveTo',
        position: { x: 11, y: 3, z: -15 },
        lookAt: { x: 0, y: 0, z: 0 },
        duration: 6,
        ease: 'power1.inOut',
      },
    ],
  },
};
