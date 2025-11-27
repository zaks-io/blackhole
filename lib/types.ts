export interface OverlayState {
  isco: boolean;
  photonSphere: boolean;
  eventHorizon: boolean;
  shadowEdge: boolean;
  doppler: boolean;
  scale: boolean;
}

export const DEFAULT_OVERLAY_STATE: OverlayState = {
  isco: false,
  photonSphere: false,
  eventHorizon: false,
  shadowEdge: false,
  doppler: false,
  scale: false,
};
