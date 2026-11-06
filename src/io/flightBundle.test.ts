/**
 * The "share this flight" bundle is only worth sending if it is faithful: the
 * log must come back byte for byte, its checksum must be the checksum of those
 * bytes, the project and motor must open with Astraea's own readers, and the
 * required answers (flown mass, date, consent) must not be skippable.
 */
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildFlightBundle, checkFlightInfo, safeFileName, type FlightInfo, type FlightInfoForm } from './flightBundle';
import { buildLogProvenance, type LogProvenance } from '../evidence/logProvenance';
import { readProject, type ProjectEnvelope } from '../formats/projectJson';
import { parseRaspEng } from '../formats/engParser';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import { exportableProject, useProjectStore } from '../state/project';

// A log as a real logger writes it: byte-order mark, CRLF, and a Latin-1 byte
// that is not valid UTF-8. Decoding it to text and back would change it.
const LOG_BYTES = new Uint8Array([
  0xef, 0xbb, 0xbf,
  ...new TextEncoder().encode('time_s,altitude_m\r\n0,0\r\n0.5,12.5\r\n1,40.1\r\n'),
  ...new TextEncoder().encode('# caf'), 0xe9, ...new TextEncoder().encode('\r\n'),
]);

const FORM: FlightInfoForm = {
  liftoffMassG: '95', launchDate: '2026-10-18', siteName: 'Black Rock', siteElevationM: '1190',
  temperatureC: '18', windSpeedMps: '3', railLengthM: '1.8', railAngleDeg: '5',
  motorLot: 'lot 4411', notes: 'Clean flight', loggerModel: 'Altus Metrum EasyMini', contactEmail: '', consent: true,
};
const CONTEXT = { expectedLiftoffMassG: 100, today: '2026-10-21' };

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

function validInfo(form: Partial<FlightInfoForm> = {}): FlightInfo {
  const { info } = checkFlightInfo({ ...FORM, ...form }, CONTEXT);
  if (info === null) throw new Error('fixture form should be valid');
  return info;
}

let project: ProjectEnvelope;
let provenance: LogProvenance;

beforeAll(async () => {
  useProjectStore.getState().loadPreset('estesAlpha');
  project = exportableProject();
  provenance = await buildLogProvenance({
    rawText: new TextDecoder().decode(LOG_BYTES),
    rawBytes: LOG_BYTES,
    fileName: 'C:\\logs\\my flight.csv',
    rowCount: 3,
  });
});

const build = (over: Partial<Parameters<typeof buildFlightBundle>[0]> = {}) =>
  buildFlightBundle({
    info: validInfo(),
    logBytes: LOG_BYTES,
    logProvenance: provenance,
    project,
    motor: CERTIFIED_MOTORS[project.workspace.motorId],
    appVersion: '0.10.0',
    exportedAt: new Date('2026-10-21T12:00:00Z'),
    ...over,
  });

describe('buildFlightBundle', () => {
  it('returns the log byte for byte, with the checksum of exactly those bytes', async () => {
    const zip = await JSZip.loadAsync((await build()).bytes);
    const logEntry = zip.file('flight-log/my flight.csv');
    expect(logEntry).not.toBeNull();
    const back = await logEntry!.async('uint8array');
    expect(Array.from(back)).toEqual(Array.from(LOG_BYTES));

    const recorded = JSON.parse((await zip.file('flight-log/provenance.json')!.async('string')) as string);
    expect(recorded.sha256).toBe(sha256(LOG_BYTES));
    expect(recorded.sha256).toBe(provenance.sha256Hex);
    expect(recorded).toMatchObject({ sourceFileName: 'C:\\logs\\my flight.csv', bytes: LOG_BYTES.byteLength, rowCount: 3, dialect: 'generic-csv' });
    expect(recorded.timeUnit).toMatch(/seconds/);
    expect(recorded.altitudeUnit).toMatch(/meters/);
  });

  it('carries a project that opens and a motor curve that parses', async () => {
    const bundle = await build();
    const zip = await JSZip.loadAsync(bundle.bytes);
    const names = Object.keys(zip.files);
    const projectName = names.find((n) => n.endsWith('.astraea.json'));
    const engName = names.find((n) => n.endsWith('.eng'));
    expect(projectName).toBeDefined();
    expect(engName).toBeDefined();

    const reopened = readProject((await zip.file(projectName!)!.async('string')) as string);
    expect(reopened.vehicle.name).toBe(project.vehicle.name);
    expect(reopened.workspace.motorId).toBe(project.workspace.motorId);

    const motor = parseRaspEng((await zip.file(engName!)!.async('string')) as string);
    const original = CERTIFIED_MOTORS[project.workspace.motorId];
    expect(motor.totalImpulse).toBeCloseTo(original.totalImpulse, 0);
    expect(motor.thrustCurve.length).toBe(original.thrustCurve.length);
  });

  it('records the answers, the consent text and the version, and lists its files', async () => {
    const bundle = await build();
    const zip = await JSZip.loadAsync(bundle.bytes);
    expect(Object.keys(zip.files).filter((n) => !n.endsWith('/')).sort()).toEqual(bundle.files.map((f) => f.name).sort());
    const info = JSON.parse((await zip.file('flight-info.json')!.async('string')) as string);
    expect(info).toMatchObject({
      astraeaVersion: '0.10.0', liftoffMassG: 95, launchDate: '2026-10-18', siteElevationM: 1190,
      temperatureC: 18, windSpeedMps: 3, railLengthM: 1.8, railAngleDeg: 5, contactEmail: null,
      consent: { agreed: true },
    });
    expect(info.consent.text).toMatch(/validate Astraea/);
    const readme = (await zip.file('README.txt')!.async('string')) as string;
    expect(readme).toContain('docs/team-data-request.md');
    expect(readme).toContain('template=model_question.yml');
    expect(readme).toContain('Saved runs also retain earlier vehicle/site settings, weather context and motor source metadata.');
    expect(readme).toContain('Saving run inputs does not add raw flight logs');
    expect(bundle.name).toBe(`${project.vehicle.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-flight-2026-10-18.zip`);
  });

  it('refuses without a loaded log', async () => {
    await expect(build({ logBytes: null, logProvenance: null })).rejects.toThrow(/Import a flight log/);
  });

  it('refuses a log that no longer matches the checksum it was imported with', async () => {
    const tampered = LOG_BYTES.slice();
    tampered[tampered.length - 3] ^= 0x01;
    await expect(build({ logBytes: tampered })).rejects.toThrow(/checksum/);
  });

  it('refuses when no motor resolves', async () => {
    await expect(build({ motor: null })).rejects.toThrow(/motor/);
  });

  it('keeps a hostile log name inside the log folder and off the provenance record', async () => {
    const evil = { ...provenance, sourceFileName: '../../etc/passwd' };
    const zip = await JSZip.loadAsync((await build({ logProvenance: evil })).bytes);
    const names = Object.keys(zip.files);
    expect(names.every((n) => !n.includes('..'))).toBe(true);
    expect(names).toContain('flight-log/passwd');
    const clash = { ...provenance, sourceFileName: 'provenance.json' };
    const zip2 = await JSZip.loadAsync((await build({ logProvenance: clash })).bytes);
    expect(Array.from(await zip2.file('flight-log/log-provenance.json')!.async('uint8array'))).toEqual(Array.from(LOG_BYTES));
    expect(JSON.parse((await zip2.file('flight-log/provenance.json')!.async('string')) as string).sha256).toBe(sha256(LOG_BYTES));
  });
});

describe('checkFlightInfo', () => {
  it('requires the flown mass, a real date and consent', () => {
    const none = checkFlightInfo({ ...FORM, liftoffMassG: '', launchDate: '', consent: false }, CONTEXT);
    expect(none.info).toBeNull();
    expect(Object.keys(none.errors).sort()).toEqual(['consent', 'launchDate', 'liftoffMassG']);
  });

  it('does not let a missing consent through even when everything else is right', () => {
    const result = checkFlightInfo({ ...FORM, consent: false }, CONTEXT);
    expect(result.info).toBeNull();
    expect(result.errors.consent).toBeDefined();
  });

  it.each(['0', '-50', 'abc', 'NaN', 'Infinity'])('rejects a liftoff mass of %s', (liftoffMassG) => {
    expect(checkFlightInfo({ ...FORM, liftoffMassG }, CONTEXT).errors.liftoffMassG).toBeDefined();
  });

  it('warns, without blocking, when the mass is more than twice or under half the design', () => {
    for (const [mass, warns] of [['95', false], ['201', true], ['49', true], ['0.095', true], ['200', false], ['50', false]] as const) {
      const result = checkFlightInfo({ ...FORM, liftoffMassG: mass }, CONTEXT);
      expect(result.info).not.toBeNull();
      expect(result.warnings.length > 0, `mass ${mass}`).toBe(warns);
    }
  });

  it('skips the plausibility warning when the design mass is unknown', () => {
    expect(checkFlightInfo({ ...FORM, liftoffMassG: '5000' }, { ...CONTEXT, expectedLiftoffMassG: null }).warnings).toEqual([]);
  });

  it.each(['2026-02-30', '18/10/2026', '2026-10-22', '2027-01-01'])('rejects the launch date %s', (launchDate) => {
    expect(checkFlightInfo({ ...FORM, launchDate }, CONTEXT).errors.launchDate).toBeDefined();
  });

  it('accepts today, and optional fields left empty', () => {
    const result = checkFlightInfo({ ...FORM, launchDate: '2026-10-21', siteName: '', siteElevationM: '', temperatureC: '', windSpeedMps: '', railLengthM: '', railAngleDeg: '', motorLot: '', notes: '', loggerModel: '' }, CONTEXT);
    expect(result.info).toMatchObject({ siteName: null, siteElevationM: null, railAngleDeg: null, loggerModel: null });
  });

  it('rejects out-of-range optional numbers and a malformed email, naming the field', () => {
    const result = checkFlightInfo({ ...FORM, railAngleDeg: '120', railLengthM: '-1', temperatureC: 'hot', contactEmail: 'me@' }, CONTEXT);
    expect(Object.keys(result.errors).sort()).toEqual(['contactEmail', 'railAngleDeg', 'railLengthM', 'temperatureC']);
  });
});

describe('safeFileName', () => {
  it('drops directories and characters a desktop would refuse, and falls back when nothing is left', () => {
    expect(safeFileName('C:\\logs\\a:b?.csv', 'x.csv')).toBe('a_b_.csv');
    expect(safeFileName('/tmp/..', 'x.csv')).toBe('x.csv');
    expect(safeFileName(null, 'x.csv')).toBe('x.csv');
  });
});
