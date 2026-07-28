import type { ChallengeWorkspaceActions } from './challenge-types';
import { api } from '@/lib/api/client';

function requireData<T>(data: T | undefined): T {
  if (data === undefined) {
    throw new Error('Challenge request failed');
  }

  return data;
}

export function createChallengeApiActions(
  eventId: string,
  csrfToken: string
): ChallengeWorkspaceActions {
  const mutationHeaders = {
    'x-csrf-token': csrfToken
  };

  return {
    async loadHints(challengeId) {
      const result = await api.GET('/api/v1/events/{event_id}/challenges/{challenge_id}/hints', {
        params: {
          path: {
            challenge_id: challengeId,
            event_id: eventId
          }
        }
      });
      return requireData(result.data);
    },
    async loadWriteup(challengeId) {
      const result = await api.GET('/api/v1/events/{event_id}/challenges/{challenge_id}/writeup', {
        params: {
          path: {
            challenge_id: challengeId,
            event_id: eventId
          }
        }
      });

      if (result.response.status === 404) {
        return null;
      }

      return requireData(result.data);
    },
    async saveWriteup(challengeId, input) {
      const result = await api.PUT('/api/v1/events/{event_id}/challenges/{challenge_id}/writeup', {
        body: input,
        headers: mutationHeaders,
        params: {
          path: {
            challenge_id: challengeId,
            event_id: eventId
          }
        }
      });
      return requireData(result.data);
    },
    async submitAnswer(challengeId, answer) {
      const result = await api.POST(
        '/api/v1/events/{event_id}/challenges/{challenge_id}/submissions',
        {
          body: {
            answer,
            idempotency_key: crypto.randomUUID()
          },
          headers: mutationHeaders,
          params: {
            path: {
              challenge_id: challengeId,
              event_id: eventId
            }
          }
        }
      );
      return requireData(result.data);
    },
    async submitSurvey(challengeId, answers) {
      const result = await api.POST('/api/v1/events/{event_id}/challenges/{challenge_id}/survey', {
        body: {
          answers
        },
        headers: mutationHeaders,
        params: {
          path: {
            challenge_id: challengeId,
            event_id: eventId
          }
        }
      });
      return requireData(result.data);
    },
    async unlockHint(challengeId, hintId) {
      const result = await api.POST(
        '/api/v1/events/{event_id}/challenges/{challenge_id}/hints/{hint_id}/unlock',
        {
          headers: mutationHeaders,
          params: {
            path: {
              challenge_id: challengeId,
              event_id: eventId,
              hint_id: hintId
            }
          }
        }
      );
      return requireData(result.data);
    }
  };
}
