/**
 * Read-only provenance dialog for the built-up aero model (hybrid 1.1.0).
 *
 * Self-contained: no network, no external links, no vendor strings. Opened by
 * the `#aero-model-provenance` hash (deep link) or from the model surfaces.
 */
import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import {
  AERO_MODEL_PROVENANCE as P,
  PROVENANCE_HASH,
  openAeroModelProvenance,
  type ProvenanceTermClass,
} from '../../application/aeroModelProvenance';
import { C } from '../kit/theme';

const CLASS_LABELS: ReadonlyArray<{ klass: ProvenanceTermClass; label: string; hint: string }> = [
  { klass: 'published', label: 'Published', hint: 'Taken from published methods or standards.' },
  { klass: 'derived', label: 'Derived', hint: 'Derived from geometry or the method contract.' },
  { klass: 'engine-observed', label: 'Engine-observed', hint: 'Observed from the reference engine; not a validation.' },
  { klass: 'unvalidated', label: 'Unvalidated', hint: 'No validation has been established.' },
];

export function AeroModelProvenanceButton(): JSX.Element {
  return (
    <button
      type="button"
      onClick={openAeroModelProvenance}
      className="rounded px-2 py-1 text-[11px]"
      style={{ border: `1px solid ${C.line}`, color: C.fg }}
      data-aero-model-provenance-button
    >
      Aero model provenance
    </button>
  );
}

export function AeroModelProvenanceDialog(): JSX.Element | null {
  const [open, setOpen] = useState(
    () => typeof window !== 'undefined' && window.location.hash === `#${PROVENANCE_HASH}`,
  );
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const sync = (): void => setOpen(window.location.hash === `#${PROVENANCE_HASH}`);
    const openEvent = (): void => setOpen(true);
    window.addEventListener('hashchange', sync);
    window.addEventListener(`${PROVENANCE_HASH}:open`, openEvent);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener(`${PROVENANCE_HASH}:open`, openEvent);
    };
  }, []);

  const close = useCallback((): void => {
    if (window.location.hash === `#${PROVENANCE_HASH}`) {
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab' || dialogRef.current === null) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('disabled'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previousFocus.current?.focus?.();
    };
  }, [open, close]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="aero-model-provenance-title"
        data-aero-model-provenance
        className="flex max-h-[88vh] w-full max-w-[820px] flex-col overflow-hidden rounded-lg"
        style={{ background: C.panel, color: C.fg, border: `1px solid ${C.line}` }}
      >
        <div className="flex items-start justify-between gap-4 border-b p-4" style={{ borderColor: C.line }}>
          <div>
            <h2 id="aero-model-provenance-title" className="text-[15px] font-medium">
              Aero model provenance — {P.modelId} {P.modelVersion} ({P.kind})
            </h2>
            <p className="mt-1 text-[11.5px]" style={{ color: C.warn }}>{P.disclaimer}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Close aero model provenance"
            className="rounded px-2 py-1 text-[11px]"
            style={{ border: `1px solid ${C.line}` }}
          >
            Close
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-4 text-[12px]">
          <section data-provenance-section="composition">
            <h3 className="text-[13px] font-medium">Composition</h3>
            <p className="mt-1" style={{ color: C.muted }}>{P.composition.wording}</p>
            <p className="mt-1 font-geist-mono text-[11.5px]">
              Band: Mach {P.composition.bandLowMach.toFixed(2)}-{P.composition.bandHighMach.toFixed(2)} · {P.composition.referenceAtmosphere}
            </p>
          </section>

          <section data-provenance-section="terms">
            <h3 className="text-[13px] font-medium">Term classes</h3>
            {CLASS_LABELS.map(({ klass, label, hint }) => (
              <div key={klass} className="mt-2" data-provenance-class={klass}>
                <p className="font-medium">{label} <span style={{ color: C.dim }}>— {hint}</span></p>
                <ul className="mt-1 space-y-0.5">
                  {P.terms.filter((term) => term.klass === klass).map((term) => (
                    <li key={term.name} style={{ color: C.muted }}>
                      <span style={{ color: C.fg }}>{term.name}:</span> {term.detail}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          <section data-provenance-section="legacy-constants">
            <h3 className="text-[13px] font-medium">Legacy override constants (unvalidated)</h3>
            <ul className="mt-1 space-y-1">
              {P.legacyConstants.map((constant) => (
                <li key={constant.name} data-provenance-constant={constant.name}>
                  <span style={{ color: C.fg }}>{constant.name}:</span>{' '}
                  <span className="font-geist-mono">{constant.value}</span>{' '}
                  <span style={{ color: C.warn }}>({constant.status})</span>
                  {constant.note === undefined ? null : (
                    <span className="block text-[11px]" style={{ color: C.dim }}>{constant.note}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section data-provenance-section="evidence">
            <h3 className="text-[13px] font-medium">Evidence scope</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5" style={{ color: C.muted }}>
              {P.evidence.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </section>

          <section data-provenance-section="limits">
            <h3 className="text-[13px] font-medium">Limits</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5" style={{ color: C.muted }}>
              {P.limits.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </section>

          <section data-provenance-section="citations">
            <h3 className="text-[13px] font-medium">Citations</h3>
            <p className="mt-1" style={{ color: C.muted }}>{P.citations}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
