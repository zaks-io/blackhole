export interface OverlayState {
  isco: boolean;
  eventHorizon: boolean;
  doppler: boolean;
  scale: boolean;
}

export const DEFAULT_OVERLAY_STATE: OverlayState = {
  isco: false,
  eventHorizon: false,
  doppler: false,
  scale: false,
};
