import { describe, expect, it } from 'vitest';
import { humanizeAuditAction, metadataEntries, shortIdentifier } from './audit-format';

describe('audit presentation', () => {
  it('turns stable keys and identifiers into calm readable labels', () => {
    expect(humanizeAuditAction('scoreboard.controls.change')).toBe(
      'Scoreboard · Controls · Change'
    );
    expect(shortIdentifier(null)).toBe('System');
    expect(shortIdentifier('018f1234-1234-7890-abcd-123456789abc')).toBe('018f1234…9abc');
  });

  it('keeps structured metadata explicit without hiding falsey values', () => {
    expect(metadataEntries({ state: 'live', count: 0, enabled: false, empty: null })).toEqual([
      ['state', 'live'],
      ['count', '0'],
      ['enabled', 'false']
    ]);
  });
});
