import { cx, variantClass } from './styles';

const avatarSizes = {
  medium: 'size-12 text-sm',
  small: 'size-8 text-xs'
} as const;

const avatarTones = {
  blue: 'border-category-blue-border bg-category-blue-subtle text-category-blue',
  cyan: 'border-category-cyan-border bg-category-cyan-subtle text-category-cyan',
  lime: 'border-category-lime-border bg-category-lime-subtle text-category-lime',
  orange: 'border-category-orange-border bg-category-orange-subtle text-category-orange',
  pink: 'border-category-pink-border bg-category-pink-subtle text-category-pink',
  teal: 'border-category-teal-border bg-category-teal-subtle text-category-teal',
  violet: 'border-category-violet-border bg-category-violet-subtle text-category-violet'
} as const;

export type AvatarTone = keyof typeof avatarTones;

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return '?';
  }

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toLocaleUpperCase() ?? '')
    .join('');
}

export interface AvatarProps {
  className?: string;
  name: string;
  size?: keyof typeof avatarSizes;
  tone?: AvatarTone;
}

export function Avatar({ className, name, size = 'medium', tone = 'blue' }: AvatarProps) {
  const classes = cx(
    'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border',
    'font-semibold tracking-tight',
    variantClass(avatarSizes, size),
    variantClass(avatarTones, tone),
    className
  );

  return (
    <span aria-hidden className={classes}>
      <span className="kitsune-optical-center">{initials(name)}</span>
    </span>
  );
}
