import { Avatar } from './avatar';
import { cx } from './styles';

export interface PresenceIdentity {
  id: string;
  name: string;
}

export interface PresenceSummaryProps {
  className?: string;
  people: readonly PresenceIdentity[];
}

export function PresenceSummary({ className, people }: PresenceSummaryProps) {
  if (people.length === 0) {
    return null;
  }

  const names = people.map((person) => person.name);
  const visibleNames = new Intl.ListFormat(undefined, {
    style: 'short',
    type: 'conjunction'
  }).format(names);

  return (
    <span
      aria-label={`${visibleNames} ${people.length === 1 ? 'is' : 'are'} viewing this challenge`}
      className={cx('inline-flex min-w-0 items-center gap-1 text-sm text-text-muted', className)}
    >
      <span aria-hidden className="isolate flex shrink-0 -space-x-1">
        {people.slice(0, 3).map((person) => (
          <Avatar isDecorative key={person.id} name={person.name} size="micro" />
        ))}
      </span>
      <span aria-hidden className="truncate">
        {visibleNames} viewing
      </span>
    </span>
  );
}
