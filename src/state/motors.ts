/**
 * Motor record policy shared by every import path (file, ThrustCurve, derived).
 *
 * Pure functions over the project's motor records so the policy is testable
 * without a store:
 *  - ids are normalized (`normalizeMotorId`; blank falls back to
 *    `imported_motor`);
 *  - stored motors are copies, never aliases of the caller's object;
 *  - an import whose normalized id is taken by a DIFFERENT designation is
 *    suffixed `_2`, `_3`, ... so an existing record is never silently
 *    overwritten, and a certified record is never shadowed;
 *  - re-importing the same designation anywhere in that id family replaces it
 *    in place (idempotent), so `key_2` never leaks a `key_3`.
 */
import type { MotorRecord } from '../formats/projectJson';
import type { MotorSpec } from '../propulsion/motorDatabase';
import { CERTIFIED_MOTORS, normalizeMotorId } from '../propulsion/motorDatabase';

/** A copy of a motor that shares no mutable state with the caller's object. */
export function copyMotor(motor: MotorSpec): MotorSpec {
  return { ...motor, thrustCurve: motor.thrustCurve.map((p) => ({ ...p })) };
}

/**
 * The id an imported motor lands on given the records already in the
 * project. Certified ids are always taken (never replaced or shadowed).
 */
export function importMotorKey(motor: MotorSpec, records: ReadonlyArray<MotorRecord>): string {
  const byId = new Map<string, MotorRecord>();
  for (const rec of records) byId.set(normalizeMotorId(rec.id), rec);
  const base = normalizeMotorId(motor.id);
  const taken = (id: string): boolean => byId.has(id) || CERTIFIED_MOTORS[id] !== undefined;
  if (!taken(base)) return base;
  // Scan the family the allocator could have minted for the same designation.
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}_${n}`;
    if (!taken(candidate)) break;
    const rec = byId.get(candidate);
    if (rec !== undefined && rec.provenance.source !== 'certified' && rec.motor.designation === motor.designation) {
      return candidate;
    }
  }
  let n = 2;
  while (taken(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

/** Records keyed by normalized id; `overlay` wins over `base` (the store's resolution order). */
export function mergeMotorRecords(
  base: ReadonlyArray<MotorRecord>,
  overlay: Readonly<Record<string, MotorRecord>>,
): MotorRecord[] {
  const out = new Map<string, MotorRecord>();
  for (const rec of base) out.set(normalizeMotorId(rec.id), rec);
  for (const [id, rec] of Object.entries(overlay)) out.set(normalizeMotorId(id), rec);
  return [...out.values()];
}
