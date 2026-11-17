// K3 candidate comparison: applies P1 (incl. per-flight option equality with arm B,
// spec Amendment 4), P2 (T = 0) and P3 to the rows from cohort-default.probe.ts, with
// the exact Amendment 3 thresholds. Exits non-zero on any failure. Nothing is tuned.
//
//   node docs/internal/execution-runs/K3-improved-default/candidate-compare.cjs [out-dir]
const fs = require('fs');
const crypto = require('crypto');
const OUT = process.argv[2] || 'out/K3/cohort-c2';
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read = (p) => JSON.parse(fs.readFileSync(p));
const failures = [];
const must = (ok, msg) => { if (!ok) failures.push(msg); };
const TOL = 1e-9; // spec section 4: printing noise only

const MANIFEST = '/home/ak/astraea-evidence/R40-published-cohort/cohort_manifest.json';
if (sha(MANIFEST) !== '3bd280773404b406439dd4684ad0d5a7f484a8fd7e9f61aaf237b2afd1fe54f5') { console.error('manifest hash'); process.exit(2); }
const manifest = read(MANIFEST).entries;
const doc = read(`${OUT}/cand.json`);
if (doc.manifest_sha256 !== '3bd280773404b406439dd4684ad0d5a7f484a8fd7e9f61aaf237b2afd1fe54f5') { console.error('cand.json manifest provenance'); process.exit(2); }

// Amendment 3 thresholds, written out literally (baseline WASM bc19590b...).
const A = { // arm A row: P3 floor
  subsonic: { mae: 7.020023422666488, within: 6 }, transonic: { mae: 7.569323699418518, within: 6 },
  supersonic: { mae: 16.58446759358418, within: 1 }, all: { mae: 9.603389562259121, within: 13 } };
const B = { // arm B row: P1/P2 ceiling
  subsonic: { mae: 5.5414374411119525, within: 7 }, transonic: { mae: 5.402402089749961, within: 7 },
  supersonic: { mae: 6.066188324415789, within: 4 }, all: { mae: 5.623962788961215, within: 18 } };
// Cross-check the literals against the L0 record of the baseline WASM, so a typo cannot pass.
const L0 = '/home/ak/astraea-evidence/goal-collegiate-accuracy/L0/summary.json';
if (fs.existsSync(L0)) {
  const s = read(L0).summaries;
  for (const k of Object.keys(A)) {
    must(Math.abs(s['wasm-A'][k].mae - A[k].mae) <= TOL && s['wasm-A'][k].within10 === A[k].within, `Amendment 3 literal A ${k} disagrees with the L0 record`);
    must(Math.abs(s['wasm-B'][k].mae - B[k].mae) <= TOL && s['wasm-B'][k].within10 === B[k].within, `Amendment 3 literal B ${k} disagrees with the L0 record`);
  }
}

const groups = { subsonic: 'byrum calisp1 calisp2 calisp3 cancerdescending ezi65 gibb thunder-lightning', transonic: 'blister calisp4 calisp5 iondrive rabia raven torrent', supersonic: 'dontdebatethis full-metal-jacket kinsel l500roc proteus6' };
for (const k in groups) groups[k] = groups[k].split(' ');
const median = (a) => { a = [...a].sort((x, y) => x - y); const n = a.length; return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2; };
const flights = manifest.map((e) => { const r = doc.rows.find((x) => x.slug === e.slug); if (!r) throw Error(e.slug); return { e, r }; });
function summarize(key) {
  const by = {};
  for (const { e, r } of flights) (by[e.airframe_group] ??= []).push((r[key] - e.measured_altitude_m) / e.measured_altitude_m * 100);
  const med = Object.fromEntries(Object.entries(by).map(([k, v]) => [k, median(v)]));
  const out = { qu8k: med.qu8k };
  for (const [name, names] of Object.entries({ ...groups, all: Object.values(groups).flat() })) {
    const vals = names.map((n) => { if (!(n in med)) throw Error(n); return med[n]; });
    out[name] = { n: vals.length, mae: vals.reduce((a, b) => a + Math.abs(b), 0) / vals.length, within: vals.filter((x) => Math.abs(x) <= 10).length, bias: vals.reduce((a, b) => a + b, 0) / vals.length };
  }
  return out;
}
const S = { cand: summarize('cand'), cBlank: summarize('cBlank'), cArm: summarize('cArm'), bNoNoz: summarize('bNoNoz') };

// P1 part 1: per-flight option equality with arm B. Exact, except the site temperature,
// where a last-digit (K -> C vs F -> C) difference is reported as such.
const optionReport = [];
for (const { e, r } of flights) {
  const a = r.optionsCand, b = r.optionsB;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const diffs = [];
  for (const k of keys) {
    if (a[k] === b[k]) continue;
    if (k === 'launchSiteTemperatureC' && typeof a[k] === 'number' && typeof b[k] === 'number' && Math.abs(a[k] - b[k]) <= 1e-12 * Math.abs(b[k])) {
      diffs.push({ key: k, kind: 'last-digit', candidate: a[k], armB: b[k], absDiff: a[k] - b[k] });
    } else diffs.push({ key: k, kind: 'DIFFERENT', candidate: a[k], armB: b[k] });
  }
  optionReport.push({ slug: e.slug, diffs });
  must(!diffs.some((d) => d.kind === 'DIFFERENT'), `P1 option equality with arm B: ${e.slug} ${JSON.stringify(diffs.filter((d) => d.kind === 'DIFFERENT'))}`);
}
const identical = optionReport.filter((o) => o.diffs.length === 0).length;
const lastDigit = optionReport.filter((o) => o.diffs.length > 0 && o.diffs.every((d) => d.kind === 'last-digit')).length;

// P1 part 2.
const c = S.cand;
must(c.all.mae <= B.all.mae + TOL, `P1 MAE ${c.all.mae} > ${B.all.mae}`);
must(c.all.within >= B.all.within, `P1 within ${c.all.within} < ${B.all.within}`);
must(Math.abs(c.all.bias) <= 5, `P1 |bias| ${c.all.bias} > 5`);
// P2, T = 0.
for (const k of ['subsonic', 'transonic', 'supersonic']) {
  must(c[k].mae <= B[k].mae + TOL, `P2 ${k} MAE ${c[k].mae} > ${B[k].mae}`);
  must(c[k].within >= B[k].within, `P2 ${k} within ${c[k].within} < ${B[k].within}`);
}
// P3, on the FROZEN arm-C definition (spec section 2: explicit 'calibrated', tip radius and temperature removed,
// the vehicle's nozzle kept as a drag input only; row cArm, which equals L0 arm C bit for bit), and on the
// stricter fully blank design (row cBlank: nozzle exit removed too, default derivation). Both must hold.
for (const [row, label] of [['cArm', 'P3 (frozen arm C)'], ['cBlank', 'P3 (fully blank, stricter)']]) {
  for (const k of ['subsonic', 'transonic', 'supersonic']) {
    must(S[row][k].mae <= A[k].mae + TOL, `${label} ${k} MAE ${S[row][k].mae} > arm A ${A[k].mae}`);
    must(S[row][k].within >= A[k].within, `${label} ${k} within ${S[row][k].within} < arm A ${A[k].within}`);
  }
}
// The frozen arm-C row must reproduce L0 arm C (Amendment 3: 4.5054/7, 5.1918/6, 6.9363/3, all 5.3534/16).
const C0 = { subsonic: [4.505418193280608, 7], transonic: [5.191765141841592, 6], supersonic: [6.936313550332696, 3], all: [5.353363464539974, 16] };
for (const [k, [mae, within]] of Object.entries(C0)) {
  must(Math.abs(S.cArm[k].mae - mae) <= TOL && S.cArm[k].within === within, `frozen arm C ${k} does not reproduce L0 arm C`);
}

const fmt = (s) => ['subsonic', 'transonic', 'supersonic', 'all'].map((k) => `${k}: ${s[k].mae.toFixed(4)} % / ${s[k].within} / ${s[k].bias >= 0 ? '+' : ''}${s[k].bias.toFixed(4)} %`).join(' | ') + ` | qu8k ${s.qu8k.toFixed(4)} %`;
const report = {
  wasm_sha256: doc.wasm_sha256, wasm_path: doc.wasm_path,
  optionEquality: { flights: flights.length, identical, lastDigitTemperatureOnly: lastDigit, other: flights.length - identical - lastDigit, detail: optionReport.filter((o) => o.diffs.length > 0) },
  appDtoEqualsManifestVehicle: doc.rows.every((r) => r.appDtoEqualsManifestVehicle),
  rows: S, failures,
};
fs.writeFileSync(`${OUT}/candidate-compare.json`, JSON.stringify(report, null, 2));
console.log(`WASM ${doc.wasm_sha256}`);
console.log(`option equality with arm B: ${identical} identical, ${lastDigit} differ in the last digit of the site temperature only, ${flights.length - identical - lastDigit} other`);
console.log(`app vehicle DTO equals the manifest vehicle for all flights: ${report.appDtoEqualsManifestVehicle}`);
for (const [name, s] of Object.entries(S)) console.log(`${name.padEnd(7)} MAE / within +-10% / bias  ${fmt(s)}`);
if (failures.length) { console.error('FAIL:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
console.log('P1, P2 (T=0), P3 on the frozen arm C and P3 on the fully blank row PASS on this WASM (see RESULT.md for what that does and does not show)');
