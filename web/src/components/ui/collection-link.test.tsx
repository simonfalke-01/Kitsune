import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CollectionLink } from './collection-link';

describe('CollectionLink', () => {
  it('activates challenge links once when Space is pressed', () => {
    const onPress = vi.fn();
    render(
      <CollectionLink appearance="challenge" href="#challenge" onPress={onPress}>
        Cache Rules Everything
      </CollectionLink>
    );
    const link = screen.getByRole('link', { name: 'Cache Rules Everything' });

    expect(fireEvent.keyDown(link, { key: ' ' })).toBe(false);
    expect(onPress).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(link, { key: ' ', repeat: true });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('keeps selected and keyboard-focus indicators visually separate', () => {
    render(
      <CollectionLink appearance="challenge" href="#challenge" isSelected>
        Cache Rules Everything
      </CollectionLink>
    );
    const link = screen.getByRole('link', { name: 'Cache Rules Everything' });

    expect(link).toHaveClass(
      'ring-1',
      'ring-inset',
      'ring-accent-border',
      'focus-visible:ring-2',
      'focus-visible:ring-focus-ring'
    );
    expect(link).not.toHaveClass('focus-visible:outline-offset-2');
  });
});
