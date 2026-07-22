import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { preferences } from '$lib/i18n/index.svelte';
import BrandMark from './BrandMark.svelte';
import Toggle from './Toggle.svelte';

describe('Kitsune primitives', () => {
  beforeEach(() => {
    preferences.branding = true;
  });

  it('shows identity by default and honors free de-branding', async () => {
    const view = render(BrandMark);
    expect(screen.getByLabelText('Kitsune')).toBeTruthy();

    preferences.branding = false;
    await vi.waitFor(() => expect(view.container.textContent).not.toContain('Kitsune'));
  });

  it('provides a keyboard-native headless switch', async () => {
    const onchange = vi.fn();
    render(Toggle, { label: 'Enable foxfire', description: 'Live visual feedback', onchange });

    const control = screen.getByRole('switch', { name: 'Enable foxfire' });
    expect(control.getAttribute('aria-checked')).toBe('false');
    await fireEvent.click(control);

    expect(onchange).toHaveBeenCalledWith(true);
    expect(control.getAttribute('aria-checked')).toBe('true');
  });
});
