// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  AERO_MODEL_PROVENANCE as P,
  PROVENANCE_HASH,
  openAeroModelProvenance,
} from '../../application/aeroModelProvenance';
import { AeroModelProvenanceDialog } from './AeroModelProvenance';

function openViaHash(): void {
  window.location.hash = PROVENANCE_HASH;
  act(() => {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

function closeViaHash(): void {
  window.location.hash = '';
  act(() => {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

beforeEach(() => {
  closeViaHash();
});
afterEach(() => {
  cleanup();
  closeViaHash();
});

describe('aero model provenance dialog', () => {
  it('opens from the hash and is an accessible, labelled dialog', () => {
    render(<AeroModelProvenanceDialog />);
    expect(screen.queryByRole('dialog')).toBeNull();
    openViaHash();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const titleId = dialog.getAttribute('aria-labelledby');
    expect(titleId).toBe('aero-model-provenance-title');
    expect(document.getElementById(titleId!)?.textContent).toContain('Aero model provenance');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Close aero model provenance');
  });

  it('opens from the model button trigger without a hash requirement', () => {
    render(<AeroModelProvenanceDialog />);
    act(() => openAeroModelProvenance());
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('closes on Escape and clears the hash', () => {
    render(<AeroModelProvenanceDialog />);
    openViaHash();
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('traps focus and closes from the close button', () => {
    render(<AeroModelProvenanceDialog />);
    openViaHash();
    const close = screen.getByRole('button', { name: 'Close aero model provenance' });
    close.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.click(close);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('renders every required disclosure with no forbidden claims', () => {
    render(<AeroModelProvenanceDialog />);
    openViaHash();
    const text = screen.getByRole('dialog').textContent ?? '';
    for (const required of [
      'No physical validation',
      'Legacy total-drag override',
      'Mach 0.80-1.20',
      'Method-only engine parity',
      'does not apply to the hybrid',
      'Component breakdown is unavailable',
      'airfoil',
      'off by default',
      'held-out real flights',
      P.legacyConstants[0].value,
    ]) {
      expect(text, required).toContain(required);
    }
    expect(text).not.toMatch(/RASAero|CDX1|\.eng/);
    expect(text).not.toMatch(/\bvalidated\b/);
    expect(text).not.toMatch(/\b1\.0\.0\b/);
    expect(text).not.toContain('accuracy verified');
  });
});
