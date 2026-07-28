import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PresenceSummary } from './presence-summary';

describe('PresenceSummary', () => {
  it('names every teammate without relying on avatar color', () => {
    const { container } = render(
      <PresenceSummary
        people={[
          { id: 'mina', name: 'Mina Park' },
          { id: 'theo', name: 'Theo Bell' }
        ]}
      />
    );

    expect(screen.getByLabelText('Mina Park & Theo Bell are viewing this challenge')).toBeVisible();
    expect(screen.getByText('Mina Park & Theo Bell viewing')).toBeVisible();

    const stack = container.querySelector('span[aria-hidden="true"]');
    expect(stack).toHaveClass('isolate', '-space-x-1');

    const avatars = stack?.querySelectorAll(':scope > span') ?? [];
    expect(avatars).toHaveLength(2);
    expect(avatars[0]).toHaveClass('size-4', 'rounded-full');
    expect(avatars[1]).toHaveClass('size-4', 'rounded-full');
    expect(avatars[0]?.firstElementChild).toHaveClass('tracking-normal');
    expect(avatars[0]?.firstElementChild).not.toHaveClass('-translate-y-optical');
  });

  it('renders nothing when nobody else is present', () => {
    const { container } = render(<PresenceSummary people={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
