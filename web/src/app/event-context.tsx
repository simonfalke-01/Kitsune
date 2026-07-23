import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';

import { useSession } from './session-context';
import { api, errorMessage, type ChallengeSummary, type EventSummary } from '@/lib/api/client';

const selectedEventKey = 'kitsune.selected-event';

const eventStatePriority: Readonly<Record<string, number>> = {
  live: 0,
  scheduled: 1,
  paused: 2,
  draft: 3,
  ended: 4,
  archived: 5
};

type WireChallenge = Omit<ChallengeSummary, 'survey'> & {
  survey: Array<
    Omit<ChallengeSummary['survey'][number], 'range'> & {
      range?: number[] | null;
    }
  >;
};

interface EventContextValue {
  challenges: ChallengeSummary[];
  error: string | null;
  events: EventSummary[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  refreshChallenges: () => Promise<void>;
  selectedEvent: EventSummary | null;
  selectEvent: (eventId: string) => Promise<void>;
}

const EventContext = createContext<EventContextValue | null>(null);

interface EventProviderProps {
  children: ReactNode;
}

function chooseDefaultEvent(events: readonly EventSummary[]): EventSummary | null {
  const sorted = [...events].sort((left, right) => {
    const leftPriority = eventStatePriority[left.state] ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = eventStatePriority[right.state] ?? Number.MAX_SAFE_INTEGER;
    const stateDifference = leftPriority - rightPriority;

    if (stateDifference !== 0) {
      return stateDifference;
    }

    return left.name.localeCompare(right.name);
  });

  return sorted[0] ?? null;
}

function normalizeChallenge(challenge: WireChallenge): ChallengeSummary {
  return {
    ...challenge,
    survey: challenge.survey.map((question) => {
      const range = question.range;
      const start = range?.[0];
      const end = range?.[1];
      const normalizedRange: [number, number] | null =
        typeof start === 'number' && typeof end === 'number' ? [start, end] : null;

      return {
        ...question,
        range: normalizedRange
      };
    })
  };
}

export function EventProvider({ children }: EventProviderProps) {
  const { isAuthenticated } = useSession();
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [challenges, setChallenges] = useState<ChallengeSummary[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedEvent = useMemo(() => {
    return events.find((event) => event.id === selectedEventId) ?? null;
  }, [events, selectedEventId]);

  const loadChallenges = useCallback(async (eventId: string | null) => {
    if (!eventId) {
      setChallenges([]);
      return;
    }

    const result = await api.GET('/api/v1/events/{event_id}/challenges', {
      params: {
        path: {
          event_id: eventId
        }
      }
    });

    if (!result.data) {
      setChallenges([]);
      setError(errorMessage(result.error, 'Challenges could not be loaded.'));
      return;
    }

    const normalized = result.data.map((challenge) => {
      return normalizeChallenge(challenge);
    });

    const sorted = normalized.sort((left, right) => {
      const positionDifference = left.position - right.position;

      if (positionDifference !== 0) {
        return positionDifference;
      }

      return left.name.localeCompare(right.name);
    });

    setChallenges(sorted);
  }, []);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setEvents([]);
      setChallenges([]);
      setSelectedEventId(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await api.GET('/api/v1/events');

    if (!result.data) {
      setError(errorMessage(result.error, 'Events could not be loaded.'));
      setIsLoading(false);
      return;
    }

    const persistedId = window.localStorage.getItem(selectedEventKey);
    const currentIsValid = result.data.some((event) => event.id === selectedEventId);
    const persistedIsValid = result.data.some((event) => event.id === persistedId);
    let nextEventId = selectedEventId;

    if (!currentIsValid) {
      nextEventId = persistedIsValid ? persistedId : (chooseDefaultEvent(result.data)?.id ?? null);
    }

    setEvents(result.data);
    setSelectedEventId(nextEventId);

    if (nextEventId) {
      window.localStorage.setItem(selectedEventKey, nextEventId);
    } else {
      window.localStorage.removeItem(selectedEventKey);
    }

    await loadChallenges(nextEventId);
    setIsLoading(false);
  }, [isAuthenticated, loadChallenges, selectedEventId]);

  useEffect(() => {
    queueMicrotask(() => {
      void refresh();
    });
  }, [refresh]);

  const selectEvent = useCallback(
    async (eventId: string) => {
      setSelectedEventId(eventId);
      window.localStorage.setItem(selectedEventKey, eventId);
      await loadChallenges(eventId);
    },
    [loadChallenges]
  );

  const refreshChallenges = useCallback(async () => {
    await loadChallenges(selectedEventId);
  }, [loadChallenges, selectedEventId]);

  const value = useMemo<EventContextValue>(
    () => ({
      challenges,
      error,
      events,
      isLoading,
      refresh,
      refreshChallenges,
      selectedEvent,
      selectEvent
    }),
    [challenges, error, events, isLoading, refresh, refreshChallenges, selectedEvent, selectEvent]
  );

  return <EventContext.Provider value={value}>{children}</EventContext.Provider>;
}

export function useEvent(): EventContextValue {
  const value = useContext(EventContext);

  if (!value) {
    throw new Error('useEvent must be used within EventProvider.');
  }

  return value;
}
