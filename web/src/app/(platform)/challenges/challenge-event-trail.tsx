import { Keyboard } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { ChallengeEventStandingStub } from './challenge-solve-stub';
import type { ChallengePresenceStatus } from './use-challenge-presence';
import type { RealtimeStatus } from '@/app/realtime-context';
import { AppHeader } from '@/components/layout/app-shell';
import {
  Dialog,
  DialogTrigger,
  IconButton,
  KeyboardKey,
  Progress,
  Sparkline,
  StatusIndicator,
  Tooltip,
  TooltipTrigger
} from '@/components/ui';
import { challengeProgress, type ChallengeExperience } from '@/lib/challenges';

interface ChallengeEventTrailProps {
  challenges: ChallengeExperience[];
  eventName: string;
  isShortcutHelpOpen: boolean;
  onShortcutHelpOpenChange: (open: boolean) => void;
  presenceStatus: ChallengePresenceStatus;
  realtimeStatus: RealtimeStatus;
  standing: ChallengeEventStandingStub;
}

const challengeShortcuts = [
  { keys: ['/'], label: 'Search challenges' },
  { keys: ['J', 'K'], label: 'Move challenge selection' },
  { keys: ['Enter'], label: 'Open focused challenge' },
  { keys: ['D'], label: 'Open details' },
  { keys: ['S'], label: 'Open solves' },
  { keys: ['H'], label: 'Open hints' },
  { keys: ['A'], label: 'Focus answer field' },
  { keys: ['F'], label: 'Toggle challenge list' },
  { keys: ['[', ']'], label: 'Resize challenge list' },
  { keys: ['?'], label: 'Show shortcuts' }
] as const;

export function ChallengeEventTrail({
  challenges,
  eventName,
  isShortcutHelpOpen,
  onShortcutHelpOpenChange,
  presenceStatus,
  realtimeStatus,
  standing
}: ChallengeEventTrailProps) {
  const progress = challengeProgress(challenges);
  const [showInitialConnection, setShowInitialConnection] = useState(false);

  useEffect(() => {
    if (realtimeStatus !== 'connecting') {
      return;
    }

    const timer = window.setTimeout(() => {
      setShowInitialConnection(true);
    }, 1_500);

    return () => window.clearTimeout(timer);
  }, [realtimeStatus]);

  const connectionLabel =
    realtimeStatus === 'offline'
      ? 'Offline'
      : realtimeStatus === 'reconnecting'
        ? 'Reconnecting'
        : realtimeStatus === 'connecting' && showInitialConnection
          ? 'Connecting'
          : realtimeStatus === 'connected' && presenceStatus === 'error'
            ? 'Team presence unavailable'
            : null;

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
          {connectionLabel ? (
            <StatusIndicator aria-live="polite" label={connectionLabel} tone="warning" />
          ) : null}
          <div className="hidden items-center gap-3 xl:flex">
            <span className="kitsune-optical-center hidden items-baseline gap-2 text-right text-sm tabular-nums text-text-muted 2xl:flex">
              <span>rank</span>
              <span>
                <strong className="font-semibold text-text">{standing.rank}</strong> /{' '}
                {standing.totalCompetitors}
              </span>
            </span>
            <Sparkline interpolation="step" series={standing.scoreSeries} />
          </div>
          <TooltipTrigger>
            <DialogTrigger isOpen={isShortcutHelpOpen} onOpenChange={onShortcutHelpOpenChange}>
              <IconButton label="Keyboard shortcuts">
                <Keyboard aria-hidden className="size-4" />
              </IconButton>
              <Dialog title="Keyboard shortcuts">
                <dl className="m-0 grid gap-3">
                  {challengeShortcuts.map((shortcut) => (
                    <div className="flex items-center justify-between gap-6" key={shortcut.label}>
                      <dt className="text-sm text-text-muted">{shortcut.label}</dt>
                      <dd className="m-0 flex shrink-0 items-center gap-1">
                        {shortcut.keys.map((key) => (
                          <KeyboardKey key={key}>{key}</KeyboardKey>
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
