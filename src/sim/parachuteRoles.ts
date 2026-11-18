/**
 * Which parachute opens at which deployment event: the TypeScript mirror of the
 * engine's `recovery_chutes` (crates/astraea-engine/src/models.rs). The legacy
 * simulator, the oracle's vehicle preparation and the inspector all read this
 * one rule, so a chute's displayed role is the role the engine flies.
 *
 * No chute declares a role: the long-standing list-order rule: the first
 * parachute is the drogue, the second the main, and a single parachute serves
 * as both. A declared `deployRole` wins over position; a slot nobody declares
 * is filled from the chutes without a role, in list order, drogue slot first. A
 * declared main is never also flown as the drogue (and vice versa): its role
 * says when it opens. Two chutes declaring the same role, or an unknown role,
 * are refused, exactly as the engine refuses them.
 */
import type { ParachuteComponent, ParachuteDeployRole, RocketComponent } from '../core/types';

export interface RecoveryChutes {
  /** Opens at apogee; null when no chute takes the drogue slot. */
  drogue: ParachuteComponent | null;
  /** Opens at the main-deploy altitude; null when no chute takes the main slot. */
  main: ParachuteComponent | null;
}

export type RecoveryChutesResult =
  | ({ ok: true } & RecoveryChutes)
  /** `reason` is the engine's wording; `clash` names the two chutes when they share a role. */
  | { ok: false; reason: string; clash?: { role: ParachuteDeployRole; chutes: [ParachuteComponent, ParachuteComponent] } };

const ROLES: readonly ParachuteDeployRole[] = ['drogue', 'main'];

/** The drogue and main a flight of these components deploys, or why it cannot choose. */
export function resolveRecoveryChutes(components: readonly RocketComponent[]): RecoveryChutesResult {
  const chutes = components.filter((c): c is ParachuteComponent => c.type === 'parachute');
  const declared: Record<ParachuteDeployRole, ParachuteComponent | null> = { drogue: null, main: null };
  const automatic: ParachuteComponent[] = [];
  for (const chute of chutes) {
    const role: unknown = chute.deployRole;
    if (role === undefined) { automatic.push(chute); continue; }
    if (!ROLES.includes(role as ParachuteDeployRole)) {
      return { ok: false, reason: `parachute '${chute.id}': deployRole '${String(role)}' is not 'drogue' or 'main'` };
    }
    const slot = role as ParachuteDeployRole;
    const previous = declared[slot];
    if (previous !== null) {
      return {
        ok: false,
        reason: `parachutes '${previous.id}' and '${chute.id}' are both set as the ${slot}; a flight opens one ${slot} -- set one of them to the other role or to automatic`,
        clash: { role: slot, chutes: [previous, chute] },
      };
    }
    declared[slot] = chute;
  }
  const pool = automatic[Symbol.iterator]();
  const next = (): ParachuteComponent | null => pool.next().value ?? null;
  const { drogue, main } = declared;
  if (drogue === null && main === null) {
    const first = next();
    const second = next();
    return { ok: true, drogue: first, main: second ?? first };
  }
  if (drogue === null) return { ok: true, drogue: next(), main };
  if (main === null) return { ok: true, drogue, main: next() };
  return { ok: true, drogue, main };
}

/** As `resolveRecoveryChutes`, throwing the refusal (the simulators fail closed). */
export function recoveryChutes(components: readonly RocketComponent[], label = 'prepareVehicle'): RecoveryChutes {
  const resolved = resolveRecoveryChutes(components);
  if (!resolved.ok) throw new Error(`${label}: ${resolved.reason}`);
  return { drogue: resolved.drogue, main: resolved.main };
}

/** The deployment events a chute opens at under the resolved roles (empty: it is not flown). */
export function chuteEvents(chute: Pick<ParachuteComponent, 'id'>, chutes: RecoveryChutes): ParachuteDeployRole[] {
  const events: ParachuteDeployRole[] = [];
  if (chutes.drogue?.id === chute.id) events.push('drogue');
  if (chutes.main?.id === chute.id) events.push('main');
  return events;
}
