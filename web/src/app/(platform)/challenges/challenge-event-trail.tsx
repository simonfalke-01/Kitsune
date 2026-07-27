import { Keyboard } from 'lucide-react';

import { ChallengeCategoryLabel } from './challenge-category';
import type { ChallengeEventStandingStub } from './challenge-solve-stub';
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
  selectedChallenge?: ChallengeExperience | null;
  standing: ChallengeEventStandingStub;
}

const challengeShortcuts = [
  { keys: ['/'], label: 'Search challenges' },
  { keys: ['J', 'K'], label: 'Move through challenges' },
  { keys: ['Enter'], label: 'Open focused challenge' },
  { keys: ['D'], label: 'Open details' },
  { keys: ['S'], label: 'Open solves' },
  { keys: ['H'], label: 'Open hints' },
  { keys: ['[', ']'], label: 'Resize challenge list' },
  { keys: ['?'], label: 'Show shortcuts' }
] as const;

export function ChallengeEventTrail({
  challenges,
  eventName,
  isShortcutHelpOpen,
  onShortcutHelpOpenChange,
  selectedChallenge,
  standing
}: ChallengeEventTrailProps) {
  const progress = challengeProgress(challenges);

  return (
    <section
      aria-label="Event progress"
      className="shrink-0 overflow-hidden rounded-md bg-surface-raised"
    >
      <div className="flex min-h-16 items-center gap-6 px-4">
        <div className="kitsune-optical-center flex min-w-0 flex-1 flex-wrap items-baseline gap-x-6 gap-y-1">
          <h1 className="m-0 shrink-0 truncate font-display text-lg font-semibold tracking-tight text-text">
            {eventName}
          </h1>
          {selectedChallenge ? (
            <div className="hidden min-w-0 items-baseline gap-2 text-base xl:flex">
              <ChallengeCategoryLabel category={selectedChallenge.category} showIcon={false} />
              <span className="text-text-subtle">/</span>
              <strong className="truncate font-medium text-text">{selectedChallenge.name}</strong>
            </div>
          ) : null}
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-base tabular-nums text-text-muted">
            <span>
              <strong className="font-semibold text-text">{progress.solved}</strong> /{' '}
              {progress.total} solved
            </span>
            <span>
              <strong className="font-semibold text-text">
                {progress.earnedPoints.toLocaleString()}
              </strong>{' '}
              / {progress.availablePoints.toLocaleString()} pts
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-6">
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
          <div className="flex items-center gap-3">
            <span className="kitsune-optical-center hidden text-right text-sm tabular-nums text-text-muted sm:block">
              Rank <strong className="font-semibold text-text">{standing.rank}</strong> /{' '}
              {standing.totalCompetitors}
            </span>
            <Sparkline interpolation="step" series={standing.scoreSeries} />
          </div>
        </div>
      </div>
      <Progress
        appearance="trail"
        label="Event solve progress"
        maxValue={Math.max(progress.total, 1)}
        value={progress.solved}
      />
    </section>
  );
}
