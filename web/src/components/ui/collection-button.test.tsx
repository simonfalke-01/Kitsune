import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CollectionButton } from './collection-button';

describe('CollectionButton', () => {
  it('stays programmatically focusable while excluded from Tab order', () => {
    render(<CollectionButton excludeFromTabOrder>Cache rules</CollectionButton>);

    const button = screen.getByRole('button', { name: 'Cache rules' });
    expect(button).toHaveAttribute('tabindex', '-1');
    button.focus();
    expect(button).toHaveFocus();
  });

  it('uses React Aria press behavior for Space', () => {
    const onPress = vi.fn();
    render(
      <CollectionButton excludeFromTabOrder onPress={onPress}>
        Cache rules
      </CollectionButton>
    );

    const button = screen.getByRole('button', { name: 'Cache rules' });
    button.focus();
    fireEvent.keyDown(button, { key: ' ' });
    fireEvent.keyUp(button, { key: ' ' });

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
