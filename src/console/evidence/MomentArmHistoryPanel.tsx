import { useEffect, useState } from 'react';
import type { MomentArmHistory, MomentArmPoint } from '../../application/momentArmHistory';
import { describeEngineIdentity, type EngineIdentity } from '../../engine/identity';
import { C } from '../kit/theme';
import { Range } from '../kit/Controls';
import { Disclosure } from '../kit/Disclosure';

const display = (v: number) => v.toPrecision(8);
/** Raw retained data only. No live geometry, coefficient API, or result rerun. */
export function MomentArmHistoryPanel({ history, engineIdentity, inputKey, stale = false, historical = false,
  label = 'Sampled flight-model history' }: {
  history?: MomentArmHistory; engineIdentity?: EngineIdentity; inputKey?: string;
  stale?: boolean; historical?: boolean; label?: string;
}) {
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [history]);
  if (!history) return <section aria-label={label} className="p-3 text-[12px]">
    <h3>Flight-model history unavailable</h3><p>History unavailable — not recorded for this run. Complete a new flight to record it; opening this view does not rerun a result.</p>
  </section>;
  const point = history.points[Math.min(index, history.points.length - 1)];
  const normal = point.normal;
  const values: [string, string][] = [
    ['Time since ignition', `${display(point.timeS)} s`], ['Modeled mass', `${display(point.massKg)} kg`],
    ['CG from nose', `${display(point.cgFromNoseM)} m`], ['Mach', display(point.mach)],
    ['Actual incidence', `${display(point.incidenceDeg)}°`], ['Dynamic pressure', `${display(point.dynamicPressurePa)} Pa`],
    ['Computational domain', `${point.domain} — not accuracy qualification`],
    ['State flags', `Rail bound: ${point.railBound}; canopy active: ${point.recovery}; before declared burnout: ${point.powered}`],
    ['Normal CP from nose', normal ? `${display(normal.cpFromNoseM)} m` : 'N/A — live canopy'],
    ['Normal arm (CP − CG)', normal ? `${display(normal.armM)} m · ${display(normal.armCalibers)} cal · ${display(normal.armPercentLength)}% length` : 'N/A — live canopy'],
    ['Normal slope C', normal ? `${display(normal.cPerRad)} /rad` : 'N/A — live canopy'],
    ['Nose first moment J', normal ? `${display(normal.jMPerRad)} m/rad` : 'N/A — live canopy'],
    ['C-weighted arm J − C·CG', normal ? `${display(normal.cnaWeightedArmMPerRad)} m/rad` : 'N/A — live canopy'],
  ];
  return <section aria-label={label} data-moment-arm-history className="space-y-2 p-3 text-[11.5px]">
    <h3 className="text-[13px] font-medium">Sampled flight-model normal moment arm</h3>
    {(stale || historical) && <p role={historical ? undefined : 'status'} style={{color:C.changed}}>{historical ? 'Historical record — not a fresh simulation.' : 'Stale result — inputs changed; these samples still belong to the recorded run.'}</p>}
    <p>Modeled, not measured. These are the flight model’s recorded states with motor depletion, not geometry-only stability. No dynamic-stability, continuous-minimum or competition assessment.</p>
    <p data-history-sampling>{history.sampleCount} raw committed-macro samples · {display(history.timeRangeS[0])}–{display(history.timeRangeS[1])} s · maximum observed gap {display(history.maxGapS)} s.</p>
    <p>Declared motor burn time: {display(history.burnoutTimeS)} s; last sample is {display(history.lastSampleToBurnoutS)} s before that time. {history.exactBurnoutSampleExists ? 'An exact timestamp sample exists; this is not an independently observed burnout.' : 'No exact burnout sample. The nearest sample is not relabeled as burnout.'}</p>
    <HistoryPlot history={history} quantity="station" selected={point} />
    <HistoryPlot history={history} quantity="arm" selected={point} />
    <p style={{color:C.dim}}>Lines only connect recorded samples as visual guides; no interior states are evaluated. Airframe CP and arm paths break where a live canopy makes them not applicable.</p>
    <label className="flex items-center gap-2">Recorded point {Math.min(index,history.points.length-1)+1} of {history.points.length}
      <Range ariaLabel="Recorded history point" min={0} max={history.points.length-1} step={1} value={Math.min(index,history.points.length-1)}
        onChange={setIndex} className="min-w-24 flex-1" />
    </label>
    <dl data-history-selected-time={point.timeS} className="grid grid-cols-[minmax(130px,1fr)_2fr] gap-x-3 gap-y-1">
      {values.map(([name,value])=><div key={name} className="contents"><dt style={{color:C.muted}}>{name}</dt><dd className="font-geist-mono">{value}</dd></div>)}
    </dl>
    <Disclosure summary="Recorded model, units and moment definitions">
      <div className="space-y-1 break-words pt-2">
        <p>Model: <code>{history.modelId}</code> · mechanics: <code>{history.mechanicalModelId}</code>. Declared inputs and primitive mechanics, not measured inertia.</p>
        <p>Recorded engine: {describeEngineIdentity(engineIdentity)}. Model IDs are contract labels, not executable checksums or accuracy evidence.</p>
        <p>Original input key: {inputKey ?? 'not recorded'} (freshness key, not a cryptographic checksum).</p>
        <p>Reference: {display(history.referenceLengthM)} m length, {display(history.referenceDiameterM)} m diameter, {display(history.referenceAreaM2)} m² area. Stations are meters aft of nose. Body is right-handed, +Y noseward; x/y/z rates are pitch/roll/yaw. Moments act about instantaneous combined CG.</p>
        <p>C-weighted arm = J − C·CG (m/rad). Positive means normal CP aft of CG in this positive-C legacy model. It is not dM/dα; q·S, wind-axis drag and rates are excluded. CP existence is not a stability verdict.</p>
        <p>Model static moment x/z includes the wind-axis-drag-coupled arm; y is fin-cant roll torque. Damping is the existing dimensional rate model, not rate-qualified. Incidence is actual air-relative incidence, not envelope-clamped incidence.</p>
        <p>Selected aero body force (N): {JSON.stringify(point.aeroForceBodyN)}. Static moment (N·m): {JSON.stringify(point.staticMomentBodyNm)}. Rate moment (N·m): {JSON.stringify(point.dampingMomentBodyNm)}. Total moment (N·m): {JSON.stringify(point.totalMomentBodyNm)}.</p>
        <p>Airframe quantities are N/A under a live canopy; the original source-domain refusal still applies. Full unrounded values are retained in the project and export trace. Physical accuracy for collegiate stability decisions remains unestablished.</p>
      </div>
    </Disclosure>
  </section>;
}

function HistoryPlot({history,quantity,selected}:{history:MomentArmHistory;quantity:'station'|'arm';selected:MomentArmPoint}) {
  const width=720, height=142, left=62, right=18, top=18, bottom=26;
  const channels: {name:string; color:string; value:(p:MomentArmPoint)=>number|null}[] = quantity==='station'
    ? [{name:'CG',color:C.s1,value:p=>p.cgFromNoseM},{name:'Normal CP',color:C.s2,value:p=>p.normal?.cpFromNoseM??null}]
    : [{name:'Normal arm',color:C.s3,value:p=>p.normal?.armCalibers??null}];
  const values=channels.flatMap(c=>history.points.flatMap(p=>{const v=c.value(p);return v===null?[]:[v];}));
  if (values.length === 0) return <p>Normal arm N/A — live canopy; no airframe values to plot.</p>;
  const lo=Math.min(0,...values), hi=Math.max(0,...values);
  const span=hi-lo||1;
  const x=(t:number)=>left+t/history.burnoutTimeS*(width-left-right);
  const y=(v:number)=>top+(hi-v)/span*(height-top-bottom);
  const path=(value:(p:MomentArmPoint)=>number|null)=>{
    let connected=false;
    return history.points.map(p=>{const v=value(p);if(v===null){connected=false;return '';}
      const segment=`${connected?'L':'M'}${x(p.timeS)},${y(v)}`;connected=true;return segment;}).join(' ');
  };
  const unit=quantity==='station'?'m aft of nose':'cal';
  return <svg role="img" aria-label={quantity==='station'?'Recorded CG and normal CP stations (meters)':'Recorded normal moment arm (calibers)'} viewBox={`0 0 ${width} ${height}`} className="w-full min-w-64">
    <path d={`M${left},${top}V${height-bottom}H${width-right}`} fill="none" stroke={C.line} />
    {[lo,hi].map((v,i)=><text key={i} x={left-5} y={y(v)+3} textAnchor="end" fill={C.dim} fontSize={9}>{v.toPrecision(3)}</text>)}
    <text x={left} y={12} fill={C.muted} fontSize={9}>{unit}</text>
    <text x={left} y={height-8} fill={C.dim} fontSize={9}>0 s</text>
    <text x={width-right} y={height-8} textAnchor="end" fill={C.dim} fontSize={9}>{display(history.burnoutTimeS)} s declared motor burn time</text>
    {channels.map((c,i)=><g key={c.name}><path d={path(c.value)} fill="none" stroke={c.color} strokeWidth={1.5} />
      {c.value(selected)!==null && <circle cx={x(selected.timeS)} cy={y(c.value(selected)!)} r={3} fill={c.color} />}
      <text x={left+90+i*110} y={12} fill={c.color} fontSize={10}>{c.name}</text></g>)}
  </svg>;
}
