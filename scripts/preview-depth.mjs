import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from 'playwright/test';
import JSZip from 'jszip';

export async function previewDepth(page, origin) {
  const stage = (name) => page.getByRole('navigation', { name: 'Pipeline stages' }).getByRole('button', { name, exact: true }).click();
  const menu = async (target, name) => {
    await target.getByRole('button', { name: 'Project menu', exact: true }).click();
    await target.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  };
  for (const preset of ['Estes Alpha III', 'NASA Student Launch', 'Spaceport America (practice)']) {
    await stage('Mission');
    await page.getByRole('button', { name: new RegExp(`^${preset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).click();
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
  await page.getByRole('radio', { name: 'Off', exact: true }).click();
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
  await menu(page, 'Open saved project');
  await expect(page.getByRole('textbox', { name: 'Vehicle name' })).toHaveValue('Preview acceptance rocket');
  await page.keyboard.press('Escape');
  const other = await page.context().newPage();
  try {
    await other.goto(new URL('app/', origin).href);
    await menu(other, 'Open saved project');
    await expect(other.getByRole('textbox', { name: 'Vehicle name' })).toHaveValue('Preview acceptance rocket');
    await other.keyboard.press('Escape');
    await other.getByRole('textbox', { name: 'Vehicle name' }).fill('Other tab wins');
    await menu(other, 'Save to this browser');
    await expect(other.locator('[data-project-status="ok"]')).toContainText('Saved locally');
    await page.getByRole('textbox', { name: 'Vehicle name' }).fill('Stale tab must not win');
    await menu(page, 'Save to this browser');
    await expect(page.locator('[data-project-status="error"]')).toContainText(/stale/i);
    await page.keyboard.press('Escape');
    await menu(page, 'Open saved project');
    await expect(page.getByRole('textbox', { name: 'Vehicle name' })).toHaveValue('Other tab wins');
    await page.keyboard.press('Escape');
  } finally {
    await other.close();
  }
  console.log('Browser data-safety check passed: cross-tab stale save refused; newer document preserved');

  await stage('Mission');
  await page.getByRole('button', { name: /^NASA Student Launch/ }).click();
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
