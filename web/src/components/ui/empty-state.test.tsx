import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EmptyState, WorkspacePlaceholder } from './empty-state';

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

  it('provides a quiet full-surface placeholder without a bounded container', () => {
    render(<WorkspacePlaceholder className="h-full" title="No challenge selected" />);

    const title = screen.getByRole('heading', { name: 'No challenge selected' });
    expect(title).toHaveClass('text-text-muted');
    expect(title.parentElement).toHaveClass(
      'flex',
      'h-full',
      'items-center',
      'justify-center',
      'text-center'
    );
    expect(title.parentElement).not.toHaveClass('rounded-lg', 'border');
  });
});
