export const flagSubmitSuccessEffectOptions = [
  { id: 'edge-border', label: 'Edge border' },
  { id: 'screen-imprint', label: 'Screen imprint' },
  { id: 'field-wave', label: 'Field wave' },
  { id: 'none', label: 'No effect' }
] as const;

export type FlagSubmitSuccessEffect = (typeof flagSubmitSuccessEffectOptions)[number]['id'];

export const firstBloodEdgeColorOptions = [
  { id: 'achievement', label: 'First-blood color' },
  { id: 'success', label: 'Success color' },
  { id: 'rainbow', label: 'Rainbow' }
] as const;

export type FirstBloodEdgeColor = (typeof firstBloodEdgeColorOptions)[number]['id'];

export const firstBloodHighlightColorOptions = [
  { id: 'achievement', label: 'Achievement' },
  { id: 'success', label: 'Success' },
  { id: 'rainbow', label: 'Rainbow' }
] as const;

export type FirstBloodHighlightColor = (typeof firstBloodHighlightColorOptions)[number]['id'];

export function firstBloodToastTone(
  color: FirstBloodHighlightColor
): 'firstBlood' | 'firstBloodRainbow' | 'firstBloodSuccess' {
  if (color === 'rainbow') {
    return 'firstBloodRainbow';
  }

  if (color === 'success') {
    return 'firstBloodSuccess';
  }

  return 'firstBlood';
}

export interface ChallengePresentationSettings {
  firstBloodEdgeColor: FirstBloodEdgeColor;
  firstBloodHighlightColor: FirstBloodHighlightColor;
  flagSubmitSuccessEffect: FlagSubmitSuccessEffect;
}

// Frontend-only adapter until presentation settings are supplied by the admin API.
export const challengePresentationSettingsStub: ChallengePresentationSettings = {
  firstBloodEdgeColor: 'rainbow',
  firstBloodHighlightColor: 'rainbow',
  flagSubmitSuccessEffect: 'edge-border'
};
