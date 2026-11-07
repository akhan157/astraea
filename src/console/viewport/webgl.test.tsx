/**
 * WebGL loss: the viewport falls back when no context exists and follows the
 * `webglcontextlost` / `webglcontextrestored` events, while the restore action
 * re-probes and remounts.
 *
 * jsdom never provides a WebGL context, so the probe is injected here; the
 * App-level test pins the same fallback over the whole real shell.
 */
// @vitest-environment jsdom
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { useWebGLLoss } from './webgl';

function Harness({ probe, recover }: { probe: (force?: boolean) => boolean; recover?: () => boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { lost, retry, epoch } = useWebGLLoss(ref, probe, recover);
  return (
    <div ref={ref} data-testid="shell" data-lost={lost ? 'yes' : 'no'} data-epoch={epoch}>
      {lost ? 'fallback' : 'canvas'}
      <button type="button" onClick={retry}>
        Restore viewport
      </button>
    </div>
  );
}

const shell = (): HTMLElement => screen.getByTestId('shell');
const available = (): boolean => true;
const unavailable = (): boolean => false;

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('useWebGLLoss', () => {
  it('starts on the fallback when no context exists, and returns to the canvas when one is restored', () => {
    render(<Harness probe={unavailable} />);
    expect(shell().dataset.lost).toBe('yes');
    expect(shell().textContent).toContain('fallback');

    fireEvent(shell(), new Event('webglcontextrestored'));

    expect(shell().dataset.lost).toBe('no');
    expect(shell().textContent).toContain('canvas');
    expect(shell().dataset.epoch).toBe('1');
  });

  it('drops to the fallback when the context is lost', () => {
    render(<Harness probe={available} />);
    expect(shell().dataset.lost).toBe('no');

    fireEvent(shell(), new Event('webglcontextlost', { cancelable: true }));

    expect(shell().dataset.lost).toBe('yes');
  });

  it('re-probes and remounts on restore, and stays on the fallback while no context exists', () => {
    let context = true;
    render(<Harness probe={() => context} />);
    expect(shell().dataset.epoch).toBe('0');

    context = false;
    fireEvent.click(screen.getByRole('button', { name: 'Restore viewport' }));
    expect(shell().dataset.lost).toBe('yes');
    expect(shell().dataset.epoch).toBe('1');

    context = true;
    fireEvent.click(screen.getByRole('button', { name: 'Restore viewport' }));
    expect(shell().dataset.lost).toBe('no');
    expect(shell().dataset.epoch).toBe('2');
  });

  it('uses the replacement check on restore, so recovery is proven by the real renderer', () => {
    let recovered = false;
    const recover = vi.fn(() => recovered);
    render(<Harness probe={unavailable} recover={recover} />);
    expect(shell().dataset.lost).toBe('yes');

    fireEvent.click(screen.getByRole('button', { name: 'Restore viewport' }));
    expect(recover).toHaveBeenCalledTimes(1);
    expect(shell().dataset.lost).toBe('yes');
    expect(shell().dataset.epoch).toBe('1');

    recovered = true;
    fireEvent.click(screen.getByRole('button', { name: 'Restore viewport' }));
    expect(recover).toHaveBeenCalledTimes(2);
    expect(shell().dataset.lost).toBe('no');
    expect(shell().dataset.epoch).toBe('2');
  });

  it('keeps the fallback when the replacement check throws', () => {
    const recover = vi.fn(() => { throw new Error('no context'); });
    render(<Harness probe={unavailable} recover={recover} />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore viewport' }));
    expect(shell().dataset.lost).toBe('yes');
    expect(shell().dataset.epoch).toBe('1');
  });
});

describe('canUseWebGL', () => {
  it('releases and removes the temporary context it probes with', async () => {
    const loseContext = vi.fn();
    const gl = {
      isContextLost: () => false,
      getExtension: (name: string) => name === 'WEBGL_lose_context' ? { loseContext } : null,
    };
    const canvas = document.createElement('canvas');
    canvas.getContext = (() => gl) as unknown as typeof canvas.getContext;
    const originalCreate = document.createElement.bind(document);
    const create = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => (
      tagName === 'canvas' ? canvas : originalCreate(tagName, options)
    )) as typeof document.createElement);

    const { canUseWebGL } = await import('./webgl');
    expect(canUseWebGL()).toBe(true);
    expect(loseContext).toHaveBeenCalledTimes(1);
    expect(canvas.isConnected).toBe(false);
    create.mockRestore();
  });

  it('keeps the probe result when releasing is unsupported', async () => {
    const gl = {
      isContextLost: () => false,
      getExtension: () => { throw new Error('extension lookup failed'); },
    };
    const canvas = document.createElement('canvas');
    canvas.getContext = (() => gl) as unknown as typeof canvas.getContext;
    const originalCreate = document.createElement.bind(document);
    const create = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => (
      tagName === 'canvas' ? canvas : originalCreate(tagName, options)
    )) as typeof document.createElement);

    const { canUseWebGL } = await import('./webgl');
    expect(canUseWebGL()).toBe(true);
    expect(canvas.isConnected).toBe(false);
    create.mockRestore();
  });
});
