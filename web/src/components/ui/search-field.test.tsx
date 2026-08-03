import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SearchField } from './search-field';

describe('SearchField', () => {
  it('owns one clear action and suppresses the native search decoration', () => {
    render(<SearchField defaultValue="cache" label="Find a challenge" />);

    const input = screen.getByRole('searchbox', { name: 'Find a challenge' });
    expect(input).toHaveClass('kitsune-search-input', 'py-2');
    expect(input).not.toHaveClass('kitsune-optical-py-2');
    expect(screen.getAllByRole('button', { name: 'Clear search' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(input).toHaveValue('');
  });
});
