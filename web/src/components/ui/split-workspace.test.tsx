import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { SplitWorkspace } from './split-workspace';

beforeEach(() => {
  window.localStorage.clear();
});

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
        persistenceKey="keyboard-panel"
        right={<div>Detail</div>}
      />
    );

    const slider = screen.getByRole('slider', { name: 'Panel width' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.keyUp(slider, { key: 'ArrowRight' });

    expect(slider).toHaveValue('39');
    expect(window.localStorage.getItem('kitsune.split-workspace.v1.keyboard-panel')).toBe('39');
  });

  it('updates pane width continuously during a pointer drag', () => {
    render(
      <SplitWorkspace
        ariaLabel="Pointer-resizable panel"
        defaultValue={40}
        left={<div>List</div>}
        persistenceKey="pointer-panel"
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
    expect(window.localStorage.getItem('kitsune.split-workspace.v1.pointer-panel')).toBeNull();

    fireEvent.pointerUp(handle, {
      button: 0,
      buttons: 0,
      clientX: 437.5,
      clientY: 300,
      pointerId: 1,
      pointerType: 'mouse'
    });
    expect(window.localStorage.getItem('kitsune.split-workspace.v1.pointer-panel')).toBe('43.75');

    fireEvent.pointerDown(handle, {
      button: 0,
      buttons: 1,
      clientX: 437.5,
      clientY: 300,
      pointerId: 2,
      pointerType: 'mouse'
    });

    fireEvent.pointerMove(handle, {
      buttons: 1,
      clientX: -200,
      clientY: 300,
      pointerId: 2,
      pointerType: 'mouse'
    });
    expect(workspace).toHaveStyle({ '--split-workspace-left': '32%' });

    fireEvent.pointerMove(handle, {
      buttons: 1,
      clientX: 1200,
      clientY: 300,
      pointerId: 2,
      pointerType: 'mouse'
    });
    expect(workspace).toHaveStyle({ '--split-workspace-left': '52%' });

    fireEvent.pointerUp(handle, {
      button: 0,
      buttons: 0,
      clientX: 1200,
      clientY: 300,
      pointerId: 2,
      pointerType: 'mouse'
    });

    expect(handle).not.toHaveAttribute('data-dragging');
    expect(window.localStorage.getItem('kitsune.split-workspace.v1.pointer-panel')).toBe('52');
  });

  it('restores a persisted split across reloads and clamps it to the current range', () => {
    window.localStorage.setItem('kitsune.split-workspace.v1.challenge-list', '22.5');

    const { unmount } = render(
      <SplitWorkspace
        ariaLabel="Persistent panel"
        defaultValue={34}
        left={<div>List</div>}
        maximum={48}
        minimum={24}
        persistenceKey="challenge-list"
        right={<div>Detail</div>}
      />
    );

    const workspace = screen
      .getByRole('slider', { name: 'Persistent panel' })
      .closest('.kitsune-split-workspace');
    expect(workspace).toHaveStyle({ '--split-workspace-left': '24%' });

    unmount();
    window.localStorage.setItem('kitsune.split-workspace.v1.challenge-list', '31.375');

    render(
      <SplitWorkspace
        ariaLabel="Persistent panel"
        defaultValue={34}
        left={<div>List</div>}
        maximum={48}
        minimum={24}
        persistenceKey="challenge-list"
        right={<div>Detail</div>}
      />
    );

    expect(
      screen.getByRole('slider', { name: 'Persistent panel' }).closest('.kitsune-split-workspace')
    ).toHaveStyle({ '--split-workspace-left': '31.375%' });
  });
});
