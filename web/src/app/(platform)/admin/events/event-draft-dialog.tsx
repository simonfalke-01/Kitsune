'use client';

import { useState } from 'react';

import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogTrigger,
  Select,
  TextArea,
  TextField,
  showToast
} from '@/components/ui';
import type { EventSummary } from '@/lib/api/client';

interface EventDraftDialogProps {
  event: EventSummary;
}

interface EventDraft {
  description: string;
  endsAt: string;
  modes: string[];
  name: string;
  participation: string;
  startsAt: string;
  state: string;
}

const modeOptions = [
  {
    id: 'jeopardy',
    label: 'Jeopardy'
  },
  {
    id: 'koth',
    label: 'King of the Hill'
  },
  {
    id: 'attack_defense',
    label: 'Attack-Defense'
  },
  {
    id: 'workshop',
    label: 'Workshop'
  }
] as const;

function dateTimeLocal(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return '';
  }

  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function initialDraft(event: EventSummary): EventDraft {
  return {
    description: event.description,
    endsAt: dateTimeLocal(event.ends_at),
    modes: [...event.modes],
    name: event.name,
    participation: event.participation,
    startsAt: dateTimeLocal(event.starts_at),
    state: event.state
  };
}

export function EventDraftDialog({ event }: EventDraftDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(() => initialDraft(event));

  function save() {
    window.localStorage.setItem(`kitsune.event-draft.${event.id}`, JSON.stringify(draft));
    showToast({
      description: 'The event update API can consume this draft in the backend phase.',
      title: 'Event draft saved',
      tone: 'success'
    });
    setIsOpen(false);
  }

  return (
    <DialogTrigger
      isOpen={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);

        if (open) {
          setDraft(initialDraft(event));
        }
      }}
    >
      <Button tone="secondary">Edit event</Button>
      <Dialog
        actions={
          <>
            <Button slot="close" tone="quiet">
              Cancel
            </Button>
            <Button onPress={save}>Save browser draft</Button>
          </>
        }
        description="Prepare the event update before the mutation API is connected."
        size="wide"
        title={`Edit ${event.name}`}
      >
        <div className="grid gap-6">
          <Alert title="Frontend preview" tone="info" />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Event name"
              onChange={(value) => {
                setDraft((current) => ({
                  ...current,
                  name: value
                }));
              }}
              value={draft.name}
            />
            <Select
              label="State"
              onSelectionChange={(key) => {
                setDraft((current) => ({
                  ...current,
                  state: String(key)
                }));
              }}
              options={[
                {
                  id: 'draft',
                  label: 'Draft'
                },
                {
                  id: 'scheduled',
                  label: 'Scheduled'
                },
                {
                  id: 'live',
                  label: 'Live'
                },
                {
                  id: 'paused',
                  label: 'Paused'
                },
                {
                  id: 'ended',
                  label: 'Ended'
                },
                {
                  id: 'archived',
                  label: 'Archived'
                }
              ]}
              selectedKey={draft.state}
            />
          </div>
          <TextArea
            label="Description"
            onChange={(value) => {
              setDraft((current) => ({
                ...current,
                description: value
              }));
            }}
            rows={6}
            value={draft.description}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="Participation"
              onSelectionChange={(key) => {
                setDraft((current) => ({
                  ...current,
                  participation: String(key)
                }));
              }}
              options={[
                {
                  id: 'individual',
                  label: 'Individual'
                },
                {
                  id: 'team',
                  label: 'Team'
                },
                {
                  id: 'hybrid',
                  label: 'Individual or team'
                }
              ]}
              selectedKey={draft.participation}
            />
            <TextField
              label="Starts"
              onChange={(value) => {
                setDraft((current) => ({
                  ...current,
                  startsAt: value
                }));
              }}
              type="datetime-local"
              value={draft.startsAt}
            />
            <TextField
              label="Ends"
              onChange={(value) => {
                setDraft((current) => ({
                  ...current,
                  endsAt: value
                }));
              }}
              type="datetime-local"
              value={draft.endsAt}
            />
          </div>
          <fieldset className="grid gap-3 rounded-lg border border-border-subtle p-4">
            <legend className="px-2 text-sm font-medium text-text">Modes</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {modeOptions.map((mode) => (
                <Checkbox
                  isSelected={draft.modes.includes(mode.id)}
                  key={mode.id}
                  onChange={(selected) => {
                    setDraft((current) => ({
                      ...current,
                      modes: selected
                        ? [...current.modes, mode.id]
                        : current.modes.filter((entry) => entry !== mode.id)
                    }));
                  }}
                >
                  {mode.label}
                </Checkbox>
              ))}
            </div>
          </fieldset>
        </div>
      </Dialog>
    </DialogTrigger>
  );
}
