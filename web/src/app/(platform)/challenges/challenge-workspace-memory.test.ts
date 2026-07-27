import { beforeEach, describe, expect, it } from 'vitest';

import {
  challengeWorkspaceMemorySnapshot,
  challengeWorkspacePath,
  parseChallengeWorkspaceMemory,
  rememberChallengeListScroll,
  rememberChallengeScroll
} from './challenge-workspace-memory';

beforeEach(() => {
  window.localStorage.clear();
});

describe('challenge workspace memory', () => {
  it('gives every non-default detail tab a stable URL', () => {
    expect(
      challengeWorkspacePath('/challenges', new URLSearchParams('division=open'), 'web', 'hints')
    ).toBe('/challenges?division=open&challenge=web&tab=hints');
    expect(
      challengeWorkspacePath(
        '/challenges',
        new URLSearchParams('challenge=web&tab=hints'),
        'web',
        'details'
      )
    ).toBe('/challenges?challenge=web');
    expect(
      challengeWorkspacePath('/challenges', new URLSearchParams('challenge=web&tab=solves'))
    ).toBe('/challenges');
  });

  it('preserves list position and per-tab detail positions without saving tab selection', () => {
    rememberChallengeListScroll('event', 184);
    rememberChallengeScroll('event', 'challenge', 'solves', 420);

    expect(parseChallengeWorkspaceMemory(challengeWorkspaceMemorySnapshot('event'))).toEqual({
      challenges: {
        challenge: {
          scrollTop: {
            solves: 420
          }
        }
      },
      listScrollTop: 184
    });
  });

  it('repairs malformed and out-of-range stored state', () => {
    expect(
      parseChallengeWorkspaceMemory(
        JSON.stringify({
          challenges: {
            challenge: {
              scrollTop: {
                details: -20,
                hints: 64
              },
              tab: 'unknown'
            }
          },
          listScrollTop: 'far'
        })
      )
    ).toEqual({
      challenges: {
        challenge: {
          scrollTop: {
            hints: 64
          }
        }
      },
      listScrollTop: 0
    });
  });
});
