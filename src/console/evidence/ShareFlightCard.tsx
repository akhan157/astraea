/**
 * Share this flight: package the imported log, the project, the motor curve
 * and what the user knows about the flight into one .zip they can send, so
 * their flight can be used to validate Astraea. Nothing is uploaded; the file
 * is saved through the same dialog as every other export.
 *
 * The as-flown liftoff mass is required and sits first: without a measured
 * mass a flight cannot validate anything.
 */
import { useEffect, useMemo, useState, type JSX } from 'react';
import { PackageOpen } from 'lucide-react';
import { buildFlightBundle, checkFlightInfo, EMPTY_FLIGHT_INFO_FORM, CONSENT_TEXT, type FlightInfoForm } from '../../io/flightBundle';
import { saveProjectTo } from '../../io/files';
import { exportableProject, useProjectStore } from '../../state/project';
import { stabilityOf } from '../../tauri/bridge';
import { designOf, engineIsAvailable, motorOfId } from '../store';
import { C } from '../kit/theme';
import { Button } from '../kit/Fields';
import { Checkbox } from '../kit/Controls';
import { useLoadedLog } from './loadedLog';
import { Card, FIELD_STYLE, Note, Notice, Well } from './studioKit';

const INPUT_CLASS = 'w-full rounded px-1.5 py-1 text-[11.5px] outline-none focus-visible:ring-1';

function Field({ label, hint, error, required, children }: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined }) => JSX.Element;
}): JSX.Element {
  const id = `share-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const describedBy = error !== undefined ? `${id}-error` : hint !== undefined ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-[10.5px] font-medium tracking-wide uppercase" style={{ color: C.dim }}>
        {label}{required ? <span style={{ color: C.warn }}> · required</span> : null}
      </label>
      {children({ id, 'aria-invalid': error !== undefined, 'aria-describedby': describedBy })}
      {error !== undefined
        ? <p id={`${id}-error`} className="text-[11px]" style={{ color: C.bad }}>{error}</p>
        : hint !== undefined ? <p id={`${id}-hint`} className="text-[11px]" style={{ color: C.dim }}>{hint}</p> : null}
    </div>
  );
}

/** Today as YYYY-MM-DD in the user's own time zone. */
function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** The design's liftoff mass in grams (airframe + loaded motor), or null when it cannot be computed. */
function useExpectedLiftoffMassG(): number | null {
  const project = useProjectStore((s) => s.project);
  const motors = useProjectStore((s) => s.motors);
  const mission = useProjectStore((s) => s.mission);
  const shearPa = useProjectStore((s) => s.shearPa);
  const [grams, setGrams] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    setGrams(null);
    if (!engineIsAvailable()) return;
    const design = designOf(project, mission, shearPa, undefined, motors);
    const motor = motorOfId(design.motorId);
    if (motor === null) return;
    stabilityOf(design.vehicle)
      .then((analysis) => { if (live) setGrams((analysis.totalMass + motor.totalMass) * 1000); })
      .catch(() => { /* no engine answer: the plausibility check is simply skipped */ });
    return () => { live = false; };
  }, [project, motors, mission, shearPa]);
  return grams;
}

export function ShareFlightCard(): JSX.Element {
  const loaded = useLoadedLog();
  const expectedLiftoffMassG = useExpectedLiftoffMassG();
  const [form, setForm] = useState<FlightInfoForm>(EMPTY_FLIGHT_INFO_FORM);
  // Errors appear once the user has tried to export, not while they type.
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const today = todayLocal();
  const check = useMemo(() => checkFlightInfo(form, { expectedLiftoffMassG, today }), [form, expectedLiftoffMassG, today]);
  const set = <K extends keyof FlightInfoForm>(key: K, value: FlightInfoForm[K]): void => {
    setForm((f) => ({ ...f, [key]: value }));
    setResult(null);
  };
  const err = (key: keyof FlightInfoForm): string | undefined => (tried ? check.errors[key] : undefined);

  const handleExport = async (): Promise<void> => {
    setTried(true);
    setResult(null);
    if (loaded === null || check.info === null) return;
    setBusy(true);
    try {
      const state = useProjectStore.getState();
      const design = designOf(state.project, state.mission, state.shearPa, undefined, state.motors);
      const bundle = await buildFlightBundle({
        info: check.info,
        logBytes: loaded.log.originalBytes,
        logProvenance: loaded.log.provenance,
        project: exportableProject(),
        motor: motorOfId(design.motorId),
        appVersion: __APP_VERSION__,
        exportedAt: new Date(),
      });
      const saved = await saveProjectTo(bundle.name, bundle.bytes, 'application/zip', { enforceExt: 'zip' });
      setResult(saved.via === 'cancelled'
        ? { tone: 'bad', text: 'Save cancelled. Nothing was written.' }
        : { tone: 'ok', text: `Saved ${saved.name ?? bundle.name}: ${bundle.files.map((f) => f.name).join(', ')}. Open README.txt inside for how to send it.` });
    } catch (e) {
      setResult({ tone: 'bad', text: `Could not build the bundle: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  const text = (key: keyof FlightInfoForm) => (id: { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined }): JSX.Element => (
    <input
      {...id}
      type="text"
      value={form[key] as string}
      onChange={(e) => set(key, e.target.value as never)}
      className={INPUT_CLASS}
      style={FIELD_STYLE}
    />
  );
  const number = (key: keyof FlightInfoForm, step: string, aria?: string) => (id: { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined }): JSX.Element => (
    <input
      {...id}
      type="number"
      inputMode="decimal"
      step={step}
      value={form[key] as string}
      aria-label={aria}
      onChange={(e) => set(key, e.target.value as never)}
      className={`${INPUT_CLASS} font-geist-mono`}
      style={FIELD_STYLE}
    />
  );

  return (
    <Card
      title="Share this flight"
      kicker="Package your log, project, motor and flight details into one .zip so your flight can help validate Astraea"
      icon={<PackageOpen className="h-4 w-4" />}
    >
      {loaded === null
        ? <Notice tone="warn" role="status">Import a flight log above first: the bundle is built around it.</Notice>
        : (
          <Well>
            <p className="text-[11.5px]" style={{ color: C.muted }}>
              Sharing <strong style={{ color: C.fg }}>{loaded.log.provenance.sourceFileName ?? 'pasted flight log'}</strong>{' '}
              ({loaded.log.originalBytes.byteLength.toLocaleString()} bytes, {loaded.log.provenance.rowCount} rows), exactly as imported.
            </p>
          </Well>
        )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Liftoff mass (g)" required error={err('liftoffMassG')} hint="Weigh the rocket as flown: motor, recovery gear and electronics installed. Validation cannot run without it.">
          {number('liftoffMassG', '1')}
        </Field>
        <Field label="Launch date" required error={err('launchDate')}>
          {(id) => (
            <input {...id} type="date" max={today} value={form.launchDate} onChange={(e) => set('launchDate', e.target.value)} className={`${INPUT_CLASS} font-geist-mono`} style={FIELD_STYLE} />
          )}
        </Field>
        <Field label="Launch site" error={err('siteName')}>{text('siteName')}</Field>
        <Field label="Site elevation (m)" error={err('siteElevationM')}>{number('siteElevationM', '1')}</Field>
        <Field label="Temperature (°C)" error={err('temperatureC')}>{number('temperatureC', '0.5')}</Field>
        <Field label="Wind speed (m/s)" error={err('windSpeedMps')}>{number('windSpeedMps', '0.5')}</Field>
        <Field label="Rail length (m)" error={err('railLengthM')}>{number('railLengthM', '0.1')}</Field>
        <Field label="Rail angle from vertical (°)" error={err('railAngleDeg')}>{number('railAngleDeg', '1')}</Field>
        <Field label="Motor lot" error={err('motorLot')}>{text('motorLot')}</Field>
        <Field label="Logger model" error={err('loggerModel')}>{text('loggerModel')}</Field>
        <Field label="Notes" error={err('notes')}>{text('notes')}</Field>
        <Field label="Contact email (optional)" error={err('contactEmail')} hint="Only so we can ask a follow-up question.">{text('contactEmail')}</Field>
      </div>

      {check.warnings.map((w) => <Notice key={w} tone="warn" role="status">{w}</Notice>)}

      <div className="space-y-1">
        <label className="flex items-start gap-2 text-[11.5px]" style={{ color: C.fg }}>
          <Checkbox
            checked={form.consent}
            onChange={(checked) => set('consent', checked)}
            invalid={err('consent') !== undefined}
          />
          <span>{CONSENT_TEXT} <span style={{ color: C.warn }}>· required</span></span>
        </label>
        {err('consent') !== undefined && <p className="text-[11px]" style={{ color: C.bad }}>{err('consent')}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button primary disabled={busy} onClick={() => void handleExport()}>
          <PackageOpen className="h-3.5 w-3.5" />
          Export flight bundle
        </Button>
        <Note>Nothing is uploaded. The file is saved on your computer; README.txt inside explains how to send it. The project file includes your vehicle name and launch-site coordinates if you set them.</Note>
      </div>
      {result !== null && <Notice tone={result.tone === 'ok' ? 'accent' : 'bad'} role={result.tone === 'ok' ? 'status' : 'alert'}>{result.text}</Notice>}
      {tried && loaded === null && <Notice tone="bad" role="alert">Import a flight log first: there is nothing to share without it.</Notice>}
    </Card>
  );
}
