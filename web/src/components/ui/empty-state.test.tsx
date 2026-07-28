import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('supports bounded and plain surface contexts without screen-level markup', () => {
    const { rerender } = render(<EmptyState title="Nothing published" />);

    expect(screen.getByText('Nothing published').parentElement?.parentElement).toHaveClass(
      'rounded-lg',
      'border'
    );

    rerender(<EmptyState appearance="plain" title="No challenge selected" />);

    const title = screen.getByRole('heading', { name: 'No challenge selected' });
    expect(title).toHaveClass('text-text-muted');
    expect(title.parentElement?.parentElement).not.toHaveClass('rounded-lg', 'border');
  });
});
