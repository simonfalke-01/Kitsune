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
    const workspace = slider.closest('.kitsune-split-workspace')!;
    const handle = workspace.querySelector<HTMLElement>('.kitsune-split-handle')!;

    expect(handle).toHaveClass('kitsune-split-handle', 'absolute', 'inset-y-0');
    expect(workspace).toHaveStyle({
      '--split-workspace-left': '40%'
    });

    Object.defineProperty(workspace, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 600,
        height: 600,
        left: 0,
        right: 1000,
        toJSON: () => undefined,
        top: 0,
        width: 1000,
        x: 0,
        y: 0
      })
    });
    Object.defineProperty(handle, 'setPointerCapture', {
      configurable: true,
      value: () => undefined
    });
    Object.defineProperty(handle, 'hasPointerCapture', {
      configurable: true,
      value: () => true
    });
    Object.defineProperty(handle, 'releasePointerCapture', {
      configurable: true,
      value: () => undefined
    });

    fireEvent.pointerDown(handle, {
      button: 0,
      buttons: 1,
      clientX: 400,
      clientY: 300,
      pointerId: 1,
      pointerType: 'mouse'
    });
    fireEvent.pointerMove(handle, {
      buttons: 1,
      clientX: 437.5,
      clientY: 300,
      pointerId: 1,
      pointerType: 'mouse'
    });

    expect(slider).toHaveValue('44');
    expect(workspace).toHaveStyle({ '--split-workspace-left': '43.75%' });

    fireEvent.pointerMove(handle, {
      buttons: 1,
      clientX: -200,
      clientY: 300,
      pointerId: 1,
      pointerType: 'mouse'
    });
    expect(workspace).toHaveStyle({ '--split-workspace-left': '32%' });

    fireEvent.pointerMove(handle, {
      buttons: 1,
      clientX: 1200,
      clientY: 300,
      pointerId: 1,
      pointerType: 'mouse'
    });
    expect(workspace).toHaveStyle({ '--split-workspace-left': '52%' });

    fireEvent.pointerUp(handle, {
      button: 0,
      buttons: 0,
      clientX: 1200,
      clientY: 300,
      pointerId: 1,
      pointerType: 'mouse'
    });

    expect(handle).not.toHaveAttribute('data-dragging');
  });
});
