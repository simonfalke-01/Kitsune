export const flagSubmitSuccessEffectOptions = [
  { id: 'edge-border', label: 'Edge border' },
  { id: 'screen-imprint', label: 'Screen imprint' },
  { id: 'field-wave', label: 'Field wave' },
  { id: 'none', label: 'No effect' }
] as const;

export type FlagSubmitSuccessEffect = (typeof flagSubmitSuccessEffectOptions)[number]['id'];

export interface ChallengePresentationSettings {
  flagSubmitSuccessEffect: FlagSubmitSuccessEffect;
}

// Frontend-only adapter until presentation settings are supplied by the admin API.
export const challengePresentationSettingsStub: ChallengePresentationSettings = {
  flagSubmitSuccessEffect: 'edge-border'
};
