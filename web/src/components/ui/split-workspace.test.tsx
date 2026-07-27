import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { SplitWorkspace } from './split-workspace';

function ControlledSplitWorkspace() {
  const [value, setValue] = useState(40);

  return (
    <SplitWorkspace
      ariaLabel="Challenge list width"
      left={<div>Challenge list</div>}
      onValueChange={setValue}
      right={<div>Challenge detail</div>}
      value={value}
    />
  );
}

describe('SplitWorkspace', () => {
  it('supports keyboard resizing through React Aria slider semantics', () => {
    render(<ControlledSplitWorkspace />);

    const slider = screen.getByRole('slider', {
      name: 'Challenge list width'
    });
    expect(slider).toHaveValue('40');

    fireEvent.keyDown(slider, {
      key: 'ArrowRight'
    });

    expect(slider).toHaveValue('41');
    expect(screen.getByText('Challenge list')).toBeVisible();
    expect(screen.getByText('Challenge detail')).toBeVisible();
  });

  it('owns resize state when no external value is supplied', () => {
    render(
      <SplitWorkspace
        ariaLabel="Panel width"
        defaultValue={38}
        left={<div>List</div>}
        right={<div>Detail</div>}
      />
    );

    const slider = screen.getByRole('slider', { name: 'Panel width' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });

    expect(slider).toHaveValue('39');
  });

  it('updates pane width continuously during a pointer drag', () => {
    render(
      <SplitWorkspace
        ariaLabel="Pointer-resizable panel"
        defaultValue={40}
        left={<div>List</div>}
        right={<div>Detail</div>}
      />
    );

    const slider = screen.getByRole('slider', { name: 'Pointer-resizable panel' });
    const thumb = slider.closest('.kitsune-split-thumb')!;
    const track = thumb.parentElement!;
    const workspace = track.closest('.kitsune-split-workspace')!;

    expect(track).toHaveClass('kitsune-split-track', 'absolute', 'inset-y-0');
    expect(workspace).toHaveStyle({
      '--split-workspace-left': '40%',
      '--split-workspace-maximum-inset': '48%',
      '--split-workspace-minimum': '32%'
    });

    Object.defineProperty(track, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 600,
        height: 600,
        left: 320,
        right: 520,
        toJSON: () => undefined,
        top: 0,
        width: 200,
        x: 320,
        y: 0
      })
    });
    Object.defineProperty(thumb, 'setPointerCapture', {
      configurable: true,
      value: () => undefined
    });
    Object.defineProperty(thumb, 'releasePointerCapture', {
      configurable: true,
      value: () => undefined
    });

    fireEvent.pointerDown(thumb, {
      button: 0,
      buttons: 1,
      clientX: 400,
      clientY: 300,
      pointerId: 1,
      pointerType: 'mouse'
    });
    fireEvent.pointerMove(document, {
      buttons: 1,
      clientX: 440,
      clientY: 300,
      pointerId: 1,
      pointerType: 'mouse'
    });

    expect(slider).toHaveValue('44');
    expect(workspace).toHaveStyle({ '--split-workspace-left': '44%' });

    fireEvent.pointerUp(document, {
      button: 0,
      buttons: 0,
      clientX: 440,
      clientY: 300,
      pointerId: 1,
      pointerType: 'mouse'
    });
  });
});
