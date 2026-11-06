/**
 * "Share this flight": one .zip a beta user can send so the flight can be used
 * to validate Astraea.
 *
 *   README.txt                  what is inside and how to submit it
 *   flight-info.json            what the user told us about the flight, and their consent
 *   flight-log/<name>           the imported log, byte for byte
 *   flight-log/provenance.json  file name, SHA-256 of those bytes, dialect, units
 *   <vehicle>.astraea.json      the project (vehicle, mission, site, motors)
 *   motor/<designation>.eng     the motor's thrust curve
 *
 * Validation fails without the flown mass, so the form requires it and the
 * bundle refuses to build without it. The pure checks live here; the card in
 * the Verify stage only collects the values.
 */
import { exportMotorFile } from './files';
import { DATA_REQUEST_URL, FLIGHT_ISSUE_URL } from '../lib/links';
import { zipFiles } from './bundle';
import { readProject, writeProject, type ProjectEnvelope } from '../formats/projectJson';
import { slugify } from '../formats/exportPreview';
import { sha256HexOfBytes, UNAVAILABLE_HASH, type LogProvenance } from '../evidence/logProvenance';
import type { MotorSpec } from '../propulsion/motorDatabase';

export const CONSENT_TEXT =
  'I agree this data may be used to validate Astraea; only derived results are published unless I say otherwise.';

/** The mass check warns outside this band around the design's liftoff mass. */
export const MASS_RATIO_LOW = 0.5;
export const MASS_RATIO_HIGH = 2;

/** What the user types, as text; empty string means "not given". */
export interface FlightInfoForm {
  liftoffMassG: string;
  launchDate: string;
  siteName: string;
  siteElevationM: string;
  temperatureC: string;
  windSpeedMps: string;
  railLengthM: string;
  railAngleDeg: string;
  motorLot: string;
  notes: string;
  loggerModel: string;
  contactEmail: string;
  consent: boolean;
}

export const EMPTY_FLIGHT_INFO_FORM: FlightInfoForm = {
  liftoffMassG: '', launchDate: '', siteName: '', siteElevationM: '', temperatureC: '', windSpeedMps: '',
  railLengthM: '', railAngleDeg: '', motorLot: '', notes: '', loggerModel: '', contactEmail: '', consent: false,
};

/** The validated form, with numbers as numbers and unanswered fields as null. */
export interface FlightInfo {
  liftoffMassG: number;
  launchDate: string;
  siteName: string | null;
  siteElevationM: number | null;
  temperatureC: number | null;
  windSpeedMps: number | null;
  railLengthM: number | null;
  /** Degrees from vertical. */
  railAngleDeg: number | null;
  motorLot: string | null;
  notes: string | null;
  loggerModel: string | null;
  contactEmail: string | null;
}

export type FlightInfoErrors = Partial<Record<keyof FlightInfoForm, string>>;

export interface FlightInfoCheck {
  /** Null while there are errors. */
  info: FlightInfo | null;
  errors: FlightInfoErrors;
  /** Worth a second look, never blocking. */
  warnings: string[];
}

export interface FlightInfoContext {
  /** Design liftoff mass (airframe + loaded motor) in grams, when known. */
  expectedLiftoffMassG: number | null;
  /** Today as YYYY-MM-DD, for the not-in-the-future check. */
  today: string;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRealDate(text: string): boolean {
  const m = DATE_RE.exec(text);
  if (m === null) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

const textOrNull = (s: string): string | null => (s.trim() === '' ? null : s.trim());

/** Validate the form. Mass, date and consent are required; every other field is optional. */
export function checkFlightInfo(form: FlightInfoForm, context: FlightInfoContext): FlightInfoCheck {
  const errors: FlightInfoErrors = {};
  const warnings: string[] = [];

  const optionalNumber = (
    key: keyof FlightInfoForm,
    label: string,
    ok: (n: number) => boolean,
    rule: string,
  ): number | null => {
    const text = (form[key] as string).trim();
    if (text === '') return null;
    const n = Number(text);
    if (!Number.isFinite(n) || !ok(n)) {
      errors[key] = `${label} ${rule}.`;
      return null;
    }
    return n;
  };

  const massText = form.liftoffMassG.trim();
  const mass = massText === '' ? NaN : Number(massText);
  if (massText === '') errors.liftoffMassG = 'Enter the measured liftoff mass: the rocket as flown, motor installed, in grams.';
  else if (!Number.isFinite(mass) || mass <= 0) errors.liftoffMassG = 'Liftoff mass must be a positive number of grams.';
  else if (context.expectedLiftoffMassG !== null && context.expectedLiftoffMassG > 0) {
    const ratio = mass / context.expectedLiftoffMassG;
    if (ratio > MASS_RATIO_HIGH || ratio < MASS_RATIO_LOW) {
      warnings.push(
        `You entered ${mass} g; the design is ${context.expectedLiftoffMassG.toFixed(0)} g with its motor loaded. ` +
        `That is ${ratio.toFixed(2)}× the design: check the unit (grams, not kilograms or ounces) and that this is the flown rocket. ` +
        'You can still export.',
      );
    }
  }

  const date = form.launchDate.trim();
  if (date === '') errors.launchDate = 'Enter the launch date.';
  else if (!isRealDate(date)) errors.launchDate = 'Launch date must be a real date, YYYY-MM-DD.';
  else if (date > context.today) errors.launchDate = 'Launch date cannot be in the future.';

  const siteElevationM = optionalNumber('siteElevationM', 'Site elevation', (n) => n >= -500 && n <= 9000, 'must be between −500 and 9000 m');
  const temperatureC = optionalNumber('temperatureC', 'Temperature', (n) => n >= -60 && n <= 60, 'must be between −60 and 60 °C');
  const windSpeedMps = optionalNumber('windSpeedMps', 'Wind speed', (n) => n >= 0 && n <= 60, 'must be between 0 and 60 m/s');
  const railLengthM = optionalNumber('railLengthM', 'Rail length', (n) => n > 0 && n <= 30, 'must be a positive length in metres');
  const railAngleDeg = optionalNumber('railAngleDeg', 'Rail angle', (n) => n >= 0 && n <= 90, 'must be between 0 and 90° from vertical');

  const email = form.contactEmail.trim();
  if (email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.contactEmail = 'That does not look like an email address.';

  if (!form.consent) errors.consent = 'Tick the box to agree before exporting.';

  if (Object.keys(errors).length > 0) return { info: null, errors, warnings };
  return {
    info: {
      liftoffMassG: mass,
      launchDate: date,
      siteName: textOrNull(form.siteName),
      siteElevationM,
      temperatureC,
      windSpeedMps,
      railLengthM,
      railAngleDeg,
      motorLot: textOrNull(form.motorLot),
      notes: textOrNull(form.notes),
      loggerModel: textOrNull(form.loggerModel),
      contactEmail: textOrNull(email),
    },
    errors,
    warnings,
  };
}

/** A name that is safe as one zip member and one file on any desktop. */
export function safeFileName(name: string | null, fallback: string): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]/g, '_').replace(/^\.+/, '').trim().slice(0, 120);
  return cleaned === '' ? fallback : cleaned;
}

export interface FlightBundleInput {
  info: FlightInfo;
  /** The imported log exactly as received. Required: a bundle without it is refused. */
  logBytes: Uint8Array | null;
  logProvenance: LogProvenance | null;
  project: ProjectEnvelope;
  motor: MotorSpec | null;
  appVersion: string;
  exportedAt: Date;
}

export interface FlightBundle {
  /** Suggested file name for the .zip. */
  name: string;
  bytes: Uint8Array;
  /** Member names and sizes, in archive order. */
  files: { name: string; bytes: number }[];
}

const encoder = new TextEncoder();
const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

function readme(input: FlightBundleInput, members: { log: string; project: string; motor: string }): string {
  return [
    'ASTRAEA FLIGHT BUNDLE',
    '=====================',
    '',
    `Made by Astraea ${input.appVersion} (beta) on ${input.exportedAt.toISOString()}.`,
    '',
    'WHAT IS INSIDE',
    `  flight-info.json           What you told us about the flight (as-flown mass, date, weather,`,
    `                             rail, logger) and your consent.`,
    `  ${members.log.padEnd(26)} Your flight log, byte for byte as you imported it.`,
    `  flight-log/provenance.json Its file name, SHA-256, format guess and units.`,
    `  ${members.project.padEnd(26)} The Astraea project: vehicle, mission, launch site and motors.`,
    `  ${members.motor.padEnd(26)} The motor's thrust curve.`,
    '',
    'WHAT IT IS FOR',
    '  Comparing Astraea\'s prediction with this flight. Validation needs the measured liftoff mass,',
    '  which is why Astraea asks for it. Nothing here is uploaded by Astraea: this file stays on',
    '  your computer until you choose to send it.',
    '',
    'WHAT IS PRIVATE',
    '  The project file holds your vehicle name and, if you set one, your launch site coordinates.',
    '  Saved runs also retain earlier vehicle/site settings, weather context and motor source metadata.',
    '  Saving run inputs does not add raw flight logs; the imported log in this bundle is included separately.',
    '  The flight log is raw. Open flight-info.json and the project in a text editor first if you',
    '  want to check what you are sharing.',
    '',
    'HOW TO SUBMIT',
    `  1. Read what we are asking for and how data is handled:`,
    `     ${DATA_REQUEST_URL}`,
    `  2. Open an issue with the "Simulation vs. real flight" template:`,
    `     ${FLIGHT_ISSUE_URL}`,
    '     Give the headline numbers (predicted vs. measured apogee) and say you have this bundle.',
    '  3. A GitHub issue is PUBLIC, and so is anything attached to it. Only attach this zip there if',
    '     you are happy for the raw log and project to be public. If you want only derived results',
    '     published, say so in the issue and we will arrange a private hand-over instead.',
    '',
    'CONSENT YOU GAVE',
    `  "${CONSENT_TEXT}"`,
    '',
  ].join('\n');
}

/**
 * Build the bundle. Refuses (throws) with no loaded log, a log whose bytes no
 * longer match their recorded checksum, or no motor to export.
 */
export async function buildFlightBundle(input: FlightBundleInput): Promise<FlightBundle> {
  if (input.logBytes === null || input.logProvenance === null) {
    throw new Error('Import a flight log in Verify first: the bundle is built around the log.');
  }
  if (input.motor === null) throw new Error('This project has no motor that resolves, so there is no thrust curve to include.');

  const sha256Hex = await sha256HexOfBytes(input.logBytes);
  const recorded = input.logProvenance.sha256Hex;
  if (recorded !== UNAVAILABLE_HASH && sha256Hex !== UNAVAILABLE_HASH && recorded !== sha256Hex) {
    throw new Error('The stored log no longer matches the checksum recorded when it was imported. Import the log again.');
  }

  // The project must read back: a bundle whose project cannot be opened is worthless.
  const projectJson = writeProject(input.project);
  readProject(projectJson);

  const vehicleSlug = slugify(input.project.vehicle.name) || 'rocket';
  const logFile = safeFileName(input.logProvenance.sourceFileName, 'pasted-flight-log.csv');
  // Never let the user's file share a name with the provenance record beside it.
  const logName = `flight-log/${logFile === 'provenance.json' ? 'log-provenance.json' : logFile}`;
  const projectName = `${vehicleSlug}.astraea.json`;
  const eng = exportMotorFile(input.motor, 'eng');
  const motorName = `motor/${safeFileName(eng.filename, `${slugify(input.motor.designation) || 'motor'}.eng`)}`;

  const provenance = {
    sourceFileName: input.logProvenance.sourceFileName,
    sha256: sha256Hex,
    bytes: input.logBytes.byteLength,
    rowCount: input.logProvenance.rowCount,
    dialect: input.logProvenance.dialect,
    timeUnit: input.logProvenance.timeUnitAssumption,
    altitudeUnit: input.logProvenance.altitudeUnitAssumption,
    skippedLines: input.logProvenance.skippedLineCount,
    bundledAs: logName,
  };
  const flightInfo = {
    schema: 'astraea.flight-info/1',
    createdAt: input.exportedAt.toISOString(),
    astraeaVersion: input.appVersion,
    ...input.info,
    consent: { agreed: true, text: CONSENT_TEXT },
    files: { log: logName, project: projectName, motor: motorName },
  };

  const members = [
    { name: 'README.txt', data: readme(input, { log: logName, project: projectName, motor: motorName }) },
    { name: 'flight-info.json', data: json(flightInfo) },
    { name: logName, data: input.logBytes },
    { name: 'flight-log/provenance.json', data: json(provenance) },
    { name: projectName, data: projectJson },
    { name: motorName, data: eng.text },
  ];
  const bytes = await zipFiles(members);
  return {
    name: `${vehicleSlug}-flight-${input.info.launchDate}.zip`,
    bytes,
    files: members.map((m) => ({ name: m.name, bytes: typeof m.data === 'string' ? encoder.encode(m.data).byteLength : m.data.byteLength })),
  };
}
