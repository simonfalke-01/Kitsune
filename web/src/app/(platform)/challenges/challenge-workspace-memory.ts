export type ChallengeDetailTab = 'details' | 'hints' | 'solves' | 'writeup';

interface ChallengeMemory {
  scrollTop: Partial<Record<ChallengeDetailTab, number>>;
}

export interface ChallengeWorkspaceMemory {
  challenges: Record<string, ChallengeMemory>;
  listScrollTop: number;
}

const memoryEvent = 'kitsune-challenge-workspace-memory';
const memoryVersion = 'v1';
const emptyMemorySnapshot = '{}';

function storageKey(eventId: string): string {
  return `kitsune.challenge-workspace.${memoryVersion}.${eventId}`;
}

function finiteScrollPosition(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

export function challengeDetailTab(value: unknown): ChallengeDetailTab {
  return value === 'hints' || value === 'solves' || value === 'writeup' ? value : 'details';
}

export function challengeWorkspacePath(
  pathname: string,
  searchParams: URLSearchParams,
  challengeId?: string,
  tab: ChallengeDetailTab = 'details'
): string {
  const next = new URLSearchParams(searchParams);

  if (challengeId) {
    next.set('challenge', challengeId);

    if (tab === 'details') {
      next.delete('tab');
    } else {
      next.set('tab', tab);
    }
  } else {
    next.delete('challenge');
    next.delete('tab');
  }

  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function parseChallengeWorkspaceMemory(snapshot: string): ChallengeWorkspaceMemory {
  try {
    const stored = JSON.parse(snapshot) as {
      challenges?: unknown;
      listScrollTop?: unknown;
    };
    const challenges: Record<string, ChallengeMemory> = {};

    if (stored.challenges && typeof stored.challenges === 'object') {
      for (const [challengeId, value] of Object.entries(stored.challenges)) {
        if (!value || typeof value !== 'object') {
          continue;
        }

        const candidate = value as {
          scrollTop?: unknown;
        };
        const scrollTop: Partial<Record<ChallengeDetailTab, number>> = {};

        if (candidate.scrollTop && typeof candidate.scrollTop === 'object') {
          for (const tab of ['details', 'solves', 'hints', 'writeup'] as const) {
            const position = finiteScrollPosition(
              (candidate.scrollTop as Record<string, unknown>)[tab]
            );

            if (position > 0) {
              scrollTop[tab] = position;
            }
          }
        }

        challenges[challengeId] = {
          scrollTop
        };
      }
    }

    return {
      challenges,
      listScrollTop: finiteScrollPosition(stored.listScrollTop)
    };
  } catch {
    return {
      challenges: {},
      listScrollTop: 0
    };
  }
}

export function challengeWorkspaceMemorySnapshot(eventId: string): string {
  try {
    return window.localStorage.getItem(storageKey(eventId)) ?? emptyMemorySnapshot;
  } catch {
    return emptyMemorySnapshot;
  }
}

export function getServerChallengeWorkspaceMemorySnapshot(): string {
  return emptyMemorySnapshot;
}

export function subscribeToChallengeWorkspaceMemory(change: () => void): () => void {
  window.addEventListener('storage', change);
  window.addEventListener(memoryEvent, change);

  return () => {
    window.removeEventListener('storage', change);
    window.removeEventListener(memoryEvent, change);
  };
}

function writeMemory(eventId: string, memory: ChallengeWorkspaceMemory) {
  try {
    window.localStorage.setItem(storageKey(eventId), JSON.stringify(memory));
    window.dispatchEvent(new Event(memoryEvent));
  } catch {
    // The workspace remains usable when storage is unavailable.
  }
}

function updateMemory(
  eventId: string,
  update: (memory: ChallengeWorkspaceMemory) => ChallengeWorkspaceMemory
) {
  const current = parseChallengeWorkspaceMemory(challengeWorkspaceMemorySnapshot(eventId));
  writeMemory(eventId, update(current));
}

export function rememberChallengeScroll(
  eventId: string,
  challengeId: string,
  tab: ChallengeDetailTab,
  scrollTop: number
) {
  updateMemory(eventId, (current) => ({
    ...current,
    challenges: {
      ...current.challenges,
      [challengeId]: {
        scrollTop: {
          ...current.challenges[challengeId]?.scrollTop,
          [tab]: finiteScrollPosition(scrollTop)
        }
      }
    }
  }));
}

export function rememberChallengeListScroll(eventId: string, scrollTop: number) {
  updateMemory(eventId, (current) => ({
    ...current,
    listScrollTop: finiteScrollPosition(scrollTop)
  }));
}
