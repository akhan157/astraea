import { useEffect, useState } from 'react';
import { describeLaunchSite } from '../../application/caseResolver';
import { useWS } from '../store';
import { C } from '../kit/theme';
import { Button, FieldRow, TextField } from '../kit/Fields';

const FT_PER_M = 3.28084;
/** Round a converted value for an input box without losing what was stored in SI. */
const tidy = (v: number): string => String(Number(v.toFixed(2)));

export function SiteEditor() {
  const vehicle = useWS((s) => s.design.vehicle);
  const setVehicle = useWS((s) => s.setVehicle);
  const units = useWS((s) => s.units);
  const imperial = units === 'imperial';
  const altUnit = imperial ? 'ft' : 'm';
  const tempUnit = imperial ? '°F' : '°C';
  const toAlt = (m: number): string => tidy(imperial ? m * FT_PER_M : m);
  const toTemp = (c: number): string => tidy(imperial ? c * 9 / 5 + 32 : c);
  const site = vehicle.launchSite;
  const [altitude, setAltitude] = useState(site ? toAlt(site.altitudeM) : '');
  const [temperature, setTemperature] = useState(site?.temperatureC === undefined ? '' : toTemp(site.temperatureC));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setAltitude(site ? toAlt(site.altitudeM) : '');
    setTemperature(site?.temperatureC === undefined ? '' : toTemp(site.temperatureC));
    setError(null);
  }, [site, imperial]); // eslint-disable-line react-hooks/exhaustive-deps
  return <form data-site-editor className="rounded-md px-3.5 py-3" style={{ border: `1px solid ${C.line}`, background: C.panel }} onSubmit={(e) => {
    e.preventDefault();
    const typed = Number(altitude);
    if (altitude.trim() === '' || !Number.isFinite(typed)) {
      setError('Enter a finite altitude, or clear the launch site.');
      return;
    }
    const altitudeM = imperial ? typed / FT_PER_M : typed;
    // The retained candidate atmosphere supports 0–20,000 m ASL.
    if (altitudeM < 0 || altitudeM > 20000) {
      setError(`Enter an altitude from 0 to ${imperial ? '65,617 ft' : '20,000 m'} above sea level; the retained atmosphere supports this range.`);
      return;
    }
    const blankTemperature = temperature.trim() === '';
    const typedTemperature = Number(temperature);
    if (!blankTemperature && !Number.isFinite(typedTemperature)) {
      setError(`Enter a finite temperature in ${tempUnit}, or leave it empty.`);
      return;
    }
    const temperatureC = imperial ? (typedTemperature - 32) * 5 / 9 : typedTemperature;
    // The site is one object: altitude and temperature are committed together,
    // so a temperature can never be dropped by an altitude edit.
    setVehicle({ launchSite: { altitudeM, ...(blankTemperature ? {} : { temperatureC }) } }, 'Launch site');
    setError(null);
  }}>
    <div className="mb-1.5 text-[10.5px] tracking-[0.12em] uppercase" style={{ color: C.dim }}>Launch site</div>
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
      <FieldRow label={`Altitude (${altUnit} above sea level)`}>
        <TextField
          id="launch-site-altitude"
          ariaLabel={`Launch site altitude in ${imperial ? 'feet' : 'metres'} above sea level`}
          value={altitude}
          onChange={setAltitude}
          width={120}
          invalid={error !== null}
        />
      </FieldRow>
      <FieldRow label={`Temperature (${tempUnit})`}>
        <TextField
          id="launch-site-temperature"
          ariaLabel={`Launch site air temperature in degrees ${imperial ? 'Fahrenheit' : 'Celsius'}`}
          value={temperature}
          onChange={setTemperature}
          width={96}
          invalid={error !== null}
        />
      </FieldRow>
      <div className="flex gap-2 pb-0.5">
        <Button primary small type="submit">Apply launch site</Button>
        <Button small type="button" onClick={() => setVehicle({ launchSite: undefined }, 'Clear launch site')}>Clear launch site</Button>
      </div>
    </div>
    <p className="mt-1.5 text-[11.5px]" style={{ color: C.muted }}>{site ? (imperial ? `${toAlt(site.altitudeM)} ft above sea level${site.temperatureC === undefined ? '' : `, ${toTemp(site.temperatureC)} °F`}` : describeLaunchSite(vehicle)) : 'Not set · sea level standard day assumed'}</p>
    <p className="text-[11px]" style={{ color: C.dim }}>Altitude is the pad elevation and feeds every run. Temperature is the air temperature at the pad; leave it empty for the standard atmosphere.</p>
    {error && <p role="alert" className="mt-1 text-[12px]" style={{ color: C.bad }}>{error}</p>}
  </form>;
}
