import type { BadgeTone } from '@/components/ui';

const writeupStateDetails: Record<string, { label: string; tone: BadgeTone }> = {
  approved: {
    label: 'Approved',
    tone: 'success'
  },
  changes_requested: {
    label: 'Changes requested',
    tone: 'warning'
  },
  draft: {
    label: 'Draft',
    tone: 'neutral'
  },
  published: {
    label: 'Published',
    tone: 'success'
  },
  submitted: {
    label: 'Submitted',
    tone: 'info'
  }
};

export function formatEngagementTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function writeupStateDetailsFor(state: string): {
  label: string;
  tone: BadgeTone;
} {
  return (
    writeupStateDetails[state] ?? {
      label: state,
      tone: 'neutral'
    }
  );
}
