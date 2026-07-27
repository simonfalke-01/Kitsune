import {
  Blocks,
  Bomb,
  CircleCheck,
  Cpu,
  Crown,
  Dices,
  Fingerprint,
  Globe2,
  KeyRound,
  Puzzle,
  Search,
  Shapes,
  Swords,
  type LucideIcon
} from 'lucide-react';

import { cx } from '@/components/ui/styles';
import {
  challengeCategoryLabel,
  challengeCategoryTone,
  type ChallengeCategoryTone
} from '@/lib/challenges';

export const categoryTextClasses: Record<ChallengeCategoryTone, string> = {
  amber: 'text-category-amber',
  blue: 'text-category-blue',
  cyan: 'text-category-cyan',
  lime: 'text-category-lime',
  orange: 'text-category-orange',
  pink: 'text-category-pink',
  teal: 'text-category-teal',
  violet: 'text-category-violet'
};

interface ChallengeCategoryDefinition {
  icon: LucideIcon;
  label: string;
  tone: ChallengeCategoryTone;
}

const categoryIcons: Readonly<Record<string, LucideIcon>> = {
  'attack-defense': Swords,
  blockchain: Blocks,
  crypto: KeyRound,
  forensics: Fingerprint,
  hardware: Cpu,
  'king of the hill': Crown,
  miscellaneous: Dices,
  osint: Search,
  pwn: Bomb,
  'reverse engineering': Puzzle,
  web: Globe2,
  welcome: CircleCheck
};

export function challengeCategoryDefinition(category: string): ChallengeCategoryDefinition {
  const label = challengeCategoryLabel(category);

  return {
    icon: categoryIcons[label.toLocaleLowerCase()] ?? Shapes,
    label,
    tone: challengeCategoryTone(label)
  };
}

interface ChallengeCategoryLabelProps {
  category: string;
  className?: string;
  showIcon?: boolean;
}

export function ChallengeCategoryLabel({
  category,
  className,
  showIcon = true
}: ChallengeCategoryLabelProps) {
  const definition = challengeCategoryDefinition(category);
  const Icon = definition.icon;

  return (
    <span
      className={cx(
        'inline-flex min-w-0 items-center gap-2',
        categoryTextClasses[definition.tone],
        className
      )}
    >
      {showIcon ? <Icon aria-hidden className="size-4 shrink-0" /> : null}
      <span className="truncate">{definition.label}</span>
    </span>
  );
}
