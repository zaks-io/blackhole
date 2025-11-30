export interface ToggleState {
  isco: boolean;
  eventHorizon: boolean;
  doppler: boolean;
  scale: boolean;
  disk: boolean;
  jets: boolean;
}

export const DEFAULT_TOGGLE_STATE: ToggleState = {
  isco: false,
  eventHorizon: false,
  doppler: false,
  scale: false,
  disk: true,
  jets: false,
};
