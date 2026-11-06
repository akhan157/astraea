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
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { releaseShellCanvases, useWebGLLoss } from './webgl';

function Harness({ probe }: { probe: (force?: boolean) => boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { lost, retry, epoch } = useWebGLLoss(ref, probe);
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

describe('useWebGLLoss', () => {
  it('starts on the fallback when no context exists, and returns to the canvas when one is restored', () => {
    render(<Harness probe={unavailable} />);
    expect(shell().dataset.lost).toBe('yes');
    expect(shell().textContent).toContain('fallback');

    fireEvent(shell(), new Event('webglcontextrestored'));

    expect(shell().dataset.lost).toBe('no');
    expect(shell().textContent).toContain('canvas');
  });

  it('drops to the fallback when the context is lost', () => {
    render(<Harness probe={available} />);
    expect(shell().dataset.lost).toBe('no');

    fireEvent(shell(), new Event('webglcontextlost', { cancelable: true }));

    expect(shell().dataset.lost).toBe('yes');
  });

  it('force-loses and removes owned canvases on release, so no detached context lingers', () => {
    const root = document.createElement('div');
    const canvas = document.createElement('canvas');
    root.append(canvas);
    const lost: string[] = [];
    const gl = {
      getExtension: () => ({ loseContext: () => lost.push('lost') }),
    };
    canvas.getContext = (() => gl) as unknown as typeof canvas.getContext;
    releaseShellCanvases(root);
    expect(lost).toEqual(['lost']);
    expect(root.querySelector('canvas')).toBeNull();
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
});
