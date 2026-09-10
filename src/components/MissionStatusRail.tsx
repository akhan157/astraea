/**
 * Mission Status Rail (spec §1.4, plan §6.3).
 *
 * One persistent row in the App shell aggregating "what does the current
 * vehicle believe": configuration validity · stability · motor · sim
 * freshness · weather age · active run state. It COMPOSES the existing
 * badges (MetricHUD stability semantics, TrajectoryStudio FRESH/STALE,
 * sounding offline state) and replaces none. Unknown/not-evaluated/out-of-
 * domain states render as such, never as zero or green (spec §1.4).
 *
 * Sources (all store-backed, unit-testable):
 *  - validity: aggregateVehicleMass() throws/returns NaN for malformed
 *    geometry (fail-closed, not "valid" by silence).
 *  - stability: computeRocketStability margin + isStable/isOverStable.
 *  - motor: shared selectedMotorId resolves into CERTIFIED_MOTORS/custom.
 *  - sim freshness: lastSimRun (Q5) — absent, or stale on vehicle/motor
 *    drift, or fresh with apogee.
 *  - weather age: soundingSummary digest written by TrajectoryStudio.
 *  - run state: activeRun (sim in-flight or Monte Carlo ensemble %).
 */

import React, { useMemo, type ComponentType } from 'react';
import { useRocketStore } from '../store/rocketStore';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import { aggregateVehicleMass } from '../core/mass';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  CloudSun,
  Play,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  Timer,
  X,
} from 'lucide-react';

function ageLabel(fetchedAt: number | null, now: number): string {
  if (fetchedAt === null) return 'No sounding';
  const minutes = Math.floor((now - fetchedAt) / 60000);
  if (minutes < 1) return 'Sounding <1 min ago';
  if (minutes < 60) return `Sounding ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `Sounding ${hours} h ago`;
}

function RailBadge(props: {
  icon: ComponentType<{ className?: string }>;
  tone: string;
  label: string;
}): React.JSX.Element {
  const Icon = props.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-mono text-[10px] font-semibold ${props.tone}`}
      title={props.label}
    >
      <Icon className="w-3 h-3" />
      {props.label}
    </span>
  );
}

export function MissionStatusRail(): React.JSX.Element {
  const vehicle = useRocketStore((s) => s.vehicle);
  const stability = useRocketStore((s) => s.stability);
  const selectedMotorId = useRocketStore((s) => s.selectedMotorId);
  const customMotors = useRocketStore((s) => s.customMotors);
  const lastSimRun = useRocketStore((s) => s.lastSimRun);
  const activeRun = useRocketStore((s) => s.activeRun);
  const soundingSummary = useRocketStore((s) => s.soundingSummary);
  // Re-render the age label as time passes while a run is active; otherwise
  // Date.now() is captured per mission-state change, never per paint.
  const now = useMemo(() => Date.now(), [lastSimRun?.recordedAt, activeRun?.progress]);

  const massInfo = useMemo(() => {
    try {
      const mass = aggregateVehicleMass(vehicle);
      return { ok: true, totalMass: mass.totalMass };
    } catch {
      return { ok: false, totalMass: Number.NaN };
    }
  }, [vehicle]);

  const margin = stability.staticMarginCalibers;
  const stabilityBadge: { label: string; tone: string; icon: ComponentType<{ className?: string }> } =
    !Number.isFinite(margin)
      ? { label: 'Stability unknown', tone: 'text-zinc-400 bg-zinc-800 border-zinc-700', icon: AlertTriangle }
      : margin < 0.5
        ? { label: `Unstable · ${margin.toFixed(2)} cal`, tone: 'text-rose-300 bg-rose-500/10 border-rose-500/40', icon: ShieldAlert }
        : margin < 1.0
          ? { label: `Marginal · ${margin.toFixed(2)} cal`, tone: 'text-amber-300 bg-amber-500/10 border-amber-500/40', icon: ShieldAlert }
          : stability.isOverStable
            ? { label: `Over-stable · ${margin.toFixed(2)} cal`, tone: 'text-amber-300 bg-amber-500/10 border-amber-500/40', icon: ShieldAlert }
            : { label: `Stable · ${margin.toFixed(2)} cal`, tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/40', icon: ShieldCheck };

  const selectedMotor = customMotors[selectedMotorId] ?? CERTIFIED_MOTORS[selectedMotorId];

  const simFresh = lastSimRun !== null && lastSimRun.vehicleId === vehicle.id && lastSimRun.motorId === selectedMotorId;
  const simBadge = !lastSimRun
    ? { label: 'Sim not run', tone: 'text-zinc-400 bg-zinc-800 border-zinc-700', icon: Timer }
    : simFresh
      ? {
          label: `Sim fresh · apogee ${lastSimRun.apogeeAltitude.toFixed(0)} m`,
          tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/40',
          icon: CheckCircle2,
        }
      : { label: 'Sim stale', tone: 'text-amber-300 bg-amber-500/10 border-amber-500/40', icon: AlertTriangle };

  const weatherBadge: { label: string; tone: string; icon: ComponentType<{ className?: string }> } =
    soundingSummary.status === 'error'
      ? { label: 'Weather offline', tone: 'text-rose-300 bg-rose-500/10 border-rose-500/40', icon: CloudOff }
      : soundingSummary.status === 'ok'
        ? {
            label: ageLabel(soundingSummary.fetchedAt, now),
            tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/40',
            icon: CloudSun,
          }
        : soundingSummary.status === 'loading'
          ? { label: 'Fetching sounding', tone: 'text-amber-300 bg-amber-500/10 border-amber-500/40', icon: CloudOff }
          : { label: 'Weather unset', tone: 'text-zinc-400 bg-zinc-800 border-zinc-700', icon: CloudOff };

  const runBadge = activeRun
    ? {
        label: `${activeRun.label}${Number.isFinite(activeRun.progress) ? ` ${Math.round(activeRun.progress * 100)}%` : ''}`,
        tone: 'text-violet-300 bg-violet-500/10 border-violet-500/40',
        icon: Play,
      }
    : { label: 'No run active', tone: 'text-zinc-400 bg-zinc-800 border-zinc-700', icon: Activity };

  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1 bg-zinc-900/90 border-b border-zinc-800 overflow-x-auto whitespace-nowrap min-h-9"
      role="region"
      aria-label="Mission status rail"
    >
      {massInfo.ok ? (
        <RailBadge icon={CheckCircle2} tone="text-emerald-400 bg-emerald-500/10 border-emerald-500/40" label={`Valid · ${massInfo.totalMass.toFixed(2)} kg`} />
      ) : (
        <RailBadge icon={X} tone="text-rose-300 bg-rose-500/10 border-rose-500/40" label="Invalid configuration" />
      )}
      <RailBadge icon={stabilityBadge.icon} tone={stabilityBadge.tone} label={stabilityBadge.label} />
      {selectedMotor ? (
        <RailBadge icon={Rocket} tone="text-cyan-300 bg-cyan-500/10 border-cyan-500/30" label={`Motor ${selectedMotor.designation}`} />
      ) : (
        <RailBadge icon={Rocket} tone="text-zinc-400 bg-zinc-800 border-zinc-700" label="Motor not evaluated" />
      )}
      <RailBadge icon={simBadge.icon} tone={simBadge.tone} label={simBadge.label} />
      <RailBadge icon={weatherBadge.icon} tone={weatherBadge.tone} label={weatherBadge.label} />
      <RailBadge icon={runBadge.icon} tone={runBadge.tone} label={runBadge.label} />
    </div>
  );
}