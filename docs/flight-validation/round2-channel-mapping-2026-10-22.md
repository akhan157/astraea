# Round 2 channel mapping follow-up

**Prepared 2026-10-22, before telemetry sample values were read.** This is a
source-backed application of the unchanged mapping hierarchy in the frozen
protocol. It does not alter predictions, thresholds, source choices, or the
model. The earlier header-only audit remains preserved as the earlier
timestamped finding; this follow-up corrects its use of header-only evidence.

## Prometheus / Altus Metrum

The selected files remain the two previously hashed candidates:

| File | Device identifier in filename | Frozen channel mapping |
|---|---|---|
| `rockets_prometheus_2022-06-24-serial-5115-flight-0001-TeleMetrum.csv` | TeleMetrum, serial 5115, flight 0001 | Use raw barometric `pressure`, exported in standard SI pressure units (Pa); derive AGL against the frozen median pressure during the 10 seconds before launch. |
| `rockets_prometheus_2022-06-24-serial-6583-flight-0003-TeleMega.csv` | TeleMega, serial 6583, flight 0003 | Use raw barometric `pressure`, exported in standard SI pressure units (Pa); derive AGL against the frozen median pressure during the 10 seconds before launch. |

This mapping follows the Altus Metrum owner manual's CSV description: exported
barometric fields include pressure, altitude, and height above pad, in standard
units; CSV height/altitude values are metric regardless of display settings.
The AltOS Telemetry specification describes `pressure` as the pressure sensor
field (reported in Pa × 10 in the documented TeleMetrum v2 and TeleMega packet
formats) and describes `height` separately. The official FAQ documents that
Altus Metrum flight computers estimate height, vertical speed, and acceleration
with a Kalman sensor-fusing filter, updating from both barometer and
accelerometer below 30 km. TeleMega's protocol explicitly labels the packet
containing `height` as Kalman data. Under the frozen exclusion of processed or
fused altitude as primary barometric measurement, `height` is therefore not
eligible. `pressure` is the direct barometric sensor channel and the frozen
fallback: derive AGL from the prelaunch median using the registered standard
atmosphere conversion. The similarly named `altitude` is not selected because
it is not the raw pressure channel and lacks a documented direct AGL
interpretation for these particular exports.

Source documents checked: Altus Metrum EasyMini Owner's Manual
v1.9.22.2 (13 Oct 2025), sections 7.4.1 and 7.6.2, and AltOS Telemetry
v1.9.22.2 (13 Oct 2025), TeleMetrum and TeleMega sensor tables. These are
published documentation versions, not verified deployed firmware/export
versions. The candidate files expose the model/serial/flight identifiers in
their filenames and a field-list record headed by `#version`, but contain no
separate version/configuration prologue. The actual device firmware version,
AltosUI export version, and per-flight configuration metadata are therefore
unavailable. This does not change the documented meaning of the `height`
field; it limits device-version-specific reproducibility.

Use each `pressure` series independently, convert it to AGL using its own
prelaunch median, retain the frozen centered five-sample median apogee
extraction, and report both apogees, their arithmetic mean and spread. Do not
inspect `height` or `altitude` values for selection. For locating the
prelaunch baseline, use documented `time` in seconds and the first transition
from `Pad` to `Boost` in the `state`/`state_name` field; take the median
pressure over the 10 seconds immediately before that transition. Then use the
frozen first upward crossing of 5 m AGL for launch time and time-to-apogee.
Altus Metrum documents flight time as seconds and identifies Pad and Boost as
flight states; exact exporter version remains unavailable, so record the
source-derived mapping and version limitation with the result.

### Time-field clarification, still pre-unblinding

The first mapping commit conservatively left `time` unmapped. Before opening
any sample rows, the published Altus Metrum owner manual and telemetry
documentation were checked for the remaining baseline prerequisite. The owner
manual describes plotted data as flight time and documents time since launch;
the AltOS telemetry specification defines the device clock tick in
hundredths of a second. It also documents Pad and Boost flight states. This
follow-up therefore pins `time` as seconds and the Pad-to-Boost transition as
the state-based locator for the prelaunch baseline window. Neither the mapping
nor the result is selected by altitude agreement.

## Other selected logs and metadata blockers

The header-only audit's hashes and field lists remain the frozen candidate
inventory. No sample values have been opened for this follow-up. No additional
candidate has yet met the frozen rule based on available source/schema and
provenance metadata:

| Vehicle/log group | Follow-up disposition | Missing evidence |
|---|---|---|
| Bella Lui | Unscorable | `z (m)` is not tied by available logger/schema metadata to a barometric sensor or AGL reference. |
| Andromeda | Unscorable | `alt(ft)` and `alt(m)` have units but no sensor/reference or logger provenance establishing AGL. |
| Astra | Unscorable | `alt` has no units, sensor, or reference metadata. |
| Cavour | Unscorable | `altitude[m]` has units but no source/reference metadata establishing barometric AGL. |
| EREBUS-11 | Unscorable | `alt` has no units, sensor, or reference metadata; the filtered filename does not establish channel provenance. |
| GENESIS | Unscorable | `filtered_altitude_AGL` states a reference but not units, sensor, or filter/source; the separate GNSS file has no altitude column. |
| Lince | Unscorable | `filtered_altitude_AGL` states a reference but not units, sensor, or filter/source. |
| Juno III COTS RRC3 | Unscorable | Coordinator-provided local README metadata identifies this logger as RRC3. Its manual says reported units are configurable (default imperial); no deployed unit setting or export metadata is available. Do not infer units from the flight-card apogee or prior simulation. |
| Juno III COTS GNSS / SRAD | Unscorable | No available device/export configuration establishes units, altitude reference, or whether the SRAD altitude is fused/processed. |
| Valkyrie | Unscorable | `altitude` has no available logger/schema provenance establishing units, sensor, or reference. |

The Prometheus case is still outside proposed 1.0 scope by the already-frozen
nominal Mach classification. This mapping only establishes outcome
eligibility; it is not evidence of improved model accuracy.

## Exposure note

After the prediction commit, the coordinator opened
`rockets_juno3_README.txt`. They report that it identifies the COTS altimeter
as RRC3 and contains a flight-card apogee and a previous RocketPy simulation
value. Those outcome values were viewed after predictions and are disclosed as
an exposure. They were not used to select the RRC3 mapping, channel, units,
vehicle, or score. The RRC3 identification is used only to locate its manual;
the manual leaves the deployed measurement units unresolved without the
device's setting.

Prior public-value and notebook/source exposures documented in the frozen
protocol remain in force. This round is not independent-blind evidence.

## Sources

- Altus Metrum, [EasyMini Owner's Manual](https://altusmetrum.org/AltOS/doc/easymini.html), §§7.4.1, 7.6.2.
- Altus Metrum, [AltOS Telemetry specification](https://altusmetrum.org/AltOS/doc/telemetry.html), §§2.2–2.4.
- Altus Metrum, [FAQ: Kalman sensor-fusing flight-state estimate](https://altusmetrum.org/FAQ), “Can I fly your products to an apogee over 100k feet?”.
- Altus Metrum, [owner manual's flight monitoring and time documentation](https://altusmetrum.org/AltOS/doc/altusmetrum.html), §§12.1, 12.5, 12.7.
- Missile Works, [RRC3 User Manual](https://www.apogeerockets.com/downloads/PDFs/RRC3-user-manual.pdf), pp. 11–12 (reporting units selectable; factory default Imperial).
