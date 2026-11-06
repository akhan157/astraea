/**
 * ThrustCurve.org search and simfile import, in the Motor stage.
 *
 * Everything is reported inline (no modal, no `window.alert`): an empty query
 * is refused before any fetch, a search or transport failure shows the API's
 * own message and never fabricates results, and an import registers the parsed
 * simfile in the catalog through the shared motor-record policy (`addMotor`),
 * which suffixes a colliding id rather than overwriting the motor there.
 *
 * The endpoint layer is `io/net.ts` (`searchThrustCurve`,
 * `downloadThrustCurveFile`); `isNetworkOnline` drives the offline state.
 */
import { useState } from 'react';
import { Download, Search } from 'lucide-react';
import { isNetworkOnline } from '../../../io/backend';
import { downloadThrustCurveFile, searchThrustCurve } from '../../../io/net';
import type { MotorSummary } from '../../../propulsion/thrustcurveApi';
import { parseRaspEng, parseRseXml } from '../../../formats/engParser';
import { validateMotorSpec } from '../../../propulsion/motorDatabase';
import { useWS } from '../../store';
import { C } from '../../kit/theme';
import { Button } from '../../kit/Fields';

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; results: MotorSummary[]; cacheNote: string }
  | { kind: 'error'; message: string };

type ImportState = { kind: 'ok' | 'error'; message: string } | null;

const INPUT = 'min-h-[30px] flex-1 rounded px-2 text-[12.5px] outline-none';
const INPUT_STYLE = { background: C.sunken, border: `1px solid ${C.line}`, color: C.fg } as const;

function Alert({ tone, children }: { tone: 'bad' | 'ok'; children: React.ReactNode }) {
  return (
    <div role="alert" className="rounded p-2 text-[12px]" style={{ background: tone === 'bad' ? 'rgba(248,113,133,.08)' : 'rgba(61,214,140,.08)', border: `1px solid ${tone === 'bad' ? 'rgba(248,113,133,.35)' : 'rgba(61,214,140,.35)'}`, color: tone === 'bad' ? C.bad : C.ok }}>
      {children}
    </div>
  );
}

export function ThrustCurvePanel() {
  const s = useWS();
  const [query, setQuery] = useState('');
  const [state, setState] = useState<SearchState>({ kind: 'idle' });
  const [importing, setImporting] = useState<string | null>(null);
  const [result, setResult] = useState<ImportState>(null);

  const online = isNetworkOnline();

  const runSearch = async (): Promise<void> => {
    const trimmed = query.trim();
    setResult(null);
    if (trimmed.length === 0) {
      setState({ kind: 'error', message: 'Enter a motor designation or manufacturer before searching.' });
      return;
    }
    setState({ kind: 'loading' });
    try {
      const res = await searchThrustCurve({ designation: trimmed, hasDataFiles: true, maxResults: 25 }, fetch);
      setState({ kind: 'ok', results: res.results, cacheNote: res.cacheNote });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const importMotor = async (summary: MotorSummary): Promise<void> => {
    setImporting(summary.id);
    setResult(null);
    try {
      const text = await downloadThrustCurveFile(summary.id, fetch);
      // RASP .eng is the default; RockSim .rse is the fallback and arrives as XML.
      const motor = text.trim().startsWith('<') ? parseRseXml(text) : parseRaspEng(text);
      validateMotorSpec(motor);
      const key = s.addMotor(motor, {
        source: 'import',
        sourceFile: `thrustcurve.org/motors/${summary.id}/`,
        note: `simfile from ThrustCurve.org (${summary.manufacturer} ${summary.designation})`,
      });
      setResult({ kind: 'ok', message: `Imported ${motor.designation} (${motor.totalImpulse.toFixed(1)} N·s total impulse) — registered as ${key} and selected.` });
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      setResult({ kind: 'error', message: `Import failed: ${why}` });
    } finally {
      setImporting(null);
    }
  };

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          aria-label="ThrustCurve search query"
          placeholder="Designation or manufacturer, e.g. C6 or Aerotech"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void runSearch(); }}
          className={INPUT}
          style={INPUT_STYLE}
        />
        <Button primary small onClick={() => void runSearch()} disabled={!online}>
          <Search size={12} /> Search
        </Button>
        <span className="text-[11px]" style={{ color: C.dim }}>thrustcurve.org · certified curves</span>
      </div>

      {!online && (
        <Alert tone="bad">Offline: the search and simfile download need a network connection. Import a .eng or .rse file instead.</Alert>
      )}

      <div role="status" data-thrustcurve-status={state.kind === 'error' ? 'error' : state.kind === 'ok' ? 'ok' : undefined}
        className="rounded p-2 text-[12px]" style={{ background: C.sunken, border: `1px solid ${C.line}`, color: state.kind === 'error' ? C.bad : C.muted }}>
        {state.kind === 'idle' && 'Search the ThrustCurve.org database, then import a curve.'}
        {state.kind === 'loading' && 'Searching ThrustCurve…'}
        {state.kind === 'ok' && (state.results.length === 0 ? 'No motors matched that query.' : `${state.results.length} motor${state.results.length === 1 ? '' : 's'} found. ${state.cacheNote}`)}
        {state.kind === 'error' && state.message}
      </div>

      {state.kind === 'ok' && state.results.length > 0 && (
        <ul aria-label="ThrustCurve search results" data-thrustcurve-results={state.results.length} className="divide-y overflow-hidden rounded" style={{ border: `1px solid ${C.line}` }}>
          {state.results.map((m) => (
            <li key={m.id} className="flex items-center gap-3 p-2" style={{ background: C.sunken }}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-geist-mono text-[12.5px]">{m.designation}</span>
                <span className="block truncate text-[11px]" style={{ color: C.dim }}>{m.manufacturer}</span>
              </span>
              <span className="font-geist-mono text-[12px]">{m.totalImpulseNs.toFixed(1)} N·s</span>
              <span className="font-geist-mono text-[12px]" style={{ color: C.muted }}>{m.diameterMm.toFixed(0)} mm</span>
              <Button small disabled={importing === m.id || !online} onClick={() => void importMotor(m)}>
                <Download size={11} /> {importing === m.id ? 'Importing…' : `Import ${m.designation}`}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {result !== null && (
        <div data-thrustcurve-import={result.kind}>
          <Alert tone={result.kind === 'ok' ? 'ok' : 'bad'}>{result.message}</Alert>
        </div>
      )}

      {state.kind === 'ok' && state.results.length > 0 && (
        <div className="text-[11px]" style={{ color: C.dim }}>
          Import fetches the motor's simulator file, parses RASP .eng (or RockSim .rse) and registers it in this project's catalog.
        </div>
      )}
    </div>
  );
}
