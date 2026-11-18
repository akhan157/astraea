// @vitest-environment jsdom
/**
 * P3: the 3D view's right-click menu on a part. It uses the store's own
 * structural actions (one undo step each; the store itself announces a
 * removal with Undo), disables what would be refused, and shows a refusal
 * that still happens instead of dropping it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef, useState } from 'react';
import { PartContextMenu } from './Viewport';
import { useProjectStore } from '../../state/project';

function Harness({ partId, onPick }: { partId: string; onPick: (id: string) => void }) {
  const trigger = createRef<HTMLSpanElement>();
  const [notice, setNotice] = useState<string | null>(null);
  const vehicle = useProjectStore((s) => s.project.vehicle);
  return (
    <div>
      <PartContextMenu trigger={trigger} partId={partId} vehicle={vehicle} onPick={onPick} onNotice={setNotice} />
      <button type="button" onClick={() => trigger.current?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 }))}>open</button>
      {notice && <p data-testid="notice">{notice}</p>}
    </div>
  );
}

const ids = () => useProjectStore.getState().project.vehicle.components.map((c) => c.id);

beforeEach(() => {
  useProjectStore.getState().loadPreset('nasaStudent');
  if (typeof Element.prototype.scrollIntoView !== 'function') Element.prototype.scrollIntoView = () => undefined;
});
afterEach(cleanup);

describe('3D part context menu', () => {
  it('offers Select, Move forward / aft and Remove for the part under the pointer', async () => {
    const onPick = vi.fn();
    render(<Harness partId="nsl-bt1" onPick={onPick} />);
    await act(async () => { fireEvent.click(screen.getByText('open')); });
    expect(screen.getByRole('menu', { name: 'Payload & Avionics Bay actions' })).toBeTruthy();
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Select', 'Move forward (toward the nose)', 'Move aft (toward the tail)', 'Remove']);
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'Select' })); });
    expect(onPick).toHaveBeenCalledWith('nsl-bt1');
  });

  it('moves a part one step as one undoable edit', async () => {
    render(<Harness partId="nsl-bt1" onPick={() => undefined} />);
    const before = ids();
    await act(async () => { fireEvent.click(screen.getByText('open')); });
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'Move forward (toward the nose)' })); });
    expect(ids().slice(0, 2)).toEqual(['nsl-bt1', 'nsl-nc']);
    expect(screen.queryByTestId('notice')).toBeNull();
    act(() => useProjectStore.getState().undo());
    expect(ids()).toEqual(before);
  });

  it('removes a part as one undoable edit, without a second announcement of its own', async () => {
    render(<Harness partId="nsl-fins" onPick={() => undefined} />);
    const before = ids();
    await act(async () => { fireEvent.click(screen.getByText('open')); });
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' })); });
    expect(ids()).not.toContain('nsl-fins');
    // The store's toast announces it (with Undo); the menu adds nothing.
    expect(screen.queryByTestId('notice')).toBeNull();
    act(() => useProjectStore.getState().undo());
    expect(ids()).toEqual(before);
  });

  it('disables the actions for a part that disappears while the menu is open', async () => {
    render(<Harness partId="nsl-bt1" onPick={() => undefined} />);
    await act(async () => { fireEvent.click(screen.getByText('open')); });
    // The part list changes under the open menu: the part is gone.
    act(() => { useProjectStore.getState().loadPreset('estesAlpha'); });
    const item = screen.queryByRole('menuitem', { name: 'Select' });
    expect(item).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Remove' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('disables a move the part list would refuse', async () => {
    render(<Harness partId="nsl-nc" onPick={() => undefined} />);
    await act(async () => { fireEvent.click(screen.getByText('open')); });
    expect(screen.getByRole('menuitem', { name: 'Move forward (toward the nose)' }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('menuitem', { name: 'Move aft (toward the tail)' }).getAttribute('aria-disabled')).toBeNull();
  });
});
