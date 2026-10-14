import { beforeEach, describe, expect, it, vi } from 'vitest';

import HomePage from './page';

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  redirect: redirectMock
}));

beforeEach(() => {
  redirectMock.mockReset();
});

describe('HomePage', () => {
  it('redirects directly to the overview', () => {
    HomePage();

    expect(redirectMock).toHaveBeenCalledOnce();
    expect(redirectMock).toHaveBeenCalledWith('/overview');
  });
});
