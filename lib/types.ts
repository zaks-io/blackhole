export interface ToggleState {
  eventHorizon: boolean;
  disk: boolean;
  audio: boolean;
  binary: boolean;
}

export const DEFAULT_TOGGLE_STATE: ToggleState = {
  eventHorizon: false,
  disk: true,
  audio: false,
  binary: false,
};
