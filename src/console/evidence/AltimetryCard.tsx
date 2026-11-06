/**
 * Altimetry card: import or paste a flight-log CSV, parse it (time, altitude
 * and, when the log has one, vertical velocity), resample onto a uniform grid,
 * and show sample count + apogee with the log's provenance. Each successful
 * import is reported upward so the calibration card works from the same bytes.
 */
import { useRef, useState, type JSX } from 'react';
import { Activity, ClipboardPaste } from 'lucide-react';
import { parseTrajectoryCsv, resample, type AltitudeSample, type LogUnitOverrides, type TrajectoryParse, type TrajectorySample } from '../../evidence/altimetry';
import { buildLogProvenance, UNAVAILABLE_HASH, type LogProvenance } from '../../evidence/logProvenance';
import { C } from '../kit/theme';
import { Button } from '../kit/Fields';
import { Select } from '../kit/Controls';
import { recordEvidence } from './ProjectLedger';
import { currentLoadedLog, rememberLoadedLog, type ImportedLog } from './loadedLog';
import { Card, FIELD_STYLE, KvRow, Note, Notice, Well, toNumber } from './studioKit';

export type { ImportedLog };

export function AltimetryCard(): JSX.Element {
  // A log imported earlier in the session comes back when the card is shown again.
  const remembered = useRef(currentLoadedLog()).current;
  const [csvText, setCsvText] = useState<string>(remembered?.csvText ?? '');
  const [csvTextDirty, setCsvTextDirty] = useState<boolean>(false);
  const [parsed, setParsed] = useState<TrajectorySample[] | null>(remembered?.log.samples ?? null);
  const [sourceName, setSourceName] = useState<string | null>(remembered?.sourceName ?? null);
  const [provenance, setProvenance] = useState<LogProvenance | null>(remembered?.log.provenance ?? null);
  const [dtText, setDtText] = useState<string>('0.5');
  const [resampled, setResampled] = useState<AltitudeSample[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unitOverrides, setUnitOverrides] = useState<LogUnitOverrides>(remembered?.unitOverrides ?? {});
  // The picked file's own bytes while the text still is that file; null once the text is pasted or edited.
  const fileBytes = useRef<Uint8Array | null>(remembered !== null && remembered.sourceName !== null ? remembered.log.originalBytes : null);
  const parseSeq = useRef(0);
  const csvDirty = csvTextDirty && parsed !== null;

  /** Parse `text`, then record its provenance; a newer import wins over a slow checksum. */
  const ingest = async (
    text: string,
    fileName: string | null,
    seq: number,
    result: TrajectoryParse,
  ): Promise<void> => {
    const { samples, hasVelocity, ...units } = result;
    const originalBytes = fileBytes.current ?? new TextEncoder().encode(text);
    // Commit the new bytes only on success: a rejected input leaves the prior
    // text, source name, and provenance untouched (fail-closed).
    setParsed(samples);
    setError(null);
    setResampled(null);
    const record = await buildLogProvenance({ rawText: text, rawBytes: originalBytes, fileName, rowCount: samples.length, units });
    if (parseSeq.current !== seq) return;
    setProvenance(record);
    rememberLoadedLog({
      log: { samples, hasVelocity, provenance: record, originalBytes },
      csvText: text,
      sourceName: fileName,
      unitOverrides,
    });
    await recordEvidence(text, 'altimeter-csv', fileName, samples.length, units, originalBytes);
  };

  const handleParse = async () => {
    const seq = ++parseSeq.current;
    setCsvTextDirty(false);
    try {
      // Parsed before the first await, so a bad paste reports its error in the same turn.
      await ingest(csvText, sourceName, seq, parseTrajectoryCsv(csvText, unitOverrides));
    } catch (err) {
      // A failed parse keeps the last successful import on screen, labeled
      // separately — a bad paste must never wipe prior evidence.
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleFile = async (file: File) => {
    const seq = ++parseSeq.current;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    // A newer paste/import started while reading: keep its bytes.
    if (parseSeq.current !== seq) return;
    try {
      const result = parseTrajectoryCsv(text, unitOverrides); // a rejected file throws before any state moves
      fileBytes.current = bytes;
      setCsvText(text);
      setCsvTextDirty(false);
      setSourceName(file.name);
      await ingest(text, file.name, seq, result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleResample = () => {
    const dt = toNumber(dtText);
    if (parsed === null || parsed.length === 0) return;
    if (dt === null || dt <= 0) {
      setError('Resample step dt must be a positive number of seconds.');
      setResampled(null);
      return;
    }
    try {
      setResampled(resample(parsed, dt));
      setError(null);
    } catch (err) {
      setResampled(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  let apogee: AltitudeSample | null = null;
  for (const sample of resampled ?? []) {
    if (apogee === null || sample.altitudeM > apogee.altitudeM) apogee = sample;
  }

  const heading = resampled === null
    ? 'Paste flight-log CSV columns: time, t, timestamp, time_s, "time (s)", time_ms for time; alt, altitude, agl, altitude_m, "altitude (m)", altitude_ft, "altitude (ft)" for height. A velocity column (velocity, "Velocity(m/s)") is used when present. Units named in the header are applied; set them below when the header does not say.'
    : '';

  return (
    <Card
      title="Altimetry"
      kicker="Import a flight log · parse · resample onto a uniform time grid"
      icon={<Activity className="h-4 w-4" />}
    >
      <textarea
        value={csvText}
        onChange={(e) => {
          setCsvText(e.target.value);
          setCsvTextDirty(true);
          // Edited text no longer matches the picked file: drop the name
          // rather than show a filename beside foreign bytes.
          setSourceName(null);
          fileBytes.current = null;
        }}
        aria-label="Altimeter CSV data"
        placeholder={'time_s,altitude_m\n0.0,12.0\n0.5,24.5\n1.0,37.5\n…'}
        spellCheck={false}
        className="h-28 min-h-28 w-full resize-y rounded-md px-2.5 py-2 font-geist-mono text-[11px] outline-none focus-visible:ring-1"
        style={FIELD_STYLE}
      />
      <Note>{heading}</Note>

      <div className="flex flex-wrap items-center gap-3 text-[11.5px]" style={{ color: C.muted }}>
        <label className="inline-flex items-center gap-1.5">
          Time unit
          <Select
            ariaLabel="Log time unit"
            value={unitOverrides.time ?? ''}
            onChange={(value) => {
              setUnitOverrides({ ...unitOverrides, time: (value || undefined) as LogUnitOverrides['time'] });
              setCsvTextDirty(true);
            }}
            style={FIELD_STYLE}
          >
            <option value="">From header (else seconds)</option>
            <option value="s">Seconds</option>
            <option value="ms">Milliseconds</option>
          </Select>
        </label>
        <label className="inline-flex items-center gap-1.5">
          Altitude unit
          <Select
            ariaLabel="Log altitude unit"
            value={unitOverrides.altitude ?? ''}
            onChange={(value) => {
              setUnitOverrides({ ...unitOverrides, altitude: (value || undefined) as LogUnitOverrides['altitude'] });
              setCsvTextDirty(true);
            }}
            style={FIELD_STYLE}
          >
            <option value="">From header (else meters)</option>
            <option value="m">Meters</option>
            <option value="ft">Feet</option>
          </Select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button small onClick={() => void handleParse()}>
          <ClipboardPaste className="h-3 w-3" />
          Parse
        </Button>
        <span style={{ color: C.faint }}>|</span>
        <label className="text-[11.5px]" style={{ color: C.muted }} htmlFor="alt-dt">
          Resample dt
          <input
            id="alt-dt"
            type="number"
            inputMode="decimal"
            value={dtText}
            step="0.1"
            min="0.01"
            aria-label="Resample time step seconds"
            onChange={(e) => setDtText(e.target.value)}
            className="ml-1.5 w-16 rounded px-1.5 py-1 font-geist-mono text-[11px] outline-none focus-visible:ring-1"
            style={FIELD_STYLE}
          />
          <span style={{ color: C.dim }}> s</span>
        </label>
        <Button small disabled={parsed === null} onClick={handleResample}>Resample</Button>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded px-2 py-0.5 text-[11.5px] font-medium hover:bg-white/5" style={{ border: `1px solid ${C.line}` }}>
          Import file
          <input
            type="file"
            accept=".csv,.txt,.log,text/csv,text/plain"
            aria-label="Flight log file"
            className="hidden"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              e.target.value = '';
              if (picked !== undefined) void handleFile(picked);
            }}
          />
        </label>
      </div>

      {error !== null && <Notice tone="bad" role="alert">{error}</Notice>}
      {error !== null && parsed !== null && (
        <Note tone="bad" role="status">▲ Results reflect the last successful import — the current paste failed to parse.</Note>
      )}

      <div role="status" aria-live="polite" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Well><KvRow label="Samples parsed" value={parsed === null ? '—' : String(parsed.length)} tone={parsed ? 'ok' : 'dim'} /></Well>
        <Well><KvRow label="Samples @ dt" value={resampled === null ? '—' : String(resampled.length)} tone={resampled ? 'ok' : 'dim'} /></Well>
        <Well>
          <KvRow label="Apogee altitude" value={apogee === null ? '—' : `${apogee.altitudeM.toFixed(1)} m`} />
          <KvRow label="Apogee at" value={apogee === null ? '—' : `${apogee.timeS.toFixed(1)} s`} tone="muted" />
        </Well>
      </div>
      {provenance !== null && parsed !== null && (
        <Well className="space-y-1.5">
          <div data-log-provenance="record" className="space-y-1.5">
            <p className="text-[10.5px] font-medium tracking-wide uppercase" style={{ color: C.dim }}>
              Log provenance — what was received, not inferred
            </p>
            <div data-log-provenance="source"><KvRow label="Source file" value={provenance.sourceFileName ?? 'pasted text'} /></div>
            <div data-log-provenance="checksum">
              <KvRow label="SHA-256" value={provenance.sha256Hex === UNAVAILABLE_HASH ? 'checksum unavailable' : provenance.sha256Hex} />
            </div>
            <div data-log-provenance="rows"><KvRow label="Rows parsed" value={String(provenance.rowCount)} /></div>
            <div data-log-provenance="dialect"><KvRow label="Dialect" value={provenance.dialect} /></div>
            <div data-log-provenance="units">
              <KvRow label="Time unit" value={provenance.timeUnitAssumption} />
              <KvRow label="Altitude unit" value={provenance.altitudeUnitAssumption} />
            </div>
            <div data-log-provenance="skipped"><KvRow label="Skipped lines" value={String(provenance.skippedLineCount)} /></div>
          </div>
        </Well>
      )}

      {csvDirty && <Note tone="warn">▲ CSV edited since Parse — results reflect the last parsed text.</Note>}
    </Card>
  );
}
