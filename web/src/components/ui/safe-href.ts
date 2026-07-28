export function safeHref(
  value: string,
  allowedProtocols: readonly string[] = ['http:', 'https:', 'mailto:']
): string | null {
  const href = value.trim();

  if (
    !href ||
    [...href].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    })
  ) {
    return null;
  }

  if (
    href.startsWith('/') ||
    href.startsWith('./') ||
    href.startsWith('../') ||
    href.startsWith('#')
  ) {
    return href;
  }

  try {
    const url = new URL(href);
    return allowedProtocols.includes(url.protocol) ? href : null;
  } catch {
    return null;
  }
}
