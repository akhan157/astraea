import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { useSessionStore } from '../../state/session';
import type { FlightRun } from '../data/contract';
import { useWS } from '../store';
import { Viewport } from '../viewport/Viewport';
import { EventStrip, TimeStack, type Pane } from '../kit/Charts';
import { ValueUnit } from '../kit/Value';
import { C } from '../kit/theme';
import { Checkbox, Range } from '../kit/Controls';

function nearestSample(times: number[], t: number): number {
  let low = 0;
  let high = times.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >>> 1;
    if (times[mid] < t) low = mid;
    else high = mid;
  }
  return Math.abs(times[low] - t) <= Math.abs(times[high] - t) ? low : high;
}

export function FlightPose({ run }: { run: FlightRun }) {
  const s = useWS();
  const [playing, setPlaying] = useState(false);
  const [full, setFull] = useState(false);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const frame = useRef<HTMLDivElement | null>(null);
  const times = run.series.t;
  const end = full ? times[times.length - 1] ?? 0 : Math.min(times[times.length - 1] ?? 0, run.summary.apogeeTime.value * 1.08);
  const set = s.set;
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => { if (el.clientWidth > 0) setViewport({ w: el.clientWidth, h: el.clientHeight }); };
    measure();
    // jsdom and older browsers may not expose ResizeObserver; a window resize
    // listener still keeps the compact/wide decision correct.
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!playing || times.length === 0) return;
    let raf = 0;
    let last = performance.now();
    const advance = (now: number) => {
      const state = useSessionStore.getState();
      const t = Math.min(end, (state.scrubT ?? 0) + (now - last) / 1000 * (full ? 4 : 1));
      last = now;
      set({ scrubT: t });
      if (t >= end) setPlaying(false);
      else raf = requestAnimationFrame(advance);
    };
    raf = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(raf);
  }, [playing, end, full, set, times]);
  const i = times.length ? nearestSample(times, s.scrubT ?? 0) : 0;
  const point = run.telemetry[i];
  const design = s.committed!.design;
  const railExitT = run.events.find((e) => e.kind === 'rail_exit')?.t;
  // Angle of attack is not meaningful while the vehicle is still constrained
  // by the rail (or, without a recorded rail exit, at low airspeed). This is a
  // display decision only; the sampled value is untouched.
  const aoaNote = point === undefined ? null
    : railExitT !== undefined
      ? (point.time < railExitT ? 'on rail' : null)
      : (point.speed < 5 ? 'low speed' : null);
  const aoaTitle = railExitT !== undefined
    ? 'Angle of attack is not displayed before rail exit in this run.'
    : 'Angle of attack is not displayed below 5 m/s airspeed on a run without a rail-exit event.';
  const aoaReadout = point && (aoaNote
    ? <span title={aoaTitle}><span style={{ color: C.dim }}>—</span> <span className="text-[10px]" style={{ color: C.dim }}>{aoaNote}</span></span>
    : <ValueUnit value={point.angleOfAttackDeg} kind="angle" />);
  // The floating card needs a wide, tall canvas: on the 636 px canvas a
  // 1280-wide window gives, the widest tilted pose reaches under the card and
  // the fit does not re-run on a pose change, so the pose could slide behind it.
  // A full-width strip cuts a clean horizontal band out of the region instead
  // and keeps every value on one visible line.
  const compactReadout = viewport.w > 0 && (viewport.w < 700 || viewport.h < 420);
  const scrubber = <label className="flex min-w-0 items-center gap-3 text-[11px]">Flight scrubber<Range ariaLabel="Flight scrubber" className="flex-1" min={0} max={end} step="0.01" value={Math.min(s.scrubT ?? 0, end)} onChange={(t) => set({ scrubT: t })} /></label>;
  return <div ref={frame} className="relative h-full min-h-0">
    <Viewport vehicle={design.vehicle} aeroModel={design.aeroModel} motor={design.motors?.[design.motorId]} attitude={point?.q} look={{}} showGhost={false} toolbar={<>
      <button className="inline-flex items-center gap-1 rounded px-2 py-1" style={{ background: C.panel, border: `1px solid ${C.line}` }} disabled={!point} onClick={() => {
        if (!playing && (s.scrubT ?? 0) >= end) set({ scrubT: 0 });
        setPlaying(!playing);
      }}>{playing ? <Pause size={12} /> : <Play size={12} />}{playing ? 'Pause' : 'Play'}</button>
      <Checkbox checked={full} onChange={setFull} className="text-[11px]">Full flight</Checkbox>
    </>} />
    {point ? (compactReadout ? (
      // Short or narrow canvas: the readout shares the bottom band with the
      // scrubber it describes, so the canvas loses one band instead of two.
      // It stays a full-width strip, which is what keeps the widest tilted
      // pose clear of the chrome (the camera does not refit on a pose change).
      <div className="absolute right-3 bottom-2 left-3 flex flex-col gap-1">
        <div role="group" aria-label="Flight pose readout"
          className="thin-scroll flex items-center gap-3 overflow-x-auto whitespace-nowrap rounded px-2.5 py-0.5 text-[11px] leading-tight"
          style={{ background: C.panel, border: `1px solid ${C.line}` }} title="Pose from the native body-to-navigation quaternion.">
          <span className="font-geist-mono" style={{ color: C.fg }}>T+{point.time.toFixed(2)} s</span>
          <span>Alt <ValueUnit value={point.altitude} kind="dist" /></span>
          <span>Airspeed <ValueUnit value={point.speed} kind="speed" /></span>
          <span>Mach <ValueUnit value={point.mach} kind="mach" /></span>
          <span>AoA {aoaReadout}</span>
          <span>q <ValueUnit value={point.dynamicPressure} kind="press" /></span>
        </div>
        {scrubber}
      </div>
    ) : <div role="group" aria-label="Flight pose readout" className="absolute top-12 right-3 w-52 space-y-1 overflow-y-auto rounded p-3 text-[12px]"
      style={{ background: C.panel, border: `1px solid ${C.line}`, maxHeight: 'calc(100% - 5.5rem)' }}>
      <p className="font-geist-mono text-[15px]">T+{point.time.toFixed(2)} s</p>
      <div>Altitude <ValueUnit value={point.altitude} kind="dist" /></div>
      <div>Airspeed <ValueUnit value={point.speed} kind="speed" /></div>
      <div>Mach <ValueUnit value={point.mach} kind="mach" /></div>
      <div>AoA {aoaReadout}</div>
      <div>Dynamic pressure <ValueUnit value={point.dynamicPressure} kind="press" /></div>
      <p className="text-[10.5px]" style={{ color: C.dim }}>Pose from the native body-to-navigation quaternion.</p>
    </div>) : <p className="absolute bottom-3 left-3" role="status">No telemetry in this run.</p>}
    {point && !compactReadout && <label className="absolute right-3 bottom-3 left-3 flex items-center gap-3 text-[11px]">Flight scrubber<Range ariaLabel="Flight scrubber" className="flex-1" min={0} max={end} step="0.01" value={Math.min(s.scrubT ?? 0, end)} onChange={(t) => set({ scrubT: t })} /></label>}
  </div>;
}

export function FlightTimeline({ run, descent = false }: { run: FlightRun; descent?: boolean }) {
  const cursor = useSessionStore((s) => s.scrubT);
  const set = useSessionStore((s) => s.setConsole);
  const panes = useMemo<Pane[]>(() => {
    const channels = run.series.channels;
    return [
      { id: 'altitude', label: 'Altitude', kind: 'dist', values: channels.altitude.value, color: C.s1 },
      { id: 'speed', label: 'Airspeed', kind: 'speed', values: channels.airspeed.value, color: C.s1 },
      ...descent ? [] : [
        { id: 'mach', label: 'Mach', kind: 'mach' as const, values: channels.mach.value, color: C.s1 },
        { id: 'aoa', label: 'Angle of attack', kind: 'angle' as const, values: channels.aoa.value, color: C.s3 },
        { id: 'pressure', label: 'Dynamic pressure', kind: 'press' as const, values: channels.q.value, color: C.s2 },
      ],
    ];
  }, [run, descent]);
  if (run.series.t.length === 0) return <p role="status" className="p-4">This run carries no display samples; rerun in the native app.</p>;
  const end = run.series.t[run.series.t.length - 1];
  return <div className="p-2">
    <EventStrip events={run.events} tMax={end} cursor={cursor} onPick={(t) => set({ scrubT: t })} width={680} />
    <TimeStack t={run.series.t} panes={panes} events={run.events} cursor={cursor} onCursor={(t) => set({ scrubT: t })} tMax={end} paneHeight={64} highlight={[0, run.events.find((e) => e.kind === 'burnout')?.t ?? 0]} />
    <p className="px-3 text-[11px]" style={{ color: C.dim }}>Bounded native display samples. Max-Q is the sampled dynamic-pressure peak. Click, drag or use arrow keys to scrub.</p>
  </div>;
}
