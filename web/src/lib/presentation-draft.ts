export interface SponsorDraft {
  description: string;
  iconDarkUrl: string;
  iconLightUrl: string;
  id: string;
  name: string;
  url: string;
}

export interface PresentationDraft {
  ctfName: string;
  endsAt: string;
  faviconUrl: string;
  homeContent: string;
  logoDarkUrl: string;
  logoLightUrl: string;
  ogDescription: string;
  ogImageUrl: string;
  sponsors: SponsorDraft[];
  startsAt: string;
}

export const presentationDraftStorageKey = 'kitsune.presentation-draft';

export const defaultPresentationDraft: PresentationDraft = {
  ctfName: 'Kitsune',
  endsAt: '',
  faviconUrl: '',
  homeContent: '',
  logoDarkUrl: '',
  logoLightUrl: '',
  ogDescription: '',
  ogImageUrl: '',
  sponsors: [],
  startsAt: ''
};

export function parsePresentationDraft(value: string | null): PresentationDraft {
  if (!value) {
    return defaultPresentationDraft;
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const values = parsed as Partial<PresentationDraft>;
    return {
      ...defaultPresentationDraft,
      ...values,
      sponsors: Array.isArray(parsed.sponsors)
        ? parsed.sponsors.filter((sponsor: unknown): sponsor is SponsorDraft => {
            if (!sponsor || typeof sponsor !== 'object') {
              return false;
            }

            const candidate = sponsor as Record<string, unknown>;
            return typeof candidate.id === 'string' && typeof candidate.name === 'string';
          })
        : []
    };
  } catch {
    return defaultPresentationDraft;
  }
}
