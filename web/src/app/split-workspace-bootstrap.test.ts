import { beforeEach, describe, expect, it } from 'vitest';

import {
  applyInitialSplitWorkspacePreferences,
  splitWorkspaceBootstrapScript
} from './split-workspace-bootstrap';

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('style');
});

describe('split workspace bootstrap', () => {
  it('publishes persisted workspace widths before the document paints', () => {
    window.localStorage.setItem('kitsune.split-workspace.v1.challenge-list', '31.375');

    applyInitialSplitWorkspacePreferences();

    expect(
      document.documentElement.style.getPropertyValue('--split-workspace-preference-challenge-list')
    ).toBe('31.375%');
  });

  it('ignores unsafe keys and invalid percentages', () => {
    window.localStorage.setItem('kitsune.split-workspace.v1.challenge-list', 'NaN');
    window.localStorage.setItem('kitsune.split-workspace.v1.detail panel', '35');
    window.localStorage.setItem('kitsune.split-workspace.v1.hidden', '100');

    applyInitialSplitWorkspacePreferences();

    expect(document.documentElement.getAttribute('style')).toBeNull();
  });

  it('serializes a self-contained head script', () => {
    expect(splitWorkspaceBootstrapScript).toContain('kitsune.split-workspace.v1.');
    expect(splitWorkspaceBootstrapScript).toContain('document.documentElement');
    expect(splitWorkspaceBootstrapScript).toContain('localStorage');
  });
});
