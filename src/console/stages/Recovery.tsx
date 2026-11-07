import { useEffect } from 'react';
import { Umbrella } from 'lucide-react';
import type { ParachuteComponent } from '../../core/types';
import { useWS } from '../store';
import { useFreshness } from '../hooks';
import { C } from '../kit/theme';
import { Caveat } from '../kit/Caveat';
import { ResultValue, ValueUnit } from '../kit/Value';
import { EmptyState, GateRow } from '../kit/Status';
import { DataTable, Stat } from '../kit/Table';
import { Button } from '../kit/Fields';
import { StageHeader } from './common';
import { NoParachuteNote } from '../shell/NoParachuteNote';
import { FlightTimeline } from './FlightTimeline';
import { RecoveryCard } from '../evidence/RecoveryCard';
import { recordedDescentInterval } from '../data/recoveryResults';
import { landingAvailability } from '../../application/flightLanding';
import { isCandidateFlightModel, resolveFlightModel } from '../../application/flightModel';
import { CANDIDATE_REFUSAL } from '../../application/candidate';
import { CandidateRefusalNotice } from './Candidate';

export function RecoveryStage() {
  const s = useWS();
  const run = s.committed?.run;
  const candidateSelected = isCandidateFlightModel(resolveFlightModel(s.design.flightModel));
  const fresh = useFreshness('recovery');
  const chutes = s.design.vehicle.components.filter((c): c is ParachuteComponent => c.type === 'parachute');
  // Point the inspector at a parachute when arriving here.
  useEffect(() => {
    const sel = s.design.vehicle.components.find((c) => c.id === s.selectedId);
    if (sel?.type !== 'parachute' && chutes[0]) s.set({ selectedId: chutes[0].id });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (candidateSelected) return <div className="flex min-h-0 flex-1 flex-col"><StageHeader stage="recovery" title="Recovery" /><NoParachuteNote components={s.design.vehicle.components} className="shrink-0 px-4 pt-3" /><div className="min-h-0 flex-1 space-y-3 overflow-auto p-4"><CandidateRefusalNotice title="Legacy recovery readout not evaluated" message={CANDIDATE_REFUSAL.legacyAero} /><p className="text-[11.5px]" style={{ color: C.muted }}>Candidate recorded events and landing availability are presented in Flight. No legacy recovery gate or landing value is substituted.</p><RecoveryCard /></div></div>;
  if (!run) return <div className="flex min-h-0 flex-1 flex-col"><StageHeader stage="recovery" title="Recovery" /><NoParachuteNote components={s.design.vehicle.components} className="shrink-0 px-4 pt-3" /><div className="min-h-0 flex-1 overflow-auto"><EmptyState icon={<Umbrella size={22} />} title="No flight yet" action={<Button primary onClick={() => void s.run()}>Run simulation</Button>} /><RecoveryCard /></div></div>;
  const descent = recordedDescentInterval(run);
  const landing = landingAvailability(run);
  const main = run.events.find((e) => e.kind === 'main');
  const gates = run.gates.filter((g) => g.stage === 'recovery');
  const stale = fresh.state === 'stale';
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StageHeader stage="recovery" title="Recovery" sub="Descent from apogee to touchdown, from the committed 6-DOF run." />
      <NoParachuteNote components={s.design.vehicle.components} className="shrink-0 px-4 pt-3" />
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4 thin-scroll" style={{ opacity: stale ? 0.85 : 1 }}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4 rounded-md p-3.5" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
          <Stat label="Landing speed">{landing.available ? <ResultValue r={run.summary.landingSpeed} size="lg" label="Landing speed" /> : `N/A — ${landing.reason}`}</Stat>
          <Stat label="Landing energy" sub={<Caveat summary="lumped whole-vehicle estimate; no standard energy threshold">Whole-vehicle kinetic energy from one lumped mass; per-section energy is not computed and no standard energy threshold is applied. Landing speed is checked against the Tripoli Level 1 certification limit.</Caveat>}>{landing.available ? <ResultValue r={run.summary.landingEnergy} size="lg" label="Landing energy" /> : `N/A — ${landing.reason}`}</Stat>
          <Stat label="Drift from pad"><ResultValue r={run.summary.drift} size="lg" label="Drift" /></Stat>
          <Stat label="Apogee → touchdown" sub={<Caveat summary="apogee to touchdown, recorded">Recorded apogee time to recorded touchdown time, not deployment-to-touchdown.</Caveat>}>{descent.available ? <ValueUnit value={descent.seconds} kind="time" size="lg" /> : `N/A — ${descent.reason}`}</Stat>
          <Stat label="Main opens at"><ValueUnit value={main?.altitude ?? NaN} kind="dist" size="lg" /></Stat>
        </div>
        <div className="rounded-md" style={{ background: C.panel, border: `1px solid ${C.line}` }}>{gates.map((g) => <GateRow key={g.id} g={g} stale={stale} />)}</div>
        <div className="rounded-md p-3.5" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
          <div className="mb-2 text-[10.5px] tracking-wide uppercase" style={{ color: C.dim }}>Descent events</div>
          <DataTable rows={run.events.filter((e) => e.kind === 'apogee_drogue' || e.kind === 'main' || e.kind === 'touchdown')} rowKey={(e) => e.kind} dense
            columns={[
              { key: 'e', label: 'Event', width: 'minmax(120px,1fr)', render: (e) => e.label },
              { key: 't', label: 'Time', align: 'right', width: '90px', render: (e) => <span className="font-geist-mono">{e.t.toFixed(2)} s</span> },
              { key: 'a', label: 'Altitude', align: 'right', width: '110px', render: (e) => <ValueUnit value={e.altitude} kind="dist" /> },
              { key: 'v', label: 'Speed', align: 'right', width: '110px', render: (e) => <ValueUnit value={e.velocity} kind="speed" /> },
            ]} />
          <FlightTimeline run={run} descent />
        </div>
        <div className="rounded-md" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
          <DataTable rows={chutes} rowKey={(c) => c.id} activeKey={s.selectedId} onRowClick={(k) => s.set({ selectedId: k })}
            columns={[
              { key: 'n', label: 'Parachute', width: '1.4fr', render: (c) => c.name },
              { key: 'd', label: 'Diameter', align: 'right', width: '100px', render: (c) => <ValueUnit value={c.diameter} kind="len" /> },
              { key: 'cd', label: 'Cd', align: 'right', width: '60px', render: (c) => <span className="font-geist-mono">{c.cd.toFixed(2)}</span> },
              { key: 'm', label: 'Packed mass', align: 'right', width: '100px', render: (c) => <ValueUnit value={c.mass} kind="mass" /> },
              { key: 'p', label: 'Packed size', align: 'right', width: '110px', render: (c) => c.packedLengthM ? <ValueUnit value={c.packedLengthM} kind="len" /> : <span style={{ color: C.dim }} title="Not entered. Excluded from clearance checks, never guessed.">not entered</span> }
            ]} />
        </div>
        <RecoveryCard />
      </div>
    </div>
  );
}
