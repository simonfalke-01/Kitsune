'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { api, type ChallengePresenceMember } from '@/lib/api/client';

export type ChallengePresenceStatus = 'idle' | 'loading' | 'ready' | 'error';

interface UseChallengePresenceOptions {
  csrfToken: string | null;
  eventId: string;
  isEnabled: boolean;
  selectedChallengeId: string | null;
}

interface ChallengePresenceState {
  members: ChallengePresenceMember[];
  selectChallenge: (challengeId: string | null) => void;
  status: ChallengePresenceStatus;
}

const heartbeatInterval = 15_000;
const pollInterval = 5_000;

export function useChallengePresence({
  csrfToken,
  eventId,
  isEnabled,
  selectedChallengeId
}: UseChallengePresenceOptions): ChallengePresenceState {
  const [members, setMembers] = useState<ChallengePresenceMember[]>([]);
  const [status, setStatus] = useState<ChallengePresenceStatus>('idle');
  const isMountedRef = useRef(true);
  const selectionRef = useRef(selectedChallengeId);
  const updateQueueRef = useRef(Promise.resolve());

  const acceptMembers = useCallback((nextMembers: ChallengePresenceMember[]) => {
    if (!isMountedRef.current) {
      return;
    }

    setMembers(nextMembers);
    setStatus('ready');
  }, []);

  const refresh = useCallback(async () => {
    if (!isEnabled) {
      return;
    }

    try {
      const result = await api.GET('/api/v1/events/{event_id}/challenge-presence', {
        params: {
          path: {
            event_id: eventId
          }
        }
      });

      if (!result.data) {
        throw new Error('Presence unavailable');
      }

      acceptMembers(result.data.members);
    } catch {
      if (isMountedRef.current) {
        setStatus('error');
      }
    }
  }, [acceptMembers, eventId, isEnabled]);

  const update = useCallback(
    (challengeId: string | null) => {
      if (!isEnabled || !csrfToken) {
        return;
      }

      updateQueueRef.current = updateQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          try {
            const result = await api.PUT('/api/v1/events/{event_id}/challenge-presence', {
              body: {
                challenge_id: challengeId
              },
              headers: {
                'x-csrf-token': csrfToken
              },
              params: {
                path: {
                  event_id: eventId
                }
              }
            });

            if (!result.data) {
              throw new Error('Presence unavailable');
            }

            acceptMembers(result.data.members);
          } catch {
            if (isMountedRef.current) {
              setStatus('error');
            }
          }
        });
    },
    [acceptMembers, csrfToken, eventId, isEnabled]
  );

  const selectChallenge = useCallback(
    (challengeId: string | null) => {
      selectionRef.current = challengeId;
      update(document.visibilityState === 'visible' ? challengeId : null);
    },
    [update]
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    selectionRef.current = selectedChallengeId;

    if (!isEnabled) {
      return;
    }

    update(document.visibilityState === 'visible' ? selectedChallengeId : null);
  }, [isEnabled, selectedChallengeId, update]);

  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    void refresh();
    const pollTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    }, pollInterval);
    const heartbeatTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        update(selectionRef.current);
      }
    }, heartbeatInterval);

    const handleVisibilityChange = () => {
      update(document.visibilityState === 'visible' ? selectionRef.current : null);

      if (document.visibilityState === 'visible') {
        void refresh();
      }
    };
    const handleOnline = () => {
      update(selectionRef.current);
      void refresh();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      window.clearInterval(pollTimer);
      window.clearInterval(heartbeatTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      update(null);
    };
  }, [isEnabled, refresh, update]);

  return {
    members: isEnabled ? members : [],
    selectChallenge,
    status: isEnabled ? status : 'idle'
  };
}
