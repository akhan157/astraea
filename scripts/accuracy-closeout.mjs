// Focused closeout journeys for three bounded UI acceptance checks.
//
// Scope: nose tip radius in the production Airframe inspector, and the
// opt-in saved-flight / saved-ensemble axial-drag provenance shown in
// Build -> Saved Runs after a settings change and after a page reload.
//
// The built `dist/` is served with the verbatim production CSP from
// `dist/_headers` (the same mechanism as scripts/browser-smoke.mjs), so the
// journeys run under the real document policy. The real production WASM engine
// flies every run; no store is mutated to create a passing result, and every
// input is typed or clicked in the UI.
//
// Two throwaway local origins are used because loading a preset creates a new
// project and resets analysis:
//   origin A: NASA Student Launch  -> supported built-up drag (flight + ensemble)
//   origin B: Spaceport America    -> engine-refused shape (flight + ensemble)
// Storage is per origin, so each origin proves save/reload independently.
//
// The Task's shared preview browser was tried first: its tab reported
// `visible:false`, the first-run coach card froze at opacity 0, and clicks
// timed out without changing the page. The documented fallback therefore
// applies: this repository's own production-CSP browser runner.
//
// Usage:
//   node scripts/accuracy-closeout.mjs
// Env:
//   ASTRAEA_EVIDENCE_DIR   default: sibling ../evidence-accuracy-bundle-frontend/closeout
//   ASTRAEA_SHOTS_DIR      default: <evidence>/runner-shots
//   ASTRAEA_EVIDENCE_JSON  default: <evidence>/runner-evidence.json
// Defaults keep an independent (coordinator) run from overwriting the author's
// retained evidence (author-run.json / author-run-shots).
//   ASTRAEA_BROWSER        chromium (default) | firefox | webkit
//   CHROMIUM_PATH          executable override for chromium
//
// Exit status: 0 only when every assertion below passes. Failures are kept in
// the evidence JSON (`status: "failed"`, `failure`) before the error is rethrown.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import { preview } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const evidenceDir = process.env.ASTRAEA_EVIDENCE_DIR ?? join(root, '..', 'evidence-accuracy-bundle-frontend', 'closeout');
const shotsDir = process.env.ASTRAEA_SHOTS_DIR ?? join(evidenceDir, 'runner-shots');
const evidenceJsonPath = process.env.ASTRAEA_EVIDENCE_JSON ?? join(evidenceDir, 'runner-evidence.json');

const TIP_HINT = 'Blunt tip radius, used only by the built-up method above about Mach 0.9. It does not change the drawn nose, the mass or the legacy model. Absent is a sharp tip.';
const TIP_WARNING = 'This nose tip radius is outside what the engine accepts (0 to the nose base diameter). Stability, aero curves and flights are refused until it is corrected or cleared.';
const REFUSAL_WARNING = 'Built-up drag was requested but not used for this rocket.';
const SUPPORTED_PREFIX = 'calibrated build-up axial drag (alpha = 0) from the in-repo method port;';
const REFUSED_PREFIX = 'legacy 25-station Mach drag tables from compute_aerodynamic_curves; legacy drag used (refused: ';

const git = (args) => {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim(); } catch { return null; }
};

const stageButton = (page, name) => page.getByRole('navigation', { name: 'Pipeline stages' }).getByRole('button', { name, exact: true });
const stage = async (page, name) => { await stageButton(page, name).click(); };

/** Dismissable first-run coach card; it is chrome, not a journey subject. */
async function dismissTour(page) {
  const skip = page.getByRole('button', { name: 'Skip tour', exact: true });
  if (await skip.count()) {
    await skip.click();
    await page.locator('[aria-label="Guided tour"]').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
  }
}

/** Screenshot every evidence state at both acceptance widths. */
async function shot(page, name, shots) {
  for (const [width, height] of [[1600, 1000], [1280, 800]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(200);
    const path = join(shotsDir, `${width}-${name}.png`);
    await page.screenshot({ path, animations: 'disabled', timeout: 60_000 });
    shots.push({ state: name, width, height, path });
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
}

/** Show the archived ensemble source itself, including records below the fold. */
async function shotSavedEnsemble(page, records, name, shots) {
  const record = records.find((item) => item.kind === 'ensemble' && item.sentence !== null);
  assert.ok(record, 'an archived ensemble source is available for visual review');
  const block = page.locator(`[data-saved-run-id="${record.id}"] [data-archived-axial-drag]`);
  for (const [width, height] of [[1600, 1000], [1280, 800]]) {
    await page.setViewportSize({ width, height });
    await block.scrollIntoViewIfNeeded();
    assert.equal(await block.isVisible(), true, 'the archived ensemble source is reachable');
    const box = await block.boundingBox();
    assert.ok(box && box.y >= 0 && box.y + box.height <= height,
      'the archived ensemble source fits inside the viewport after scrolling');
    const path = join(shotsDir, `${width}-${name}.png`);
    await page.screenshot({ path, animations: 'disabled', timeout: 60_000 });
    shots.push({ state: name, width, height, path });
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
}

/** The 2D airframe drawing's geometry only: no ids, classes, text or styles. */
const geometrySignature = (page) => page.evaluate(() => {
  const svg = document.querySelector('[role="img"][aria-label="Side and aft views with dimensions"]');
  if (!svg) return null;
  const collect = (selector, names) => [...svg.querySelectorAll(selector)].map((el) => names.map((n) => el.getAttribute(n) ?? '').join('|'));
  return {
    viewBox: svg.getAttribute('viewBox') ?? '',
    polygons: collect('polygon', ['points']),
    rects: collect('rect', ['x', 'y', 'width', 'height']),
    paths: collect('path', ['d']),
    lines: collect('line', ['x1', 'y1', 'x2', 'y2']),
  };
});

/** Parts panel text with the live mass, so a mass change cannot hide. */
const partsPanelText = (page) => page.evaluate(() => {
  const tree = document.querySelector('[role="tree"][aria-label="Assembly parts"]');
  return tree?.parentElement?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
});

/** The FieldRow a label belongs to: outer label span -> inner row div -> row with title. */
const fieldRowInfo = (page, label) => page.evaluate((wanted) => {
  const spans = [...document.querySelectorAll('span')];
  const outer = spans.find((span) => span.textContent?.trim() === wanted);
  if (!outer) return null;
  const inner = outer.parentElement;
  const row = inner?.parentElement ?? null;
  return { title: row?.getAttribute('title') ?? null, hasInput: inner?.querySelector('input') !== null };
}, label);

/** The number input rendered inside the inspector row labelled `label`. */
async function fieldInput(page, label) {
  const handle = await page.evaluateHandle((wanted) => {
    const spans = [...document.querySelectorAll('span')];
    const outer = spans.find((span) => span.textContent?.trim() === wanted);
    return outer?.parentElement?.querySelector('input') ?? null;
  }, label);
  const input = handle.asElement();
  assert.ok(input, `No number input rendered for '${label}'`);
  return input;
}

async function setFieldMm(page, label, millimetres) {
  const input = await fieldInput(page, label);
  await input.click();
  await input.fill(String(millimetres));
  await input.press('Tab');
}

/** The field's displayed number in millimetres; display formatting is not the contract. */
const fieldMm = async (page, label) => Number(await (await fieldInput(page, label)).inputValue());

const selectNose = (page) => page.getByRole('treeitem', { name: 'Von Kármán Nosecone', exact: true }).click();
const tipWarning = (page) => page.locator('[data-invalid-geometry="true"]');

async function openNoseInspector(page) {
  await stage(page, 'Airframe');
  // The 2D/3D choice is stage-local state; a run or reload remounts in 3D.
  const twoD = page.getByRole('radio', { name: '2D', exact: true });
  if (await twoD.count()) await twoD.click();
  await selectNose(page);
  await page.getByText('Nose tip radius', { exact: true }).first().waitFor({ timeout: 15_000 });
}

async function applyStagedEdits(page) {
  const apply = page.getByRole('button', { name: 'Apply staged edits', exact: true });
  await apply.click();
  await apply.waitFor({ state: 'detached', timeout: 30_000 });
}

/** The project slot is an explicit action: there is no autosave. */
async function openProjectMenu(page) {
  await page.getByRole('button', { name: 'Project menu', exact: true }).click();
  await page.getByRole('button', { name: /^Save to this browser/ }).waitFor({ timeout: 15_000 });
}

async function slotAction(page, buttonName, expected, label) {
  await openProjectMenu(page);
  await page.getByRole('button', { name: buttonName }).click();
  const started = Date.now();
  let last = null;
  while (Date.now() - started < 30_000) {
    const statuses = await page.locator('[data-project-status]').allInnerTexts().catch(() => []);
    last = statuses.map((text) => text.trim());
    const matched = last.find((text) => expected.test(text));
    if (matched !== undefined) {
      await page.keyboard.press('Escape');
      return matched;
    }
    const failed = last.find((text) => /failed/i.test(text));
    if (failed !== undefined) throw new Error(`${label} failed: ${failed}`);
    await page.waitForTimeout(100);
  }
  throw new Error(`${label} did not report success; last status: ${JSON.stringify(last)}`);
}

async function saveProjectToSlot(page) {
  return slotAction(page, /^Save to this browser/, /^Saved locally \(revision \d+\)$/, 'Save to this browser');
}

async function openSavedProject(page) {
  return slotAction(page, /^Open saved project/, /^Opened saved project \(revision \d+\)$/, 'Open saved project');
}

/** Parse the engine's axial-drag block into the warning line and the exact sentence. */
function splitAxialBlock(text) {
  const lines = String(text).split('\n').map((line) => line.trim()).filter(Boolean);
  const warning = lines.find((line) => line === REFUSAL_WARNING) ?? null;
  const line = lines.find((candidate) => candidate.startsWith('Axial drag'));
  const sentence = line === undefined ? null : line.replace(/^Axial drag\s*(·\s*)?/, '').trim();
  return { warning, sentence, raw: lines };
}

const liveAxial = async (page) => splitAxialBlock(await page.locator('[data-axial-drag]').innerText());

/** Every Saved Runs record's archived provenance block, read from the DOM. */
const savedRunRecords = (page) => page.$$eval('[data-saved-run-id]', (nodes) => nodes.map((el) => {
  const block = el.querySelector('[data-archived-axial-drag]');
  const sentence = block?.querySelector('span.font-geist-mono')?.textContent?.trim() ?? null;
  const warning = block === null || block === undefined
    ? null
    : ([...block.querySelectorAll('span')].map((span) => span.textContent?.trim()).find((text) => text === 'Built-up drag was requested but not used for this rocket.') ?? null);
  const head = el.querySelector('div')?.textContent?.trim() ?? '';
  const kind = head.startsWith('Ensemble') ? 'ensemble' : head.startsWith('Flight') ? 'flight' : 'other';
  const engineLabel = [...el.querySelectorAll('span[title^="Engine SHA-256"]')].map((span) => span.textContent?.trim())[0] ?? null;
  return { id: el.getAttribute('data-saved-run-id'), head, kind, sentence, warning, engineLabel };
}));

const readSavedRuns = async (page) => {
  await stage(page, 'Build');
  await page.locator('[aria-label="Saved runs"]').waitFor({ timeout: 30_000 });
  return savedRunRecords(page);
};

/** The shared WASM flight is finished when the banner stops saying Running. */
async function clickAndAwaitRun(page, runButton) {
  const started = Date.now();
  await runButton.click();
  let sawRunning = false;
  while (Date.now() - started < 300_000) {
    const text = (await runButton.textContent().catch(() => '')) ?? '';
    const running = text.includes('Running');
    if (running) sawRunning = true;
    else if (await runButton.isEnabled().catch(() => false)) {
      if (sawRunning || Date.now() - started > 1_500) return;
    }
    await page.waitForTimeout(100);
  }
  throw new Error('Timed out waiting for the simulation to finish');
}

async function runFlight(page) {
  const runButton = page.getByRole('banner').getByRole('button', { name: /Run simulation|Running/ });
  await clickAndAwaitRun(page, runButton);
  const apogee = page.locator('[aria-label^="Apogee (committed run) "]');
  await apogee.waitFor({ timeout: 30_000 });
  const label = await apogee.getAttribute('aria-label');
  const meters = Number(label.match(/run\) ([\d,.]+) m/)[1].replaceAll(',', ''));
  assert.ok(Number.isFinite(meters) && meters > 0, `the native flight returned ${label}`);
  return meters;
}

async function runEnsemble(page, n) {
  await stage(page, 'Flight');
  await page.getByRole('tab', { name: 'Monte Carlo', exact: true }).click();
  const runs = page.getByRole('spinbutton', { name: 'Monte Carlo nRuns', exact: true });
  await runs.fill(String(n));
  await runs.press('Tab');
  const runButton = page.getByRole('button', { name: `Run ${n} flights`, exact: true });
  await runButton.click();
  // The dispersion's axialDrag line appears during the run; the ensemble is
  // finished only when the Run button is enabled again.
  await page.locator('[data-axial-drag]').waitFor({ timeout: 300_000 });
  const started = Date.now();
  while (Date.now() - started < 300_000) {
    if (await runButton.isEnabled().catch(() => false)) return liveAxial(page);
    await page.waitForTimeout(100);
  }
  throw new Error(`Timed out waiting for the ${n}-flight ensemble to finish`);
}

async function readFlightAxial(page) {
  await stage(page, 'Flight');
  await page.getByRole('tab', { name: 'Results', exact: true }).click();
  await page.locator('[data-axial-drag]').waitFor({ timeout: 30_000 });
  return liveAxial(page);
}

/** Item 1: nose tip radius, production UI, limits and persistence. */
async function noseJourney(page, state) {
  const nose = { steps: [] };
  await stage(page, 'Airframe');
  await page.getByRole('radio', { name: '2D', exact: true }).click();
  await openNoseInspector(page);

  const addButton = page.getByRole('button', { name: 'Add Nose tip radius', exact: true });
  assert.equal(await addButton.count(), 1, 'a default nose cone offers Add');
  assert.equal((await fieldRowInfo(page, 'Nose tip radius')).hasInput, false, 'a default nose cone has no tip-radius input');
  assert.equal((await fieldRowInfo(page, 'Nose tip radius')).title, TIP_HINT, 'the hint is the production string');
  assert.equal(await tipWarning(page).count(), 0, 'no warning for an absent radius');
  const baseDiameter = await fieldMm(page, 'Base diameter');
  assert.equal(baseDiameter, 152, 'the NASA nose base diameter is 152 mm, the documented upper limit');

  const baselineGeometry = await geometrySignature(page);
  assert.ok(baselineGeometry !== null, 'the 2D drawing geometry is readable');
  const baselineParts = await partsPanelText(page);
  assert.ok(baselineParts !== null && baselineParts.includes('Parts'), 'the parts panel with its mass is readable');
  nose.baseline = { baseDiameter, baselineGeometry, baselineParts, initial: 'add-offered' };
  await shot(page, 'nose-default', state.shots);

  await addButton.click();
  assert.equal((await fieldRowInfo(page, 'Nose tip radius')).hasInput, true, 'Add replaces the button with the number field');
  assert.equal(await fieldMm(page, 'Nose tip radius'), 1, 'Add stages 1 mm');
  assert.equal(await tipWarning(page).count(), 0, '1 mm is inside the accepted range');
  assert.deepEqual(await geometrySignature(page), baselineGeometry, 'adding a tip radius must not change the drawn nose');
  assert.equal(await partsPanelText(page), baselineParts, 'adding a tip radius must not change the parts panel or mass');
  nose.steps.push({ step: 'add', valueMm: 1, warning: false });

  await setFieldMm(page, 'Nose tip radius', 1.5);
  assert.equal(await fieldMm(page, 'Nose tip radius'), 1.5, 'an in-range edit is kept exactly');
  assert.equal(await tipWarning(page).count(), 0, '1.5 mm does not warn');
  nose.steps.push({ step: 'edit-in-range', valueMm: 1.5, warning: false });

  await setFieldMm(page, 'Nose tip radius', 200);
  assert.equal(await fieldMm(page, 'Nose tip radius'), 200, 'an out-of-range value is not clamped');
  assert.equal(await tipWarning(page).count(), 1, '200 mm above the 152 mm base diameter warns');
  assert.equal(await tipWarning(page).innerText(), TIP_WARNING, 'the warning is the production string');
  assert.deepEqual(await geometrySignature(page), baselineGeometry, 'an out-of-range tip radius still must not change the drawn nose');
  assert.equal(await partsPanelText(page), baselineParts, 'an out-of-range tip radius still must not change mass');
  nose.steps.push({ step: 'above-base-diameter', valueMm: 200, warning: true, clamped: false });
  await shot(page, 'nose-warning', state.shots);

  await setFieldMm(page, 'Nose tip radius', -1);
  assert.equal(await tipWarning(page).count(), 1, 'a negative radius warns');
  nose.steps.push({ step: 'negative', valueMm: -1, warning: true });
  await setFieldMm(page, 'Nose tip radius', 1.5);
  assert.equal(await tipWarning(page).count(), 0, 'returning in range clears the warning');
  await applyStagedEdits(page);

  // Persistence of an added radius across a real save + reload + open.
  await saveProjectToSlot(page);
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('banner').waitFor();
  await dismissTour(page);
  await openSavedProject(page);
  await stage(page, 'Airframe');
  await page.getByRole('radio', { name: '2D', exact: true }).click();
  await openNoseInspector(page);
  assert.equal(await fieldMm(page, 'Nose tip radius'), 1.5, 'the added radius survives a reload');
  assert.equal(await tipWarning(page).count(), 0, 'the restored radius is in range');
  assert.deepEqual(await geometrySignature(page), baselineGeometry, 'the restored state keeps the drawn nose unchanged');
  nose.steps.push({ step: 'persisted-after-reload', valueMm: 1.5 });
  await shot(page, 'nose-persisted', state.shots);

  // The limit is enforced by the real engine, not only the warning copy.
  await setFieldMm(page, 'Nose tip radius', 200);
  await applyStagedEdits(page);
  const runButton = page.getByRole('banner').getByRole('button', { name: /Run simulation|Running/ });
  await runButton.click();
  const runFailed = page.getByText(/^Run failed:/).first();
  const debugRunState = async () => page.evaluate(() => ({
    header: document.querySelector('header')?.innerText?.slice(0, 1500) ?? null,
    statuses: [...document.querySelectorAll('[role="status"]')].map((el) => el.textContent?.trim()).filter(Boolean).slice(0, 12),
    apogee: document.querySelector('[aria-label^="Apogee (committed run) "]')?.getAttribute('aria-label') ?? null,
    runButton: (() => {
      const button = [...document.querySelectorAll('header button')].find((candidate) => /Run (simulation|candidate)|Running/.test(candidate.textContent ?? ''));
      return button ? { text: button.textContent?.trim(), disabled: button.disabled, title: button.title } : null;
    })(),
    tipRadius: (() => {
      const spans = [...document.querySelectorAll('span')];
      const outer = spans.find((span) => span.textContent?.trim() === 'Nose tip radius');
      return outer?.parentElement?.querySelector('input')?.value ?? null;
    })(),
  }));
  try {
    await runFailed.waitFor({ timeout: 120_000 });
  } catch (error) {
    state.debugRunState = await debugRunState();
    await shot(page, 'nose-engine-refusal-missing', state.shots);
    throw error;
  }
  const failureText = (await runFailed.textContent()) ?? '';
  assert.ok(failureText.includes("prepareVehicle: nose tipRadius 0.2 m on component 'nsl-nc' exceeds its nose base diameter 0.152 m"),
    `the engine must refuse a 200 mm radius on a 152 mm base; got: ${failureText}`);
  nose.engineRefusal = { trigger: 'Run simulation with 200 mm applied', text: failureText.replace(/^Run failed:\s*/, '') };
  await openNoseInspector(page);
  await setFieldMm(page, 'Nose tip radius', 1.5);
  await applyStagedEdits(page);
  nose.steps.push({ step: 'engine-refused-above-base-diameter', valueMm: 200 });

  // Clearing is also persisted.
  await openNoseInspector(page);
  await page.getByRole('button', { name: 'Clear Nose tip radius', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Add Nose tip radius', exact: true }).count(), 1, 'Clear brings the Add button back');
  assert.equal(await tipWarning(page).count(), 0, 'clearing removes the warning');
  assert.deepEqual(await geometrySignature(page), baselineGeometry, 'clearing must not change the drawn nose');
  assert.equal(await partsPanelText(page), baselineParts, 'clearing must not change the parts panel or mass');
  await applyStagedEdits(page);
  await saveProjectToSlot(page);
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('banner').waitFor();
  await dismissTour(page);
  await openSavedProject(page);
  await stage(page, 'Airframe');
  await page.getByRole('radio', { name: '2D', exact: true }).click();
  await openNoseInspector(page);
  assert.equal(await page.getByRole('button', { name: 'Add Nose tip radius', exact: true }).count(), 1, 'a cleared radius stays cleared after a reload');
  nose.steps.push({ step: 'cleared-and-persisted' });

  // Leave a valid declared radius for the provenance runs below, so the
  // engine's own archived sentence names it.
  await page.getByRole('button', { name: 'Add Nose tip radius', exact: true }).click();
  await setFieldMm(page, 'Nose tip radius', 1.5);
  await applyStagedEdits(page);
  nose.finalRadiusMm = 1.5;
  return nose;
}

/** Opt in to built-up flight drag through the real Aero controls. */
async function enableBuiltUpDrag(page) {
  await stage(page, 'Aero');
  await page.getByRole('tab', { name: 'Aerodynamic inputs', exact: true }).click();
  const model = page.getByRole('checkbox', { name: 'Use built-up aero model (beta)', exact: true });
  await model.check();
  const optIn = page.getByRole('checkbox', { name: 'Use built-up drag in flights', exact: true });
  await optIn.waitFor({ timeout: 15_000 });
  await optIn.check();
  assert.equal(await model.isChecked(), true, 'the built-up model stays selected');
  assert.equal(await optIn.isChecked(), true, 'the flight-drag opt-in is checked');
}

/** Turn the built-up model off: one project edit that also clears the opt-in. */
async function clearBuiltUpDrag(page) {
  await stage(page, 'Aero');
  await page.getByRole('tab', { name: 'Aerodynamic inputs', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Use built-up aero model (beta)', exact: true }).uncheck();
  assert.equal(await page.getByRole('checkbox', { name: 'Use built-up drag in flights', exact: true }).count(), 0,
    'clearing the model also clears the flight-drag opt-in');
}

/** Item 2a: supported built-up drag saved on NASA Student Launch. */
async function supportedOrigin(context, evidence, watch, servers) {
  const origin = await startServer(evidence.csp, servers);
  const page = await newOriginPage(context, origin, evidence, watch);
  const result = { origin };
  result.nose = await noseJourney(page, evidence);

  await enableBuiltUpDrag(page);
  await shot(page, 'aero-built-up-opt-in', evidence.shots);
  result.flightApogeeM = await runFlight(page);
  result.liveFlight = await readFlightAxial(page);
  assert.ok(result.liveFlight.sentence.startsWith(SUPPORTED_PREFIX), `supported flight must archive the engine's calibrated sentence, got: ${result.liveFlight.sentence}`);
  assert.ok(result.liveFlight.sentence.includes('nose tipRadius 0.0015 m'), 'the declared tip radius reached the engine');
  assert.ok(result.liveFlight.sentence.endsWith('not a validated model'), 'the engine line keeps its qualification');
  assert.equal(result.liveFlight.warning, null, 'a supported flight is not labeled refused');
  await shot(page, 'flight-supported-results', evidence.shots);

  result.liveEnsemble = await runEnsemble(page, 10);
  assert.ok(result.liveEnsemble.sentence.startsWith(SUPPORTED_PREFIX), `supported ensemble must archive the calibrated sentence, got: ${result.liveEnsemble.sentence}`);
  assert.ok(result.liveEnsemble.sentence.includes('drag ladder from the nominal baseline flight; ensemble members share it'), 'the ensemble shares the nominal ladder');
  assert.ok(result.liveEnsemble.sentence.includes('nose tipRadius 0.0015 m'), 'the ensemble line names the declared tip radius');
  assert.equal(result.liveEnsemble.warning, null, 'a supported ensemble is not labeled refused');
  await shot(page, 'flight-ensemble-supported', evidence.shots);

  result.recordsAfterSave = await readSavedRuns(page);
  const flightRecord = result.recordsAfterSave.find((record) => record.kind === 'flight' && record.sentence !== null);
  const ensembleRecord = result.recordsAfterSave.find((record) => record.kind === 'ensemble' && record.sentence !== null);
  assert.ok(flightRecord, 'Saved Runs archives the supported flight with its axial-drag sentence');
  assert.ok(ensembleRecord, 'Saved Runs archives the supported ensemble with its axial-drag sentence');
  assert.equal(flightRecord.sentence, result.liveFlight.sentence, 'the archived flight sentence is the engine sentence, verbatim');
  assert.equal(ensembleRecord.sentence, result.liveEnsemble.sentence, 'the archived ensemble sentence is the engine sentence, verbatim');
  assert.equal(flightRecord.warning, null, 'the archived supported flight carries no refusal warning');
  assert.equal(ensembleRecord.warning, null, 'the archived supported ensemble carries no refusal warning');
  assert.ok(flightRecord.engineLabel !== null && flightRecord.engineLabel.includes(evidence.wasmSha256.slice(0, 12)),
    `Saved Runs must name the built engine identity (${evidence.wasmSha256.slice(0, 12)}), got: ${flightRecord.engineLabel}`);
  await shot(page, 'build-saved-runs-supported', evidence.shots);

  await clearBuiltUpDrag(page);
  result.recordsAfterSettingsCleared = await readSavedRuns(page);
  assert.deepEqual(result.recordsAfterSettingsCleared, result.recordsAfterSave,
    'archived axial-drag display must not depend on the current settings');
  await shot(page, 'build-saved-runs-supported-settings-cleared', evidence.shots);

  result.saveMessage = await saveProjectToSlot(page);
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('banner').waitFor();
  await dismissTour(page);
  result.openMessage = await openSavedProject(page);
  result.recordsAfterReload = await readSavedRuns(page);
  assert.deepEqual(result.recordsAfterReload, result.recordsAfterSave, 'archived axial-drag display must survive the reload byte-for-byte');
  await shot(page, 'build-saved-runs-supported-after-reload', evidence.shots);
  await shotSavedEnsemble(page, result.recordsAfterReload, 'build-saved-ensemble-supported-after-reload', evidence.shots);

  const recordEl = page.locator(`[data-saved-run-id="${flightRecord.id}"]`);
  await recordEl.getByRole('button', { name: 'Load saved inputs', exact: true }).click();
  await page.getByRole('status').filter({ hasText: /^Loaded / }).first().waitFor({ timeout: 30_000 });
  result.recordsAfterLoadSavedInputs = await readSavedRuns(page);
  assert.deepEqual(result.recordsAfterLoadSavedInputs, result.recordsAfterSave, 'opening saved inputs must not rewrite the archived provenance');
  await shot(page, 'build-saved-runs-supported-inputs-loaded', evidence.shots);
  return result;
}

/** Item 2b: the engine's explicit refusal, saved on Spaceport America. */
async function refusedOrigin(context, evidence, watch, servers) {
  const origin = await startServer(evidence.csp, servers);
  const page = await newOriginPage(context, origin, evidence, watch);
  const result = { origin };
  await stage(page, 'Mission');
  await page.getByRole('button', { name: /^Spaceport America \(practice\)/ }).click();
  await page.getByRole('textbox', { name: 'Vehicle name' }).waitFor();
  const vehicleName = await page.getByRole('textbox', { name: 'Vehicle name' }).inputValue();
  assert.match(vehicleName, /Spaceport America/, 'the Spaceport America preset is the active vehicle');
  result.legacyApogeeM = await runFlight(page);

  await enableBuiltUpDrag(page);
  result.refusedApogeeM = await runFlight(page);
  assert.equal(result.refusedApogeeM, result.legacyApogeeM, 'a refused shape must fly its own legacy tables');
  result.liveFlight = await readFlightAxial(page);
  assert.equal(result.liveFlight.warning, REFUSAL_WARNING, 'the refused flight is labeled with the production warning');
  assert.ok(result.liveFlight.sentence.startsWith(REFUSED_PREFIX), `the refused flight keeps the engine's refusal sentence, got: ${result.liveFlight.sentence}`);
  await shot(page, 'flight-refused-results', evidence.shots);

  result.liveEnsemble = await runEnsemble(page, 10);
  assert.equal(result.liveEnsemble.warning, REFUSAL_WARNING, 'the refused ensemble is labeled with the production warning');
  assert.ok(result.liveEnsemble.sentence.startsWith(REFUSED_PREFIX), `the refused ensemble keeps the engine's refusal sentence, got: ${result.liveEnsemble.sentence}`);
  await shot(page, 'flight-ensemble-refused', evidence.shots);

  result.recordsAfterSave = await readSavedRuns(page);
  const flightRecord = result.recordsAfterSave.find((record) => record.kind === 'flight' && record.sentence !== null);
  const ensembleRecord = result.recordsAfterSave.find((record) => record.kind === 'ensemble' && record.sentence !== null);
  assert.ok(flightRecord, 'Saved Runs archives the refused flight');
  assert.ok(ensembleRecord, 'Saved Runs archives the refused ensemble');
  assert.equal(flightRecord.sentence, result.liveFlight.sentence, 'the archived refused flight sentence is verbatim');
  assert.equal(ensembleRecord.sentence, result.liveEnsemble.sentence, 'the archived refused ensemble sentence is verbatim');
  assert.equal(flightRecord.warning, REFUSAL_WARNING, 'the archived refused flight keeps the warning');
  assert.equal(ensembleRecord.warning, REFUSAL_WARNING, 'the archived refused ensemble keeps the warning');
  await shot(page, 'build-saved-runs-refused', evidence.shots);

  await clearBuiltUpDrag(page);
  result.recordsAfterSettingsCleared = await readSavedRuns(page);
  assert.deepEqual(result.recordsAfterSettingsCleared, result.recordsAfterSave,
    'the archived refusal must not depend on the current settings');
  await shot(page, 'build-saved-runs-refused-settings-cleared', evidence.shots);

  result.saveMessage = await saveProjectToSlot(page);
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('banner').waitFor();
  await dismissTour(page);
  result.openMessage = await openSavedProject(page);
  result.recordsAfterReload = await readSavedRuns(page);
  assert.deepEqual(result.recordsAfterReload, result.recordsAfterSave, 'the archived refusal must survive the reload byte-for-byte');
  await shot(page, 'build-saved-runs-refused-after-reload', evidence.shots);
  await shotSavedEnsemble(page, result.recordsAfterReload, 'build-saved-ensemble-refused-after-reload', evidence.shots);
  return result;
}

async function startServer(csp, servers) {
  const server = await preview({ preview: { host: '127.0.0.1', port: 0, open: false, headers: { 'Content-Security-Policy': csp } } });
  servers.push(server);
  return server.resolvedUrls.local[0];
}

async function newOriginPage(context, origin, evidence, watch) {
  const page = await context.newPage();
  watch(page);
  const response = await page.goto(new URL('app/', origin).href, { waitUntil: 'load', timeout: 60_000 });
  assert.equal(response.status(), 200, 'app must answer 200');
  assert.equal(response.headers()['content-security-policy'], evidence.csp, 'the app document must carry the production CSP');
  await page.getByRole('banner').waitFor({ timeout: 30_000 });
  await dismissTour(page);
  return page;
}

/** Main-world CSP probe; it runs before the error watchers so its deliberate
 *  inline-script violation is evidence, not a page error. */
async function cspProbe(context, evidence, servers) {
  const origin = await startServer(evidence.csp, servers);
  const page = await context.newPage();
  const response = await page.goto(new URL('app/', origin).href, { waitUntil: 'load', timeout: 60_000 });
  assert.equal(response.status(), 200);
  assert.equal(response.headers()['content-security-policy'], evidence.csp, 'the probe document must carry the production CSP');
  const probe = await page.evaluate(async () => {
    const violations = [];
    const handler = (event) => violations.push({ directive: event.violatedDirective, blockedURI: event.blockedURI });
    document.addEventListener('securitypolicyviolation', handler);
    let evalResult;
    try { new Function('return 1')(); evalResult = 'allowed'; } catch (error) { evalResult = `blocked:${error.name}`; }
    let wasmResult;
    try { await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])); wasmResult = 'compiled'; } catch (error) { wasmResult = `blocked:${error.name}`; }
    const script = document.createElement('script');
    script.textContent = 'window.__cspInlineProbe = "ran";';
    document.head.appendChild(script);
    script.remove();
    await new Promise((resolve) => setTimeout(resolve, 200));
    document.removeEventListener('securitypolicyviolation', handler);
    const inlineRan = window.__cspInlineProbe === 'ran';
    delete window.__cspInlineProbe;
    return { evalResult, wasmResult, inlineRan, violations };
  });
  await page.close();
  // CDP/DevTools evaluation is not subject to the page CSP, so `new Function`
  // from this probe returns 'allowed' even with a correct policy. It is
  // recorded for transparency but proves nothing; the enforcement probes below
  // are page-level script loading, which the policy does govern.
  assert.equal(probe.inlineRan, false, 'the production CSP must block an inline script');
  assert.ok(probe.violations.some((violation) => violation.directive === 'script-src-elem'), 'the blocked inline script reports a script-src-elem violation');
  assert.equal(probe.wasmResult, 'compiled', "script-src 'wasm-unsafe-eval' must allow the engine's WASM");
  return { ...probe, origin, evalProbeNote: 'CDP-injected evaluation bypasses page CSP; recorded, not asserted' };
}

async function main() {
  await mkdir(shotsDir, { recursive: true });
  const headersText = await readFile(join(root, 'dist/_headers'), 'utf8');
  const csp = headersText.match(/^  Content-Security-Policy: (.+)$/m)?.[1];
  assert.ok(csp, 'dist/_headers must carry the production Content-Security-Policy');
  const wasm = await readFile(join(root, 'src/engine/astraea_engine.wasm'));
  const wasmSha256 = createHash('sha256').update(wasm).digest('hex');
  const distWasmName = (await readdir(join(root, 'dist/assets'))).find((name) => /^astraea_engine-.*\.wasm$/.test(name));
  assert.ok(distWasmName, 'the built dist must ship the engine asset');
  const distWasm = await readFile(join(root, 'dist/assets', distWasmName));
  assert.equal(createHash('sha256').update(distWasm).digest('hex'), wasmSha256, 'the built asset must be the built WASM byte-for-byte');

  const browserName = process.env.ASTRAEA_BROWSER ?? 'chromium';
  const browserType = { chromium, firefox, webkit }[browserName];
  assert.ok(browserType, `Unknown ASTRAEA_BROWSER: ${browserName}`);
  const evidence = {
    kind: 'accuracy-closeout-author-run',
    startedAt: new Date().toISOString(),
    lane: {
      cwd: root,
      branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
      head: git(['rev-parse', 'HEAD']),
      engineSourceTree: git(['rev-parse', 'HEAD:crates/astraea-engine']),
      status: git(['status', '--porcelain=v1']),
    },
    browser: browserName,
    csp,
    wasm: { path: 'src/engine/astraea_engine.wasm', bytes: wasm.byteLength, sha256: wasmSha256 },
    distWasm: { name: distWasmName, bytes: distWasm.byteLength, sha256: createHash('sha256').update(distWasm).digest('hex') },
    wasmSha256,
    shots: [],
    pageErrors: [],
    status: 'running',
  };
  const servers = [];
  const pageErrors = evidence.pageErrors;

  let browser;
  try {
    browser = await browserType.launch(browserType === chromium ? {
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    } : {});
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const watch = (page) => {
      page.on('pageerror', (error) => pageErrors.push({ kind: 'pageerror', url: page.url(), text: error.message }));
      page.on('console', (message) => { if (message.type() === 'error') pageErrors.push({ kind: 'console', url: page.url(), text: message.text() }); });
    };
    evidence.cspProbe = await cspProbe(context, evidence, servers);
    evidence.supported = await supportedOrigin(context, evidence, watch, servers);
    evidence.refused = await refusedOrigin(context, evidence, watch, servers);
    assert.deepEqual(pageErrors, [], 'no page or console errors during the journeys');
    evidence.status = 'passed';
  } catch (error) {
    evidence.status = 'failed';
    evidence.failure = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw error;
  } finally {
    await writeFile(evidenceJsonPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    await browser?.close();
    for (const server of servers) await new Promise((resolve) => server.httpServer.close(() => resolve()));
    console.error(`evidence: ${evidenceJsonPath}`);
    console.error(`shots: ${shotsDir}`);
  }
  console.log(`Closeout journeys passed. Evidence: ${evidenceJsonPath}`);
  console.log(`Screenshots: ${shotsDir}`);
  console.log(`WASM ${wasmSha256} (${wasm.byteLength} bytes); CSP enforced; engine label: ${evidence.supported.recordsAfterSave.find((record) => record.engineLabel)?.engineLabel}`);
  console.log('Nose: add/edit/clear persisted; limits warned and engine-refused; geometry unchanged.');
  console.log(`Saved runs: supported ${evidence.supported.recordsAfterSave.length} records, refused ${evidence.refused.recordsAfterSave.length} records, verbatim after settings clear + reload.`);
}

await main();
