/**
 * ARCAS Rust/TypeScript runtime parity smoke test.
 *
 * This is a PARITY check, not an empirical-accuracy check. It exports the
 * CURRENT ARCAS vehicles from `src/validation/arcas/arcas-vehicle.ts` to a
 * temporary JSON file, runs the prebuilt Rust aero CLI
 * (`crates/astraea-core/examples/arcas_aero.rs`) on that file, and compares the
 * Rust output point-for-point against the TypeScript engine at identical
 * inputs. Agreement shows the Rust port reproduces the TS model; it says
 * nothing about how well either model matches NASA TN D-4013/D-4014
 * wind-tunnel data (that is `docs/internal/validation-arcas.md`).
 *
 * No geometry constants are duplicated here: the vehicle JSON is derived
 * directly from the exported `ARCAS_SHORT` / `ARCAS_LONG` objects, and the TS
 * oracle values are computed live. There are no hardcoded output snapshots.
 *
 * Tolerance: the pre-existing "generic port" parity bound recorded in
 * `docs/internal/validation-arcas.md` — 0.5% relative. Where the reference value is
 * near zero (e.g. subsonic fin wave drag, which is exactly 0 below M=0.8) a
 * relative comparison is meaningless, so the absolute deviation is reported
 * and checked against an absolute band instead.
 *
 * Locate the Rust binary (priority order):
 *   - `ARCAS_RUST_BINARY=/path/to/arcas_aero[.exe]`
 *   - the default build output under `crates/astraea-core/target/...`
 *
 * Run (from the repo root, after building the example):
 *   cargo build --manifest-path crates/astraea-core/Cargo.toml --example arcas_aero
 *   npx vitest run --config scripts/arcas-runtime.vitest.config.mjs
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { computeRocketStability } from '../src/aero/barrowman';
import { computeAerodynamicCurves,                      } from '../src/aero/transonicAero';
import { ARCAS_LONG, ARCAS_SHORT } from '../src/validation/arcas/arcas-vehicle';
import { ARCAS_TUNNEL_REYNOLDS_PER_METER } from '../src/validation/arcas/arcas-test-conditions';
                                                       

// --- documented parity bound -------------------------------------------------
// 0.5% relative is the pre-existing "generic port" parity bound documented in
// docs/internal/validation-arcas.md (Rust parity on generic vehicles).
const REL_TOL = 5e-3;
// Below this magnitude a relative error is not meaningful (exact zeros and
// cancellation), so the absolute deviation is reported and bounded instead.
const NEAR_ZERO = 1e-9;
const ABS_TOL = 1e-9;

                       
                      
                 
                      
                        
                         
 


/**
 * Record one Rust-vs-TS point comparison. Pushes a human-readable string onto
 * `failures` when the deviation exceeds the documented bound.
 */
function checkNumber(
  actual        ,
  expected        ,
  label        ,
  failures          ,
  stats             ,
)       {
  stats.comparisons += 1;
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
    failures.push(`${label}: non-finite value (rust=${actual}, ts=${expected})`);
    return;
  }
  const absDiff = Math.abs(actual - expected);
  if (Math.abs(expected) <= NEAR_ZERO) {
    stats.nearZeroCount += 1;
    stats.nearZeroMaxAbs = Math.max(stats.nearZeroMaxAbs, absDiff);
    if (absDiff > ABS_TOL) {
      failures.push(
        `${label}: near-zero ref ${expected} vs rust ${actual} (abs ${absDiff} > ${ABS_TOL})`,
      );
    }
    return;
  }
  const relDiff = absDiff / Math.abs(expected);
  if (relDiff > stats.maxRel) {
    stats.maxRel = relDiff;
    stats.maxRelLabel = label;
  }
  if (relDiff > REL_TOL) {
    failures.push(
      `${label}: rel ${(relDiff * 100).toFixed(4)}% > ${(REL_TOL * 100).toFixed(2)}% ` +
        `(rust=${actual}, ts=${expected}, abs=${absDiff})`,
    );
  }
}

function requireBinary(candidate        , source        )         {
  // Only path-like values are existence-checked; a bare command name is left to
  // the OS so we do not reject something that would resolve on PATH.
  const looksLikePath = candidate.includes('/') || candidate.includes('\\');
  // On Windows, CreateProcess appends `.exe` to an extensionless path, so accept
  // that form too (the docs show an extensionless example).
  const exists =
    looksLikePath &&
    (existsSync(candidate) ||
      (process.platform === 'win32' && existsSync(`${candidate}.exe`)));
  if (looksLikePath && !exists) {
    throw new Error(
      `${source} points at '${candidate}', but no file exists there. ` +
        'Build the example with `cargo build --manifest-path crates/astraea-core/Cargo.toml --example arcas_aero` ' +
        'and pass a valid path.',
    );
  }
  return candidate;
}

function resolveRustBinary()         {
  const fromEnv = process.env.ARCAS_RUST_BINARY;
  if (fromEnv && fromEnv.trim()) return requireBinary(fromEnv.trim(), 'ARCAS_RUST_BINARY');


  const exe = process.platform === 'win32' ? '.exe' : '';
  const candidates = [
    `crates/astraea-core/target/debug/examples/arcas_aero${exe}`,
    `crates/astraea-core/target/release/examples/arcas_aero${exe}`,
    `target/debug/examples/arcas_aero${exe}`,
    `target/release/examples/arcas_aero${exe}`,
  ].map((p) => resolve(process.cwd(), p));

  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      'ARCAS Rust aero binary not found. Build it with ' +
        '`cargo build --manifest-path crates/astraea-core/Cargo.toml --example arcas_aero`, or pass ' +
        '`ARCAS_RUST_BINARY=<path>`. Looked in: ' +
        candidates.join(', '),
    );
  }
  return found;
}

                          
               
                   
                      
                  
                  
                          
               
                                 
 

                          
                      
                              
                           
                         
                                
 

                            
             
               
               
                  
               
                      
                     
                        
                      
 

                      
              
                           
                           
                                 
                          
                 
                 
                      
                                   
                       
                            
                                      
    
                              
                             
 

function runRust(binary        , jsonPath        )             {
  let stdout        ;
  try {
    stdout = execFileSync(binary, [jsonPath], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    const e = error                                                  ;
    const stderr = e.stderr ? e.stderr.toString().trim() : '';
    const base = e.message ?? String(error);
    // execFileSync's message already embeds the child's stderr on Windows; only
    // append it when it is not already present so the diagnostic is not doubled.
    const detail = stderr && !base.includes(stderr) ? `\n${stderr}` : '';
    throw new Error(`Rust aero CLI failed on ${jsonPath}: ${base}${detail}`);
  }
  try {
    return JSON.parse(stdout)              ;
  } catch {
    const snippet = stdout.replace(/\s+/g, ' ').trim().slice(0, 200);
    throw new Error(
      `Rust aero CLI at '${binary}' produced non-JSON stdout: ${snippet || '(empty)'}`,
    );
  }
}

/** Compare one powered/coasting curve block against the live TS engine. */
function compareCurves(
  tag        ,
  rust                ,
  ts                 ,
  failures          ,
  stats             ,
)       {
  const rustPoints = rust.drag_curves;
  const tsPoints = ts.dragCurves;
  if (rustPoints.length !== tsPoints.length) {
    failures.push(
      `${tag}: point count rust=${rustPoints.length} ts=${tsPoints.length} (expected ${tsPoints.length})`,
    );
    return;
  }

  for (let i = 0; i < tsPoints.length; i += 1) {
    const r = rustPoints[i];
    const t = tsPoints[i];
    const prefix = `${tag}[${i}] M=${t.mach.toFixed(2)}`;
    checkNumber(r.mach, t.mach, `${prefix}.mach`, failures, stats);
    checkNumber(r.total_cd, t.totalCd, `${prefix}.cd`, failures, stats);
    checkNumber(r.cp_m, t.cp, `${prefix}.cp_m`, failures, stats);
    checkNumber(r.static_margin_calibers, t.staticMarginCalibers, `${prefix}.margin`, failures, stats);
    // Drag breakdown terms are part of the same CD sum; compare them too.
    checkNumber(r.friction_cd, t.frictionCd, `${prefix}.friction_cd`, failures, stats);
    checkNumber(r.wave_cd, t.waveCd, `${prefix}.wave_cd`, failures, stats);
    checkNumber(r.base_cd, t.baseCd, `${prefix}.base_cd`, failures, stats);
    checkNumber(
      r.protuberance_cd,
      t.protuberanceCd ?? 0,
      `${prefix}.protuberance_cd`,
      failures,
      stats,
    );
  }

  checkNumber(rust.subsonic_cd, ts.subsonicCd, `${tag}.subsonic_cd`, failures, stats);
  checkNumber(
    rust.supersonic_cd_mach2,
    ts.supersonicCdMach2,
    `${tag}.supersonic_cd_mach2`,
    failures,
    stats,
  );
  checkNumber(rust.max_transonic_cd, ts.maxTransonicCd, `${tag}.max_transonic_cd`, failures, stats);
  checkNumber(rust.mach_at_max_cd, ts.machAtMaxCd, `${tag}.mach_at_max_cd`, failures, stats);
}

function compareVehicle(
  label        ,
  vehicle               ,
  binary        ,
  workDir        ,
)       {
  const jsonPath = join(workDir, `${label.replace(/[^a-z0-9]+/gi, '-')}.json`);
  // The Rust input schema mirrors the TS RocketVehicle camelCase component
  // fields, so the exported components can be handed over verbatim.
  writeFileSync(jsonPath, JSON.stringify({
    components: vehicle.components,
    reynoldsPerMeter: ARCAS_TUNNEL_REYNOLDS_PER_METER,
  }), 'utf8');

  const rust = runRust(binary, jsonPath);
  const tsStability = computeRocketStability(vehicle);

  const failures           = [];
  const stats              = {
    comparisons: 0, maxRel: 0, maxRelLabel: '', nearZeroCount: 0, nearZeroMaxAbs: 0,
  };

  // --- stability (Barrowman CP/CNa and friends) ---
  checkNumber(rust.stability.cp_m, tsStability.cp, `${label}.stability.cp_m`, failures, stats);
  checkNumber(rust.stability.total_cna, tsStability.totalCNa, `${label}.stability.total_cna`, failures, stats);
  checkNumber(rust.stability.cg_m, tsStability.cg, `${label}.stability.cg_m`, failures, stats);
  checkNumber(rust.stability.total_mass_kg, tsStability.totalMass, `${label}.stability.total_mass_kg`, failures, stats);
  checkNumber(rust.stability.total_length_m, tsStability.totalLength, `${label}.stability.total_length_m`, failures, stats);
  checkNumber(
    rust.stability.reference_diameter_m,
    tsStability.referenceDiameter,
    `${label}.stability.reference_diameter_m`,
    failures,
    stats,
  );
  checkNumber(
    rust.stability.static_margin_calibers,
    tsStability.staticMarginCalibers,
    `${label}.stability.static_margin_calibers`,
    failures,
    stats,
  );

  // --- per-component contributions: aggregate agreement can hide a
  //     compensating error between parts ---
  const tsContribById = new Map(tsStability.contributions.map((c) => [c.id, c]));
  if (rust.stability.contributions.length !== tsStability.contributions.length) {
    failures.push(
      `${label}.contributions: count rust=${rust.stability.contributions.length} ` +
        `ts=${tsStability.contributions.length}`,
    );
  }
  for (const rc of rust.stability.contributions) {
    const tc = tsContribById.get(rc.id);
    if (!tc) {
      failures.push(`${label}.contributions: rust id '${rc.id}' not found in TS`);
      continue;
    }
    checkNumber(rc.mass_kg, tc.mass, `${label}.contrib[${rc.id}].mass`, failures, stats);
    checkNumber(rc.cg_m, tc.cg, `${label}.contrib[${rc.id}].cg`, failures, stats);
    checkNumber(rc.axial_start_m, tc.axialStart, `${label}.contrib[${rc.id}].axialStart`, failures, stats);
    checkNumber(rc.axial_end_m, tc.axialEnd, `${label}.contrib[${rc.id}].axialEnd`, failures, stats);
    if (rc.cp_m === null || tc.cp === undefined) {
      if (!(rc.cp_m === null && tc.cp === undefined)) {
        failures.push(`${label}.contrib[${rc.id}].cp: null mismatch rust=${rc.cp_m} ts=${tc.cp}`);
      }
    } else {
      checkNumber(rc.cp_m, tc.cp, `${label}.contrib[${rc.id}].cp`, failures, stats);
    }
    if (rc.cna === null || tc.cna === undefined) {
      if (!(rc.cna === null && tc.cna === undefined)) {
        failures.push(`${label}.contrib[${rc.id}].cna: null mismatch rust=${rc.cna} ts=${tc.cna}`);
      }
    } else {
      checkNumber(rc.cna, tc.cna, `${label}.contrib[${rc.id}].cna`, failures, stats);
    }
  }

  // D-4013 §Apparatus and Tests holds the tunnel Reynolds number at 9.8e6/m.
  compareCurves(
    `${label}.powered_off`,
    rust.powered_off,
    computeAerodynamicCurves(vehicle, false, 41, ARCAS_TUNNEL_REYNOLDS_PER_METER),
    failures,
    stats,
  );
  compareCurves(
    `${label}.powered_on`,
    rust.powered_on,
    computeAerodynamicCurves(vehicle, true, 41, ARCAS_TUNNEL_REYNOLDS_PER_METER),
    failures,
    stats,
  );

  const summary =
    `${label}: ${stats.comparisons} comparisons, max rel ` +
    `${(stats.maxRel * 100).toFixed(6)}% (${stats.maxRelLabel || 'n/a'}), ` +
    `${stats.nearZeroCount} near-zero (max abs ${stats.nearZeroMaxAbs})`;
  console.log(summary);

  expect(failures, `${label} parity failures:\n${failures.join('\n')}`).toEqual([]);
}

describe('ARCAS Rust/TypeScript runtime parity', () => {
  let binary        ;
  let workDir        ;

  beforeAll(() => {
    binary = resolveRustBinary();
    workDir = mkdtempSync(join(tmpdir(), 'arcas-parity-'));
    console.log(`Rust binary: ${binary}`);
    console.log(`Vehicle JSON dir: ${workDir}`);
  });

  afterAll(() => {
    if (workDir) rmSync(workDir, { recursive: true, force: true });
  });

  it('matches the TypeScript engine for the ARCAS short body', () => {
    compareVehicle('arcas_short', ARCAS_SHORT, binary, workDir);
  });

  it('matches the TypeScript engine for the ARCAS long body', () => {
    compareVehicle('arcas_long', ARCAS_LONG, binary, workDir);
  });
});
