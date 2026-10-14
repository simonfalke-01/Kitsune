'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';

import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  FileDropZone,
  TextArea,
  TextField,
  showToast
} from '@/components/ui';
import {
  parsePresentationDraft,
  presentationDraftStorageKey,
  type PresentationDraft,
  type SponsorDraft
} from '@/lib/presentation-draft';

async function readImage(files: FileList | null): Promise<string | null> {
  const file = files?.item(0);

  if (!file) {
    return null;
  }

  if (file.size > 1_000_000) {
    showToast({
      description: 'Use an image smaller than 1 MB for the browser draft.',
      title: 'Image is too large',
      tone: 'warning'
    });
    return null;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      resolve(typeof reader.result === 'string' ? reader.result : null);
    });
    reader.addEventListener('error', () => {
      resolve(null);
    });
    reader.readAsDataURL(file);
  });
}

function ImagePreview({ alt, src }: { alt: string; src: string }) {
  return (
    <div className="flex min-h-24 items-center justify-center rounded-md border border-border-subtle bg-surface p-4">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- Preview sources can be data URLs or operator-controlled remote assets.
        <img alt={alt} className="max-h-16 max-w-full object-contain" src={src} />
      ) : (
        <span className="text-sm text-text-muted">No image</span>
      )}
    </div>
  );
}

function subscribeToHydration(): () => void {
  return () => undefined;
}

export function PresentationSettings() {
  const isHydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false
  );

  if (!isHydrated) {
    return <Alert title="Loading presentation draft" />;
  }

  const initialDraft = parsePresentationDraft(
    window.localStorage.getItem(presentationDraftStorageKey)
  );
  return <PresentationSettingsEditor initialDraft={initialDraft} />;
}

function PresentationSettingsEditor({ initialDraft }: { initialDraft: PresentationDraft }) {
  const [draft, setDraft] = useState<PresentationDraft>(initialDraft);
  const [savedDraft, setSavedDraft] = useState<PresentationDraft>(initialDraft);
  const [selectedSponsorId, setSelectedSponsorId] = useState<string | null>(
    initialDraft.sponsors[0]?.id ?? null
  );
  const selectedSponsor = useMemo(
    () => draft.sponsors.find((sponsor) => sponsor.id === selectedSponsorId) ?? null,
    [draft.sponsors, selectedSponsorId]
  );
  const isDirty = JSON.stringify(draft) !== JSON.stringify(savedDraft);

  function updateDraft<Key extends keyof PresentationDraft>(
    key: Key,
    value: PresentationDraft[Key]
  ) {
    setDraft((current) => ({
      ...current,
      [key]: value
    }));
  }

  function updateSponsor(id: string, patch: Partial<SponsorDraft>) {
    setDraft((current) => ({
      ...current,
      sponsors: current.sponsors.map((sponsor) =>
        sponsor.id === id
          ? {
              ...sponsor,
              ...patch
            }
          : sponsor
      )
    }));
  }

  function addSponsor() {
    const id = crypto.randomUUID();
    const sponsor: SponsorDraft = {
      description: '',
      iconDarkUrl: '',
      iconLightUrl: '',
      id,
      name: '',
      url: ''
    };
    setDraft((current) => ({
      ...current,
      sponsors: [...current.sponsors, sponsor]
    }));
    setSelectedSponsorId(id);
  }

  function removeSponsor(id: string) {
    setDraft((current) => {
      const sponsors = current.sponsors.filter((sponsor) => sponsor.id !== id);
      setSelectedSponsorId(sponsors[0]?.id ?? null);
      return {
        ...current,
        sponsors
      };
    });
  }

  function saveDraft() {
    window.localStorage.setItem(presentationDraftStorageKey, JSON.stringify(draft));
    setSavedDraft(draft);
    showToast({
      description: 'The presentation API can consume this draft in the backend phase.',
      title: 'Browser draft saved',
      tone: 'success'
    });
  }

  return (
    <div className="grid gap-6">
      <Alert
        description="These controls save a browser draft until the presentation API is connected."
        title="Frontend preview"
        tone="info"
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <TextField
              label="Event name"
              onChange={(value) => {
                updateDraft('ctfName', value);
              }}
              value={draft.ctfName}
            />
            <TextField
              label="Favicon URL"
              onChange={(value) => {
                updateDraft('faviconUrl', value);
              }}
              placeholder="https://"
              type="url"
              value={draft.faviconUrl}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Starts"
                onChange={(value) => {
                  updateDraft('startsAt', value);
                }}
                type="datetime-local"
                value={draft.startsAt}
              />
              <TextField
                label="Ends"
                onChange={(value) => {
                  updateDraft('endsAt', value);
                }}
                type="datetime-local"
                value={draft.endsAt}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Metadata</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <TextField
              label="Open Graph description"
              onChange={(value) => {
                updateDraft('ogDescription', value);
              }}
              value={draft.ogDescription}
            />
            <TextField
              label="Open Graph image URL"
              onChange={(value) => {
                updateDraft('ogImageUrl', value);
              }}
              placeholder="https://"
              type="url"
              value={draft.ogImageUrl}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Marks</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <div className="grid content-start gap-4">
            <ImagePreview alt="Light theme logo preview" src={draft.logoLightUrl} />
            <TextField
              label="Light theme logo URL"
              onChange={(value) => {
                updateDraft('logoLightUrl', value);
              }}
              placeholder="https://"
              type="url"
              value={draft.logoLightUrl}
            />
            <FileDropZone
              acceptedFileTypes={['image/*']}
              description="PNG, SVG, JPEG, or WebP under 1 MB"
              label="Upload light theme logo"
              onSelect={(files) => {
                void readImage(files).then((value) => {
                  if (value) {
                    updateDraft('logoLightUrl', value);
                  }
                });
              }}
            />
          </div>
          <div className="grid content-start gap-4">
            <ImagePreview alt="Dark theme logo preview" src={draft.logoDarkUrl} />
            <TextField
              label="Dark theme logo URL"
              onChange={(value) => {
                updateDraft('logoDarkUrl', value);
              }}
              placeholder="https://"
              type="url"
              value={draft.logoDarkUrl}
            />
            <FileDropZone
              acceptedFileTypes={['image/*']}
              description="PNG, SVG, JPEG, or WebP under 1 MB"
              label="Upload dark theme logo"
              onSelect={(files) => {
                void readImage(files).then((value) => {
                  if (value) {
                    updateDraft('logoDarkUrl', value);
                  }
                });
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Home content</CardTitle>
        </CardHeader>
        <CardContent>
          <TextArea
            description="Markdown"
            label="Event home"
            onChange={(value) => {
              updateDraft('homeContent', value);
            }}
            rows={12}
            value={draft.homeContent}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <CardTitle>Sponsors</CardTitle>
            <Badge>{draft.sponsors.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-3">
          <div className="grid content-start gap-2">
            {draft.sponsors.length === 0 ? (
              <Alert title="No sponsors" />
            ) : (
              draft.sponsors.map((sponsor, index) => (
                <Button
                  key={sponsor.id}
                  onPress={() => {
                    setSelectedSponsorId(sponsor.id);
                  }}
                  tone={selectedSponsorId === sponsor.id ? 'primary' : 'secondary'}
                >
                  {sponsor.name || `Sponsor ${index + 1}`}
                </Button>
              ))
            )}
            <Button onPress={addSponsor} tone="quiet">
              Add sponsor
            </Button>
          </div>

          <div className="grid content-start gap-4 lg:col-span-2">
            {selectedSponsor ? (
              <>
                <TextField
                  label="Name"
                  onChange={(value) => {
                    updateSponsor(selectedSponsor.id, {
                      name: value
                    });
                  }}
                  value={selectedSponsor.name}
                />
                <TextField
                  label="URL"
                  onChange={(value) => {
                    updateSponsor(selectedSponsor.id, {
                      url: value
                    });
                  }}
                  placeholder="https://"
                  type="url"
                  value={selectedSponsor.url}
                />
                <TextArea
                  description="Markdown"
                  label="Description"
                  onChange={(value) => {
                    updateSponsor(selectedSponsor.id, {
                      description: value
                    });
                  }}
                  value={selectedSponsor.description}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    label="Light icon URL"
                    onChange={(value) => {
                      updateSponsor(selectedSponsor.id, {
                        iconLightUrl: value
                      });
                    }}
                    type="url"
                    value={selectedSponsor.iconLightUrl}
                  />
                  <TextField
                    label="Dark icon URL"
                    onChange={(value) => {
                      updateSponsor(selectedSponsor.id, {
                        iconDarkUrl: value
                      });
                    }}
                    type="url"
                    value={selectedSponsor.iconDarkUrl}
                  />
                </div>
                <Button
                  onPress={() => {
                    removeSponsor(selectedSponsor.id);
                  }}
                  tone="danger"
                >
                  Remove sponsor
                </Button>
              </>
            ) : (
              <Alert title="Add a sponsor to edit it" />
            )}
          </div>
        </CardContent>
        <CardFooter>
          <Button
            isDisabled={!isDirty}
            onPress={() => {
              setDraft(savedDraft);
            }}
            tone="quiet"
          >
            Discard changes
          </Button>
          <Button isDisabled={!isDirty} onPress={saveDraft}>
            Save browser draft
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
