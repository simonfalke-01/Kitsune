import { describe, expect, it } from 'vitest';

import {
  externalAuthStartHref,
  initialSubmissionState,
  safeReturnPath,
  submissionReducer
} from './public-auth';

describe('public authentication helpers', () => {
  it('keeps application-local return paths and rejects external redirects', () => {
    expect(safeReturnPath('/challenges?division=beginner#leaderboard')).toBe(
      '/challenges?division=beginner#leaderboard'
    );
    expect(safeReturnPath(['/settings', '/challenges'])).toBe('/settings');
    expect(safeReturnPath('https://example.com')).toBe('/challenges');
    expect(safeReturnPath('//example.com')).toBe('/challenges');
    expect(safeReturnPath('/%2F%2Fexample.com')).toBe('/challenges');
    expect(safeReturnPath('/\\example.com')).toBe('/challenges');
  });

  it('builds provider starts only from generated public auth paths', () => {
    expect(
      externalAuthStartHref('/api/v1/auth/oidc/acme/workforce/start', '/scoreboard?live=true')
    ).toBe('/api/v1/auth/oidc/acme/workforce/start?return_to=%2Fscoreboard%3Flive%3Dtrue');
    expect(externalAuthStartHref('/api/v1/auth/saml/acme/workforce/start', '//example.com')).toBe(
      '/api/v1/auth/saml/acme/workforce/start?return_to=%2Fchallenges'
    );
    expect(externalAuthStartHref('https://example.com/start', '/challenges')).toBeNull();
    expect(externalAuthStartHref('/api/v1/auth/logout', '/challenges')).toBeNull();
  });

  it('moves submission state through pending, failure, and success', () => {
    expect(submissionReducer(initialSubmissionState, { type: 'submit' })).toEqual({
      message: null,
      status: 'submitting'
    });
    expect(
      submissionReducer(initialSubmissionState, {
        message: 'Retry the request.',
        type: 'fail'
      })
    ).toEqual({
      message: 'Retry the request.',
      status: 'failed'
    });
    expect(
      submissionReducer(initialSubmissionState, {
        message: 'Request complete.',
        type: 'succeed'
      })
    ).toEqual({
      message: 'Request complete.',
      status: 'succeeded'
    });
  });
});
