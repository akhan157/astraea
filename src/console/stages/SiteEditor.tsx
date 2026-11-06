import { useEffect, useState } from 'react';
import { describeLaunchSite } from '../../application/caseResolver';
import { useWS } from '../store';
import { C } from '../kit/theme';
import { Button, FieldRow, TextField } from '../kit/Fields';

export function SiteEditor() {
  const vehicle = useWS((s) => s.design.vehicle);
  const setVehicle = useWS((s) => s.setVehicle);
  const site = vehicle.launchSite;
  const [altitude, setAltitude] = useState(site ? String(site.altitudeM) : '');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setAltitude(site ? String(site.altitudeM) : '');
    setError(null);
  }, [site]);
  return <form data-site-editor className="rounded-md px-3.5 py-3" style={{ border: `1px solid ${C.line}`, background: C.panel }} onSubmit={(e) => {
    e.preventDefault();
    const altitudeM = Number(altitude);
    if (altitude.trim() === '' || !Number.isFinite(altitudeM)) {
      setError('Enter a finite altitude, or clear the launch site.');
      return;
    }
    setVehicle({ launchSite: { altitudeM } }, 'Launch site');
    setError(null);
  }}>
    <div className="mb-1.5 text-[10.5px] tracking-[0.12em] uppercase" style={{ color: C.dim }}>Launch site</div>
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
      <FieldRow label="Altitude (m ASL)">
        <TextField
          id="launch-site-altitude"
          ariaLabel="Launch site altitude in metres above sea level"
          value={altitude}
          onChange={setAltitude}
          width={120}
          invalid={error !== null}
        />
      </FieldRow>
      <div className="flex gap-2 pb-0.5">
        <Button primary small type="submit">Apply launch site</Button>
        <Button small type="button" onClick={() => setVehicle({ launchSite: undefined }, 'Clear launch site')}>Clear launch site</Button>
      </div>
    </div>
    <p className="mt-1.5 text-[11.5px]" style={{ color: C.muted }}>{site ? describeLaunchSite(vehicle) : 'Not set · sea level standard day assumed'}</p>
    <p className="text-[11px]" style={{ color: C.dim }}>Altitude is the pad elevation and feeds every run.</p>
    {error && <p role="alert" className="mt-1 text-[12px]" style={{ color: C.bad }}>{error}</p>}
  </form>;
}
