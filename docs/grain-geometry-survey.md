# Grain Geometry Survey — what the hobby actually uses (C10 usage check)

**Date:** 2026-09-11 · **Status:** research only, no code · **Feeds:** capability decision C10 ("add the grain shapes people actually use if low-effort")

**Question:** Beyond the shipped BATES/star regression, which solid-propellant grain geometries does the hobby actually use, and which belong in Astraea?

**Method:** primary sources only — openMotor source + readthedocs, BurnSim wiki, Richard Nakka's Experimental Rocketry site (grain theory, grain-mould, fin/rod-tube motor pages), The Rocketry Forum (TRF) threads, ProPEP documentation. Web summaries were cross-checked against the underlying pages; nothing below relies on uncorroborated secondary claims.

---

## 1. Survey of the reference tools

### 1.1 openMotor (the C10 census reference)

Native grain classes, verified from the source tree (`motorlib/grains/`):

| Geometry | Class | Engine |
|---|---|---|
| BATES | `BatesGrain` | **analytic** (`PerforatedGrain`, circle formulas) |
| End burning | `EndBurningGrain` | **analytic** (`Grain`, constant disc area) |
| Rod & tube | `RodTubeGrain` | **analytic** (`PerforatedGrain`: tube perimeter grows, rod perimeter shrinks as circles) |
| Star | `StarGrain` | FMM (pixel core map) |
| Finocyl | `Finocyl` | FMM |
| Moon burner | `MoonBurner` | FMM |
| C-slot ("C grain") | `CGrain` | FMM (slot = rectangle from casting tube toward center) |
| D-grain | `DGrain` | FMM |
| X-core | `XCore` | FMM |
| Custom | `CustomGrain` | FMM (polygon/DXF core map) |

- FMM = Fast Marching Method (`scikit-fmm` + `scikit-image`): a 2D pixel map of the core cross-section is eroded uniformly, and burning perimeter/area are read off contour lengths at each regression depth. `FmmGrain.generateCoreMap()` + `getCorePerimeter(regDist)`.
- **Key pattern:** openMotor uses analytic closed forms *where they exist* (BATES, end burner, rod & tube — all circle-only) and numerical front tracking *everywhere else*. Even the star is FMM in openMotor; Astraea's shipped star is an analytic perimeter approximation (`P = 2π·valleyRadius + 2·points·(outerRadius − valleyRadius)`), which is fine for engineering curves but ignores fillet/corner rounding.
- **Which geometries users pick** (Reddit `r/rocketry` openMotor threads): BATES as the baseline ("balancing length-to-diameter for neutrality"); moon for long-burn EX motors; star for neutral burns; finocyl for monolithic high-initial-thrust casts; custom DXF for wagon-wheel / anything else. No centralized `.ric` file census exists, so this is qualitative.

### 1.2 BurnSim

Grain types (BurnSim wiki *Grain Types*): **BATES** (and end burner by setting core diameter to zero), **C-Slot**, **D-Grain**, **Moon Burner**, **Star**, **X-Core**, **Fin-o-cyl**, **Tapered Core** (BurnSim 4, axial-varying — simulated from a meridional half-section), **Custom** (BurnSim 4, sketch/DXF/SVG/raster).

- All types including custom shapes burn through "the same pixel-based eroder" — i.e. **BurnSim has no analytic perimeter laws at all**; every geometry is numerical front erosion.
- Wiki notes per geometry: C-slot "often used to give a longer burn time by providing a larger web thickness than possible with a BATES grain in the same diameter"; moon burner "another way to increase web thickness but reduces thermal concerns" vs a slot; star for "neutral burn, reduce heat to the case"; X-core for easier manufacture than star; fin-o-cyl "advantages similar to star but easier to manufacture".

### 1.3 ProPEP

**ProPEP has no grain inputs.** It is a chemical-equilibrium program (Gibbs free-energy minimization over an ingredient list at chamber/exit pressures) that outputs $C^*$, $I_{sp}$, $T_c$, etc. Grain geometry plays no role in it and none can be entered. In Nakka's toolchain the geometry half lives in his spreadsheets (`SRM.XLS`, `PFC-BURN.XLS`); ProPEP only feeds thermochemistry (C*, density, burn-rate coefficients) into the motor design. **Survey verdict for C10's purposes: ProPEP tells us nothing about which grains to build** (and confirms C16's chemistry solver is a separate lane).

### 1.4 Nakka-Richard — published test data per geometry

Nakka's site documents four "most common grain configurations," each called out as neutral or nearly neutral (RNX grain-mould page): **unrestricted hollow cylinder; BATES; rod & tube; pseudo-finocyl**.

Published motors/static data by geometry:

| Geometry | Nakka motors with published data | Notes |
|---|---|---|
| Unrestricted hollow cylinder (inhibited or not) | A-100, B-200, C-400 (KNSU); Epoch (composite, inhibited ends) | Epoch was fired with BATES and pseudo-finocyl grains as well |
| BATES (multi-segment) | Kappa (4 segments, KNSU); Impulser (segment drawings); RNX series | "Often employed in amateur motors … approximately neutral with the right Lo/D and D/do" |
| Rod & tube | Paradigm (J-class, composite) | "Kn completely neutral … volumetric loading excellent, better than either of the other configurations; tube grain serves as thermal insulator, so no case liner needed … best suited to larger motors (J & up)" |
| Pseudo-finocyl (2-D fins) | RNX pseudo-finocyl (fin slots cut post-cast); PFC-BURN spreadsheet | 5 independent variables (grain radius, core radius, fin width, fin depth, fin count); neutral, regressive, or smoke-track tail-off profile |
| Star | Theory page only (th_grain grain-regression figure: star ≈ neutral burn) | Nakka's star discussion is analytical, not a static test |
| C-slot, moon burner, multi-perforated | **None** published | Nakka's "finocyl" is specifically the 2-D *pseudo*-finocyl ("a true finocyl grain geometry is 3-dimensional … the fins grow radially outward toward the aft end") |

Also relevant: Nakka's grain-theory page defines web fraction and volumetric loading fraction as the two knobs that trade against each other, and notes port-to-throat ratio ≥ 2–3 to avoid erosive burning — the practical constraints that drive geometry choice.

### 1.5 The Rocketry Forum threads

**Grain Geometry 101** (2010, 21 posts, practitioners incl. veteran EX/high-power flyers):
- AeroTech **hobby/mid-power is dominated by slotted (C-slot) grains**: "virtually every single-use Aerotech motor and reload kit for the RMS [hobbyline] are the slotted grains"; easy manufacture — "cast the cylinder and then cut a slot after curing," no round-core tooling.
- **HPR is BATES-predominant**: "In the hobby cases that's an accurate statement. In HPR cases, Bates grains predominate."
- BATES neutrality mechanism spelled out (core area grows while segment ends shrink).
- C-slot behavior: "slot against the wall … small spike in area at the beginning … then a continuous decrease"; longer burn with lower average thrust (same formula: White Lightning G64 in C-slot vs G79 in a BATES 29/120 config); downsides: "increased insulation requirements," soot that "pollutes colored exhaust flames," slight off-center thrust/off-balance propellant, "not often seen in professional motor applications" — "an excellent candidate for a mass-produced hobby rocket motor."
- Star: Space Shuttle SRB top segment — high initial thrust, then regressive as tips burn away.
- Moon burner: appears in AeroTech's "non-standard" motor spec sheet ("slot, Bates or moon").

**Long burn grains or moon burner** (2014):
- "Long burns are typically end grain burners or shallow cored and moonburns … thrust curve has a noticeable 'hump' … 'crescent' that tapers off."
- Commercial moon burners: AeroTech K185/M685, Cesaroni K300; multi-grain moon burners shipped in segments and glued with an alignment pipe (Cesaroni 75/98 mm) — the offset core alignment is the assembly pain point, not the ballistic modeling.
- End burners: "very few long-burn composite motors are end-burning (I49, G69, I59, Warp9-based)"; TRA L2 guide: most APCP is central-burning "because most APCP has a burn rate that is too low for useful endburners"; Warp9 burns ~18 mm/s allowing a 7.7 s I49 end burner.
- Misaligned moon-burner cores in a test burn ≈ "spectacular Roman candle" — geometry model must at least represent the offset port.

---

## 2. Candidate matrix (verdicts for C10)

Legend — **Buys** = what it gives you over shipped BATES/star. **Neutrality** = flat Kn (constant burn area ⇒ constant Pc, efficient nozzle). **Web fraction** = web/outer radius (drives burn duration). **Volumetric loading** = propellant volume/chamber volume. **Impl.** = analytic perimeter law possible, or numerical front tracking (FMM/pixel eroder) required; effort S ≤1d, M 1–3d, L >1wk against Astraea's TS engine.

| Geometry | Who uses it | Buys over BATES/star | Impl. (analysis) | Verdict | Rationale (one line) |
|---|---|---|---|---|---|
| **End burner** | AeroTech I49/G69/I59 (Warp9); very common EX/KNSU sugar motors (slow burn rates make end burners practical); BurnSim core-dia-0; openMotor native | Longest burn (web = full grain length); perfectly neutral (constant disc area); high volumetric loading (no port) | **Analytic, trivial:** constant $A_b = \pi R^2$, web = length, no port geometry | **BUILD** (S) | Real commercial + EX usage and it is the cheapest possible geometry — a constant burn-area case falls straight out of the existing sampler | 
| **Rod & tube** | Nakka Paradigm (J-class flagship); openMotor native (analytic); BurnSim does not ship it | Completely neutral Kn (rod regressive + tube progressive cancel); "excellent" volumetric loading, better than the other three Nakka configs; tube shields the case → linerless aluminum casing | **Analytic, trivial:** two concentric circles (tube perimeter grows, rod perimeter shrinks); same class as shipped BATES | **BUILD** (S) | Circle-only closed form at near-zero marginal cost, openMotor parity, real flagship EX motor behind it |
| **Moon burner** | AeroTech K185/M685, Cesaroni K300, AT "G non-std" mid-power; TRF long-burn builders; openMotor native | Long burn in the same diameter (larger web fraction than BATES); progressive-regressive "hump"; flame reaches the case only part of the burn (better insulation story than C-slot); simple offset-core casting | **Analytic, piecewise, M:** the port is a circle regressing concentrically until it contacts the case (closed form), then circle∩case arc geometry; no FMM needed | **BUILD** (M) | Top long-burn geometry in the hobby after the slot, and the offset-port model is exactly what TRF's misalignment discussion needs Astraea to represent |
| **C-slot** | AeroTech hobbyline RMS (F40, G64) and "slotted" SU; commercial mass-production staple; BurnSim + openMotor native | Longer burn (larger web) than BATES; cheapest manufacture (cast + cut slot, no core tooling); slightly regressive with ignition spike | **Analytic, piecewise, M:** slot walls recede as parallel lines, convex corners round as radius-`web` arcs, core circle grows — lines + circular arcs only | **BUILD** (M) | The single most-used hobby geometry after BATES/star (AeroTech hobbyline is "virtually all slotted"); piecewise analytic keeps it FMM-free |
| **Finocyl** | EX/advanced (Nakka RNX pseudo-finocyl + PFC-BURN; Reddit monolithic 75 mm casts; TRF 3-D-printed mandrel trend); tactical/professional motors | High initial surface (high liftoff thrust) with neutral or regressive tail; good volumetric loading; monolithic casting; true finocyl is 3-D (fins grow toward aft) | **Needs FMM / crude 2-D approximation only** — both openMotor and BurnSim pixel-erode it; Nakka's PFC-BURN is the only analytic route, and it models the 2-D pseudo-finocyl | **SKIP (defer)** | EX-only demand and no closed-form perimeter law; only worth it behind a general front-tracking engine, which is an L-XL lift |
| **Multi-perforated / wagon wheel** | Rare in the hobby (casting difficulty: multi-piece/draft-angle mandrels, vacuum casting, venting voids); not native to openMotor or BurnSim (custom/DXF only); mostly industrial/large commercial | High volumetric loading + near-neutral; thin webs; odd spoke counts for acoustic stability | Circles per port are analytic, but port-merge (into-into-port) events need intersection bookkeeping — effectively needs front tracking for fidelity | **SKIP** | No hobby-cast demand and every reference tool treats it as a custom-DXF case; the FMM engine that would enable it is not worth building for this demand |

Also present in tools but out of scope: D-grain and X-core (manufacturing-ease variants of star, minimal hobby footprint), Tapered Core (axial-varying cross-section — needs a meridional simulator, different architecture), custom/DXF (needs FMM).

---

## 3. Recommendation

**Build set (in order):** end burner (S) → rod & tube (S) → moon burner (M) → C-slot (M). All four are (piecewise) analytic — circles, lines, and radius-`web` arcs — and map directly onto the shipped web-sampled `grainRegression` engine without a new numerical core. Together they cover the three things the hobby actually buys beyond BATES/star: **long burns** (end burner, moon, C-slot), **neutrality with high loading** (end burner, rod & tube), and **cheap manufacture profiles** (C-slot).

**Definitely skip:** finocyl, multi-perforated (and D/X/tapers) — usage is EX/industrial only, and fidelity requires a Fast-Marching/pixel-erosion engine (openMotor's FMM is scikit-fmm over raster maps; porting that to the TS client is an L–XL effort). Revisit finocyl only if a general front-tracking lane is ever funded; until then Astraea's analytic engine covers every mass-produced hobby geometry.

**Caveats:** openMotor "user-picked geometry" evidence is qualitative (forum threads, no centralized design census). BurnSim usage numbers are not published. Commercial grain geometry is inferred from catalogs/instructor notes as sourced in §1.5, not from the manufacturers' spec sheets directly.

---

## Sources

- openMotor source: `motorlib/grains/` (bates, endBurner, rodTube, finocyl, moonBurner, star, cGrain, dGrain, xCore, custom), `motorlib/grain.py` (FmmGrain/PerforatedGrain) — github.com/reilleya/openMotor
- openMotor readthedocs: `motorlib.grain`, `motorlib.geometry` — openmotor.readthedocs.io/en/latest/motorlib.html
- openMotor README (feature list, FMM claim) — github.com/reilleya/openMotor
- BurnSim wiki, Grain Types — wiki.burnsim.com/wiki/Grain_Types
- Nakka: Solid Rocket Motor Theory — Propellant Grain (th_grain.html); RNX Composite Propellant — Grain Mould (rnx_mou.html, four configurations, rod & tube and pseudo-finocyl detail); RNX Grain Completion (rnx_fin.html, fin-slot cutting); Kappa (kappa.html); Paradigm (paradigm.html); ProPEP (th_prope.html)
- TRF: Grain Geometry 101 (rocketryforum.com/threads/grain-geometry-101.13476); Long burn grains or moon burner (rocketryforum.com/threads/long-burn-grains-or-moon-burner.70008)
- Reddit r/rocketry openMotor threads (user geometry choices, .ric/.dxf sharing)
- NASA-style star reference in TRF Grain Geometry 101 (Shuttle SRB top-segment star grain)