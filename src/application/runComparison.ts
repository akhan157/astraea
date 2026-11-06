import type { RunInputs } from './runInputs';

export interface InputDifference { path: string; baseline: string; variant: string }
export interface InputDifferenceGroup {
  name: string;
  note: string;
  rows: InputDifference[];
  total: number;
  omitted: number;
}
export const MAX_INPUT_DIFFERENCES = 100;

function display(value: unknown): string {
  if (value === undefined) return 'absent (not zero or null)';
  if (Object.is(value, -0)) return '-0';
  const text = JSON.stringify(value);
  return text.length <= 512 ? text : `${text.slice(0, 512)}… [${text.length} characters; full value in exported project archive]`;
}
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Exact structural differences of validated JSON archives. No label/hash equality.
 * Array order matters; key order does not. Never consult live state or defaults.
 * Bound retained/rendered rows, while counting every omitted difference.
 */
export function archivedValueDifferences(baseline: unknown, variant: unknown): Pick<InputDifferenceGroup, 'rows' | 'total' | 'omitted'> {
  const rows: InputDifference[] = [];
  let total = 0;
  const visit = (a: unknown, b: unknown, path: string) => {
    if (Object.is(a, b)) return;
    if (Array.isArray(a) && Array.isArray(b)) {
      for (let i = 0; i < Math.max(a.length, b.length); i++) visit(a[i], b[i], `${path}[${i}]`);
    } else if (object(a) && object(b)) {
      for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
        visit(Object.hasOwn(a, key) ? a[key] : undefined, Object.hasOwn(b, key) ? b[key] : undefined, `${path}[${JSON.stringify(key)}]`);
      }
    } else {
      total++;
      if (rows.length < MAX_INPUT_DIFFERENCES) rows.push({ path: path || '$', baseline: display(a), variant: display(b) });
    }
  };
  visit(baseline, variant, '');
  return { rows, total, omitted: Math.max(0, total - rows.length) };
}

function invocation(inputs: RunInputs) {
  const { id: _motorId, ...motor } = inputs.motorRecord.motor;
  if (inputs.version === 3) {
    return { vehicle: inputs.vehicle, motor, candidateRequest: inputs.candidateRequest,
      derivation: inputs.derivation, weatherModel: inputs.weatherModel };
  }
  return { vehicle: inputs.vehicle, motor, engineOptions: inputs.engineOptions,
    finShearModulusPa: inputs.finShearModulusPa, sampler: inputs.ensemble, weatherModel: inputs.weatherModel,
    reportMomentArmHistory: inputs.reportMomentArmHistory };
}
function context(inputs: RunInputs) {
  return { launch: inputs.launch, context: inputs.context,
    motorId: inputs.motorRecord.motor.id, motorProvenance: inputs.motorRecord.provenance };
}

/** Missing original inputs remain unknown, not a comparison with today's project.
 * Model declarations and fit provenance are deliberately separate from actual
 * call values (including dragCdScale). Nothing here qualifies a prediction.
 */
export function compareRunInputs(baseline?: RunInputs, variant?: RunInputs): InputDifferenceGroup[] | null {
  if (!baseline || !variant) return null;
  const groups: Array<[string, string, unknown, unknown]> = [
    ['Archived invocation and analysis inputs', 'Values passed/captured at dispatch, including vehicle metadata. A changed field does not prove a physical effect. Geometry uses metres/kg; options with Deg are degrees, timeStep seconds, shear modulus Pa; sampler sigmas retain their named units.', invocation(baseline), invocation(variant)],
    ['Recorded model declaration', 'Archive v1 has no original declaration; legacy is implied. Metadata absence does not prove the original executable or physical accuracy.', baseline.version === 1 ? undefined : baseline.flightModel, variant.version === 1 ? undefined : variant.flightModel],
    ['Calibration artifact', 'Fit provenance is not present applicability or validation. Actual applied Cd scale is in engineOptions above. Legacy adjustment applies globally to powered and coast airframe drag.', baseline.version === 3 ? undefined : baseline.dragCalibration, variant.version === 3 ? undefined : variant.dragCalibration],
    ['Retained context and source provenance', 'Includes requested settings, mission, source labels and weather profiles. These legacy runs consume surface wind only, not the retained weather profiles. Context changes alone do not prove a changed invocation.', context(baseline), context(variant)],
  ];
  return groups.map(([name, note, a, b]) => ({ name, note, ...archivedValueDifferences(a, b) }));
}
