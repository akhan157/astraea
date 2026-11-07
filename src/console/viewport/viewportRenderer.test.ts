// @vitest-environment jsdom
/**
 * The viewport owns one renderer for the page. These tests pin the reuse and
 * release rules without a GPU: R3F's Canvas teardown must not lose the shared
 * context, while an explicit drop must release it exactly once and detach the
 * canvas it owns.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as THREE from 'three';

import {
  ViewportRendererStore,
  createViewportRendererHost,
  makeViewportRendererHost,
  type ViewportRendererHost,
} from './viewportRenderer';

interface FakeRenderer {
  forceContextLoss: () => void;
  dispose: () => void;
  getContext: () => { isContextLost: () => boolean };
}

function fakeHost({ lost = false, rawForce = vi.fn(), dispose = vi.fn() } = {}): {
  host: ViewportRendererHost; rawForce: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>;
} {
  const canvas = document.createElement('canvas');
  const renderer: FakeRenderer = {
    forceContextLoss: rawForce,
    dispose,
    getContext: () => ({ isContextLost: () => lost }),
  };
  const host = makeViewportRendererHost(() => ({ canvas, renderer: renderer as unknown as THREE.WebGLRenderer }));
  if (host === null) throw new Error('host construction unexpectedly failed');
  return { host, rawForce, dispose };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('makeViewportRendererHost', () => {
  it('suppresses R3F Canvas teardown loss and releases the owned context once on drop', () => {
    const { host, rawForce, dispose } = fakeHost();
    const parent = document.createElement('div');
    parent.append(host.canvas);

    // This is the call R3F makes for a caller-provided renderer on Canvas
    // unmount. The context must survive a stage switch.
    host.renderer.forceContextLoss();
    expect(rawForce).not.toHaveBeenCalled();
    expect(host.canvas.parentElement).toBe(parent);

    host.release();
    expect(host.canvas.parentElement).toBeNull();
    expect(rawForce).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);

    host.release();
    expect(rawForce).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('does not re-lose a context the driver already lost, but still disposes and detaches', () => {
    const { host, rawForce, dispose } = fakeHost({ lost: true });
    const parent = document.createElement('div');
    parent.append(host.canvas);

    host.release();

    expect(rawForce).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(host.canvas.parentElement).toBeNull();
  });

  it('turns a constructor failure into a missing host, not a render error', () => {
    expect(makeViewportRendererHost(() => { throw new Error('no GL'); })).toBeNull();
  });
});

describe('ViewportRendererStore', () => {
  it('reuses one host across repeated acquires and drops it idempotently', () => {
    const released = vi.fn();
    const first = { canvas: document.createElement('canvas'), renderer: {} as THREE.WebGLRenderer, release: released };
    const second = { canvas: document.createElement('canvas'), renderer: {} as THREE.WebGLRenderer, release: vi.fn() };
    const factory = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const store = new ViewportRendererStore(factory);

    expect(store.acquire()).toBe(first);
    expect(store.acquire()).toBe(first);
    expect(factory).toHaveBeenCalledTimes(1);

    store.drop();
    expect(released).toHaveBeenCalledTimes(1);
    expect(store.peek()).toBeNull();

    store.drop();
    expect(released).toHaveBeenCalledTimes(1);

    expect(store.acquire()).toBe(second);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('retries construction after a failed acquire', () => {
    const host = { canvas: document.createElement('canvas'), renderer: {} as THREE.WebGLRenderer, release: vi.fn() };
    const factory = vi.fn().mockReturnValueOnce(null).mockReturnValueOnce(host);
    const store = new ViewportRendererStore(factory);

    expect(store.acquire()).toBeNull();
    expect(store.peek()).toBeNull();
    expect(store.acquire()).toBe(host);
    expect(factory).toHaveBeenCalledTimes(2);
  });
});

describe('createViewportRendererHost', () => {
  it('returns null instead of throwing when the environment has no WebGL', () => {
    expect(createViewportRendererHost()).toBeNull();
  });
});
