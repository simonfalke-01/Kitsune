import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AuthoredContent, parseAuthoredContent } from './authored-content';

describe('AuthoredContent', () => {
  it('renders the supported challenge Markdown structure', () => {
    render(
      <AuthoredContent
        content={`# Objective

Recover **the flag** from [the service](https://example.com).

- Inspect the cache
- Submit \`kit{flag}\`

| Port | Protocol |
| --- | --- |
| 443 | HTTPS |

\`\`\`sh
curl https://example.com
\`\`\``}
      />
    );

    expect(screen.getByRole('heading', { name: 'Objective' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'the service' })).toHaveAttribute(
      'href',
      'https://example.com'
    );
    expect(screen.getByRole('list')).toBeVisible();
    expect(screen.getByRole('table')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Scrollable authored table' })).toHaveAttribute(
      'tabindex',
      '0'
    );
    expect(screen.getByText('curl https://example.com')).toBeVisible();
    expect(screen.getByLabelText('sh code')).toHaveAttribute('tabindex', '0');
  });

  it('renders unsafe links as text without exposing a navigation target', () => {
    render(<AuthoredContent content="Read [this](javascript:unsafe) first." />);

    expect(screen.queryByRole('link', { name: 'this' })).not.toBeInTheDocument();
    expect(screen.getByText(/Read this first/)).toBeVisible();
  });

  it('keeps unclosed code fences as safe authored code', () => {
    expect(parseAuthoredContent('```text\nflag <script>')).toEqual([
      {
        language: 'text',
        text: 'flag <script>',
        type: 'code'
      }
    ]);
  });
});
