import { describe, expect, it } from 'vitest';

import {
  formatUnreadCount,
  notificationContent,
  notificationPriority,
  notificationStatus,
  safeNotificationHref
} from './notifications';

describe('notificationContent', () => {
  it('extracts supported player-facing fields', () => {
    expect(
      notificationContent(
        {
          action_label: 'Open challenge',
          action_url: '/challenges/web-100',
          message: 'A new challenge is available.',
          subject: 'Challenge unlocked'
        },
        'challenge.unlocked'
      )
    ).toEqual({
      body: 'A new challenge is available.',
      href: '/challenges/web-100',
      linkLabel: 'Open challenge',
      title: 'Challenge unlocked'
    });
  });

  it('falls back to a readable template name for unknown payloads', () => {
    expect(notificationContent(null, 'scoreboard.control_changed')).toEqual({
      body: null,
      href: null,
      linkLabel: 'View details',
      title: 'Scoreboard control changed'
    });
  });
});

describe('safeNotificationHref', () => {
  it('accepts internal paths and HTTP links', () => {
    expect(safeNotificationHref('/scoreboard')).toBe('/scoreboard');
    expect(safeNotificationHref('https://example.com/guide')).toBe('https://example.com/guide');
  });

  it('rejects protocol-relative and executable links', () => {
    expect(safeNotificationHref('//example.com/guide')).toBeNull();
    expect(safeNotificationHref('javascript:alert(1)')).toBeNull();
  });
});

describe('notification metadata', () => {
  it('maps priority and count values to bounded display metadata', () => {
    expect(notificationPriority(0)).toEqual({
      label: 'Standard',
      tone: 'neutral'
    });
    expect(notificationPriority(2)).toEqual({
      label: 'Urgent',
      tone: 'danger'
    });
    expect(formatUnreadCount(120)).toBe('99+');
    expect(formatUnreadCount(-1)).toBe('0');
  });

  it('gives retraction precedence over expiry', () => {
    const now = Date.parse('2026-07-27T12:00:00Z');

    expect(
      notificationStatus(
        {
          expires_at: '2026-07-27T11:00:00Z',
          retracted_at: '2026-07-27T10:00:00Z'
        },
        now
      )
    ).toBe('retracted');
    expect(
      notificationStatus(
        {
          expires_at: '2026-07-27T11:00:00Z',
          retracted_at: null
        },
        now
      )
    ).toBe('expired');
    expect(
      notificationStatus(
        {
          expires_at: '2026-07-27T13:00:00Z',
          retracted_at: null
        },
        now
      )
    ).toBe('active');
  });
});
