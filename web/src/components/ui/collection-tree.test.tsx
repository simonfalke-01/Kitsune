import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import type { Selection } from 'react-aria-components';
import { describe, expect, it } from 'vitest';

import { CollectionTree, CollectionTreeItem } from './collection-tree';

function TreeFixture({
  selectionBehavior = 'replace'
}: {
  selectionBehavior?: 'replace' | 'toggle';
}) {
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());

  return (
    <CollectionTree
      aria-label="Challenges"
      disabledBehavior="selection"
      disabledKeys={new Set(['category:web'])}
      expandedKeys={new Set(['category:web'])}
      onSelectionChange={setSelectedKeys}
      selectedKeys={selectedKeys}
      selectionBehavior={selectionBehavior}
      selectionMode="single"
    >
      <CollectionTreeItem appearance="category" content="Web" id="category:web" textValue="Web">
        <CollectionTreeItem
          appearance="challenge"
          content="Cache rules"
          id="challenge:cache"
          textValue="Cache rules"
        />
        <CollectionTreeItem
          appearance="challenge"
          content="Origin story"
          id="challenge:origin"
          textValue="Origin story"
        />
      </CollectionTreeItem>
    </CollectionTree>
  );
}

describe('CollectionTree', () => {
  it('represents the collection as one sequential Tab stop', () => {
    render(<TreeFixture />);

    const tree = screen.getByRole('treegrid', { name: 'Challenges' });
    const rows = within(tree).getAllByRole('row');
    const categoryToggle = within(tree).getByRole('button', { name: 'Collapse Web' });

    expect(tree).toHaveAttribute('tabindex', '0');
    expect(categoryToggle).toHaveAttribute('tabindex', '-1');
    for (const row of rows) {
      expect(row).toHaveAttribute('tabindex', '-1');
    }
  });

  it('uses React Aria selection when Space is pressed', () => {
    render(<TreeFixture selectionBehavior="toggle" />);

    const origin = screen.getByRole('row', { name: 'Origin story' });
    origin.focus();
    fireEvent.keyDown(origin, { key: ' ' });
    fireEvent.keyUp(origin, { key: ' ' });

    expect(origin).toHaveAttribute('aria-selected', 'true');
  });
});
