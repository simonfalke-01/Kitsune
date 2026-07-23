export function humanizeAuditAction(action: string): string {
  return action
    .split(/[._-]/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function shortIdentifier(value: string | null | undefined): string {
  if (!value) {
    return 'System';
  }
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

export function metadataEntries(metadata: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(metadata)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]);
}
