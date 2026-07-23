'use client';

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

import { useSession } from './session-context';
import { api, errorMessage, type ChallengeSummary, type EventSummary } from '@/lib/api/client';
import { chooseDefaultEvent, normalizeChallenge } from '@/lib/events';

const selectedEventKey = 'kitsune.selected-event';

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
  initialChallenges: ChallengeSummary[];
  initialEvents: EventSummary[];
  initialSelectedEventId: string | null;
}

export function EventProvider({
  children,
  initialChallenges,
  initialEvents,
  initialSelectedEventId
}: EventProviderProps) {
  const { isAuthenticated } = useSession();
  const [events, setEvents] = useState<EventSummary[]>(initialEvents);
  const [challenges, setChallenges] = useState<ChallengeSummary[]>(initialChallenges);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialSelectedEventId);
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

    try {
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
    } catch {
      setChallenges([]);
      setError('Challenges could not be loaded. Check your connection and retry.');
    }
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

    try {
      const result = await api.GET('/api/v1/events');

      if (!result.data) {
        setError(errorMessage(result.error, 'Events could not be loaded.'));
        return;
      }

      const persistedId = window.localStorage.getItem(selectedEventKey);
      const currentIsValid = result.data.some((event) => event.id === selectedEventId);
      const persistedIsValid = result.data.some((event) => event.id === persistedId);
      let nextEventId = selectedEventId;

      if (!currentIsValid) {
        nextEventId = persistedIsValid
          ? persistedId
          : (chooseDefaultEvent(result.data)?.id ?? null);
      }

      setEvents(result.data);
      setSelectedEventId(nextEventId);

      if (nextEventId) {
        window.localStorage.setItem(selectedEventKey, nextEventId);
      } else {
        window.localStorage.removeItem(selectedEventKey);
      }

      await loadChallenges(nextEventId);
    } catch {
      setError('Events could not be loaded. Check your connection and retry.');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, loadChallenges, selectedEventId]);

  const selectEvent = useCallback(
    async (eventId: string) => {
      setSelectedEventId(eventId);
      window.localStorage.setItem(selectedEventKey, eventId);
      document.cookie = `${selectedEventKey}=${encodeURIComponent(eventId)}; Path=/; Max-Age=31536000; SameSite=Lax`;
      setError(null);
      setIsLoading(true);

      try {
        await loadChallenges(eventId);
      } finally {
        setIsLoading(false);
      }
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
