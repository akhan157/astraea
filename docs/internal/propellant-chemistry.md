# Propellant chemistry

**As of 2026-10-04.** Astraea computes the theoretical performance of any solid-propellant recipe, the job ProPEP 3 does for hobby motor makers. It runs the same calculation NASA CEA does and matches CEA's output.

## What it does

- **Input:** a recipe (built-in ingredients by id, or custom ones with formula, heat of formation and density; grams or percent), chamber pressure, and exit pressure or area ratio.
- **Output:** for both shifting-equilibrium and frozen expansion: chamber, throat and exit temperature, pressure, molecular weight, γ, cp and sound speed; c*, Cf, Isp (optimum, vacuum, at ambient), Ae/At; chamber and exit composition; mixture density.
- **Code:** `crates/astraea-core/src/equilibrium.rs` (Gibbs minimization with condensed phases, the NASA RP-1311 method), `propellant.rs` (ingredients, recipe, rocket problem), `thermo.rs` (species data). Tauri commands `ingredient_library` and `propellant_performance`; bridge functions `ingredientLibrary()` and `propellantPerformance()`.

## Data

- **Product species:** NASA Glenn thermodynamic database, as shipped with CEA (`crates/astraea-core/data/thermo-propellant.inp`, about 930 products over C H O N Cl Al K Na Mg S F Fe Ca B Li Sr Ba Ti Cu Zn). Regenerate with `scripts/build-thermo-subset.py`.
- **Ingredients:** AP, KN, AN, KP, Al, Mg, S, Fe2O3, HTPB, sorbitol, dextrose, sucrose. Heats of formation come from CEA's database where it has the species; otherwise from NIST or the hobby literature (each entry names its source). Erythritol (KNER) and other ingredients still need sourced values.

## Validation

`scripts/cea-propellant-corpus.json` holds 14 NASA CEA (2002 Glenn code, via RocketCEA) rocket cases. They cover KNSB, KNDX, KNSU, APCP at three pressures and with an area ratio, AP/HTPB, AP/Al/HTPB/Fe2O3, AP/Mg/HTPB, AN/HTPB and KP/HTPB. Regenerate with `scripts/cea-propellant-corpus.py`.

| Quantity | Worst difference from CEA |
|---|---|
| Temperatures, c*, Cf, Isp, Ivac, Ae/At | 0.01% (CEA's printed precision) |
| γs, sound speed | 0.01% |
| Chamber mole fractions | 5e-6 absolute |

Differences from CEA in behaviour:

- **Throat on a phase change** (for example K2CO3 melting at 1173 K): CEA reports "discontinuity at the throat". Astraea uses the point of maximum mass flux; its exit numbers still match CEA.
- **Frozen expansion** below a condensed product's data range: CEA stops. Astraea extrapolates the fit, so frozen exit values for sugar motors are an extrapolation.
- **Non-burning mixes** (about 90% KN): CEA, Cantera and Astraea all fail to converge. Astraea returns an error.

## ProPEP 3

ProPEP 3 runs the same kind of calculation on the older PEP ingredient file. Astraea now covers its performance output natively. ProPEP results can serve as an extra cross-check, with CEA remaining the reference. Not yet built: the a and n burn-rate fit from test burns, and import of a `pepcoded.daf` ingredient file. A real file is needed to confirm that format.

## Next

- Wire the result into motor design and flight (roadmap E3): c* and the burn-rate law r = a·Pcⁿ give Pc(t); Cf·Pc·At gives thrust.
- A recipe editor in the Propulsion studio. The studio still uses the old fixed APCP preset (`solve_chamber`, which `gibbs.rs` keeps for the existing tests).
