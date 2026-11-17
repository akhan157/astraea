// Shared manifest boundary for the B1 probes. TESTS/PROBE ONLY.
//
// The cohort manifest is external JSON with a frozen hash and a shape established by
// earlier lanes. This module checks the fields the probes consume (slug, options object,
// vehicle object with components and a kelvin launch site), then asserts the named type.
// It does not validate every vehicle component; the engine rejects malformed vehicles.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { flightRunOptions } from '../../../../src/application/caseResolver';
import type { RocketVehicle } from '../../../../src/core/types';

export const MANIFEST_PATH = '/home/ak/astraea-evidence/R40-published-cohort/cohort_manifest.json';
export const MANIFEST_SHA256 = '3bd280773404b406439dd4684ad0d5a7f484a8fd7e9f61aaf237b2afd1fe54f5';

/** A manifest entry as the engine DTO carries it: launchSite is in kelvin, not the app's °C. */
export interface CohortEntry {
  slug: string;
  vehicle: RocketVehicle & { launchSite: { altitudeM: number; temperatureK: number } };
  motor: unknown;
  options: object;
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Check the fields the probes use. The remaining vehicle tree is the engine's contract. */
function readEntry(value: unknown, index: number): CohortEntry {
  if (typeof value !== 'object' || value === null) throw new Error(`manifest entry ${index} is not an object`);
  if (!('slug' in value) || typeof value.slug !== 'string') throw new Error(`manifest entry ${index} has no string slug`);
  if (!('options' in value) || typeof value.options !== 'object' || value.options === null || Array.isArray(value.options)) {
    throw new Error(`manifest entry ${value.slug} has no options object`);
  }
  if (!('motor' in value)) throw new Error(`manifest entry ${value.slug} has no motor`);
  if (!('vehicle' in value) || typeof value.vehicle !== 'object' || value.vehicle === null) {
    throw new Error(`manifest entry ${value.slug} has no vehicle object`);
  }
  const vehicle = value.vehicle;
  if (!('components' in vehicle) || !Array.isArray(vehicle.components)) {
    throw new Error(`manifest entry ${value.slug} has no components array`);
  }
  if (!('launchSite' in vehicle) || typeof vehicle.launchSite !== 'object' || vehicle.launchSite === null) {
    throw new Error(`manifest entry ${value.slug} has no launchSite object`);
  }
  const site = vehicle.launchSite;
  if (!('altitudeM' in site) || typeof site.altitudeM !== 'number') {
    throw new Error(`manifest entry ${value.slug} launchSite lacks numeric altitudeM`);
  }
  if (!('temperatureK' in site) || typeof site.temperatureK !== 'number') {
    throw new Error(`manifest entry ${value.slug} launchSite lacks numeric temperatureK`);
  }
  // Used fields validated above; the component tree is passed through to the engine as declared.
  const entry = value as CohortEntry;
  return entry;
}

export function loadCohort(): { entries: CohortEntry[]; sha256: string } {
  const bytes = readFileSync(MANIFEST_PATH);
  const digest = sha256(bytes);
  if (digest !== MANIFEST_SHA256) throw new Error(`manifest sha256 ${digest} does not match the frozen ${MANIFEST_SHA256}`);
  const parsed: unknown = JSON.parse(bytes.toString());
  if (typeof parsed !== 'object' || parsed === null || !('entries' in parsed) || !Array.isArray(parsed.entries)) {
    throw new Error('manifest has no entries array');
  }
  const entries = parsed.entries.map(readEntry);
  return { entries, sha256: digest };
}

/**
 * Amendment 4 adapter: the manifest engine DTO as the app holds it.
 * temperatureC = temperatureK - 273.15; every other field is copied as declared.
 */
function adaptCohortVehicle(e: CohortEntry): RocketVehicle {
  const vehicle: RocketVehicle = structuredClone(e.vehicle);
  const site = e.vehicle.launchSite;
  vehicle.launchSite = { altitudeM: site.altitudeM, temperatureC: site.temperatureK - 273.15 };
  return vehicle;
}

/** Candidate-default options exactly as K3's cohort-default.probe.ts builds them. */
export function candidateDefaultOptions(e: CohortEntry): Record<string, unknown> {
  return { ...e.options, ...flightRunOptions(adaptCohortVehicle(e)) };
}
