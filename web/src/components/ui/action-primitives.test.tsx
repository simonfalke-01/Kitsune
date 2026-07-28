import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Bell } from 'lucide-react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CopyButton } from './copy-button';
import { DownloadLink } from './download-link';
import { IconButton } from './icon-button';
import { KeyboardKey } from './keyboard-key';
import { SkipLink } from './skip-link';

const writeText = vi.fn().mockResolvedValue(undefined);

describe('action primitives', () => {
  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText
      }
    });
  });

  it('gives icon-only actions one consistent accessible target', () => {
    render(
      <IconButton label="Notification settings">
        <Bell aria-hidden className="size-4" />
      </IconButton>
    );

    expect(screen.getByRole('button', { name: 'Notification settings' })).toHaveClass(
      'size-control',
      'cursor-pointer',
      'focus-visible:outline-solid'
    );
  });

  it('owns clipboard state while keeping visible copy text concise', async () => {
    render(
      <CopyButton copiedLabel="Connection copied" label="Copy Connection" value="nc host 1337" />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy Connection' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('nc host 1337');
    });
    const copied = screen.getByRole('button', { name: 'Connection copied' });
    expect(copied).toHaveTextContent('Copied');
    expect(copied.querySelector('svg')).toBeNull();
  });

  it('disables unsafe download targets', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { rerender } = render(
      <DownloadLink aria-label="Download capture" href="/files/capture.txt">
        Download
      </DownloadLink>
    );

    expect(screen.getByRole('link', { name: 'Download capture' })).toHaveAttribute('download', '');

    rerender(
      <DownloadLink aria-label="Download capture" href="javascript:unsafe">
        Download
      </DownloadLink>
    );

    const unavailableDownload = screen.getByRole('link', { name: 'Download capture' });
    expect(unavailableDownload).toHaveAttribute('aria-disabled', 'true');
    expect(unavailableDownload).not.toHaveAttribute('href');
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('renders shortcut keys through the shared key treatment', () => {
    render(<KeyboardKey>J</KeyboardKey>);

    expect(screen.getByText('J').tagName).toBe('KBD');
    expect(screen.getByText('J')).toHaveClass('font-mono', 'tabular-nums');
  });

  it('keeps focus bypasses out of the visual flow until keyboard focus', () => {
    render(<SkipLink href="#target">Skip collection</SkipLink>);

    expect(screen.getByRole('link', { name: 'Skip collection' })).toHaveClass(
      'absolute',
      '-translate-y-16',
      'focus-visible:translate-y-0'
    );
  });
});
