import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PresenceSummary } from './presence-summary';

describe('PresenceSummary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it.each(['en-GB', 'de-DE', 'tr-TR'])(
    'hydrates without replacing presence text when the browser locale is %s',
    (browserLocale) => {
      const NativeListFormat = Intl.ListFormat;
      let defaultLocale = 'en-US';
      vi.spyOn(Intl, 'ListFormat').mockImplementation(function (
        locales?: Intl.LocalesArgument,
        options?: Intl.ListFormatOptions
      ) {
        return new NativeListFormat(locales ?? defaultLocale, options);
      });

      const summary = (
        <PresenceSummary
          people={[
            { id: 'theo', name: 'Theo Bell' },
            { id: 'sora', name: 'Sora Chen' }
          ]}
        />
      );
      const container = document.createElement('div');
      container.innerHTML = renderToString(summary);
      const serverElement = container.firstElementChild;
      const onRecoverableError = vi.fn();

      defaultLocale = browserLocale;
      render(summary, { container, hydrate: true, onRecoverableError });

      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(container.firstElementChild).toBe(serverElement);
      expect(container.firstElementChild).toHaveAttribute(
        'aria-label',
        'Theo Bell & Sora Chen are viewing this challenge'
      );
      expect(container).toHaveTextContent('Theo Bell & Sora Chen viewing');
    }
  );
});
