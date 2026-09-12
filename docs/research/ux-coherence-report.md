# Astraea UX-Coherence Audit (first-time-user walkthrough)

Read-only walk of `App.tsx`, `Header.tsx`, all four studio surfaces (CAD via
ComponentTree/PropertyInspector/MetricHUD, Propulsion, Trajectory, Evidence),
`FlightSimulationTab`, `rocketStore`, plus the sim/loads/motor/weather modules
they touch. Repo untouched; no edits or commits made.

Severity: **HIGH** = breaks a core user loop / strands user or fabricates
results. **MED** = misleading or dead-end but recoverable. **LOW** = friction.

---

## 1. Motor selection fragmentation — an imported custom motor cannot be flown anywhere

There are **three independent, non-communicating motor pickers** and no
vehicle-level motor assignment anywhere in the store (`customMotors` /
`importCustomMotor` are the only motor state — the `RocketVehicle` type has no
motor field, and no `motorId`/selection is stored).

**1a. [HIGH] Flight Sim picks from `CERTIFIED_MOTORS` only; `customMotors` is never read.**
`src/components/FlightSimulationTab.tsx:265-268`
```tsx
{Object.values(CERTIFIED_MOTORS).map((m) => (
  <option key={m.id} value={m.id}>
    [{m.impulseClass}] {m.designation} — {m.totalImpulse} Ns (⌀{(m.diameter * 1000).toFixed(0)}mm)
  </option>
))}
```
with fallback `const activeMotor: MotorSpec = CERTIFIED_MOTORS[selectedMotorId] || CERTIFIED_MOTORS.estes_c6;`
(`:46`). Grep across `src/` shows `customMotors` is read only by
`PropulsionStudio.tsx:62-63` (display). So an imported motor is invisible to
the only surface that can actually run a flight.

**1b. [HIGH] Trajectory Studio's motor is hardcoded to the C6.**
`src/App.tsx:130-132`
```tsx
{studio === 'trajectory' && (
  <TrajectoryStudio vehicle={vehicle} motor={CERTIFIED_MOTORS.estes_c6} />
)}
```
There is no motor UI in TrajectoryStudio at all — the `motor` prop only feeds
the header badge (`{motor.designation}`, `TrajectoryStudio.tsx:283`) and
`runMonteCarlo` (`:145`). Every Monte Carlo run is Estes C6, forever.

**1c. [HIGH] Propulsion Studio lists imported motors but the link stops there.**
`src/components/PropulsionStudio.tsx:62-64`
```tsx
const customMotors = useRocketStore((s) => s.customMotors);
const catalog: Record<string, MotorSpec> = { ...CERTIFIED_MOTORS, ...customMotors };
const [selectedMotorId, setSelectedMotorId] = useState<string>('estes_c6');
```
`selectedMotorId` is local state; no "fly this", no "assign to vehicle", no
export-to-sim path. The import alert points here as the destination:
`src/components/Header.tsx:58,62`
```ts
alert(`Imported motor ${motor.designation} (${motor.totalImpulse.toFixed(1)} N·s) — see Propulsion studio`);
```

**Trace of an imported motor (`.eng` or `.rse`):**
1. Header → Import `.eng`/`.rse` → `parseRaspEng`/`parseRseXml`
   (`Header.tsx:56-62`) → `importCustomMotor` → `store.customMotors`
   (`rocketStore.ts:270-271`).
2. `PropulsionStudio` merges it into its local `catalog` and renders it in the
   dropdown (`:63,:167`) with derived stats. End of path.
3. `FlightSimulationTab` dropdown (`:265`) — absent. `TrajectoryStudio` motor
   (`App.tsx:131`) — hardcoded C6. Simulator keyed by the motor object
   (`sixDofSimulator.ts:280-288`) — unreachable.
**Verdict:** an imported custom motor can be viewed, never flown. The alert
text "see Propulsion studio" is a dead-end affordance that advertises
integration that does not exist. This plus 1b also means the two trajectory
surfaces can never agree on the motor: Flight Sim (user-picked certified motor,
e.g. K550W on the NASA preset) vs Trajectory MC (always C6).

Click path that breaks: Header → Import `.eng` → alert → Propulsion tab →
select imported motor → look for any way to simulate it → none exist; Flight
Sim tab and Trajectory tab both ignore it.

---

## 2. Dead ends / placeholder text

**2a. [MED] "Live Sounding (Open-Meteo)" is cosmetic — the fetched layers feed nothing.**
`src/components/TrajectoryStudio.tsx:381-386`
```tsx
) : soundingStatus === 'ok' ? (
  <span className="text-emerald-400">{soundingLayers.length} pressure levels fetched</span>
```
`fetchSounding` result lands in `soundingLayers`, used **only** in this status
line. Monte Carlo uses the manual table's probe (`:132-136`), not the sounding.
Click path: Trajectory → coords → "Fetch Live Sounding" → "N pressure levels
fetched" → "Run Monte Carlo" → the fetched profile has zero effect. Two wind
sources exist; the "live" one is theater.

**2b. [MED] Evidence studio is a self-declared dead end.**
`src/components/EvidenceStudio.tsx:542`
```
(preview — evidence only, no sim overlay)
```
The fitted Cd (`CalibrationCard`) and parsed apogee (`AltimetryCard`) have no
downstream consumer — the sim's Cd/apogee come from `computeAerodynamicCurves`
/ `simulate6DofFlight` with no way to feed calibrated Cd or compare flight
observations. Click path: Evidence → paste CSV → Parse → Calibrate Cd → read
numbers → nothing in any other studio can consume them.

**2c. [MED] Propulsion Studio advertises "motor library" but the library is browse-only.**
`src/components/PropulsionStudio.tsx:141`
```
Certified motor library, BATES grain regression, and APCP nozzle performance — self-contained panel, no vehicle wiring
```
Honest, but it is a studio tab next to "Flight Sim" where users would expect
motor selection to mean something for the vehicle. BATES/nozzle cards use
fixed disclosed constants (`:29-37`) and never touch the selected motor.

**2d. [LOW] Header preset dropdown is uncontrolled and can disagree with the loaded vehicle.**
`src/components/Header.tsx:146-149`
```tsx
<select
  onChange={(e) => loadPreset(e.target.value)}
  defaultValue="estes_alpha"
```
After a drag-and-drop `.ork`/`.rkt`/`.json` import (`App.tsx:87-99`), the
dropdown still reads "Estes Alpha III Replica" while the vehicle-name field
shows the imported name. Similarly, modal and studio state never resets with
the vehicle.

---

## 3. Flows that require impossible state

**3a. [HIGH] Flight Sim offers motors that cannot physically fit the airframe; the run then dies.**
The modal's dropdown lists all 5 `CERTIFIED_MOTORS` with zero fit filtering or
warning. Default preset Estes Alpha bore = `innerDiameter 0.0241` m
(`rocketStore.ts:63`); only the C6 (⌀18 mm) fits. Selecting H128 (⌀29), I205,
K550W (⌀54) or M1820 (⌀75) and running throws:
`src/dynamics/loads.ts:212-214`
```ts
throw new Error(
  `prepareVehicle: motor diameter ${motor.diameter} m exceeds mount '${mount.id}' bore ${bore} m`
);
```
which surfaces as the modal's "Simulation failed at …" red alert with prior
results cleared ("Previous results were cleared"). Recoverable (pick another
motor), but 4 of 5 offered motors are physically impossible for the shipped
default rocket, with no upfront indication — the fit failure is only
discoverable by running and reading an error snapshot.
Click path: Flight Sim → "Certified Rocket Motor" → "AeroTech H128W-14A" →
"Run 6-DOF Trajectory Simulation" → red failure box.

**3b. [HIGH] Motor-mount state is invisible and uneditable, so some vehicles are permanently unflyable.**
`isMotorMount` is set only in the two presets that have it
(`rocketStore.ts:62,120`) and read in `loads.ts:193`. Grep across
`src/components` shows **no UI surface** for it — `BodyTubeControls`
(`PropertyInspector.tsx:351-390`) offers Length/Outer Dia/Inner Dia only.
Consequences:
- A rocket built from scratch in CAD (Add Airframe Component → Body Tube) has
  zero mounts → silent aft-end fallback
  (`loads.ts:200` `if (!mount) return massRollup.totalLength; // aft-end fallback`):
  the motor is placed at the airframe's total length regardless of geometry.
- An imported `.ork` with two motor-mount tubes throws on every run:
  `loads.ts:194-197`
  ```ts
  if (mounts.length > 1) {
    throw new Error(
      `prepareVehicle: ${mounts.length} motor mounts flagged (${mounts.map((m) => m.id).join(', ')}) — assignment must be unique`
    );
  }
  ```
  There is no way to clear the flag in the UI → every Flight Sim and Monte
  Carlo run fails, permanently, for that vehicle. Stranded.
Click path: import multi-mount `.ork` → Flight Sim → Run → red failure; or
build custom airframe → sim silently uses aft-end motor placement.

**3c. [MED] Monte Carlo "Surface wind" is actually the 500 m probe altitude.**
`src/components/TrajectoryStudio.tsx:36,129-137`
```ts
const [probeAltitudeM, setProbeAltitudeM] = useState<number>(500);
// Surface wind follows the manual table's probe readout so the shear
// editor and the dispersion section speak the same wind field.
const options: SixDofOptions = {
  railLength: 2.4,
  railElevationDeg: 90.0,
  ...
  windSpeedSurface: probeWind?.speedMs ?? 0,
```
The wind fed as `windSpeedSurface` is interpolated at `probeAltitudeM` (default
500 m), not at the surface (0 m). A user who sets a 500 m layer to 5 m/s gets
the dispersion driven by 5 m/s "surface" wind — a different (and wrong)
semantics than Flight Sim's surface-wind slider. The two trajectory tools can
never reproduce each other.

**3d. [MED] Chuteless rockets fabricate parachute-deployment events.**
Spaceport America preset has no parachute component
(`rocketStore.ts:196-243`); `loads.ts:172-173` produce `drogue: undefined`,
`mainChute: undefined`, so canopy drag is inert (`loads.ts:411-419`
`const drogueLive = flags.drogueDeployed && pv.drogue !== undefined;` …). Yet
the simulator still emits:
`src/sim/sixDofSimulator.ts:683` and `:694`
```
… recovery activated at …s (alt …m). High-speed drogue parachute ejected.
Main parachute opened at …m AGL. Decelerating descent for safe landing.
```
The Flight Sim timeline tells the user a drogue and main deployed that the
model never activates. The modal also shows the "Main Parachute AGL" slider
(`FlightSimulationTab.tsx:275`) for a vehicle with no main.
Click path: Preset → "Spaceport America 30k" → Flight Sim → Run → timeline
shows both deployments; actual descent is bare-airframe drag at terminal
velocity.

---

## 4. Error paths that strand the user / stale readouts

**4a. [MED] Trajectory Monte Carlo results are never marked stale.**
`src/components/TrajectoryStudio.tsx:122-159` — `mcResult` persists across wind
table edits, sigma changes, and **vehicle/preset switches** (TrajectoryStudio
is never re-keyed on `vehicle;` React keeps the instance, so `mcResult` and the
wind rows survive a preset change). The header badge then shows the *new*
vehicle name (`:283` `{vehicle.name}`) next to dispersion stats computed for
the *old* vehicle. Only a failed rerun clears it (`:158-160`). Contrast the
Flight Sim modal, which has FRESH/STALE badges and a run manifest
(`FlightSimulationTab.tsx:69,341-346`).
Click path: Trajectory → Run Monte Carlo → Header → switch preset → Trajectory
tab → stale scatter under a new rocket's name, nothing flags it.

**4b. [LOW] The "Running Monte Carlo (N runs)…" label never renders.**
`TrajectoryStudio.tsx:143-148` runs `runMonteCarlo` synchronously inside the
click handler; `setMcRunning(true)` cannot repaint before the blocking loop
(up to 200 6-DOF sims) completes. The button appears frozen with no progress
and no cancel. Same shape in EventEvidence — no.

**4c. [child of 3a] Sim failures are recoverable but the fit problem is only discoverable post-run** — see 3a. The modal does handle failure well otherwise (clears stale output, shows input snapshot, keeps the modal open) — worth preserving.

**4d. [LOW] Imported motors and presets vanish on reload.** `customMotors` is
in-memory only (`rocketStore.ts:269-271`), no persistence or warning; a user
who imported an `.eng`, closed the app, and reopens cannot find their motor in
Propulsion Studio. No hint explains non-durability.

---

## 5. Studios that duplicate or contradict each other

**5a. [MED] Two trajectory tools that cannot agree.** Flight Sim (modal) and
Trajectory MC both wrap `simulate6DofFlight` but with mutually exclusive,
non-shared inputs: modal = user motor (default C6), rail 2.4 m @ 85° /
azimuth 90°, wind slider 3.5 m/s @ 270°, main 250 m
(`FlightSimulationTab.tsx:35-44`); Trajectory MC = hardcoded C6, rail 2.4 m @
90° vertical, wind from the manual probe, main 250 m (`TrajectoryStudio.tsx:131-137`).
Same vehicle → different apogee/drift, no cross-reference, and neither surface
can see the other's wind table, rail, or motor.

**5b. [MED] Three wind sources, one consumer each.** Manual shear table
(Trajectory probe) vs Flight Sim slider vs Open-Meteo sounding (display-only,
2a). No shared state; Flight Sim and MC disagree even with identical numbers
because one applies wind at 85° rail and one at 90° vertical.

**5c. [MED] Propulsion's "Certified Motor" browser duplicates the Flight Sim
motor picker.** Same `CERTIFIED_MOTORS` records, second dropdown, independent
selection — the two selected motor ids can differ with nothing indicating the
disconnect. On the default Estes Alpha, Propulsion happily shows all five +
imports while the modal can physically fly only the C6.

**5d. [LOW] Evidence numbers contradict sim numbers without reconciliation.**
Altimetry apogee / calibrated Cd (Evidence) vs simulated apogee / transonic Cd
(Flight Sim) describe the same flight with no comparison affordance — a user
who runs both gets two apogees with no explanation.

---

## 6. What a new user cannot figure out

1. **That motors are not part of the vehicle.** Nowhere is there an
   "assigned motor"; every picker is a local dropdown and the sim takes the
   motor as a parameter (`sixDofSimulator.ts:280-282`). The import alert
   ("see Propulsion studio") implies the motor lives there; it does not.
2. **Why 4 of 5 offered motors fail** on the default rocket — bore/mount
   constraints surface only as a post-run error snapshot (3a).
3. **Where the motor mount is / how to set it** — invisible flag, no UI;
   custom rockets silently get aft-end motor placement, multi-mount imports
   are permanently unflyable (3b).
4. **Which wind drives which sim** — sounding is decorative (2a), MC reads the
   500 m probe as "surface" (3c), Flight Sim reads its own slider (5b).
5. **That Trajectory MC will always be C6** regardless of the Flight Sim motor
   or anything importable (1b).
6. **That Trajectory MC results are stale after any change** (4a).
7. **That imported motors don't survive a reload** (4d).

---

## Ranking (cheapest highest-impact fixes)

1. Wire `customMotors` into the Flight Sim picker and share one motor
   selection (store-level `selectedMotorId` + fit prefilter/warning) — closes
   1a/1b/5c and most of 6.1-6.2.
2. Filter or warn on bore fit before running — closes 3a/6.2.
3. Expose `isMotorMount` in `BodyTubeControls` and surface the
   multi-mount/zero-mount states — closes 3b/6.3.
4. Add staleness to Trajectory MC (reuse modal pattern) and key wind inputs on
   altitude 0 — closes 4a/3c.
5. Either consume the live sounding or drop the fetch — closes 2a.
6. Gate parachute event text on canopy existence — closes 3d.