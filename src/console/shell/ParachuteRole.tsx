/**
 * Deployment role of the selected parachute (plan #9): a Role control
 * (Automatic by position / Drogue / Main) and one plain line saying when this
 * chute opens in a flight.
 *
 * The line is computed with the same rule the engine flies
 * (`sim/parachuteRoles.ts`, mirroring `recovery_chutes` in the engine), from
 * the whole parts list: whether a chute is the drogue can depend on the other
 * chutes, so the answer is never guessed from this chute alone. A role clash
 * the engine would refuse is shown here before a run is attempted.
 *
 * Deliberately store-free: the inspector passes the chute, the parts list, the
 * main-deploy altitude and the units, and receives the role change, so the
 * staging and undo wiring stay in the inspector.
 */
import type { ParachuteComponent, ParachuteDeployRole, RocketComponent } from '../../core/types';
import { chuteEvents, resolveRecoveryChutes } from '../../sim/parachuteRoles';
import { C } from '../kit/theme';
import { show } from '../kit/units';
import { FieldRow, InspectorSection, SelectField } from '../kit/Fields';
import type { Units } from '../../state/session';

type RoleChoice = 'auto' | ParachuteDeployRole;

const ROLE_OPTIONS: { value: RoleChoice; label: string }[] = [
  { value: 'auto', label: 'Automatic (by position)' },
  { value: 'drogue', label: 'Drogue' },
  { value: 'main', label: 'Main' },
];

export interface ParachuteRoleProps {
  chute: ParachuteComponent;
  /** The whole parts list (the drafted preview), in order. */
  components: readonly RocketComponent[];
  /** Workspace main-deploy altitude above the pad, metres. */
  mainDeployAltitudeM: number;
  units: Units;
  /** `undefined` = back to automatic (the field is removed, not stored). */
  onRoleChange: (role: ParachuteDeployRole | undefined) => void;
  changed?: boolean;
  onRevert?: () => void;
}

/** What the line under the control says: the answer, then what it means. */
export interface DeploymentStatement {
  tone: 'ok' | 'warn';
  /** When the chute opens, in plain words. */
  answer: string;
  /** Why, or what happens around it. */
  detail: string;
}

/**
 * The deployment statement for one chute. Pure, so the wording for every case
 * is testable without rendering.
 */
export function deploymentStatement(chute: ParachuteComponent, components: readonly RocketComponent[], mainDeployAltitudeM: number, units: Units): DeploymentStatement {
  const altitude = show(mainDeployAltitudeM, 'dist', units);
  const altitudeText = Number.isFinite(mainDeployAltitudeM) ? `${altitude.text} ${altitude.unit}` : 'the main-deploy altitude (not set)';
  const resolved = resolveRecoveryChutes(components);
  if (!resolved.ok) {
    const role = chute.deployRole;
    const clash = role === undefined ? undefined : components.find((c): c is ParachuteComponent => c.type === 'parachute' && c.id !== chute.id && c.deployRole === role);
    return clash !== undefined && role !== undefined
      ? { tone: 'warn', answer: `Runs are blocked: ${clash.name} is also set as the ${role}.`, detail: `A flight opens one ${role}. Set one of the two to the other role or to Automatic.` }
      : {
        tone: 'warn',
        answer: 'Runs are blocked by the parachute roles.',
        detail: resolved.clash === undefined
          ? `The roles cannot be flown: ${resolved.reason}.`
          : `${resolved.clash.chutes[0].name} and ${resolved.clash.chutes[1].name} are both set as the ${resolved.clash.role}; a flight opens one. Change one of them.`,
      };
  }
  const events = chuteEvents(chute, resolved);
  const byPosition = chute.deployRole === undefined
    ? ' Automatic: the first parachute in the parts list is the drogue, the second the main. Pick a role so reordering parts cannot swap them.'
    : '';
  if (events.length === 2) {
    return { tone: 'ok', answer: 'Opens at apogee.', detail: `It is the only parachute, so it is both drogue and main and stays open to the ground.${byPosition}` };
  }
  if (events[0] === 'drogue') {
    const main = resolved.main;
    return {
      tone: 'ok',
      answer: 'Opens at apogee.',
      detail: (main === null
        ? 'No parachute is the main, so this one stays the only canopy down to the ground.'
        : `${main.name} takes over as the main at ${altitudeText} on the way down.`) + byPosition,
    };
  }
  if (events[0] === 'main') {
    const drogue = resolved.drogue;
    return {
      tone: 'ok',
      answer: `Opens at ${altitudeText} on the way down.`,
      detail: (drogue === null
        ? 'No parachute opens at apogee: the rocket falls without a canopy until then.'
        : `${drogue.name} opens first, at apogee.`) + ' The altitude is the main-deploy altitude set in Flight.' + byPosition,
    };
  }
  const named = [resolved.drogue && `${resolved.drogue.name} is the drogue`, resolved.main && `${resolved.main.name} is the main`].filter(Boolean).join(' and ');
  return { tone: 'warn', answer: 'Not opened in flights.', detail: `${named}; a flight opens one of each. Give this chute a role to use it instead.` };
}

export function ParachuteRole({ chute, components, mainDeployAltitudeM, units, onRoleChange, changed, onRevert }: ParachuteRoleProps) {
  const statement = deploymentStatement(chute, components, mainDeployAltitudeM, units);
  return (
    <InspectorSection title="Deployment">
      <FieldRow label="Role" changed={changed} onRevert={onRevert} hint="Drogue opens at apogee; Main opens at the main-deploy altitude. Automatic picks by position in the parts list.">
        <SelectField
          value={chute.deployRole ?? 'auto'}
          width={200}
          ariaLabel="Parachute role"
          options={ROLE_OPTIONS}
          onChange={(v) => onRoleChange(v === 'auto' ? undefined : (v as ParachuteDeployRole))}
        />
      </FieldRow>
      <p role="status" data-parachute-opens="" className="mt-1.5 text-[12.5px]" style={{ color: statement.tone === 'warn' ? C.warn : C.fg }}>{statement.answer}</p>
      <p className="mt-0.5 text-[11.5px]" style={{ color: C.muted }}>{statement.detail}</p>
      <p className="mt-1.5 text-[11px]" style={{ color: C.dim }}>
        Idealized: the chute opens fully and instantly at the event. The motor&apos;s ejection delay and the canopy&apos;s inflation are not modeled.
      </p>
    </InspectorSection>
  );
}
