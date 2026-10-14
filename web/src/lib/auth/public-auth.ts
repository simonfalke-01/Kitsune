export type SubmissionState =
  | { message: null; status: 'idle' | 'submitting' }
  | { message: string; status: 'failed' | 'succeeded' };

export type SubmissionAction =
  { type: 'reset' | 'submit' } | { message: string; type: 'fail' | 'succeed' };

export const initialSubmissionState: SubmissionState = {
  message: null,
  status: 'idle'
};

export function submissionReducer(
  _state: SubmissionState,
  action: SubmissionAction
): SubmissionState {
  switch (action.type) {
    case 'reset':
      return initialSubmissionState;
    case 'submit':
      return { message: null, status: 'submitting' };
    case 'fail':
      return { message: action.message, status: 'failed' };
    case 'succeed':
      return { message: action.message, status: 'succeeded' };
  }
}

export function safeReturnPath(value: string | string[] | null | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (
    !candidate ||
    candidate.length > 2048 ||
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\')
  ) {
    return '/challenges';
  }

  try {
    const parsed = new URL(candidate, 'https://kitsune.invalid');

    if (
      parsed.origin !== 'https://kitsune.invalid' ||
      decodeURIComponent(parsed.pathname).startsWith('//')
    ) {
      return '/challenges';
    }
  } catch {
    return '/challenges';
  }

  return candidate;
}

export function externalAuthStartHref(
  startPath: string,
  returnTo: string | string[] | null | undefined
): string | null {
  if (!startPath.startsWith('/') || startPath.startsWith('//') || startPath.includes('\\')) {
    return null;
  }

  try {
    const parsed = new URL(startPath, 'https://kitsune.invalid');

    if (
      parsed.origin !== 'https://kitsune.invalid' ||
      !/^\/api\/v1\/auth\/(?:oidc|saml)\/[^/?#]+\/[^/?#]+\/start$/u.test(parsed.pathname)
    ) {
      return null;
    }

    parsed.searchParams.set('return_to', safeReturnPath(returnTo));
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}
