/**
 * RIVAL S2 — WorkstationShell: the precision/canvas-led five-studio shell.
 *
 * Direction: synthesis §4's other pole from the ui2 S2 shell. Where S2 leads
 * with run status (mission rail, run records, readiness everywhere), this
 * shell leads with the pick/edit surface: a type/scope selection filter with
 * three-state highlight (pattern 1), an explicit edit-commit boundary
 * (pattern 4), compare-vs-saved blended on the canvas (pattern 3), and
 * selection as first-class state (pattern 10). The run surface still exists
 * to the IDENTICAL S2 acceptance: five studios keyboard-reachable, routine
 * simulation inline (no modal), stale/invalid never unqualified-pass, and
 * WebGL loss preserves editing — all on the same S1 selectors.
 *
 * Studios stay mounted across switches so case inputs (wind rows, probe,
 * sounding, drafts, compare) survive navigation; freshness is computed from
 * input keys, never from a remount wipe.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Header } from '../Header';
import { ComponentTree } from '../ComponentTree';
import { PropertyInspector } from '../PropertyInspector';
import { MetricHUD } from '../MetricHUD';
import { RocketCanvas } from '../../viewport/RocketCanvas';
import { PropulsionStudio } from '../PropulsionStudio';
import { TrajectoryStudio } from '../TrajectoryStudio';
import { EvidenceStudio } from '../EvidenceStudio';
import { AeroPanel } from './AeroPanel';
import { assessMounts, resolveMotor } from '../../application/caseResolver';
import { displayFor, useRunStore } from '../../store/runStore';
import { useWorkspaceStore, type WorkstationStudio } from '../../store/workspaceStore';
import { useRocketStore } from '../../store/rocketStore';
import { useEditBufferStore } from '../../store/editBufferStore';
import type { RocketComponent } from '../../core/types';
import { StatusBadge } from '../ui/StatusBadge';
import { StudioNavigation, useStudioKeyboard } from './StudioNavigation';
import { PrecisionContextBar } from './PrecisionContextBar';
import { CompareDock } from './CompareDock';
import { pickStateFor, type PickState } from './SelectionFilter';

/** False when no WebGL context can be created (headless test, broken GPU). */
export function canUseWebGL(): boolean {
  try {
    if (typeof document === 'undefined') return false;
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl');
    return gl !== null && gl !== undefined;
  } catch {
    return false;
  }
}

function useWebGLLoss(containerRef: React.RefObject<HTMLDivElement | null>): { lost: boolean; retry: () => void; epoch: number } {
  const [lost, setLost] = useState(() => !canUseWebGL());
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onLost = (e: Event) => {
      // Preserve editing: prevent the default teardown, keep every store.
      e.preventDefault();
      setLost(true);
    };
    const onRestored = () => setLost(false);
    el.addEventListener('webglcontextlost', onLost);
    el.addEventListener('webglcontextrestored', onRestored);
    return () => {
      el.removeEventListener('webglcontextlost', onLost);
      el.removeEventListener('webglcontextrestored', onRestored);
    };
  }, [containerRef, epoch]);
  const retry = useCallback(() => {
    setLost(!canUseWebGL());
    setEpoch((n) => n + 1);
  }, []);
  return { lost, retry, epoch };
}

const PANEL_LABEL: Record<WorkstationStudio, string> = {
  airframe: 'Airframe CAD',
  aero: 'Aerodynamics & Flutter',
  propulsion: 'Propulsion & Motors',
  trajectory: 'Trajectory & Weather',
  evidence: 'Recovery Packaging & Flight Evidence Ledger',
};

const LeftPane: React.FC = () => {
  const studio = useWorkspaceStore((s) => s.studio);
  const vehicle = useRocketStore((s) => s.vehicle);
  const selectedMotorId = useRocketStore((s) => s.selectedMotorId);
  const customMotors = useRocketStore((s) => s.customMotors);
  const stability = useRocketStore((s) => s.stability);
  const selectedComponentId = useRocketStore((s) => s.selectedComponentId);
  const filter = useWorkspaceStore((s) => s.filter);
  const records = useRunStore((s) => s.records);
  const selectStudio = useWorkspaceStore((s) => s.selectStudio);
  const chosenId = useRunStore((s) => s.chosenRunId);
  const chosen = records.find((r) => r.runId === chosenId) ?? null;

  if (studio === 'airframe') {
    const mounts = assessMounts(vehicle);
    const highlight = (comp: RocketComponent): PickState => pickStateFor(comp, selectedComponentId, mounts);
    return <ComponentTree filter={filter} highlight={highlight} />;
  }
  if (studio === 'aero') {
    return (
      <div className="flex flex-col gap-1 p-2 overflow-y-auto" aria-label="Aero cases">
        <h3 className="text-[11px] uppercase tracking-wide text-zinc-500 px-1">Component contributions</h3>
        {(stability.contributions ?? []).map((c) => (
          <div key={c.id} className="rounded-md border border-zinc-700/60 bg-zinc-900/60 px-2 py-1.5 text-[11px]">
            <div className="text-zinc-200 font-medium truncate">{c.name ?? c.id}</div>
            <div className="font-mono text-zinc-400">CNα {(c.cna ?? NaN).toFixed(3)} · CP {(c.cp ?? NaN).toFixed(3)} m</div>
          </div>
        ))}
        {(stability.contributions ?? []).length === 0 && (
          <p className="text-[11px] text-zinc-500 px-1">No contributions — geometry carries no lifting surfaces yet.</p>
        )}
      </div>
    );
  }
  if (studio === 'propulsion') {
    const resolution = resolveMotor(selectedMotorId, customMotors);
    return (
      <div className="flex flex-col gap-1 p-2 overflow-y-auto" aria-label="Motor library">
        <h3 className="text-[11px] uppercase tracking-wide text-zinc-500 px-1">Motor binding</h3>
        <div className="rounded-md border border-zinc-700/60 bg-zinc-900/60 px-2 py-1.5 text-[11px]">
          <div className="text-zinc-200 font-medium">Assigned: {selectedMotorId}</div>
          <div className="text-zinc-400">
            {resolution.status === 'resolved' ? `Resolves to ${resolution.motor.designation}.` : 'Unresolved — assign in Propulsion.'}
          </div>
        </div>
        <div className="text-[11px] text-zinc-500 px-1">Custom imports: {Object.keys(customMotors).length}</div>
      </div>
    );
  }
  if (studio === 'trajectory') {
    return (
      <div className="flex flex-col gap-1 p-2 overflow-y-auto" aria-label="Launch cases and runs">
        <h3 className="text-[11px] uppercase tracking-wide text-zinc-500 px-1">Launch case</h3>
        <div className="rounded-md border border-zinc-700/60 bg-zinc-900/60 px-2 py-1.5 text-[11px] text-zinc-300">
          <div className="truncate">Vehicle: {vehicle.name}</div>
          <div className="truncate">Motor: {selectedMotorId}</div>
        </div>
        <h3 className="text-[11px] uppercase tracking-wide text-zinc-500 px-1 mt-1">Runs</h3>
        {records.length === 0 && <p className="text-[11px] text-zinc-500 px-1">No runs yet — routine simulation runs inline below.</p>}
        {records.map((r) => {
          const q = displayFor(r).status;
          return (
            <div key={r.runId} className="rounded-md border border-zinc-700/60 bg-zinc-900/60 px-2 py-1.5 text-[11px] flex items-center justify-between gap-1">
              <span className="text-zinc-300 truncate">{r.label}</span>
              <StatusBadge status={q.status} label={q.label} />
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1 p-2 overflow-y-auto" aria-label="Recovery and logs">
      <h3 className="text-[11px] uppercase tracking-wide text-zinc-500 px-1">Comparison basis</h3>
      {chosen ? (
        <div className="rounded-md border border-zinc-700/60 bg-zinc-900/60 px-2 py-1.5 text-[11px] text-zinc-300">
          <div className="truncate">Run: {chosen.label}</div>
          <div className="font-mono text-zinc-500">key {chosen.runKey.slice(0, 16)}…</div>
        </div>
      ) : (
        <p className="text-[11px] text-zinc-500 px-1">No run selected yet — choose one to compare against a log.</p>
      )}
      <p className="text-[11px] text-zinc-500 px-1">Log import and mapping arrive with the evidence loop (S6).</p>
      <button
        type="button"
        onClick={() => selectStudio('trajectory')}
        className="mt-1 mx-1 px-2 py-1 rounded border border-zinc-600 text-[11px] text-zinc-300 hover:bg-zinc-800 text-left"
      >
        Run a trajectory first →
      </button>
    </div>
  );
};

const RightPane: React.FC<{ onRun: () => void }> = ({ onRun }) => {
  const studio = useWorkspaceStore((s) => s.studio);
  const vehicle = useRocketStore((s) => s.vehicle);
  const selectedMotorId = useRocketStore((s) => s.selectedMotorId);
  const customMotors = useRocketStore((s) => s.customMotors);
  const stability = useRocketStore((s) => s.stability);
  const selectStudio = useWorkspaceStore((s) => s.selectStudio);
  const stage = useEditBufferStore((s) => s.stage);
  const draftFor = useEditBufferStore((s) => s.draftFor);

  if (studio === 'airframe') {
    // Pattern 4 boundary: every inspector edit stages into the buffer; Apply
    // in the precision bar is the only path that commits to the store.
    return <PropertyInspector onUpdate={stage} draftFor={draftFor} />;
  }
  if (studio === 'trajectory') {
    const resolution = resolveMotor(selectedMotorId, customMotors);
    const mounts = assessMounts(vehicle);
    const issues: Array<{ text: string; studio: 'propulsion' | 'airframe' }> = [];
    if (resolution.status !== 'resolved') issues.push({ text: `Motor "${selectedMotorId}" is unresolved — assign it in Propulsion.`, studio: 'propulsion' });
    if (mounts.ambiguous) issues.push({ text: 'Motor mounts are ambiguous — resolve the mount in Airframe.', studio: 'airframe' });
    if (mounts.solidMount) issues.push({ text: 'No motor mount — mark a mount tube in Airframe.', studio: 'airframe' });
    return (
      <div className="flex flex-col gap-2 p-2 overflow-y-auto" aria-label="Run readiness">
        <h3 className="text-[11px] uppercase tracking-wide text-zinc-500 px-1">Run readiness</h3>
        {issues.length === 0 ? (
          <StatusBadge status="pass" label="Ready — inputs resolve" detail="Motor and mount checks pass. Run the ensemble inline; no modal." />
        ) : (
          issues.map((issue, i) => (
            <button
              key={i}
              type="button"
              onClick={() => selectStudio(issue.studio)}
              className="text-left rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-200 hover:bg-red-500/20"
            >
              {issue.text}
            </button>
          ))
        )}
        <button
          type="button"
          onClick={onRun}
          data-run-inline="true"
          title="Run routine simulation (Ctrl+Enter)"
          className="px-3 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 text-xs font-semibold border border-cyan-500/40"
        >
          Run routine simulation ⏎
        </button>
        <p className="text-[11px] text-zinc-500 px-1">Executes the inline ensemble below — never a modal.</p>
      </div>
    );
  }
  if (studio === 'aero') {
    return (
      <div className="flex flex-col gap-2 p-2 overflow-y-auto" aria-label="Model applicability">
        <h3 className="text-[11px] uppercase tracking-wide text-zinc-500 px-1">Model applicability</h3>
        <div className="rounded-md border border-zinc-700/60 bg-zinc-900/60 px-2 py-1.5 text-[11px] text-zinc-300">
          Barrowman-stack estimate at the nose-tip datum; valid for subsonic, axial flight. Transonic corrections
          and flutter bounds are advisory until S7 binds the selected fin set.
        </div>
        <StatusBadge
          status={stability.isStable ? 'pass' : 'fail'}
          label={`Margin ${stability.staticMarginCalibers.toFixed(2)} cal (criterion ≥ 1.0)`}
        />
      </div>
    );
  }
  if (studio === 'propulsion') {
    const resolution = resolveMotor(selectedMotorId, customMotors);
    const mounts = assessMounts(vehicle);
    return (
      <div className="flex flex-col gap-2 p-2 overflow-y-auto" aria-label="Installation">
        <h3 className="text-[11px] uppercase tracking-wide text-zinc-500 px-1">Installation</h3>
        {resolution.status === 'resolved' ? (
          <dl className="rounded-md border border-zinc-700/60 bg-zinc-900/60 px-2 py-1.5 text-[11px] grid grid-cols-2 gap-1">
            <dt className="text-zinc-500">Designation</dt>
            <dd className="font-mono text-zinc-100">{resolution.motor.designation}</dd>
            <dt className="text-zinc-500">Total impulse</dt>
            <dd className="font-mono text-zinc-100">{resolution.motor.totalImpulse.toFixed(1)} N·s</dd>
            <dt className="text-zinc-500">Mount bore</dt>
            <dd className="font-mono text-zinc-100">{mounts.boreM !== null ? `${(mounts.boreM * 1000).toFixed(1)} mm` : 'unknown'}</dd>
          </dl>
        ) : (
          <StatusBadge status="invalid" label="No motor resolves — nothing installed" />
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 p-2 overflow-y-auto" aria-label="Evidence settings">
      <h3 className="text-[11px] uppercase tracking-wide text-zinc-500 px-1">Evidence settings</h3>
      <p className="text-[11px] text-zinc-500 px-1">Packed dimensions, log mapping, and alignment controls arrive with S6.</p>
    </div>
  );
};

export const WorkstationShell: React.FC = () => {
  const studio = useWorkspaceStore((s) => s.studio);
  const leftWidth = useWorkspaceStore((s) => s.leftWidth);
  const rightWidth = useWorkspaceStore((s) => s.rightWidth);
  const displayUnits = useWorkspaceStore((s) => s.displayUnits);
  const setDisplayUnits = useWorkspaceStore((s) => s.setDisplayUnits);
  const vehicle = useRocketStore((s) => s.vehicle);
  const selectedComponentId = useRocketStore((s) => s.selectedComponentId);
  const history = useRocketStore((s) => s.history);
  const records = useRunStore((s) => s.records);
  const compare = useWorkspaceStore((s) => s.compare);
  const viewportRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLElement>(null);
  const { lost: webglLost, retry: retryWebGL, epoch: webglEpoch } = useWebGLLoss(viewportRef);

  // Explicit Run (UI §5.3): Ctrl/Cmd+Enter and every Run entry execute the
  // inline ensemble in Trajectory — never a modal. The studio stays mounted
  // across switches, so the click lands on live case inputs; a preflight-
  // blocked run control is disabled and the click is a no-op.
  const runInline = useCallback(() => {
    useWorkspaceStore.getState().selectStudio('trajectory');
    window.setTimeout(() => {
      const el = centerRef.current?.querySelector<HTMLElement>('[data-run-control]');
      el?.focus();
      if (typeof el?.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
      el?.click();
    }, 0);
  }, []);
  useStudioKeyboard(runInline);

  // Escape cancels the nearest edit boundary, then the compare popover —
  // never navigation state and never a running job (UI §5.3).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.ctrlKey || e.metaKey) return;
      const pending = Object.keys(useEditBufferStore.getState().drafts).length;
      if (pending > 0) {
        e.preventDefault();
        useEditBufferStore.getState().discardAll();
        return;
      }
      if (useWorkspaceStore.getState().compare.active) {
        e.preventDefault();
        useWorkspaceStore.getState().setCompareActive(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Compare checkpoint: the most recent committed revision (history head).
  const checkpoint = compare.checkpoint ?? (history.length > 0 ? history[0] : null);

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <Header onRun={runInline} />

      <div className="flex items-center gap-2 px-3 py-1 bg-zinc-950 border-b border-zinc-800 flex-wrap">
        <StudioNavigation />
        <button
          type="button"
          onClick={runInline}
          data-run-inline="true"
          title="Run routine simulation inline (Ctrl+Enter)"
          className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/40"
        >
          Run ⏎
        </button>
      </div>

      {/* Precision chrome (RIVAL): filter, edit boundary, run-from-selection,
          compare toggle — the workstation's leading surface. */}
      <PrecisionContextBar onRun={runInline} />

      <div className="flex-1 flex overflow-hidden relative min-h-0">
        <aside aria-label="Context list" style={{ width: leftWidth }} className="shrink-0 border-r border-zinc-800 bg-zinc-900/40 overflow-hidden hidden md:block">
          <LeftPane />
        </aside>

        <main ref={centerRef} aria-label={`${PANEL_LABEL[studio]} workspace`} className="flex-1 relative h-full overflow-y-auto p-4 bg-zinc-950 min-w-0">
          {/* All studios stay mounted so switching never erases case inputs
              (wind rows, probe, sounding, drafts, compare); the inactive ones
              are hidden, not unmounted. Freshness is computed from input
              keys, never from a remount wipe. */}
          <div hidden={studio !== 'airframe'} className="relative h-full min-h-96" data-studio-panel="airframe">
            <MetricHUD />
            <div ref={viewportRef} className="absolute inset-0">
              {!webglLost ? (
                <RocketCanvas
                  key={webglEpoch}
                  overlayVehicle={compare.active ? checkpoint : null}
                  overlayOpacity={compare.active && checkpoint ? compare.blend / 100 : 0}
                />
              ) : (
                <div
                  role="alert"
                  data-webgl-fallback="true"
                  className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-900/80 p-6 text-center"
                >
                  <p className="text-sm font-semibold text-zinc-100">3D viewport unavailable — editing preserved</p>
                  <p className="text-[11px] text-zinc-400 max-w-md">
                    The WebGL context was lost. The assembly tree, forms, metrics, and blueprint export are
                    untouched — keep editing, then restore the viewport.
                  </p>
                  <button
                    type="button"
                    onClick={retryWebGL}
                    className="px-3 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/20 text-cyan-200 text-xs font-semibold hover:bg-cyan-500/30"
                  >
                    Restore viewport
                  </button>
                </div>
              )}
            </div>
            <CompareDock />
          </div>
          <div hidden={studio !== 'aero'} data-studio-panel="aero">
            <AeroPanel />
          </div>
          <div hidden={studio !== 'propulsion'} data-studio-panel="propulsion"><PropulsionStudio /></div>
          <div hidden={studio !== 'trajectory'} data-studio-panel="trajectory"><TrajectoryStudio /></div>
          <div hidden={studio !== 'evidence'} data-studio-panel="evidence"><EvidenceStudio /></div>
        </main>

        <aside aria-label="Inspector" style={{ width: rightWidth }} className="shrink-0 border-l border-zinc-800 bg-zinc-900/40 overflow-hidden hidden lg:block">
          <RightPane onRun={runInline} />
        </aside>
      </div>

      <footer aria-label="Workstation status" className="flex items-center gap-4 px-3 py-1 bg-zinc-900/80 border-t border-zinc-800 text-[11px] text-zinc-400 flex-wrap">
        <button
          type="button"
          onClick={() => setDisplayUnits(displayUnits === 'metric' ? 'imperial' : 'metric')}
          aria-label={`Display units: ${displayUnits}. Activate to switch.`}
          className="px-1.5 py-0.5 rounded border border-zinc-700 hover:bg-zinc-800 font-mono"
        >
          {displayUnits === 'metric' ? 'SI / m' : 'ft / in'}
        </button>
        <span className="font-mono truncate">sel: {selectedComponentId ?? 'none'}</span>
        <span className="font-mono truncate">rev: {vehicle.id} v{vehicle.version}</span>
        <span>runs: {records.length}</span>
        <span>{webglLost ? 'viewport: fallback (editing live)' : 'viewport: WebGL'}</span>
      </footer>
    </div>
  );
};