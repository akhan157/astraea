// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from 'radix-ui';
import { isOverflowing, OverflowFold } from './Caveat';
import { GateRow } from './Status';
import type { Gate, GateStatus } from '../data/contract';

const REASON = 'Below the generic geometry screening band; selected-motor and powered-flight margins are not assessed.';

/**
 * jsdom lays nothing out (scrollWidth/clientWidth are 0). This stubs both on
 * fold text nodes only, so the overflow decision can be exercised both ways.
 */
function stubFoldMetrics(scrollWidth: number, clientWidth: number): () => void {
  const proto = HTMLElement.prototype;
  const originalScroll = Object.getOwnPropertyDescriptor(proto, 'scrollWidth');
  const originalClient = Object.getOwnPropertyDescriptor(proto, 'clientWidth');
  Object.defineProperty(proto, 'scrollWidth', {
    configurable: true,
    get(this: HTMLElement) { return this.dataset.foldText === undefined ? 0 : scrollWidth; },
  });
  Object.defineProperty(proto, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) { return this.dataset.foldText === undefined ? 0 : clientWidth; },
  });
  return () => {
    if (originalScroll === undefined) Reflect.deleteProperty(proto, 'scrollWidth');
    else Object.defineProperty(proto, 'scrollWidth', originalScroll);
    if (originalClient === undefined) Reflect.deleteProperty(proto, 'clientWidth');
    else Object.defineProperty(proto, 'clientWidth', originalClient);
  };
}

function gate(status: GateStatus): Gate {
  return {
    id: 'static_margin',
    label: 'Geometry static margin',
    stage: 'aero',
    status,
    value: { value: 3.235, unit: 'cal', confidence: 'modeled', reason: 'Geometry-only Barrowman CP against component-rollup CG.' },
    threshold: '1-3 cal',
    reason: REASON,
  };
}

afterEach(() => cleanup());

describe('isOverflowing', () => {
  it('treats a one-pixel rounding difference as fitting', () => {
    expect(isOverflowing(null)).toBe(false);
    expect(isOverflowing({ scrollWidth: 100, clientWidth: 100 })).toBe(false);
    expect(isOverflowing({ scrollWidth: 101, clientWidth: 100 })).toBe(false);
    expect(isOverflowing({ scrollWidth: 102, clientWidth: 100 })).toBe(true);
  });
});

describe('OverflowFold', () => {
  it('always folds when asked, toggles with More/Less and keeps the full text in the DOM', () => {
    render(<OverflowFold always text="Full sentence one." />);
    const more = screen.getByRole('button', { name: 'More' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('Full sentence one.')).toBeTruthy();
    fireEvent.click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(more.textContent).toBe('Less');
    expect(screen.getByText('Full sentence one.')).toBeTruthy();
    fireEvent.click(more);
    expect(more.getAttribute('aria-expanded')).toBe('false');
  });

  it('offers More when the collapsed line overflows and wraps it on open', () => {
    const restore = stubFoldMetrics(500, 100);
    try {
      render(<OverflowFold text={REASON} />);
      const more = screen.getByRole('button', { name: 'More' });
      const text = document.querySelector('[data-fold-text]') as HTMLElement;
      expect(text.textContent).toBe(REASON);
      expect(text.className).toContain('truncate');
      fireEvent.click(more);
      expect(text.className).not.toContain('truncate');
      expect(text.textContent).toBe(REASON);
    } finally {
      cleanup();
      restore();
    }
  });

  it('offers no More when the line fits', () => {
    const restore = stubFoldMetrics(100, 100);
    try {
      render(<OverflowFold text={REASON} />);
      expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
    } finally {
      cleanup();
      restore();
    }
  });
});

describe('GateRow reason folding', () => {
  it('never folds a failing gate', () => {
    const restore = stubFoldMetrics(500, 100);
    try {
      render(<Tooltip.Provider><GateRow g={gate('fail')} /></Tooltip.Provider>);
      expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
      const reason = document.querySelector('[data-gate-reason]') as HTMLElement;
      expect(reason.textContent).toBe(REASON);
      expect(reason.className).toContain('break-words');
      expect(reason.className).not.toContain('truncate');
      expect(reason.closest('[data-fold]')).toBeNull();
    } finally {
      cleanup();
      restore();
    }
  });

  it('never folds a gate whose status is unknown: an unassessed check needs its reason', () => {
    const restore = stubFoldMetrics(500, 100);
    try {
      render(<Tooltip.Provider><GateRow g={gate('unknown')} /></Tooltip.Provider>);
      expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
      const reason = document.querySelector('[data-gate-reason]') as HTMLElement;
      expect(reason.textContent).toBe(REASON);
      expect(reason.closest('[data-fold]')).toBeNull();
    } finally {
      cleanup();
      restore();
    }
  });

  it('folds a passing gate reason that overflows and expands it with More', () => {
    const restore = stubFoldMetrics(500, 100);
    try {
      render(<Tooltip.Provider><GateRow g={gate('pass')} /></Tooltip.Provider>);
      const more = screen.getByRole('button', { name: 'More' });
      const reason = document.querySelector('[data-gate-reason]') as HTMLElement;
      expect(reason.textContent).toBe(REASON);
      expect(reason.className).toContain('truncate');
      fireEvent.click(more);
      expect(more.getAttribute('aria-expanded')).toBe('true');
      expect(reason.className).not.toContain('truncate');
      expect(reason.textContent).toBe(REASON);
    } finally {
      cleanup();
      restore();
    }
  });

  it('expands with Enter or Space without selecting the gate, while a row click still selects it', async () => {
    const restore = stubFoldMetrics(500, 100);
    try {
      const user = userEvent.setup();
      const onOpen = vi.fn();
      render(<Tooltip.Provider><GateRow g={gate('pass')} onOpen={onOpen} /></Tooltip.Provider>);
      const more = screen.getByRole('button', { name: 'More' });
      more.focus();
      await user.keyboard('{Enter}');
      expect(more.getAttribute('aria-expanded')).toBe('true');
      expect(onOpen).not.toHaveBeenCalled();
      await user.keyboard(' ');
      expect(more.getAttribute('aria-expanded')).toBe('false');
      expect(onOpen).not.toHaveBeenCalled();
      fireEvent.click(screen.getByText('Geometry static margin'));
      expect(onOpen).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
      restore();
    }
  });
});
