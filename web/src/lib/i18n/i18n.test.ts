import { describe, expect, it } from 'vitest';

import { en } from './en';

describe('voice catalog', () => {
  it('ships complete playful and professional variants for toned copy', () => {
    expect(en.auth.welcome.kitsune).toBeTruthy();
    expect(en.auth.welcome.professional).toBeTruthy();
    expect(en.auth.intro.kitsune).toBeTruthy();
    expect(en.auth.intro.professional).toBeTruthy();
    expect(en.auth.setupTitle.kitsune).toBeTruthy();
    expect(en.auth.setupTitle.professional).toBeTruthy();
  });

  it('keeps the free de-brand support request in the catalog', () => {
    expect(en.branding.nudge).toContain('please consider supporting');
  });
});
