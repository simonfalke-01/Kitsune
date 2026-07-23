export type VariantDefinition<Variant extends string> = Readonly<Record<Variant, string>>;

type ClassValue = string | false | null | undefined;

export function cx(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}

export function variantClass<Variant extends string>(
  variants: VariantDefinition<Variant>,
  selected: Variant
): string {
  return variants[selected];
}

export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring';

export const fieldGroup =
  'flex content-start flex-col gap-2 text-sm text-text disabled:text-text-subtle';

export const fieldLabel = 'font-medium text-text';

export const fieldDescription = 'text-sm text-text-muted';

export const fieldError = 'text-sm font-medium text-danger-text';

export const fieldControl = cx(
  'min-h-control w-full rounded-md border border-border-subtle bg-surface-raised px-3 py-2',
  'text-base text-text outline-none',
  'transition-colors duration-fast ease-out-quart',
  'hover:border-border',
  'focus-visible:border-accent-border focus-visible:outline-2',
  'focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
  'invalid:border-danger-border invalid:outline-danger',
  'disabled:cursor-not-allowed disabled:bg-surface-sunken',
  'disabled:text-text-subtle'
);

export const overlaySurface = cx(
  'rounded-lg border border-border-subtle bg-surface-raised p-1 shadow-lg',
  'entering:translate-y-1 entering:opacity-0',
  'exiting:translate-y-1 exiting:opacity-0',
  'transition duration-normal ease-out-quart'
);

export const collectionItem = cx(
  'flex cursor-default items-center gap-2 rounded-md px-3 py-2',
  'text-sm text-text outline-none',
  'transition-colors duration-fast ease-out-quart',
  'hover:bg-surface-hover focused:bg-surface-hover',
  'selected:bg-accent-subtle selected:text-accent-text',
  'focus-visible:outline-2 focus-visible:outline-offset-2',
  'focus-visible:outline-focus-ring',
  'disabled:text-text-subtle'
);
