import { Keyboard } from 'lucide-react';

import type { ChallengeEventStandingStub } from './challenge-solve-stub';
import { AppHeader } from '@/components/layout/app-shell';
import {
  Button,
  Dialog,
  DialogTrigger,
  Progress,
  Sparkline,
  Tooltip,
  TooltipTrigger
} from '@/components/ui';
import { challengeProgress, type ChallengeExperience } from '@/lib/challenges';

interface ChallengeEventTrailProps {
  challenges: ChallengeExperience[];
  eventName: string;
  isShortcutHelpOpen: boolean;
  onShortcutHelpOpenChange: (open: boolean) => void;
  standing: ChallengeEventStandingStub;
}

const challengeShortcuts = [
  { keys: ['/'], label: 'Search challenges' },
  { keys: ['J', 'K'], label: 'Move challenge selection' },
  { keys: ['Enter'], label: 'Open focused challenge' },
  { keys: ['D'], label: 'Open details' },
  { keys: ['S'], label: 'Open solves' },
  { keys: ['H'], label: 'Open hints' },
  { keys: ['F'], label: 'Toggle challenge list' },
  { keys: ['[', ']'], label: 'Resize challenge list' },
  { keys: ['?'], label: 'Show shortcuts' }
] as const;

export function ChallengeEventTrail({
  challenges,
  eventName,
  isShortcutHelpOpen,
  onShortcutHelpOpenChange,
  standing
}: ChallengeEventTrailProps) {
  const progress = challengeProgress(challenges);

  return (
    <AppHeader
      appearance="workspace"
      brandLabel={eventName}
      footer={
        <Progress
          appearance="trail"
          label="Event solve progress"
          maxValue={Math.max(progress.total, 1)}
          value={progress.solved}
        />
      }
    >
      <section aria-label="Event progress" className="flex min-w-0 items-center justify-end gap-6">
        <div className="flex shrink-0 items-center gap-6">
          <div className="hidden items-center gap-3 xl:flex">
            <span className="kitsune-optical-center hidden text-right text-sm tabular-nums text-text-muted 2xl:block">
              Rank <strong className="font-semibold text-text">{standing.rank}</strong> /{' '}
              {standing.totalCompetitors}
            </span>
            <Sparkline interpolation="step" series={standing.scoreSeries} />
          </div>
          <TooltipTrigger>
            <DialogTrigger isOpen={isShortcutHelpOpen} onOpenChange={onShortcutHelpOpenChange}>
              <Button
                aria-label="Keyboard shortcuts"
                className="size-control shrink-0"
                size="icon"
                tone="quiet"
              >
                <Keyboard aria-hidden className="size-4" />
              </Button>
              <Dialog title="Keyboard shortcuts">
                <dl className="m-0 grid gap-3">
                  {challengeShortcuts.map((shortcut) => (
                    <div className="flex items-center justify-between gap-6" key={shortcut.label}>
                      <dt className="text-sm text-text-muted">{shortcut.label}</dt>
                      <dd className="m-0 flex shrink-0 items-center gap-1">
                        {shortcut.keys.map((key) => (
                          <kbd
                            className="min-w-8 rounded-sm border border-border-subtle bg-surface-sunken px-2 py-1 text-center font-mono text-xs font-medium text-text"
                            key={key}
                          >
                            {key}
                          </kbd>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Dialog>
            </DialogTrigger>
            <Tooltip>Keyboard shortcuts</Tooltip>
          </TooltipTrigger>
        </div>
      </section>
    </AppHeader>
  );
}
