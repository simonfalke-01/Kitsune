import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const fontFiles = [
  'suisse-intl-regular.otf',
  'suisse-intl-medium.otf',
  'suisse-intl-semibold.otf',
  'suisse-intl-bold.otf',
  'suisse-intl-mono-regular.otf',
  'suisse-intl-mono-bold.otf'
] as const;

describe('self-hosted Suisse fonts', () => {
  it.each(fontFiles)('%s is a valid OpenType asset', (filename) => {
    const font = readFileSync(resolve(process.cwd(), 'public', 'fonts', filename));

    expect(font.byteLength).toBeGreaterThan(0);
    expect(font.subarray(0, 4).toString('ascii')).toBe('OTTO');
  });
});
