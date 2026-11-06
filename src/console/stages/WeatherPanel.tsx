import { useMemo, useState } from 'react';
import { fetchWeatherLayers } from '../../io/net';
import { parseWindProfileCsv, toManualWindTable } from '../../sim/windProfile';
import { windAtAltitude, windToENU, type WindLayer } from '../../sim/weather';
import { useProjectStore } from '../../state/project';
import { weatherLayers, weatherSnapshot } from '../../application/weatherSnapshots';
import { consoleActions, useWS } from '../store';
import { C } from '../kit/theme';

export function WeatherPanel() {
  const s = useWS();
  const site = useProjectStore((state) => state.project.workspace.site);
  // Profiles live in the project as weather snapshots, so they persist with it.
  const project = useProjectStore((state) => state.project);
  const manual = useMemo(() => weatherLayers(project, 'manual'), [project]);
  const forecast = useMemo(() => weatherLayers(project, 'forecast'), [project]);
  const forecastSource = weatherSnapshot(project, 'forecast')?.source ?? null;
  const setManual = (layers: WindLayer[], label = 'Edit wind table') =>
    consoleActions.setWeatherProfile('manual', layers, 'manual', label);
  const setForecast = (layers: WindLayer[], source = 'open-meteo') =>
    consoleActions.setWeatherProfile('forecast', layers, source, layers.length ? 'Fetch sounding' : 'Use manual table');
  const [csv, setCsv] = useState('');
  const [probe, setProbe] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const layers = forecast.length ? forecast : manual;
  const wind = useMemo(() => { try { return layers.length ? windAtAltitude(layers, probe) : null; } catch { return null; } }, [layers, probe]);
  const enu = wind ? windToENU(wind.speedMs, wind.directionFromDeg) : null;
  return <section className="space-y-3 p-4 text-[12px]">
    <h3>Weather and wind profile</h3>
    <p style={{ color: C.muted }}>Profiles are inspection data. The engine consumes only the surface wind selected below, with its own shear model; it does not ingest wind layers.</p>
    <div className="flex flex-wrap gap-3">{(['latDeg', 'lonDeg'] as const).map((field) => <label key={field}>{field === 'latDeg' ? 'Latitude' : 'Longitude'}<input aria-label={field === 'latDeg' ? 'Weather latitude' : 'Weather longitude'} type="number" step="any" value={site[field]} onChange={(e) => {
      if (e.target.value.trim() === '' || !Number.isFinite(e.target.valueAsNumber)) return;
      consoleActions.setWorkspace({ site: { ...site, [field]: e.target.valueAsNumber } }, 'Weather location');
    }} className="ml-2 rounded p-1" style={{ background: C.sunken, border: `1px solid ${C.line}` }} /></label>)}
      <label>Launch time (UTC)<input aria-label="Weather launch time" type="datetime-local" value={site.launchTimeISO?.slice(0, 16) ?? ''} onChange={(e) => consoleActions.setWorkspace({ site: { ...site, launchTimeISO: e.target.value ? `${e.target.value}:00Z` : null } }, 'Weather launch time')} className="ml-2 rounded p-1" style={{ background: C.sunken }} /></label>
      <button disabled={loading} className="rounded border px-3 py-1" onClick={async () => {
        setLoading(true); setError(null);
        try {
          if (!site.launchTimeISO) throw new Error('Enter a launch time before fetching a forecast.');
          const result = await fetchWeatherLayers(site.latDeg, site.lonDeg, site.launchTimeISO);
          const activeSite = useProjectStore.getState().project.workspace.site;
          if (activeSite.latDeg !== site.latDeg || activeSite.lonDeg !== site.lonDeg || activeSite.launchTimeISO !== site.launchTimeISO) {
            throw new Error('Launch location or time changed; fetch the forecast again.');
          }
          setForecast(result.layers, `${result.source} · valid ${result.forecastHourISO} · fetched ${result.fetchedAt}`);
          setStatus(`${result.layers.length} forecast layers · nearest launch hour ${result.forecastHourISO} · ${result.source} · fetched ${result.fetchedAt}`);
        } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
        finally { setLoading(false); }
      }}>{loading ? 'Fetching…' : 'Fetch sounding'}</button>
      {forecast.length > 0 && <><span style={{ color: C.muted }}>Saved sounding: {forecast.length} layers{forecastSource ? ` · ${forecastSource}` : ''}</span><button onClick={() => setForecast([])}>Use manual table</button></>}
    </div>
    <label className="block">Wind CSV (altitude, speed, direction from)<textarea aria-label="Wind profile CSV" value={csv} onChange={(e) => setCsv(e.target.value)} className="mt-1 block h-20 w-full rounded p-2 font-geist-mono" style={{ background: C.sunken }} /></label>
    <input aria-label="Import wind profile CSV" type="file" accept=".csv" onChange={async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try { const text = await file.text(); const parsed = toManualWindTable(parseWindProfileCsv(text)); setManual(parsed.layers, `Import ${file.name}`); setCsv(text); setError(null); setStatus(`Imported ${parsed.layers.length} manual layers from ${file.name}`); }
      catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    }} />
    <button className="rounded border px-3 py-1" onClick={() => {
      try { const parsed = toManualWindTable(parseWindProfileCsv(csv)); setManual(parsed.layers, 'Import wind CSV'); setError(null); setStatus(`Imported ${parsed.layers.length} manual layers`); }
      catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    }}>Import wind table</button>
    <button className="ml-3 rounded border px-3 py-1" onClick={() => setManual([...manual, { altitudeM: (manual[manual.length - 1]?.altitudeM ?? -100) + 100, speedMs: 0, directionFromDeg: 0, tempC: 15, pressureHpa: 1013.25 }], 'Add wind layer')}>Add wind layer</button>
    <div className="space-y-1">{manual.map((layer, i) => <div key={i} className="flex flex-wrap gap-2">{(['altitudeM', 'speedMs', 'directionFromDeg'] as const).map((field) => <label key={field}>{field}<input type="number" aria-label={`Wind layer ${i + 1} ${field}`} value={layer[field]} onChange={(e) => {
      if (!Number.isFinite(e.target.valueAsNumber) || e.target.valueAsNumber < 0) return;
      setManual(manual.map((row, j) => i === j ? { ...row, [field]: e.target.valueAsNumber } : row));
    }} className="ml-1 w-24 rounded p-1" style={{ background: C.sunken }} /></label>)}<button onClick={() => setManual(manual.filter((_, j) => i !== j), 'Remove wind layer')}>Remove layer {i + 1}</button></div>)}</div>
    <label>Probe altitude (m MSL)<input aria-label="Wind probe altitude" type="number" value={probe} onChange={(e) => { if (Number.isFinite(e.target.valueAsNumber)) setProbe(e.target.valueAsNumber); }} className="ml-2 rounded p-1" style={{ background: C.sunken }} /></label>
    {wind && enu && <p>Wind {wind.speedMs.toFixed(2)} m/s from {wind.directionFromDeg.toFixed(1)}° · East {enu.east.toFixed(2)}, North {enu.north.toFixed(2)} m/s · {forecast.length ? 'forecast takes precedence' : 'manual'}</p>}
    {layers.length > 0 && <button className="rounded border px-3 py-2" onClick={() => {
      const surface = windAtAltitude(layers, s.design.vehicle.launchSite?.altitudeM ?? 0);
      s.setOptions({ windSpeedSurface: surface.speedMs, windAzimuthDeg: surface.directionFromDeg }, 'Use surface weather');
    }}>Apply profile surface wind to runs</button>}
    {status && <p role="status">{status}</p>}{error && <p role="alert" style={{ color: C.bad }}>{error}</p>}
  </section>;
}
