import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from 'playwright/test';
import JSZip from 'jszip';

/**
 * Replacing a design with unsaved edits asks first; these journeys mean to
 * replace it. The ask opens in the same event as the click or file pick, so
 * once the page has run one more task the Replace button is either on screen
 * or not coming. No wall-clock wait: a busy CI page can take longer than any
 * fixed timeout just to answer.
 */
async function confirmReplace(target) {
  await target.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
  const replace = target.getByRole('button', { name: 'Replace', exact: true });
  if (await replace.isVisible()) await replace.click();
}


export async function previewDepth(page, origin) {
  const stage = (name) => page.getByRole('navigation', { name: 'Pipeline stages' }).getByRole('button', { name, exact: true }).click();
  const menu = async (target, name) => {
    await target.getByRole('button', { name: 'Project menu', exact: true }).click();
    await target.getByRole('button', { name: new RegExp(`^${name}`) }).click();
    await confirmReplace(target);
  };
  for (const preset of ['Estes Alpha III', 'NASA Student Launch', 'Spaceport America (practice)']) {
    await stage('Mission');
    await page.getByRole('button', { name: new RegExp(`^${preset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).click();
    await confirmReplace(page);
    await page.getByRole('banner').getByRole('button', { name: /Run simulation/ }).click();
    await expect(page.getByRole('banner').getByRole('button', { name: /Run simulation/ })).toBeEnabled({ timeout: 60_000 });
    const label = await page.locator('[aria-label^="Apogee (committed run) "]').getAttribute('aria-label');
    const meters = Number(label.match(/run\) ([\d,.]+) m/)[1].replaceAll(',', ''));
    assert.ok(Number.isFinite(meters) && meters > 0, `${preset}: ${label}`);
    console.log(`Preset software check passed: ${preset}: ${label} (not physical validation)`);
  }

  const vehicleName = page.getByRole('textbox', { name: 'Vehicle name' });
  const nameBeforeRefusal = await vehicleName.inputValue();
  for (const unsupported of [
    { stage: '', fins: '<freeformfinset><name>Malformed fins</name></freeformfinset>', reason: 'has no <finpoints>' },
    { stage: '<overridemass>1.05</overridemass>', fins: '', reason: 'Unsupported mass/CG override' },
  ]) {
    const zip = new JSZip();
    zip.file('rocket.ork', `<openrocket><rocket><name>Must not replace project</name><subcomponents><stage>${unsupported.stage}<subcomponents><bodytube><length>0.5</length><radius>0.025</radius><subcomponents>${unsupported.fins}</subcomponents></bodytube></subcomponents></stage></subcomponents></rocket></openrocket>`);
    await page.getByLabel('Import file', { exact: true }).setInputFiles({ name: 'unsupported.ork', mimeType: 'application/octet-stream', buffer: Buffer.from(await zip.generateAsync({ type: 'uint8array' })) });
    await confirmReplace(page);
    await expect(page.getByText(new RegExp(unsupported.reason))).toBeVisible();
    await expect(vehicleName).toHaveValue(nameBeforeRefusal);
    await page.getByRole('button', { name: 'Dismiss disclosure', exact: true }).click();
  }
  console.log('Import safety check passed: malformed freeform geometry and mass overrides refused without replacing project');

  // End-to-end freeform acceptance: real synthetic ORK import, visible 2D
  // polygon, inspector edit, and a committed flight through the WASM worker.
  const fixturePath = new URL('./fixtures/freeform-fins-synthetic.ork', import.meta.url);
  const fixture = await readFile(fixturePath);
  await page.getByLabel('Import file', { exact: true }).setInputFiles({
    name: 'freeform-fins-synthetic.ork', mimeType: 'application/octet-stream', buffer: fixture,
  });
  await confirmReplace(page);
  await expect(vehicleName).toHaveValue('Freeform Fin Fixture');
  await stage('Airframe');
  const finRow = page.getByRole('treeitem', { name: 'Fin set', exact: true });
  await finRow.click();
  await expect(page.getByTestId('freeform-points')).toBeVisible();
  await expect(page.getByTestId('freeform-point-4')).toBeVisible();
  await page.getByRole('radio', { name: '2D', exact: true }).click();
  const drawing = page.getByRole('img', { name: 'Side and aft views with dimensions' });
  await expect(drawing.locator('polygon')).toHaveCount(2); // exact top and bottom outline polygons
  await expect(drawing.locator('rect')).toHaveCount(5); // two tubes and three aft-view fin instances
  await page.screenshot({ path: '/tmp/astraea-freeform-2d-smoke.png' });

  const editedX = page.getByTestId('freeform-point-2').locator('input').first();
  const originalX = await editedX.inputValue();
  await editedX.press('ArrowUp');
  await editedX.press('Tab');
  await expect(editedX).not.toHaveValue(originalX);
  const editedValue = await editedX.inputValue();
  await page.getByRole('button', { name: 'Apply staged edits', exact: true }).click();
  await page.getByRole('banner').getByRole('button', { name: /Run simulation/ }).click();
  const freeformApogee = page.locator('[aria-label^="Apogee (committed run) "]');
  await freeformApogee.waitFor({ timeout: 90_000 });
  const freeformResult = await freeformApogee.getAttribute('aria-label');
  const apogeeM = Number(freeformResult.match(/run\) ([\d,.]+) m/)[1].replaceAll(',', ''));
  assert.ok(Number.isFinite(apogeeM) && apogeeM > 0, `Freeform native flight returned ${freeformResult}`);
  console.log(`Freeform UI smoke passed: imported 4-point ORK outline, edited point 2 (${originalX} → ${editedValue}), and native WASM flight ${freeformResult}`);

  await stage('Aero');
  await expect(page.getByText(/does not substitute an equivalent one for a freeform outline/)).toBeVisible();

  // Inspect the actual bytes downloaded by each geometry exporter.
  await stage('Build');
  await page.getByRole('radio', { name: 'Plain file', exact: true }).click();
  const exportBytes = async (format) => {
    const row = page.locator(`[data-format="${format}"]`);
    await row.getByRole('button', { name: 'Review export', exact: true }).click();
    const downloadReady = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Confirm export', exact: true }).click();
    const download = await downloadReady;
    const bytes = await readFile(await download.path());
    return { filename: download.suggestedFilename(), bytes };
  };
  const rkt = page.locator('[data-format="rkt"]');
  await expect(rkt).toContainText(/has no free-form fin-set node/);
  await expect(rkt.getByRole('button', { name: 'Review export' })).toBeDisabled();
  const ork = await exportBytes('ork');
  const archive = await JSZip.loadAsync(ork.bytes);
  const orkXml = await archive.file('rocket.ork')?.async('string');
  assert.match(orkXml ?? '', /<freeformfinset>[\s\S]*<finpoints>/);
  assert.match(orkXml ?? '', /<point x="0\.056" y="0\.082"\/>/);
  const step = await exportBytes('step');
  assert.match(step.bytes.toString('utf8'), /ISO-10303-21/);
  assert.match(step.bytes.toString('utf8'), /Fin set \(fin 1\/3\)/);
  const stl = await exportBytes('stl');
  assert.ok(stl.bytes.length > 84 && stl.bytes.subarray(0, 20).toString('ascii').includes('ASTRAEA CAD EXPORT'));
  const svg = await exportBytes('svg');
  assert.match(svg.bytes.toString('utf8'), /class="bp-fin"/);
  console.log(`Freeform exports inspected: ${ork.filename} (finpoints), ${step.filename} (STEP polygon), ${stl.filename} (${stl.bytes.length} bytes), ${svg.filename} (fin outline); RKT refused with a precise reason`);

  // Two independent UI sessions, one IndexedDB slot: a stale tab must not
  // overwrite the newer tab's bytes. Both tabs belong to this test profile.
  await menu(page, 'Open the copy in this browser');
  await expect(page.getByRole('textbox', { name: 'Vehicle name' })).toHaveValue('Preview acceptance rocket');
  await page.keyboard.press('Escape');
  const other = await page.context().newPage();
  try {
    await other.goto(new URL('app/', origin).href);
    await menu(other, 'Open the copy in this browser');
    await expect(other.getByRole('textbox', { name: 'Vehicle name' })).toHaveValue('Preview acceptance rocket');
    await other.keyboard.press('Escape');
    await other.getByRole('textbox', { name: 'Vehicle name' }).fill('Other tab wins');
    await menu(other, 'Save in this browser');
    await expect(other.locator('[data-project-status="ok"]')).toContainText('Saved in this browser');
    await page.getByRole('textbox', { name: 'Vehicle name' }).fill('Stale tab must not win');
    await menu(page, 'Save in this browser');
    await expect(page.locator('[data-project-status="error"]')).toContainText(/stale/i);
    await page.keyboard.press('Escape');
    await menu(page, 'Open the copy in this browser');
    await expect(page.getByRole('textbox', { name: 'Vehicle name' })).toHaveValue('Other tab wins');
    await page.keyboard.press('Escape');
  } finally {
    await other.close();
  }
  console.log('Browser data-safety check passed: cross-tab stale save refused; newer document preserved');

  await stage('Mission');
  await page.getByRole('button', { name: /^NASA Student Launch/ }).click();
  await confirmReplace(page);
  await stage('Flight');
  await page.getByRole('tab', { name: 'Monte Carlo', exact: true }).click();
  const runs = page.getByRole('spinbutton', { name: 'Monte Carlo nRuns', exact: true });
  await runs.fill('1000');
  const started = Date.now();
  await page.getByRole('button', { name: 'Run 1000 flights', exact: true }).click();
  await stage('Verify');
  await stage('Flight');
  assert.ok(Date.now() - started < 10_000, 'UI must remain responsive while workers run');
  // The remount resets the dock to its first tab; the run continues in the
  // jobs store, so re-select Monte Carlo before waiting on its progress.
  await page.getByRole('tab', { name: 'Monte Carlo', exact: true }).click();
  await page.getByText(/1000\s*\/\s*1000/).waitFor({ timeout: 300_000 });
  await expect(page.getByRole('img', { name: '1000 simulated landing points', exact: true })).toBeVisible();
  console.log(`Full ensemble check passed: 1000 landings in ${((Date.now() - started) / 1000).toFixed(1)} s; UI remained responsive`);

  // Compare the plotted point coordinates, not implementation-specific SVG ids.
  const points = () => page.getByRole('img', { name: '10 simulated landing points', exact: true }).locator('circle').evaluateAll((nodes) => nodes.map((node) => [node.getAttribute('cx'), node.getAttribute('cy')]));
  await runs.fill('10');
  await page.getByRole('button', { name: 'Run 10 flights', exact: true }).click();
  await page.getByText(/10\s*\/\s*10/).waitFor({ timeout: 60_000 });
  const first = await points();
  assert.ok(first.length >= 10);
  await page.getByRole('button', { name: 'Run 10 flights', exact: true }).click();
  await page.getByText(/10\s*\/\s*10/).waitFor({ timeout: 60_000 });
  assert.deepEqual(await points(), first, 'Same seed and inputs must reproduce the plotted ensemble');
  console.log('Seed reproducibility check passed');

  const currentName = await vehicleName.inputValue();
  await page.getByRole('button', { name: 'Copilot', exact: true }).click();
  await page.getByRole('button', { name: 'Ask copilot', exact: true }).click();
  const copilot = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Rule-based engineering copilot' }) });
  await expect(copilot.locator('strong').first()).toBeVisible({ timeout: 60_000 });
  await expect(vehicleName).toHaveValue(currentName);
  await page.keyboard.press('Escape');
  console.log('Rule-based copilot checks computed without applying a design change');
}


/**
 * Accuracy bundle journeys: site temperature, nozzle back-pressure thrust,
 * built-up flight drag and the refused shape a shipped template provides.
 *
 * Every apogee assertion compares with a baseline flown in the same session on
 * the same engine and template, so an engine swap keeps the check meaningful.
 * Screenshots are written only when ASTRAEA_SHOTS_DIR is set (evidence stays
 * outside the repository).
 */
// Session restore since af43d61 carries the previous journey across reloads.
async function resetAccuracyProject(page) {
  await page.evaluate(async () => {
    const keys = ['astraea.working-session.v1', 'astraea.project.v1'];
    for (const key of keys) localStorage.removeItem(key);
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('astraea', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('IndexedDB open blocked'));
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('projects', 'readwrite');
        for (const key of keys) tx.objectStore('projects').delete(key);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error('Project reset aborted'));
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  });
  await page.reload();
  // Wait for the app to mount (restore runs at startup) before asserting no restore.
  await expect(page.getByRole('banner')).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.getByRole('status').filter({ hasText: 'Restored unsaved work' })).toHaveCount(0);
}

export async function accuracyBundleJourneys(page, origin) {
  const stage = (name) => page.getByRole('navigation', { name: 'Pipeline stages' }).getByRole('button', { name, exact: true }).click();
  const shots = process.env.ASTRAEA_SHOTS_DIR;
  const shot = async (name) => {
    if (!shots) return;
    for (const [width, height] of [[1600, 1000], [1280, 800]]) {
      await page.setViewportSize({ width, height });
      // A live WebGL viewport keeps repainting; freeze CSS transitions and give
      // the compositor room under software GL.
      await page.screenshot({ path: join(shots, `${width}-${name}.png`), animations: 'disabled', timeout: 60_000 });
    }
    await page.setViewportSize({ width: 1600, height: 1000 });
  };
  const runFlight = async () => {
    await page.getByRole('banner').getByRole('button', { name: /Run simulation/ }).click();
    await expect(page.getByRole('banner').getByRole('button', { name: /Run simulation/ })).toBeEnabled({ timeout: 120_000 });
    const label = await page.locator('[aria-label^="Apogee (committed run) "]').getAttribute('aria-label');
    const meters = Number(label.match(/run\) ([\d,.]+) m/)[1].replaceAll(',', ''));
    assert.ok(Number.isFinite(meters) && meters > 0, `native flight returned ${label}`);
    return meters;
  };
  const openAeroInputs = async () => {
    await stage('Aero');
    await page.getByRole('tab', { name: 'Aerodynamic inputs', exact: true }).click();
  };
  const expectAbsent = async (name) => {
    assert.equal(await page.getByText(name, { exact: true }).count(), 0, `${name} must not appear for a default project`);
  };

  // K3: built-up drag is now the default flight, and says so on the result. A result for the
  // explicit legacy choice carries the engine's own "legacy ... calibrated drag not requested" line.
  const expectLegacyLine = async () => {
    await expect(page.getByText('Axial drag', { exact: true })).toBeVisible();
    await expect(page.getByText(/calibrated drag not requested/).first()).toBeVisible();
    await expect(page.getByText('Built-up drag was requested but not used for this rocket.')).toHaveCount(0);
  };

  await page.goto(new URL('app/', origin).href);
  await resetAccuracyProject(page);
  await expect(page.getByRole('banner')).toBeVisible();
  await stage('Mission');

  // The baseline of this journey is the legacy flight, chosen with the checkbox (on by default for a new project).
  await openAeroInputs();
  const flightDragBox = page.getByRole('checkbox', { name: 'Use built-up drag in flights', exact: true });
  await flightDragBox.setChecked(false); // idempotent: a restored earlier project may already be on the legacy flight
  await stage('Mission');

  // ── legacy flight: none of the new lines may appear ────────────────────────
  const nasaBaseline = await runFlight();
  assert.ok(Math.abs(nasaBaseline - 534) < 2, `Desktop baseline ~534 m; browser returned ${nasaBaseline} m`);
  await stage('Flight');
  await page.getByRole('tab', { name: 'Results', exact: true }).click();
  await expectLegacyLine();
  await expectAbsent('Site temperature');
  await page.getByRole('tab', { name: 'Monte Carlo', exact: true }).click();
  await expectAbsent('Axial drag');
  await stage('Build');
  await expectAbsent('Atmosphere');
  await expectAbsent('Thrust pressure');
  await expectAbsent('Axial drag');
  console.log(`Accuracy bundle legacy journey passed: no new line on the explicit legacy flight (baseline ${nasaBaseline} m)`);

  // ── site temperature ──────────────────────────────────────────────────────
  await stage('Mission');
  await page.getByLabel('Launch site altitude in metres above sea level', { exact: true }).fill('400');
  await page.getByLabel('Launch site air temperature in degrees Celsius', { exact: true }).fill('30');
  await page.getByRole('button', { name: 'Apply launch site', exact: true }).click();
  await expect(page.getByText('400 m ASL, 30 °C', { exact: true })).toBeVisible();
  await shot('mission-site-temperature');
  const warm = await runFlight();
  assert.ok(warm > nasaBaseline, `a warm pad must raise apogee on this engine (${warm} m vs ${nasaBaseline} m)`);
  await stage('Flight');
  await expect(page.getByText('Site temperature', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Results', exact: true }).click();
  await expectLegacyLine();
  await shot('flight-site-temperature');
  await stage('Build');
  await expect(page.getByText('Atmosphere', { exact: true })).toBeVisible();
  await expect(page.getByText('Thrust pressure', { exact: true })).toBeVisible();
  await expect(page.getByText('Axial drag', { exact: true })).toBeVisible();
  await expect(page.getByText(/site-anchored dry-air lapse/).first()).toBeVisible();
  await shot('build-site-temperature');
  console.log(`Site-temperature journey passed: ${nasaBaseline} m → ${warm} m with 30 °C at 400 m ASL`);

  // ── nozzle back-pressure thrust (site cleared, so it is isolated) ─────────
  await stage('Mission');
  await page.getByRole('button', { name: 'Clear launch site', exact: true }).click();
  await openAeroInputs();
  await page.getByRole('button', { name: 'Add nozzle exit diameter', exact: true }).click();
  const nozzle = page.locator('div[title^="Sustainer nozzle exit diameter"] input');
  await nozzle.fill('50');
  await nozzle.press('Tab');
  const backPressure = page.getByRole('checkbox', { name: 'Nozzle back-pressure thrust', exact: true });
  await expect(backPressure).toBeEnabled();
  await backPressure.check();
  await shot('aero-nozzle-backpressure');
  const thrust = await runFlight();
  assert.ok(thrust > nasaBaseline, `back-pressure thrust must raise apogee (${thrust} m vs ${nasaBaseline} m)`);
  await stage('Build');
  await expect(page.getByText(/p_ref = 101325 Pa/).first()).toBeVisible();
  console.log(`Nozzle back-pressure journey passed: ${nasaBaseline} m → ${thrust} m with a 0.05 m exit`);

  // ── built-up flight drag on a supported template ──────────────────────────
  await openAeroInputs();
  await page.getByRole('checkbox', { name: 'Use built-up aero model (beta)', exact: true }).check();
  const builtUp = page.getByRole('checkbox', { name: 'Use built-up drag in flights', exact: true });
  await expect(builtUp).toBeVisible();
  await builtUp.check();
  await shot('aero-built-up-drag');
  const builtUpApogee = await runFlight();
  assert.ok(builtUpApogee !== nasaBaseline, `built-up drag must change the flight (${builtUpApogee} m vs ${nasaBaseline} m)`);
  await stage('Flight');
  await page.getByRole('tab', { name: 'Results', exact: true }).click();
  await expect(page.getByText('Axial drag', { exact: true })).toBeVisible();
  await expect(page.getByText(/calibrated build-up axial drag/).first()).toBeVisible();
  await expect(page.getByText('Built-up drag was requested but not used for this rocket.')).toHaveCount(0);
  await shot('flight-built-up-drag');
  await stage('Build');
  await expect(page.getByText(/calibrated build-up axial drag/).first()).toBeVisible();
  console.log(`Built-up drag journey passed: ${nasaBaseline} m → ${builtUpApogee} m on the NASA template`);

  // ── the refused shape a shipped template already provides ─────────────────
  await stage('Mission');
  await page.getByRole('button', { name: /^Spaceport America \(practice\)/ }).click();
  await confirmReplace(page);
  const spaceportBaseline = await runFlight();
  await openAeroInputs();
  await page.getByRole('checkbox', { name: 'Use built-up aero model (beta)', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Use built-up drag in flights', exact: true }).check();
  const refused = await runFlight();
  assert.equal(refused, spaceportBaseline, `a refused shape must fly its own legacy tables (${refused} m vs ${spaceportBaseline} m)`);
  await stage('Flight');
  await page.getByRole('tab', { name: 'Results', exact: true }).click();
  await expect(page.getByText('Built-up drag was requested but not used for this rocket.')).toBeVisible();
  await expect(page.getByText(/legacy drag used \(refused: /).first()).toBeVisible();
  await shot('flight-built-up-drag-refused');
  await stage('Build');
  await expect(page.getByText(/legacy drag used \(refused: /).first()).toBeVisible();
  console.log(`Refused-shape journey passed: Spaceport America flew ${spaceportBaseline} m either way and says why`);
}
