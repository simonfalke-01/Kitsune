import { X } from 'lucide-react';
import type { Key, ReactNode } from 'react';
import {
  Button as ReactAriaButton,
  Label,
  Tag,
  TagGroup as ReactAriaTagGroup,
  TagList,
  Text,
  type TagGroupProps as ReactAriaTagGroupProps
} from 'react-aria-components';

import { cx, focusRing } from './styles';

export interface TagOption {
  id: number | string;
  label: string;
}

export interface TagGroupProps extends Omit<ReactAriaTagGroupProps, 'children' | 'onRemove'> {
  description?: ReactNode;
  label: ReactNode;
  onRemove?: (keys: Set<Key>) => void;
  tags: readonly TagOption[];
}

export function TagGroup({
  className,
  description,
  label,
  onRemove,
  tags,
  ...props
}: TagGroupProps) {
  return (
    <ReactAriaTagGroup
      {...props}
      className={cx('grid gap-2 text-sm', typeof className === 'string' ? className : undefined)}
      onRemove={onRemove}
    >
      <Label className="font-medium text-text">{label}</Label>
      {description ? (
        <Text className="text-sm text-text-muted" slot="description">
          {description}
        </Text>
      ) : null}
      <TagList
        className="flex flex-wrap gap-2 outline-none"
        items={tags}
        renderEmptyState={() => <span className="text-sm text-text-muted">No tags applied</span>}
      >
        {(tag) => (
          <Tag
            className={cx(
              'inline-flex items-center gap-1 rounded-md border border-border-subtle',
              'bg-surface-sunken px-2 py-1 text-sm text-text outline-none',
              'selected:border-accent-border selected:bg-accent-subtle',
              focusRing
            )}
            id={tag.id}
            textValue={tag.label}
          >
            {tag.label}
            {onRemove ? (
              <ReactAriaButton
                aria-label={`Remove ${tag.label}`}
                className={cx(
                  'rounded-sm p-1 text-text-muted outline-none',
                  'hover:bg-surface-hover hover:text-text',
                  focusRing
                )}
                slot="remove"
              >
                <X aria-hidden className="size-3" />
              </ReactAriaButton>
            ) : null}
          </Tag>
        )}
      </TagList>
    </ReactAriaTagGroup>
  );
}
