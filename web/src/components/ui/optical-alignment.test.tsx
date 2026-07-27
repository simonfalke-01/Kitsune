import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Avatar } from './avatar';
import { Badge } from './badge';
import { Button } from './button';
import { NavigationLink } from './navigation-link';
import { Tabs, TabsList, TabsTab } from './tabs';
import { TextArea } from './text-area';
import { TextField } from './text-field';

describe('optical vertical alignment', () => {
  it('uses optically offset padding for centered controls', () => {
    render(
      <>
        <Button>Save changes</Button>
        <TextField label="Team name" />
        <Badge>Ready</Badge>
        <Tabs>
          <TabsList aria-label="Sections">
            <TabsTab id="details">Details</TabsTab>
          </TabsList>
        </Tabs>
      </>
    );

    expect(screen.getByRole('button', { name: 'Save changes' })).toHaveClass(
      'kitsune-optical-py-2'
    );
    expect(screen.getByRole('textbox', { name: 'Team name' })).toHaveClass('kitsune-optical-py-2');
    expect(screen.getByText('Ready')).toHaveClass('kitsune-optical-py-1');
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveClass('kitsune-optical-py-3');
  });

  it('keeps prose controls symmetric and offsets only centered text', () => {
    render(
      <>
        <TextArea label="Writeup" />
        <NavigationLink href="/challenges">Challenges</NavigationLink>
        <Avatar name="Kitsune Labs" />
      </>
    );

    expect(screen.getByRole('textbox', { name: 'Writeup' })).toHaveClass('py-2');
    expect(screen.getByRole('textbox', { name: 'Writeup' })).not.toHaveClass(
      'kitsune-optical-py-2'
    );
    expect(screen.getByText('Challenges')).toHaveClass('kitsune-optical-center');
    expect(screen.getByText('KL')).toHaveClass('kitsune-optical-center');
  });
});
