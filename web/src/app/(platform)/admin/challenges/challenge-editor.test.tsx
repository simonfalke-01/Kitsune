import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChallengeEditor } from './challenge-editor';

interface CreateRequestOptions {
  body: Record<string, unknown>;
  headers: {
    'x-csrf-token': string;
  };
  params: {
    path: {
      event_id: string;
    };
  };
}

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn<(path: string, options: CreateRequestOptions) => Promise<unknown>>(),
  refreshChallenges: vi.fn()
}));

vi.mock('../../../event-context', () => ({
  useEvent: () => ({
    refreshChallenges: mocks.refreshChallenges,
    selectedEvent: {
      id: 'event-a',
      name: 'Finals'
    }
  })
}));

vi.mock('../../../session-context', () => ({
  useSession: () => ({
    session: {
      csrf_token: 'csrf-token'
    }
  })
}));

vi.mock('@/lib/api/client', () => ({
  api: {
    GET: mocks.get,
    POST: mocks.post
  },
  errorMessage: (_error: unknown, fallback: string) => fallback
}));

function renderEditor(overrides: Partial<React.ComponentProps<typeof ChallengeEditor>> = {}) {
  const props: React.ComponentProps<typeof ChallengeEditor> = {
    challenges: [],
    discardRequested: false,
    nextPosition: 3,
    onDiscard: vi.fn(),
    onDone: vi.fn(),
    onDirtyChange: vi.fn(),
    onKeepEditing: vi.fn(),
    onRequestClose: vi.fn(),
    ...overrides
  };

  render(<ChallengeEditor {...props} />);
  return props;
}

describe('ChallengeEditor', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
    mocks.refreshChallenges.mockReset();
    mocks.get.mockResolvedValue({ data: [] });
    mocks.post.mockResolvedValue({
      data: {
        id: 'challenge-new'
      }
    });
    mocks.refreshChallenges.mockResolvedValue(undefined);
  });

  it('exposes every challenge kind and dynamic collection controls', async () => {
    renderEditor();

    fireEvent.click(screen.getByRole('tab', { name: 'Behavior and answers' }));

    for (const kind of [
      'Static flag',
      'Multiple choice',
      'Dynamic instance',
      'File backed',
      'Remote service',
      'Manual verification',
      'Plugin'
    ]) {
      expect(screen.getByRole('radio', { name: new RegExp(kind) })).toBeVisible();
    }

    fireEvent.click(screen.getByRole('radio', { name: /Plugin/ }));
    expect(screen.getByLabelText('Plugin key')).toBeVisible();
    expect(screen.getByLabelText('Plugin challenge kind')).toBeVisible();
    expect(screen.getByLabelText('Plugin configuration')).toBeVisible();

    fireEvent.click(screen.getByRole('tab', { name: 'Hints and survey' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add hint' }));
    expect(screen.getByText('Hint 1 ID')).toBeVisible();
    expect(screen.getByLabelText('Hint content')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Add question' }));
    expect(screen.getByLabelText('Question 1 key')).toBeVisible();
    expect(screen.getByLabelText('Prompt')).toBeVisible();

    await waitFor(() => {
      expect(mocks.get).toHaveBeenCalledWith('/api/v1/events/{event_id}/divisions', {
        params: {
          path: {
            event_id: 'event-a'
          }
        }
      });
    });
  });

  it('submits the generated create request and preserves the selected event', async () => {
    const onDone = vi.fn();
    renderEditor({ onDone });

    fireEvent.change(screen.getByLabelText('Challenge name'), {
      target: { value: 'Header maze' }
    });
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'Web' }
    });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Inspect the proxy chain.' }
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Behavior and answers' }));
    fireEvent.change(screen.getByLabelText('Accepted answer'), {
      target: { value: 'kit{headers}' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));

    await waitFor(() => {
      expect(mocks.post).toHaveBeenCalledTimes(1);
    });

    const [path, request] = mocks.post.mock.calls[0] ?? [];
    expect(path).toBe('/api/v1/events/{event_id}/challenges');
    expect(request?.body).toMatchObject({
      answers: [
        {
          case_insensitive: false,
          kind: 'exact',
          value: 'kit{headers}'
        }
      ],
      category: 'Web',
      description: 'Inspect the proxy chain.',
      kind: {
        type: 'static_flag'
      },
      name: 'Header maze',
      position: 3,
      scoring: {
        kind: 'static',
        points: 100
      }
    });
    expect(request?.headers).toEqual({
      'x-csrf-token': 'csrf-token'
    });
    expect(request?.params.path.event_id).toBe('event-a');
    expect(mocks.refreshChallenges).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('reports validation and requests cancel without silently discarding changes', async () => {
    const onDirtyChange = vi.fn();
    const onRequestClose = vi.fn();
    renderEditor({ onDirtyChange, onRequestClose });

    fireEvent.change(screen.getByLabelText('Challenge name'), {
      target: { value: 'Draft challenge' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    });
    expect(onRequestClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));
    expect(await screen.findByText(/validation issues/)).toBeVisible();
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
