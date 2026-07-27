import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { showToast, toastQueue, ToastRegion } from './toast';

describe('ToastRegion', () => {
  it('renders first blood as a gold achievement rather than a warning', () => {
    render(<ToastRegion />);

    let toastId = '';
    act(() => {
      toastId = showToast({
        description: 'First blood and 450 points.',
        title: 'Challenge solved',
        tone: 'firstBlood'
      });
    });

    const toast = screen.getByText('Challenge solved').closest('.kitsune-toast');
    expect(toast).toHaveClass(
      'border-first-blood-border',
      'bg-first-blood-subtle',
      'text-first-blood-text'
    );

    act(() => {
      toastQueue.close(toastId);
    });
  });

  it.each([
    ['firstBloodSuccess', ['border-success-border', 'bg-success-subtle', 'text-success-text']],
    ['firstBloodRainbow', ['kitsune-first-blood-toast']]
  ] as const)('renders the %s first-blood presentation', (tone, classes) => {
    render(<ToastRegion />);

    let toastId = '';
    act(() => {
      toastId = showToast({
        description: 'First blood and 450 points.',
        title: 'Challenge solved',
        tone
      });
    });

    expect(screen.getByText('Challenge solved').closest('.kitsune-toast')).toHaveClass(...classes);

    act(() => {
      toastQueue.close(toastId);
    });
  });
});
