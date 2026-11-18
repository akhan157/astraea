/**
 * The start screen: Blank / Use an example / Import a file / Resume. It opens
 * on a first visit instead of a step-by-step tour (the tour stays available
 * from the palette), and any time from the palette. Choosing an option that
 * replaces the current design says so and is undoable; when the current design
 * has unsaved edits, the replacement asks first.
 */
import { useState } from 'react';
import { create } from 'zustand';
import { Dialog } from 'radix-ui';
import { FilePlus2, FolderOpen, History, LayoutTemplate, X } from 'lucide-react';
import { PRESETS, consoleActions, useWS } from '../store';
import { useProjectStore } from '../../state/project';
import { addComponentOp } from '../../state/componentOps';
import type { ComponentType, RocketComponent, RocketVehicle } from '../../core/types';
import { OPEN_FILE_ACCEPT } from '../../io/files';
import { importProjectFile } from '../../state/projectIo';
import { C } from '../kit/theme';

/** Where "the start screen has been seen" lives; shared with the tour's first-visit flag. */
export const START_SEEN_KEY = 'astraea.workstation.toured';

interface PendingReplace { label: string; run: () => void }
export const useStartChooser = create<{ open: boolean; pending: PendingReplace | null }>(() => ({ open: false, pending: null }));
export const openStartChooser = (): void => useStartChooser.setState({ open: true, pending: null });

/**
 * Replace the current design (load an example, start blank, …). Runs at once
 * when nothing unsaved would be lost (the replacement is undoable and
 * announced with an Undo toast); otherwise asks first.
 */
export function replaceDesign(label: string, run: () => void): void {
  if (!hasUnsavedEdits()) { run(); return; }
  useStartChooser.setState({ open: true, pending: { label, run } });
}

function markSeen(): void {
  try { window.localStorage.setItem(START_SEEN_KEY, '1'); } catch { /* storage unavailable */ }
}

/**
 * A blank starter: nose cone, motor-mount tube, fins and a parachute, built
 * with the same part defaults as "Add part", at a common 24.8 mm (BT-50) size
 * for the bundled Estes C6. Every value is an editable starting point.
 */
export function blankVehicle(): RocketVehicle {
  let components: RocketComponent[] = [];
  for (const type of ['nosecone', 'bodytube', 'trapezoidfinset', 'parachute'] as ComponentType[]) {
    const op = addComponentOp(components, type, 0.0248);
    if (op.ok) components = op.components;
  }
  const d = 0.0248;
  components = components.map((c) => {
    if (c.type === 'bodytube') return { ...c, isMotorMount: true };
    // Fins in proportion to the tube (a common model-rocket planform), flush with its aft end.
    if (c.type === 'trapezoidfinset') {
      const tube = components.find((x) => x.type === 'bodytube');
      const rootChord = 2 * d;
      return { ...c, rootChord, tipChord: d, span: 0.7 * d, sweepLength: d, thickness: 0.0024, axialOffset: tube && tube.type === 'bodytube' ? Math.max(0, tube.length - rootChord) : c.axialOffset };
    }
    return c;
  });
  return { id: `blank-${Date.now().toString(36)}`, name: 'Untitled rocket', version: '1.0', author: 'Astraea user', notes: '', components };
}

/** Whether replacing the design would lose edits the user has not saved. */
export function hasUnsavedEdits(): boolean {
  const { past, file } = useProjectStore.getState();
  return past.length > 0 && file.kind !== 'clean';
}

export function StartChooser({ canResume, onResume }: { canResume: boolean; onResume?: () => void }) {
  const open = useStartChooser((s) => s.open);
  const pending = useStartChooser((s) => s.pending);
  const s = useWS();
  const [localConfirm, setConfirming] = useState<PendingReplace | null>(null);
  const confirming = localConfirm ?? pending;
  const [importError, setImportError] = useState<string | null>(null);
  const close = (): void => { markSeen(); setConfirming(null); setImportError(null); useStartChooser.setState({ open: false, pending: null }); };
  const replace = (label: string, run: () => void): void => {
    if (hasUnsavedEdits()) { setConfirming({ label, run }); return; }
    run();
    close();
  };
  const tile = 'flex w-full items-start gap-3 rounded-md p-3 text-left hover:bg-white/[0.04]';
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[560px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-lg p-5 shadow-2xl" style={{ background: C.panel, border: `1px solid ${C.lineStrong}`, color: C.fg }}>
          <div className="mb-1 flex items-center">
            <Dialog.Title className="text-[15px] font-medium">Start a rocket</Dialog.Title>
            <Dialog.Close className="ml-auto rounded p-1 hover:bg-white/5" aria-label="Close"><X size={14} /></Dialog.Close>
          </div>
          <Dialog.Description className="mb-4 text-[12.5px]" style={{ color: C.muted }}>
            Pick a starting point. Everything is editable, and replacing the current design can be undone.
          </Dialog.Description>
          {confirming ? (
            <div role="alertdialog" aria-label="Replace the current design?" className="space-y-3">
              <p className="text-[13px]">Replace <strong>{s.design.vehicle.name}</strong> with {confirming.label}?</p>
              <p className="text-[12px]" style={{ color: C.muted }}>Your current design has edits that aren't saved to a file. You can undo the replacement afterwards ({'Undo'} in the top bar).</p>
              <div className="flex gap-2">
                <button className="rounded-md px-3 py-1.5 text-[12.5px] font-medium" style={{ background: C.accent, color: '#06222A' }} onClick={() => { confirming.run(); close(); }}>Replace</button>
                <button className="rounded-md px-3 py-1.5 text-[12.5px]" style={{ border: `1px solid ${C.line}` }} onClick={() => { if (pending) close(); else setConfirming(null); }}>Keep my design</button>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {canResume && (
                <button className={tile} onClick={() => { onResume?.(); close(); }} style={{ border: `1px solid rgba(110,231,247,.35)` }}>
                  <History size={16} color={C.accent} className="mt-0.5 shrink-0" />
                  <span><span className="block text-[13px] font-medium">Resume {s.design.vehicle.name}</span><span className="block text-[12px]" style={{ color: C.muted }}>Carry on where you left off.</span></span>
                </button>
              )}
              <button className={tile} style={{ border: `1px solid ${C.line}` }} onClick={() => replace('a blank design', () => { useProjectStore.getState().loadBlank(blankVehicle(), 'estes_c6'); s.set({ stage: 'airframe', selectedId: null }); })}>
                <FilePlus2 size={16} color={C.muted} className="mt-0.5 shrink-0" />
                <span><span className="block text-[13px] font-medium">Blank rocket</span><span className="block text-[12px]" style={{ color: C.muted }}>A plain nose cone, tube, fins and parachute to size yourself.</span></span>
              </button>
              <div className="rounded-md p-3" style={{ border: `1px solid ${C.line}` }}>
                <div className="mb-2 flex items-center gap-3"><LayoutTemplate size={16} color={C.muted} className="shrink-0" /><span className="text-[13px] font-medium">Use an example</span><span className="text-[12px]" style={{ color: C.muted }}>you edit a copy</span></div>
                <div className="grid grid-cols-3 gap-2">
                  {PRESETS.map((p) => (
                    <button key={p.id} className="rounded p-2 text-left text-[12px] hover:bg-white/[0.04]" style={{ border: `1px solid ${C.line}` }}
                      onClick={() => replace(`the ${p.label} example`, () => { consoleActions.loadPreset(p.id); s.set({ stage: 'mission' }); })}>
                      <span className="block font-medium">{p.label}</span>
                      <span className="block text-[11px]" style={{ color: C.dim }}>{s.motors[p.motorId]?.designation} · {p.mission.site}</span>
                    </button>
                  ))}
                </div>
              </div>
              <label className={`${tile} cursor-pointer`} style={{ border: `1px solid ${C.line}` }}>
                <FolderOpen size={16} color={C.muted} className="mt-0.5 shrink-0" />
                <span><span className="block text-[13px] font-medium">Import a file</span><span className="block text-[12px]" style={{ color: C.muted }}>OpenRocket (.ork), RockSim (.rkt) or an Astraea project file.</span></span>
                <input type="file" accept={OPEN_FILE_ACCEPT} className="sr-only" aria-label="Import a rocket file"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    try { await importProjectFile(file); close(); } catch (err) { setImportError(err instanceof Error ? err.message : String(err)); }
                  }} />
              </label>
              {importError && <p role="alert" className="text-[12px]" style={{ color: C.bad }}>{importError}</p>}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
