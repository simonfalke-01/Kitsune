import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './button';
import { EscapeFocusManager } from './escape-focus-manager';
import { TextField } from './text-field';

describe('EscapeFocusManager', () => {
  it('releases text and pressable focus with an unmodified Escape', () => {
    render(
      <>
        <EscapeFocusManager />
        <TextField label="Flag" />
        <Button>Submit flag</Button>
      </>
    );

    const flag = screen.getByLabelText('Flag');
    const submit = screen.getByRole('button', { name: 'Submit flag' });

    flag.focus();
    expect(flag).toHaveFocus();
    fireEvent.keyDown(flag, { key: 'Escape' });
    expect(flag).not.toHaveFocus();

    submit.focus();
    expect(submit).toHaveFocus();
    fireEvent.keyDown(submit, { key: 'Escape' });
    expect(submit).not.toHaveFocus();
  });

  it('leaves the first Escape press to an open overlay', () => {
    render(
      <>
        <EscapeFocusManager />
        <div aria-label="Keyboard shortcuts" role="dialog">
          <TextField label="Shortcut filter" />
        </div>
      </>
    );

    const filter = screen.getByLabelText('Shortcut filter');

    filter.focus();
    fireEvent.keyDown(filter, { key: 'Escape' });

    expect(filter).toHaveFocus();
  });

  it('does not release focus for modified or composing key presses', () => {
    render(
      <>
        <EscapeFocusManager />
        <TextField label="Flag" />
      </>
    );

    const flag = screen.getByLabelText('Flag');

    flag.focus();
    fireEvent.keyDown(flag, { key: 'Escape', metaKey: true });
    expect(flag).toHaveFocus();

    fireEvent.keyDown(flag, { isComposing: true, key: 'Escape' });
    expect(flag).toHaveFocus();
  });
});
