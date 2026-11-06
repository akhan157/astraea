"""Launch-time atmosphere from the ERA5 files RocketPy ships (inputs, not flight data).

Usage: python era5_launch.py <weather.nc> <lat> <lon> <utc ISO 'YYYY-MM-DDTHH:MM'> <elevation_m> > out.json

Rule (registered in docs/flight-validation/round2-protocol.md): bilinear in
latitude/longitude, linear in time between the bracketing analyses, geopotential
height z/g0 per pressure level. Pad pressure and temperature are interpolated
(log-pressure vs height, linear temperature) to the launch elevation; the
surface wind is the (u, v) interpolated linearly in height to elevation + 10 m.
Below the lowest pressure level, p and T are extrapolated hydrostatically with
the standard 6.5 K/km lapse rate and the wind is held at the lowest level.
"""
import datetime as dt
import json
import sys

import netCDF4 as nc
import numpy as np

G0 = 9.80665


def main(path, lat, lon, when, elev):
    d = nc.Dataset(path)
    tname = 'valid_time' if 'valid_time' in d.variables else 'time'
    lname = 'pressure_level' if 'pressure_level' in d.variables else 'level'
    tv = d[tname]
    times = nc.num2date(tv[:], tv.units, only_use_cftime_datetimes=False, only_use_python_datetimes=True)
    t0 = np.array([(t.replace(tzinfo=None) - dt.datetime(1970, 1, 1)).total_seconds() for t in times])
    target = (dt.datetime.fromisoformat(when) - dt.datetime(1970, 1, 1)).total_seconds()
    if not (t0[0] <= target <= t0[-1]):
        raise SystemExit(f'launch time {when} outside file range')
    i1 = int(np.searchsorted(t0, target))
    i0 = max(i1 - 1, 0) if t0[i1] != target else i1
    wt = 0.0 if i0 == i1 else (target - t0[i0]) / (t0[i1] - t0[i0])
    lats = d['latitude'][:]
    lons = d['longitude'][:]
    levels = np.array(d[lname][:], dtype=float)

    def interp_xy(arr):  # arr[level, lat, lon] -> [level]
        # latitude may be descending
        li = np.argsort(lats)
        la = lats[li]
        a = arr[:, li, :]
        y1 = int(np.clip(np.searchsorted(la, lat), 1, len(la) - 1))
        y0 = y1 - 1
        x1 = int(np.clip(np.searchsorted(lons, lon), 1, len(lons) - 1))
        x0 = x1 - 1
        wy = (lat - la[y0]) / (la[y1] - la[y0])
        wx = (lon - lons[x0]) / (lons[x1] - lons[x0])
        return ((1 - wy) * ((1 - wx) * a[:, y0, x0] + wx * a[:, y0, x1])
                + wy * ((1 - wx) * a[:, y1, x0] + wx * a[:, y1, x1]))

    def field(name):
        v0 = interp_xy(np.array(d[name][i0], dtype=float))
        v1 = interp_xy(np.array(d[name][i1], dtype=float))
        return (1 - wt) * v0 + wt * v1

    z = field('z') / G0
    t = field('t')
    u = field('u')
    v = field('v')
    order = np.argsort(z)
    z, levels_s, t, u, v = z[order], levels[order], t[order], u[order], v[order]

    def at(h):
        if h < z[0]:
            # Below the lowest pressure level: standard lapse rate (6.5 K/km)
            # hydrostatic extrapolation for p and T; the wind is clamped to the
            # lowest level (the file has no lower information).
            tk = float(t[0] + 0.0065 * (z[0] - h))
            pk = float(levels_s[0] * (tk / t[0]) ** (G0 / (287.05287 * 0.0065)))
            return (pk, tk, float(u[0]), float(v[0]))
        lp = np.interp(h, z, np.log(levels_s))
        return (float(np.exp(lp)), float(np.interp(h, z, t)),
                float(np.interp(h, z, u)), float(np.interp(h, z, v)))

    p, tk, _, _ = at(elev)
    _, _, u10, v10 = at(elev + 10.0)
    speed = float(np.hypot(u10, v10))
    from_deg = float((np.degrees(np.arctan2(-u10, -v10)) + 360.0) % 360.0)
    print(json.dumps({
        'file': path.split('/')[-1], 'utc': when, 'lat': lat, 'lon': lon, 'elevationM': elev,
        'padPressureHPa': round(p, 3), 'padTemperatureC': round(tk - 273.15, 2),
        'u10': round(float(u10), 3), 'v10': round(float(v10), 3),
        'windSpeed10m': round(speed, 3), 'windFromDeg': round(from_deg, 1),
        'windBelowLowestLevel': bool(elev + 10.0 < z[0]), 'timeIndex': [int(i0), int(i1)], 'timeWeight': round(float(wt), 3),
        'lowestLevelHeightM': round(float(z[0]), 1), 'highestLevelHeightM': round(float(z[-1]), 1),
    }))


if __name__ == '__main__':
    main(sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4], float(sys.argv[5]))
