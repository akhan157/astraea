import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { expect } from 'playwright/test';
import JSZip from 'jszip';
import { syntheticCalibrationCoast } from './fixtures/synthetic-calibration-coast.mjs';

const appVersion = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;

/**
 * Verify's Validation card starts closed. Open it before a journey touches the
 * flight-evidence studio; once open it stays open for the page session.
 */
async function openValidation(page) {
  const toggle = page.locator('[data-validation-toggle]');
  await expect(toggle).toHaveCount(1);
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}


// Real UI journeys; no mocked engine or application store. Exercise download
// fallback without opening an OS file picker in unattended browser tests.
export async function previewJourneys(page, origin) {
  await page.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }));
  const stage = (name) => page.getByRole('navigation', { name: 'Pipeline stages' }).getByRole('button', { name, exact: true }).click();
  const menu = async (name) => {
    await page.getByRole('button', { name: 'Project menu', exact: true }).click();
    await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  };
  const pass = (name) => console.log(`Preview acceptance passed: ${name}`);
  // layout-polish falsifiers are collected so one run reports every failure
  // instead of stopping at the first; the strict assertion is below.
  const layoutFailures = [];
  const layoutCheck = (condition, message) => { if (!condition) layoutFailures.push(message); };
  const themedControlCounts = () => page.evaluate(() => ({
    selects: document.querySelectorAll('select:not([data-kit-select])').length,
    details: document.querySelectorAll('details:not([data-kit-disclosure])').length,
    checkboxes: document.querySelectorAll('input[type="checkbox"]:not([data-kit-checkbox])').length,
    ranges: document.querySelectorAll('input[type="range"]:not([data-kit-range])').length,
  }));
  const assertThemedControls = async (stageName) => {
    assert.deepEqual(await themedControlCounts(), { selects: 0, details: 0, checkboxes: 0, ranges: 0 }, `${stageName}: every select/details/checkbox/range must come from the themed kit`);
  };
  // Owner direction (2026-11-05): a gate reason may be folded to one ellipsized
  // line, but only with a More control, and after expanding it must be fully
  // visible. A failing gate's reason is never folded, so it passes directly.
  const assertGateReasonsReachable = async (stageName) => {
    const reasons = page.locator('[data-gate-reason]');
    assert.ok(await reasons.count() > 0, `${stageName}: gate rows must expose their reason`);
    const fullyVisible = (reason) => reason.evaluate((node) => node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= node.clientHeight + 1);
    for (let i = 0; i < await reasons.count(); i += 1) {
      const reason = reasons.nth(i);
      if (await fullyVisible(reason)) continue;
      const controls = await reason.getAttribute('id');
      assert.ok(controls, `${stageName}: a folded gate reason must be addressable`);
      const more = page.locator(`button[aria-controls="${controls}"]`);
      assert.equal(await more.count(), 1, `${stageName}: a folded gate reason must offer one More control`);
      await expect(more).toHaveAttribute('aria-expanded', 'false');
      await more.click();
      await expect(more).toHaveAttribute('aria-expanded', 'true');
      assert.ok(await fullyVisible(reason), `${stageName}: gate reason must be fully visible after More`);
    }
  };
  const layoutMetrics = () => page.evaluate(() => {
    const header = document.querySelector('header');
    const sub = [...document.querySelectorAll('span')].find((node) => node.textContent?.includes('The part tree is the source of truth'));
    const run = [...document.querySelectorAll('button')].find((node) => node.textContent?.includes('Run simulation'));
    const compare = [...document.querySelectorAll('button')].find((node) => node.textContent?.trim() === 'Compare revision');
    const rect = (node) => node ? { x: node.getBoundingClientRect().x, y: node.getBoundingClientRect().y, w: node.getBoundingClientRect().width, h: node.getBoundingClientRect().height } : null;
    return {
      innerWidth,
      innerHeight,
      header: { scrollWidth: header?.scrollWidth ?? null, clientWidth: header?.clientWidth ?? null },
      stageHeaderHeight: sub?.parentElement?.getBoundingClientRect().height ?? null,
      run: { rect: rect(run), height: rect(run)?.h ?? null },
      compare: { height: rect(compare)?.h ?? null },
      sub: { scrollWidth: sub?.scrollWidth ?? null, clientWidth: sub?.clientWidth ?? null },
      massNames: [...document.querySelectorAll('[data-part-name]')].map((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, text: node.textContent })),
    };
  });
  const assertLayout = (size, m) => {
    assert.equal(m.header.scrollWidth, m.innerWidth, `${size}: header must not overflow`);
    assert.ok(m.run.rect && m.run.rect.x >= 0 && m.run.rect.y >= 0 && m.run.rect.x + m.run.rect.w <= m.innerWidth && m.run.rect.y + m.run.rect.h <= m.innerHeight, `${size}: Run must be fully visible`);
    assert.ok(m.run.height <= 32, `${size}: Run must stay on one line`);
    assert.ok(m.compare.height <= 30, `${size}: Compare revision must stay on one line`);
    assert.ok(m.stageHeaderHeight !== null && m.stageHeaderHeight <= 68, `${size}: StageHeader may add at most one subtitle row (got ${m.stageHeaderHeight}px)`);
    assert.ok(m.sub.scrollWidth !== null && m.sub.scrollWidth <= m.sub.clientWidth + 1, `${size}: stage subtitle must not be clipped`);
    assert.ok(m.massNames.length > 0, `${size}: mass-budget part names must be present`);
    assert.deepEqual(m.massNames.filter((name) => name.scrollWidth > name.clientWidth + 1).map((name) => name.text), [], `${size}: mass-budget part names must not be clipped`);
  };
  const assertHeadersOneLine = async (size) => {
    const headers = await page.evaluate(() => {
      const lines = (element) => {
        const tops = new Set();
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) if (rect.width > 1 && rect.height > 1) tops.add(Math.round(rect.top));
        }
        return tops.size;
      };
      return [...document.querySelectorAll('[role="columnheader"]')].map((header) => ({ text: header.textContent, lines: lines(header) }));
    });
    assert.ok(headers.length > 0, `${size}: table headers must be present`);
    assert.deepEqual(headers.filter((header) => header.lines > 1), [], `${size}: table headers must not wrap`);
  };

  assert.equal((await page.goto(origin)).status(), 200);
  await page.getByText('Read the validation record', { exact: true }).click();
  await expect(page.getByText(/The Estes Cosmic Cargo comparison uses estimated fin geometry/)).toBeVisible();
  assert.equal(await page.locator('.eyebrow').textContent(), `Free · Beta ${appVersion} · Browser, Windows and Linux · macOS pending`, 'Landing version must come from package.json');
  const landingNotice = page.locator('[data-beta-notice]');
  assert.match(await landingNotice.innerText(), /^Beta\b[\s\S]*6–10%[\s\S]*not flight approval/i, 'The landing page labels itself Beta and states its accuracy');
  assert.match(await landingNotice.locator('a').getAttribute('href'), /docs\/accuracy\.md$/);
  // v0.10.0 is a published pre-release: the three OS cards, and nothing else, link to the
  // release that matches package.json, so a version bump cannot leave stale download links.
  const releaseLinks = await page.locator('a[href*="astraea/releases"]').evaluateAll((links) => links.map((link) => [link.dataset.os, link.getAttribute('href')]));
  assert.deepEqual(releaseLinks, ['windows', 'mac', 'linux'].map((os) => [os, `https://github.com/akhan157/astraea/releases/tag/v${appVersion}`]), 'Desktop downloads must point at the published release for this version');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile landing must not overflow');
  await page.setViewportSize({ width: 1600, height: 1000 });
  pass('landing disclosure, accessible validation record, mobile width');

  await page.goto(new URL('app/', origin).href);
  const betaNotice = page.locator('[data-beta-notice]');
  await expect(betaNotice).toBeVisible();
  assert.match(await betaNotice.innerText(), /^Beta\b[\s\S]*not flight approval[\s\S]*6–10%/i, 'The app labels itself Beta and states its accuracy');
  assert.match(await betaNotice.locator('a').getAttribute('href'), /docs\/accuracy\.md$/);
  const isMac = await page.evaluate(() => /mac|iphone|ipad/i.test(navigator.userAgentData?.platform || navigator.platform || ''));
  const runButton = page.getByRole('banner').getByRole('button', { name: /Run simulation/ });
  // The palette trigger keeps an explicit accessible name; its label text is
  // collapsed below the xl breakpoint, so the role name is the stable locator.
  const searchButton = page.getByRole('button', { name: /Command palette/ });
  await expect(runButton).toContainText(isMac ? '⌘↵' : 'Ctrl+Enter');
  await expect(searchButton).toContainText(isMac ? '⌘K' : 'Ctrl+K');
  if (!isMac) {
    for (const glyph of ['⌘', '⇧', '↵']) assert.equal(await page.locator('body').evaluate((body, g) => body.innerText.includes(g), glyph), false, `No Mac glyph ${glyph} off macOS`);
  }
  pass(`platform-correct shortcut labels (${isMac ? 'macOS' : 'Ctrl'})`);
  await runButton.click();
  await page.locator('[aria-label^="Apogee (committed run) "]').waitFor({ timeout: 60_000 });
  for (const name of ['Mission', 'Airframe', 'Motor', 'Aero', 'Flight', 'Recovery', 'Verify', 'Build']) {
    await stage(name);
    const mainText = await page.locator('main').innerText();
    assert.ok(mainText.length > 30, `${name} must render`);
    await assertThemedControls(name);
    if (name === 'Verify' || name === 'Recovery') await assertGateReasonsReachable(name);
    if (name === 'Aero') {
      assert.doesNotMatch(mainText, /0 parts carry no lift/, 'Aero must not print an empty zero-lift list');
      assert.doesNotMatch(mainText, /CNα N\/A/, 'Aero must not present body-tube CNα/CP as missing');
      assert.match(mainText, /Not lifting surfaces/i, 'Aero must group non-lifting parts in the breakdown table');
      assert.match(mainText, /— not modelled as a lifting surface in this subsonic rollup\. These parts move the CG, not the CP\./, 'Aero must carry the one-line non-lifting footnote');
      assert.doesNotMatch(mainText, /so the engine reports no CNα or CP/, 'Aero must not print the old per-type sentences');
    }
  }
  pass('all eight stages, themed controls and reachable gate reasons');

  // no-parachute-warning: the note is a current-component inventory fact, not
  // a recovery result inferred from the committed run. Remove both chutes with
  // the real tree, check Flight readiness and Recovery, add one back, then undo
  // all three structural edits and prove the original identities/order and the
  // current committed result are restored.
  await stage('Airframe');
  const partNameFilter = page.getByLabel('Filter parts by name');
  await partNameFilter.fill('');
  await page.getByTitle(/^All assembly components/).click();
  const originalComponents = await page.locator('[role="treeitem"]').evaluateAll((nodes) => nodes.map((node) => ({
    id: node.getAttribute('data-component-id'),
    name: node.getAttribute('aria-label'),
  })));
  assert.equal(originalComponents.length, 7, 'NASA Student Launch must have seven parts before the chute check');
  await partNameFilter.fill('Parachute');
  await expect(page.locator('[role="treeitem"]')).toHaveCount(2);
  while (await page.locator('[role="treeitem"]').count() > 0) {
    const row = page.locator('[role="treeitem"]').first();
    await row.hover();
    await row.getByRole('button', { name: 'Remove component' }).click();
  }
  await partNameFilter.fill('');

  await stage('Flight');
  const readiness = page.getByLabel('Run readiness');
  await expect(readiness).toContainText('No parachute in this design.');
  assert.equal(await readiness.locator('[data-no-parachute-note] p').evaluate((node) => getComputedStyle(node).color), 'rgb(245, 181, 68)', 'the no-parachute note must be amber');
  await expect(page.getByText(/Showing the committed run\./)).toBeVisible();
  assert.equal(await runButton.isDisabled(), false, 'the no-parachute note must not block a run');

  await stage('Recovery');
  const recoveryNote = page.locator('main [data-no-parachute-note]');
  assert.equal(await recoveryNote.count(), 1, 'Recovery must show one no-parachute note');
  assert.equal((await recoveryNote.innerText()).trim(), 'No parachute in this design.');
  const recoveryNoteBox = await recoveryNote.boundingBox();
  const landingStatBox = await page.getByText('Landing speed', { exact: true }).first().boundingBox();
  assert.ok(recoveryNoteBox && landingStatBox && recoveryNoteBox.y < landingStatBox.y, 'the Recovery note must sit above the recorded stats');
  await expect(page.getByText('Descent events', { exact: true })).toBeVisible();

  await stage('Airframe');
  await page.getByRole('button', { name: 'Add part' }).click();
  await page.getByRole('button', { name: 'Recovery parachute' }).click();
  await stage('Flight');
  await expect(readiness).not.toContainText('No parachute in this design.');
  await stage('Recovery');
  await expect(page.locator('main [data-no-parachute-note]')).toHaveCount(0);

  // Undo the add, then the two removals. Structural edits never coalesce, so
  // exactly three steps restore the original component list. Focus a button
  // first so the Workstation's undo shortcut is not ignored as field typing.
  await stage('Airframe');
  await partNameFilter.fill('');
  await page.getByRole('button', { name: 'Add part' }).focus();
  const undoKey = isMac ? 'Meta+z' : 'Control+z';
  for (let i = 0; i < 3; i += 1) await page.keyboard.press(undoKey);
  await expect.poll(() => page.locator('[role="treeitem"]').count()).toBe(originalComponents.length);
  const restoredComponents = await page.locator('[role="treeitem"]').evaluateAll((nodes) => nodes.map((node) => ({
    id: node.getAttribute('data-component-id'),
    name: node.getAttribute('aria-label'),
  })));
  assert.deepEqual(restoredComponents, originalComponents, 'undo must restore the original component identities and order');
  await stage('Flight');
  await expect(page.getByLabel('Run readiness')).not.toContainText('No parachute in this design.');
  await expect(page.getByText(/Showing the committed run\./)).toHaveCount(0);
  await expect(page.getByText(/not a current result/)).toHaveCount(0);
  await expect(page.getByRole('main').getByText('Valid run', { exact: true })).toBeVisible();
  pass('no-parachute note is current-design only, non-blocking, removed by a returning chute, and fully undone');

  // declutter-fold: the Airframe stability card shows its two caveat sentences
  // as one ellipsized line with More; expanding restores both full lines in
  // their original colours. DOM numbers only.
  await stage('Airframe');
  const stabilityStrip = page.getByRole('region', { name: 'Live stability and flight preview' });
  const caveat = stabilityStrip.locator('[data-fold]').first();
  const caveatText = caveat.locator('[data-fold-text]');
  const airframeAmber = 'Above generic geometry band (>3 cal). Weathercocking requires flight analysis.';
  const airframeRollup = 'Component rollup only; selected motor and powered-flight margin history unavailable.';
  const caveatMore = caveat.getByRole('button', { name: 'More', exact: true });
  await expect(caveatMore).toHaveCount(1);
  const caveatLineHeight = await caveatText.evaluate((node) => parseFloat(getComputedStyle(node).lineHeight));
  const foldedCaveat = await caveatText.evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, height: node.getBoundingClientRect().height }));
  assert.ok(foldedCaveat.scrollWidth > foldedCaveat.clientWidth + 1, `Airframe caveat must fold to one ellipsized line (scrollWidth ${foldedCaveat.scrollWidth} > clientWidth ${foldedCaveat.clientWidth})`);
  assert.ok(foldedCaveat.height <= caveatLineHeight + 1, `folded Airframe caveat must be one line (${foldedCaveat.height}px, line ${caveatLineHeight}px)`);
  const collapsedCaveat = await caveatText.innerText();
  assert.ok(collapsedCaveat.includes(airframeAmber) && collapsedCaveat.includes(airframeRollup), 'both Airframe sentences stay in the DOM while folded');
  assert.ok(collapsedCaveat.indexOf(airframeAmber) < collapsedCaveat.indexOf(airframeRollup), 'the amber sentence comes before the grey one');
  assert.deepEqual(await caveat.locator('[data-fold-part]').evaluateAll((nodes) => nodes.map((node) => ({ part: node.getAttribute('data-fold-part'), color: getComputedStyle(node).color }))), [
    { part: 'amber', color: 'rgb(245, 181, 68)' },
    { part: 'grey', color: 'rgb(94, 100, 109)' },
  ], 'folded Airframe sentences keep their original colours');
  await caveatMore.click();
  await expect(caveat.getByRole('button', { name: 'Less', exact: true })).toHaveCount(1);
  const expandedCaveat = await caveatText.evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, height: node.getBoundingClientRect().height }));
  assert.ok(expandedCaveat.height > caveatLineHeight * 1.5, `expanded Airframe caveat shows both lines (${expandedCaveat.height}px)`);
  assert.ok(expandedCaveat.scrollWidth <= expandedCaveat.clientWidth + 1, 'expanded Airframe caveat is not clipped');
  const expandedText = await caveatText.innerText();
  assert.ok(expandedText.includes(airframeAmber) && expandedText.includes(airframeRollup), 'expanded Airframe caveat carries both full sentences');
  pass('Airframe caveat folds to one line and expands to both full sentences');

  // beta-aero-layout: the built-up model publishes totals but no component
  // breakdown. The 3D view must still lay out the full rocket from the native
  // geometry rollup, while CG/CP stay the selected model's own numbers (the
  // beta CP is 2.41818 m, not the legacy 2.40917 m). DOM attributes only.
  const layoutProbe = () => page.evaluate(() => {
    const el = document.querySelector('[data-layout-state]');
    return {
      state: el?.getAttribute('data-layout-state') ?? null,
      length: Number(el?.getAttribute('data-layout-length') ?? Number.NaN),
      parts: Number(el?.getAttribute('data-layout-parts') ?? Number.NaN),
      markers: el?.getAttribute('data-markers') ?? null,
      cg: Number(el?.getAttribute('data-marker-cg') ?? Number.NaN),
      cp: Number(el?.getAttribute('data-marker-cp') ?? Number.NaN),
    };
  });
  const waitForLayout = (parts) => page.waitForFunction((expected) => {
    const el = document.querySelector('[data-layout-state]');
    return el?.getAttribute('data-layout-state') === 'ready'
      && Number(el.getAttribute('data-layout-parts')) === expected;
  }, parts, { timeout: 60_000 });
  // The keep-last policy shows the previous breakdown while the next model
  // settles, so waiting for parts alone would accept the legacy snapshot.
  // The marker CP is the current model's own value once its result is live.
  const waitForCp = (cp) => page.waitForFunction((target) => {
    const el = document.querySelector('[data-layout-state]');
    const seen = Number(el?.getAttribute('data-marker-cp') ?? Number.NaN);
    return Number.isFinite(seen) && Math.abs(seen - target) < 1e-6;
  }, cp, { timeout: 60_000 });
  await stage('Aero');
  await waitForLayout(7);
  await waitForCp(2.409174961652899);
  const legacyLayout = await layoutProbe();
  assert.ok(Math.abs(legacyLayout.length - 2.97) < 1e-3, `legacy layout length ${legacyLayout.length} must be 2.97 m`);
  assert.ok(legacyLayout.markers === 'present' && Math.abs(legacyLayout.cp - 2.409174961652899) < 1e-6, `legacy CP must be its own value (got ${legacyLayout.cp})`);
  await page.getByRole('tab', { name: 'Aerodynamic inputs' }).click();
  const betaToggle = page.getByRole('checkbox', { name: 'Use built-up aero model (beta)' });
  await betaToggle.waitFor({ timeout: 60_000 });
  assert.equal(await betaToggle.isChecked(), false, 'beta must start off');
  await betaToggle.check();
  await page.getByText(/Model: aero-buildup 1\.1\.0 \(hybrid\)/).waitFor({ timeout: 60_000 });
  await waitForCp(2.4181789584971094);
  await waitForLayout(7);
  const betaLayout = await layoutProbe();
  assert.ok(Math.abs(betaLayout.length - 2.97) < 1e-3, `beta layout length ${betaLayout.length} must stay 2.97 m, not the 1 m fallback`);
  assert.equal(betaLayout.parts, 7, `beta layout must keep every part (got ${betaLayout.parts})`);
  assert.ok(Math.abs(betaLayout.cg - legacyLayout.cg) < 1e-9, `beta CG must be the same native rollup (got ${betaLayout.cg})`);
  assert.ok(Math.abs(betaLayout.cp - 2.4181789584971094) < 1e-6, `beta CP must be the model's own value (got ${betaLayout.cp})`);
  assert.ok(Math.abs(betaLayout.cp - legacyLayout.cp) > 1e-5, 'beta CP must not be replaced by the legacy CP');
  await betaToggle.uncheck();
  await page.getByText(/Model: aero-buildup/).waitFor({ state: 'detached', timeout: 60_000 });
  await waitForCp(2.409174961652899);
  await waitForLayout(7);
  const restoredLayout = await layoutProbe();
  assert.ok(Math.abs(restoredLayout.length - legacyLayout.length) < 1e-9, `legacy layout must be restored (got ${restoredLayout.length})`);
  assert.ok(Math.abs(restoredLayout.cp - legacyLayout.cp) < 1e-9, `legacy CP must be restored (got ${restoredLayout.cp})`);
  pass('beta aero model: full rocket stays laid out; CP stays the model\'s own');

  await stage('Mission');
  const siteCard = page.locator('[data-site-card]');
  await expect(siteCard).toBeVisible();
  const siteCardText = await siteCard.innerText();
  assert.match(siteCardText, /Not set/, 'Unset launch site must read as not set');
  assert.match(siteCardText, /sea level standard day assumed/, 'Unset launch site must state the default atmosphere');
  assert.doesNotMatch(siteCardText, /\b0 m\b/, 'Unset launch site must not show a measured-looking zero');
  await expect(page.getByRole('button', { name: 'Set launch site' })).toBeVisible();
  const siteInput = page.getByLabel('Launch site altitude in metres above sea level');
  await siteInput.scrollIntoViewIfNeeded();
  const siteMetrics = await siteInput.evaluate((node) => {
    const form = node.closest('form');
    const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === 'Apply launch site');
    return {
      inputWidth: node.getBoundingClientRect().width,
      formHeight: form?.getBoundingClientRect().height ?? null,
      buttonHeight: button?.getBoundingClientRect().height ?? null,
    };
  });
  assert.ok(siteMetrics.inputWidth <= 160, `Launch-site altitude field must be compact (got ${siteMetrics.inputWidth}px)`);
  assert.ok(siteMetrics.formHeight !== null && siteMetrics.formHeight <= 150, `Launch-site form must be compact (got ${siteMetrics.formHeight}px)`);
  assert.ok(siteMetrics.buttonHeight !== null && siteMetrics.buttonHeight <= 30, `Launch-site buttons must be compact (got ${siteMetrics.buttonHeight}px)`);

  await stage('Flight');
  const launchSummary = page.locator('[data-launch-summary]');
  await expect(launchSummary).toBeVisible();
  assert.equal(await launchSummary.locator('input, select, textarea').count(), 0, 'Flight launch settings must be read-only');
  await expect(page.getByRole('button', { name: 'Edit in Mission' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit in Mission' }).click();
  await expect(page.getByRole('navigation', { name: 'Pipeline stages' }).getByRole('button', { name: 'Mission', exact: true })).toHaveAttribute('aria-current', 'page');
  await stage('Flight');
  await page.getByRole('tab', { name: 'Results' }).click();
  const basis = page.locator('[data-result-basis]');
  assert.ok(await basis.count() > 0, 'Flight results must expose their basis reasons');
  const clippedBasis = await basis.evaluateAll((nodes) => nodes
    .filter((node) => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1)
    .map((node) => node.textContent ?? ''));
  assert.deepEqual(clippedBasis, [], 'Flight result basis reasons must not be clipped');
  await page.getByRole('tab', { name: 'Timeline' }).click();
  pass('Mission site/default display, compact site form, read-only Flight launch summary and wrapped result basis');

  await page.setViewportSize({ width: 1280, height: 800 });
  for (const name of ['Airframe', 'Aero']) {
    await stage(name);
    const readout = page.getByRole('region', { name: 'Live stability and flight preview' });
    await expect(readout).toBeVisible();
    // The remounted viewport needs a beat to size its canvas at the smaller
    // viewport; wait for a laid-out canvas before judging geometry. A runner
    // with no WebGL at all shows the labeled fallback instead: there is no
    // canvas to occlude, so the check is vacuously satisfied there (the
    // fallback path has its own dedicated coverage below).
    await page.locator('main canvas:visible, [data-webgl-fallback="true"]').first().waitFor({ timeout: 30_000 });
    if (await page.locator('[data-webgl-fallback="true"]').count() === 0) {
      await expect.poll(async () => {
        const canvas = await page.locator('main canvas:visible').boundingBox();
        const panel = await readout.boundingBox();
        return canvas.width > 0 && canvas.x + canvas.width <= panel.x + 1;
      }, { message: `${name}: live readout must not cover the canvas`, timeout: 30_000 }).toBe(true);
    }
  }
  await stage('Airframe');
  assertLayout('1280×800', await layoutMetrics());
  // The mass table is narrowest with the inspector inline. Open it manually
  // (the empty panel stays open), then check headers, palette and Motor tabs.
  const inspectorToggle = page.getByRole('button', { name: 'Toggle inspector' });
  if (await inspectorToggle.getAttribute('aria-expanded') === 'false') { await inspectorToggle.click(); await page.waitForTimeout(250); }
  const paletteLabels = await searchButton.evaluate((button) => [...button.children]
    .filter((element) => element.tagName === 'SPAN' && element.getClientRects().length > 0 && !element.querySelector('kbd'))
    .map((element) => ({ text: element.innerText, clipped: element.scrollWidth > element.clientWidth + 1 })));
  assert.deepEqual(paletteLabels.map((label) => label.text), ['Search'], '1280: the palette shows only "Search"');
  assert.ok(paletteLabels.every((label) => !label.clipped), '1280: the palette label must not clip');
  await assertHeadersOneLine('1280×800');
  const massTableFits = await page.evaluate(() => {
    const table = document.querySelector('[role="table"]');
    const last = [...table.querySelectorAll('[role="columnheader"]')].at(-1);
    return last.getBoundingClientRect().right <= table.getBoundingClientRect().right + 1 && table.scrollWidth <= table.clientWidth + 1;
  });
  assert.ok(massTableFits, '1280: the mass-budget last column must stay inside the table');
  // layout-polish 6e: with the inspector open the name column takes its width
  // from the share bar, so every part name stays on one line. Truncation is
  // still forbidden by the scrollWidth check in assertLayout.
  const massNameLines = await page.evaluate(() => {
    const lines = (element) => {
      const tops = new Set();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) if (rect.width > 1 && rect.height > 1) tops.add(Math.round(rect.top));
      }
      return tops.size;
    };
    return [...document.querySelectorAll('[data-part-name]')].map((node) => ({ text: node.textContent, lines: lines(node) }));
  });
  layoutCheck(massNameLines.length > 0, '1280×800: mass-budget part names must be present');
  for (const name of massNameLines) layoutCheck(name.lines === 1, `1280×800: mass-budget part name "${name.text}" must stay on one line (got ${name.lines})`);
  await stage('Motor');
  const motorTabLines = await page.evaluate(() => {
    const lines = (element) => {
      const tops = new Set();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) if (rect.width > 1 && rect.height > 1) tops.add(Math.round(rect.top));
      }
      return tops.size;
    };
    const names = ['ThrustCurve', 'Curve editor', 'Chamber & nozzle', 'BATES grain', 'Propellant recipe'];
    return [...document.querySelectorAll('[role="radio"]')].filter((button) => names.includes(button.textContent)).map((button) => ({ text: button.textContent, lines: lines(button) }));
  });
  assert.equal(motorTabLines.length, 5, '1280: the Motor tool tabs must be present');
  assert.deepEqual(motorTabLines.filter((tab) => tab.lines > 1), [], '1280: the Motor tool tabs must not wrap');
  await stage('Airframe');
  if (await inspectorToggle.getAttribute('aria-expanded') === 'true') { await inspectorToggle.click(); await page.waitForTimeout(200); }
  await page.setViewportSize({ width: 1024, height: 768 });
  await stage('Airframe');
  assertLayout('1024×768', await layoutMetrics());
  await page.setViewportSize({ width: 800, height: 600 });
  await stage('Airframe');
  assertLayout('800×600', await layoutMetrics());
  await page.setViewportSize({ width: 1600, height: 1000 });
  for (const name of ['Toggle parts panel', 'Toggle inspector']) {
    const toggle = page.getByRole('button', { name });
    if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  }
  pass('1280×800 live readouts do not occlude the viewport; header and tables fit at 1280/1024/800');

  // 3D framing, reported by the camera rig itself: about 80% of the limiting
  // dimension at both canvas sizes (including the canvas the inspector leaves
  // behind), and a preset click still re-orients the camera.
  await page.setViewportSize({ width: 1600, height: 1000 });
  await stage('Airframe');
  await page.locator('main canvas:visible, [data-webgl-fallback="true"]').first().waitFor({ timeout: 30_000 });
  if (await page.locator('[data-webgl-fallback="true"]').count() === 0) {
    const fitFraction = () => page.evaluate(() => {
      const value = Number(document.querySelector('[data-fit-fraction]')?.getAttribute('data-fit-fraction'));
      return Number.isFinite(value) ? value : null;
    });
    const cameraDir = () => page.evaluate(() => document.querySelector('[data-camera-dir]')?.getAttribute('data-camera-dir') ?? null);
    const framed = [];
    for (const [width, height] of [[1600, 1000], [1280, 800]]) {
      await page.setViewportSize({ width, height });
      await expect.poll(async () => {
        const value = await fitFraction();
        return value !== null && value > 0.74 && value < 0.86;
      }, { message: `${width}×${height}: the 3D view frames the rocket at about 80% of the limiting dimension`, timeout: 30_000 }).toBe(true);
      framed.push({ size: `${width}×${height}`, fraction: await fitFraction() });
    }
    const iso = await cameraDir();
    assert.ok(iso, 'the viewport must report the camera it framed with');
    await page.getByRole('radio', { name: 'SIDE', exact: true }).click();
    await expect.poll(async () => (await cameraDir()) !== iso, { message: 'a preset click must still re-orient the camera', timeout: 10_000 }).toBe(true);
    await page.getByRole('radio', { name: 'ISO', exact: true }).click();
    await page.setViewportSize({ width: 1280, height: 800 });
    pass(`3D view auto-frames at ${framed.map((f) => `${f.fraction.toFixed(3)} @ ${f.size}`).join(', ')}; presets still re-orient`);
  }
  // The viewcube sits at the bottom-right of the canvas and clicking a face
  // still orients the view. The floor shadow rig is gone, so its map probe and
  // catcher must not exist.
  await stage('Flight');
  await page.getByRole('tab', { name: 'Timeline' }).click();
  await page.locator('main canvas:visible, [data-webgl-fallback="true"]').first().waitFor({ timeout: 30_000 });
  if (await page.locator('[data-webgl-fallback="true"]').count() === 0) {
    const cubeState = () => page.evaluate(() => {
      const shellEl = document.querySelector('[data-layout-state]');
      const canvasEl = document.querySelector('main canvas');
      if (!shellEl || !canvasEl) return null;
      const base = canvasEl.getBoundingClientRect();
      const rect = (shellEl.getAttribute('data-gizmo-rect') ?? '').split(',').filter((v) => v !== '').map(Number);
      return {
        rect: rect.length === 4 && rect.every(Number.isFinite) ? rect : null,
        canvas: [base.width, base.height],
        shadows: document.querySelectorAll('[data-shadow-updates], [data-shadow-catcher]').length,
      };
    });
    await expect.poll(async () => (await cubeState())?.rect !== null, { message: 'the viewport must report the viewcube footprint', timeout: 20_000 }).toBe(true);
    // The canvas resizes a beat after the stage switch (default 300×150 first),
    // and the footprint can lag behind it. Wait until both agree before
    // measuring; the exact assertions below still decide pass or fail.
    const settled = (s) => s?.rect !== null && s.canvas[0] > 300 && Math.abs((s.rect[0] + s.rect[2]) / 2 - (s.canvas[0] - 64)) <= 1 && Math.abs((s.rect[1] + s.rect[3]) / 2 - (s.canvas[1] - 64)) <= 1;
    await expect.poll(async () => settled(await cubeState()), { message: 'the viewcube footprint must settle on the sized canvas', timeout: 20_000 }).toBe(true).catch(() => undefined);
    const cube = await cubeState();
    const [gx0, gy0, gx1, gy1] = cube.rect;
    const [cw, ch] = cube.canvas;
    assert.ok(gx0 >= 0 && gy0 >= 0 && gx1 <= cw + 0.5 && gy1 <= ch + 0.5, `the viewcube must sit inside the canvas (rect ${cube.rect}, canvas ${cube.canvas})`);
    assert.ok(Math.abs((gx0 + gx1) / 2 - (cw - 64)) <= 1 && Math.abs((gy0 + gy1) / 2 - (ch - 64)) <= 1, `the viewcube must sit 64 px in from the bottom-right corner (rect ${cube.rect}, canvas ${cube.canvas})`);
    assert.ok(Math.abs(gx1 - gx0 - 128) <= 1 && Math.abs(gy1 - gy0 - 128) <= 1, `the viewcube footprint must be 128×128 px (rect ${cube.rect})`);
    assert.equal(cube.shadows, 0, 'the floor shadow rig must be gone: no shadow-map probe and no shadow catcher');
    pass(`viewcube ${cube.rect.join(',')} (128×128 at the 64 px bottom-right margin); no shadow probe or catcher`);

    // Clicking a face must still orient the camera. The cube turns the camera
    // through OrbitControls, so the orbit probe counts the turn.
    const orbit = () => page.evaluate(() => {
      const shellEl = document.querySelector('[data-layout-state]');
      return {
        version: Number(shellEl?.getAttribute('data-orbit-version') ?? '-1'),
        turned: Number(shellEl?.getAttribute('data-orbit-turned') ?? '-1'),
      };
    });
    await expect.poll(async () => (await orbit()).version, { message: 'the viewport must report the orbit probe', timeout: 20_000 }).toBeGreaterThanOrEqual(0);
    const before = await orbit();
    // The cube's centre is the gizmo margin point, 64 px in from each edge; a
    // click dead centre hits the camera-facing face, so aim at a neighbour.
    const target = await page.evaluate(() => {
      const base = document.querySelector('main canvas').getBoundingClientRect();
      return { x: base.left + base.width - 64, y: base.top + base.height - 64 };
    });
    let clicked = false;
    for (const [dx, dy] of [[18, -5], [-18, -5], [0, -29], [0, 18]]) {
      await page.mouse.click(target.x + dx, target.y + dy);
      await page.waitForTimeout(450);
      if ((await orbit()).version > before.version) { clicked = true; break; }
    }
    const after = await orbit();
    assert.ok(clicked, `clicking a viewcube face must change the camera orientation (orbit version stayed ${after.version})`);
    const turned = after.turned - before.turned;
    assert.ok(turned > 10, `clicking a viewcube face must turn the camera by more than 10° (turned ${turned.toFixed(1)}°)`);
    pass(`clicking the viewcube turns the camera ${turned.toFixed(1)}° (orbit version ${before.version} -> ${after.version})`);
    // Return to the fitted ISO view so the free-region checks below measure the
    // framing they always did.
    await page.getByRole('radio', { name: 'ISO', exact: true }).click();
    await page.waitForTimeout(400);

    // The upright, attitude-posed rocket must stay inside the canvas area the
    // stage's toolbar, pose readout and scrubber leave free — at every point of
    // the scrub range, including the most tilted pose near apogee.
    const frame = () => page.evaluate(() => {
      const shellEl = document.querySelector('[data-layout-state]');
      const canvasEl = document.querySelector('main canvas');
      if (!shellEl || !canvasEl) return null;
      const nums = (text) => { const n = (text ?? '').split(',').filter((v) => v !== '').map(Number); return n.length === 4 && n.every(Number.isFinite) ? n : null; };
      const base = canvasEl.getBoundingClientRect();
      const local = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return null;
        return [r.left - base.left, r.top - base.top, r.right - base.left, r.bottom - base.top];
      };
      return {
        bbox: nums(shellEl.getAttribute('data-rocket-bbox')),
        region: nums(shellEl.getAttribute('data-safe-region')),
        size: [base.width, base.height],
        obstacles: [
          local(document.querySelector('[data-viewport-toolbar]')),
          local(document.querySelector('[aria-label="Flight pose readout"]')),
          local(document.querySelector('label:has(input[aria-label="Flight scrubber"])')),
        ].filter(Boolean),
        time: /T\+([\d.]+)/.exec(document.querySelector('[aria-label="Flight pose readout"]')?.textContent ?? '')?.[1] ?? null,
      };
    });
    const scrub = page.locator('input[aria-label="Flight scrubber"]');
    await expect.poll(() => page.evaluate(() => Boolean(document.querySelector('[data-rocket-bbox]'))), { message: 'the Flight viewport must report the rocket\'s screen box', timeout: 20_000 }).toBe(true);
    const max = Number(await scrub.getAttribute('max'));
    const seen = [];
    const upright = { regionH: 0, bboxH: 0 }; // `const` + property writes: assigned at the 50 % pose
    for (const fraction of [0.02, 0.5, 0.9, 0.99]) {
      await scrub.evaluate((input, value) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value));
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, Math.max(0, max * fraction));
      await page.waitForTimeout(400);
      const state = await frame();
      assert.ok(state?.bbox, `Flight at ${Math.round(fraction * 100)}%: the viewport must report the rocket's screen box`);
      const [x0, y0, x1, y1] = state.bbox;
      const [w, h] = state.size;
      assert.ok(x0 >= -0.5 && y0 >= -0.5 && x1 <= w + 0.5 && y1 <= h + 0.5, `Flight at ${state.time}s: the rocket must stay inside the canvas (box ${state.bbox}, canvas ${state.size})`);
      assert.ok(x1 - x0 > 2 && y1 - y0 > 2, `Flight at ${state.time}s: the rocket must be drawn at a usable size (box ${state.bbox})`);
      for (const o of state.obstacles) {
        const overlaps = x0 < o[2] && x1 > o[0] && y0 < o[3] && y1 > o[1];
        assert.ok(!overlaps, `Flight at ${state.time}s: the rocket must clear the toolbar/readout/scrubber (box ${state.bbox}, obstacle ${o})`);
      }
      if (state.region) {
        const [rx0, ry0, rx1, ry1] = state.region;
        assert.ok(x0 >= rx0 - 1.5 && y0 >= ry0 - 1.5 && x1 <= rx1 + 1.5 && y1 <= ry1 + 1.5, `Flight at ${state.time}s: the rocket must sit inside the free region (box ${state.bbox}, region ${state.region})`);
      }
      if (fraction === 0.5) { upright.regionH = state.region ? state.region[3] - state.region[1] : 0; upright.bboxH = y1 - y0; }
      seen.push(`${state.time}s ${state.bbox.map((v) => Math.round(v)).join(',')}`);
    }
    pass(`Flight pose stays inside the free canvas region at ${seen.join(' | ')}`);

    // flight-layout: the free region must be *usable* at the desktop default
    // size, not merely non-overlapping. At base 89376e4 it was 57.5 px tall and
    // the fitted rocket 44 px, so these two assertions fail there; the scaled
    // dock default and the one-row chrome give the canvas its room back.
    assert.ok(upright.regionH >= 220, `1280×800: the Flight free region must be at least 220 px tall (got ${upright.regionH.toFixed(1)} px)`);
    assert.ok(upright.bboxH >= 120, `1280×800: the fitted rocket must stay clearly visible (got ${upright.bboxH.toFixed(1)} px tall)`);
    pass(`1280×800 Flight free region ${upright.regionH.toFixed(1)} px tall; rocket ${upright.bboxH.toFixed(1)} px`);

    // At 1600×1000 the smaller default dock must not cost the canvas anything:
    // the base measurement was a 377.6 px region with a 281.7 px rocket.
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.waitForTimeout(700);
    await scrub.evaluate((input, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, Math.max(0, max * 0.5));
    // Resize and pose effects can settle after the fixed delay on a busy
    // software renderer. Wait for the existing size requirements themselves;
    // a genuinely undersized rocket or free region still fails this check.
    await expect.poll(async () => {
      const settled = await frame();
      return Boolean(settled?.bbox && settled.region
        && settled.bbox[3] - settled.bbox[1] >= 281
        && settled.region[3] - settled.region[1] >= 378);
    }, { message: '1600×1000: the resized Flight frame must meet its existing size requirements', timeout: 20_000 }).toBe(true);
    const wide = await frame();
    assert.ok(wide?.bbox, '1600×1000: the viewport must report the rocket\'s screen box');
    const wideBoxH = wide.bbox[3] - wide.bbox[1];
    const wideRegionH = wide.region ? wide.region[3] - wide.region[1] : 0;
    assert.ok(wideBoxH >= 281, `1600×1000: the posed rocket must not get smaller than the 281.7 px base (got ${wideBoxH.toFixed(1)} px)`);
    assert.ok(wideRegionH >= 378, `1600×1000: the free region must not shrink below the 377.6 px base (got ${wideRegionH.toFixed(1)} px)`);
    pass(`1600×1000 Flight free region ${wideRegionH.toFixed(1)} px tall; rocket ${wideBoxH.toFixed(1)} px`);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(500);
  }
  // flight-layout: the smaller dock must stay usable. At 1280×800 and
  // 1600×1000 the tab bar stays visible and the Timeline keeps its fixed
  // chart-pane height (the stack scrolls instead of squashing); the Monte
  // Carlo, Weather and Results tabs keep every control rendered, unclipped and
  // reachable by scrolling. DOM rects only.
  const dockTab = (name) => page.getByRole('tab', { name, exact: true }).click();
  const timelineProbe = () => page.evaluate(() => {
    const tablist = document.querySelector('main [role="tablist"]');
    const panel = document.querySelector('main [role="tabpanel"][data-state="active"]');
    const tabs = tablist ? [...tablist.querySelectorAll('[role="tab"]')].map((tab) => {
      const r = tab.getBoundingClientRect();
      return { name: (tab.textContent ?? '').trim(), w: Math.round(r.width), h: Math.round(r.height) };
    }) : [];
    const bar = tablist?.getBoundingClientRect();
    return {
      bar: bar ? { top: Math.round(bar.top), bottom: Math.round(bar.bottom), h: Math.round(bar.height) } : null,
      tabs,
      paneHeights: panel ? [...panel.querySelectorAll('svg')].map((svg) => Number(svg.getAttribute('height'))).filter(Number.isFinite) : [],
      overflowY: panel ? getComputedStyle(panel).overflowY : null,
      clientH: panel?.clientHeight ?? 0,
      scrollH: panel?.scrollHeight ?? 0,
      innerHeight,
    };
  });
  const assertTimelineStack = (label, m) => {
    assert.ok(m.bar && m.bar.h > 8, `${label}: the dock tab bar must stay visible (got ${JSON.stringify(m.bar)})`);
    assert.ok(m.bar.top >= 0 && m.bar.bottom <= m.innerHeight, `${label}: the dock tab bar must stay inside the window (${m.bar.top}..${m.bar.bottom} of ${m.innerHeight})`);
    assert.ok(m.tabs.length >= 5, `${label}: every Flight dock tab must stay present (got ${m.tabs.map((t) => t.name).join(', ')})`);
    for (const t of m.tabs) assert.ok(t.w > 0 && t.h > 0, `${label}: dock tab "${t.name}" must be rendered`);
    assert.ok(m.paneHeights.includes(344), `${label}: the Timeline must keep its 5 × 64 px chart panes (svg heights ${m.paneHeights.join(',')})`);
    assert.equal(m.overflowY, 'auto', `${label}: the Timeline must scroll rather than squash`);
    assert.ok(m.scrollH >= 344, `${label}: the Timeline must keep its full content height (scroll ${m.scrollH} of ${m.clientH})`);
  };
  await dockTab('Timeline');
  await page.waitForTimeout(300);
  assertTimelineStack('1280×800', await timelineProbe());
  pass('1280×800: dock tab bar visible; Timeline keeps its 344 px chart stack and scrolls');

  const dockPanelProbe = () => page.evaluate(() => {
    const panel = document.querySelector('main [role="tabpanel"][data-state="active"]');
    if (!panel) return null;
    const base = panel.getBoundingClientRect();
    const controls = [...panel.querySelectorAll('button, input, select, textarea, [role="button"], [role="radio"]')];
    return {
      overflowY: getComputedStyle(panel).overflowY,
      clientH: panel.clientHeight,
      scrollH: panel.scrollHeight,
      rows: panel.querySelectorAll('[role="row"]').length,
      controls: controls.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          kind: el.tagName.toLowerCase(),
          name: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40),
          w: Math.round(r.width), h: Math.round(r.height),
          clippedX: el.scrollWidth > el.clientWidth + 1,
          clippedY: el.scrollHeight > el.clientHeight + 1,
          top: Math.round(r.top - base.top), bottom: Math.round(r.bottom - base.top),
        };
      }),
    };
  });
  const assertDockTabUsable = (label, m) => {
    assert.ok(m, `${label}: the dock tab must render its panel`);
    assert.equal(m.overflowY, 'auto', `${label}: the dock panel must scroll rather than clip`);
    assert.ok(m.clientH > 80, `${label}: the dock panel must keep a usable height (got ${m.clientH} px)`);
    for (const c of m.controls) {
      assert.ok(c.w > 0 && c.h > 0, `${label}: control "${c.name}" must be rendered (${c.w}×${c.h})`);
      if (c.kind !== 'input' && c.kind !== 'textarea') assert.ok(!c.clippedX && !c.clippedY, `${label}: control "${c.name}" must not be clipped`);
      assert.ok(c.top >= -1 && c.bottom <= m.scrollH + 2, `${label}: control "${c.name}" must be reachable by scrolling (${c.top}..${c.bottom} of ${m.scrollH})`);
    }
  };
  // layout-polish 6c: after an ensemble run, the plot, its ring legend, the Run
  // button and the outcome counts must all sit inside the default dock's
  // visible panel area at scrollTop 0.
  const assertMcRecapVisible = async (label) => {
    await page.evaluate(() => { const panel = document.querySelector('main [role="tabpanel"][data-state="active"]'); if (panel) panel.scrollTop = 0; });
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const panel = document.querySelector('main [role="tabpanel"][data-state="active"]');
      if (!panel) return null;
      const base = panel.getBoundingClientRect();
      const inside = (element) => {
        if (!element) return { present: false, top: null, bottom: null, visible: false };
        const r = element.getBoundingClientRect();
        return {
          present: true,
          top: Math.round((r.top - base.top) * 10) / 10,
          bottom: Math.round((r.bottom - base.top) * 10) / 10,
          visible: r.top >= base.top - 0.5 && r.bottom <= base.top + panel.clientHeight + 0.5,
        };
      };
      const legend = [...panel.querySelectorAll('span')].find((span) => (span.textContent ?? '').includes('99% of samples within')) ?? null;
      return {
        panelH: panel.clientHeight,
        scatter: inside(panel.querySelector('[role="img"][aria-label*="simulated landing points"]')),
        legend: inside(legend),
        run: inside([...panel.querySelectorAll('button')].find((button) => /^Run \d+ flights$/.test((button.textContent ?? '').trim()))),
        counts: inside(panel.querySelector('[data-mc-outcome-counts]')),
      };
    });
    layoutCheck(m !== null, `${label}: the Monte Carlo panel must be active`);
    if (!m) return;
    for (const [name, box] of Object.entries({ scatter: m.scatter, legend: m.legend, run: m.run, counts: m.counts })) {
      layoutCheck(box.present, `${label}: ${name} must be present`);
      layoutCheck(box.visible, `${label}: ${name} must be fully visible at the default dock (${JSON.stringify(box)} of ${m.panelH} px)`);
    }
  };
  for (const [tabName, label] of [['Monte Carlo', '1280×800 Monte Carlo'], ['Weather', '1280×800 Weather']]) {
    await dockTab(tabName);
    await page.waitForTimeout(300);
    const m = await dockPanelProbe();
    assert.ok(m.controls.length > 0, `${label}: the tab must expose its controls`);
    assertDockTabUsable(label, m);
  }
  await dockTab('Results');
  await page.waitForTimeout(300);
  const resultPanel = await dockPanelProbe();
  assertDockTabUsable('1280×800 Results', resultPanel);
  assert.ok(resultPanel.rows >= 10, `1280×800 Results: every result row must render (got ${resultPanel.rows})`);
  pass(`1280×800: Monte Carlo, Weather and Results stay usable in the smaller dock (${resultPanel.rows} result rows)`);

  // layout-polish 6c falsifier: a real ensemble at the default dock.
  await dockTab('Monte Carlo');
  await page.waitForTimeout(300);
  await page.getByRole('spinbutton', { name: 'Monte Carlo nRuns', exact: true }).fill('24');
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: /^Run \d+ flights$/ }).click();
  await page.locator('[data-mc-outcome-counts]').waitFor({ timeout: 240_000 });
  await page.waitForFunction(() => document.querySelectorAll('main .animate-spin').length === 0, undefined, { timeout: 240_000 });
  await page.waitForTimeout(400);
  await assertMcRecapVisible('1280×800 Monte Carlo after a run');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(900);
  await assertMcRecapVisible('1600×1000 Monte Carlo after a run');
  assert.deepEqual(layoutFailures, [], `layout-polish falsifiers:\n${layoutFailures.join('\n')}`);
  pass('Monte Carlo plot, ring legend, Run and outcome counts fit the default dock at 1280×800 and 1600×1000');

  await dockTab('Timeline');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(600);
  assertTimelineStack('1600×1000', await timelineProbe());
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(400);
  pass('1600×1000: the dock tab bar and the 344 px chart stack hold with the scaled default');

  await stage('Airframe');
  await page.setViewportSize({ width: 1280, height: 800 });
  await stage('Airframe');

  // The R3F viewport canvas lives in the dock next to the live-stats region
  // (the region itself only holds a static-margin strip). Probe the visible
  // main canvas, but reuse its live context: creating a new one on an element
  // that already has a different-type context silently returns null.
  // A runner with no WebGL at all shows the labeled fallback and never a
  // canvas: assert the fallback is showing with live readouts, then skip the
  // loss/restore cycle that needs a real context (Chromium covers it).
  await page.locator('main canvas:visible, [data-webgl-fallback="true"]').first().waitFor({ timeout: 30_000 });
  if (await page.locator('[data-webgl-fallback="true"]').count() > 0) {
    await expect(page.getByRole('region', { name: 'Live stability and flight preview' })).toBeVisible();
    pass('WebGL loss preserves readouts; viewport restores (no-WebGL runner: fallback shown, readouts live)');
  } else {
  const viewportCanvas = page.locator('main canvas:visible');
  await expect(viewportCanvas).toBeVisible({ timeout: 30_000 });
  const canLoseContext = await viewportCanvas.evaluate((canvas) => {
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    // A replaced or contextless canvas has no live context to lose: report
    // honestly instead of treating a probe artifact as a test failure.
    if (!(gl instanceof WebGLRenderingContext || gl instanceof WebGL2RenderingContext)) return 'stale';
    if (gl.isContextLost()) return 'stale';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return gl.isContextLost() ? true : 'stale';
  });
  if (canLoseContext === 'stale') {
    // The probed canvas was replaced between resolve and lose: re-resolve the
    // live one and retry once rather than failing on a probe artifact.
    await expect(page.locator('main canvas:visible')).toBeVisible({ timeout: 30_000 });
    const retry = await page.locator('main canvas:visible').evaluate((canvas) => {
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      if (!(gl instanceof WebGLRenderingContext || gl instanceof WebGL2RenderingContext) || gl.isContextLost()) return false;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return gl.isContextLost();
    });
    assert.ok(retry, 'Browser must expose context-loss testing');
  } else {
    assert.ok(canLoseContext, 'Browser must expose context-loss testing');
  }
  await expect(page.locator('[data-webgl-fallback="true"]:visible')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('region', { name: 'Live stability and flight preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Restore viewport', exact: true }).click();
  await expect(page.locator('main canvas:visible')).toBeVisible({ timeout: 30_000 });
  pass('WebGL loss preserves readouts; viewport restores');
  }

  await stage('Airframe');
  await page.getByRole('radio', { name: '2D', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Side and aft views with dimensions' })).toBeVisible();
  await page.getByRole('radio', { name: '3D + 2D', exact: true }).click();
  await page.locator('main canvas:visible, [data-webgl-fallback="true"]').first().waitFor({ timeout: 30_000 });
  if (await page.locator('[data-webgl-fallback="true"]').count() === 0) {
    await expect(page.locator('main canvas:visible')).toBeVisible();
  }
  await expect(page.getByRole('img', { name: 'Side and aft views with dimensions' })).toBeVisible();
  await page.getByRole('radio', { name: '3D', exact: true }).click();
  pass('2D, split and 3D views');
  await page.getByRole('treeitem', { name: 'Von Kármán Nosecone', exact: true }).click();
  const length = page.locator('div.group').filter({ has: page.locator('span.truncate', { hasText: /^Length$/ }) }).getByRole('textbox');
  const before = await length.inputValue();
  await length.fill(String(Number(before.replaceAll(',', '')) + 10));
  await length.press('Enter');
  await page.getByRole('button', { name: 'Apply staged edits', exact: true }).click();
  await expect(page.getByRole('banner')).toContainText('since run');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveAttribute('title', isMac ? /⌘Z/ : /Ctrl\+Z/);
  await expect(page.getByRole('button', { name: 'Redo', exact: true })).toHaveAttribute('title', isMac ? /⇧⌘Z/ : /Ctrl\+Shift\+Z/);
  await stage('Build');
  await expect(page.locator('[data-format="kml"]').getByRole('button', { name: 'Review export' })).toBeDisabled();
  await stage('Airframe');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(length).toHaveValue(before);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(length).not.toHaveValue(before);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(length).toHaveValue(before);
  pass('staged edits, stale flight export refusal, undo, redo');

  const name = page.getByRole('textbox', { name: 'Vehicle name' });
  await name.fill('Preview acceptance rocket');
  await name.press('Tab');
  await menu('Save to this browser');
  await page.locator('[data-project-status="ok"]').waitFor();
  await page.keyboard.press('Escape');
  await name.fill('Unsaved change');
  await name.press('Tab');
  await menu('Open saved project');
  await expect(name).toHaveValue('Preview acceptance rocket');
  await page.keyboard.press('Escape');
  await page.reload();
  await menu('Open saved project');
  await expect(name).toHaveValue('Preview acceptance rocket');
  await page.keyboard.press('Escape');
  pass('IndexedDB save/restore across edits and reload');

  await stage('Flight');
  await page.getByRole('tab', { name: 'Weather', exact: true }).click();
  const csv = page.getByRole('textbox', { name: 'Wind profile CSV' });
  await csv.fill('altitude,speed,direction\n300,6,180\n0,2,90');
  await page.getByRole('button', { name: 'Import wind table', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Wind layer 1 altitudeM', exact: true })).toHaveValue('0');
  await expect(page.getByRole('spinbutton', { name: 'Wind layer 1 speedMs', exact: true })).toHaveValue('2');
  await csv.fill('garbage');
  await page.getByRole('button', { name: 'Import wind table', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Wind layer 1 speedMs', exact: true })).toHaveValue('2');
  pass('sorted wind CSV import; malformed input preserves prior data');

  await page.getByRole('banner').getByRole('button', { name: /Run simulation/ }).click();
  await page.locator('[aria-label^="Apogee (committed run) "]').waitFor({ timeout: 60_000 });
  await stage('Mission');
  const site = page.getByRole('textbox', { name: 'Mission site', exact: true });
  await site.fill('Huntsville, AL (journey)');
  await expect(site).toHaveValue('Huntsville, AL (journey)');
  await stage('Build');
  await page.getByRole('radio', { name: 'Off', exact: true }).click();
  const files = {};
  for (const format of ['project', 'rkt', 'ork', 'step', 'stl', 'svg', 'eng', 'rse', 'png', 'kml']) {
    await page.locator(`[data-format="${format}"]`).getByRole('button', { name: 'Review export' }).click();
    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Confirm export', exact: true }).click();
    const download = await downloadPromise;
    const path = await download.path();
    assert.ok((await stat(path)).size > 20, `${format} export must contain data`);
    files[format] = { name: download.suggestedFilename(), bytes: await readFile(path) };
  }
  pass('all ten export formats download consecutively');

  await name.fill('Round-trip probe');
  await page.getByLabel('Import file', { exact: true }).setInputFiles({ name: files.project.name, mimeType: 'application/json', buffer: files.project.bytes });
  await expect(name).toHaveValue('Preview acceptance rocket');
  await page.getByLabel('Import file', { exact: true }).setInputFiles({ name: files.ork.name, mimeType: 'application/octet-stream', buffer: files.ork.bytes });
  await expect(page.getByRole('treeitem')).toHaveCount(7);
  await page.getByLabel('Import file', { exact: true }).setInputFiles({ name: files.project.name, mimeType: 'application/json', buffer: files.project.bytes });
  await expect(name).toHaveValue('Preview acceptance rocket');
  await page.getByLabel('Import file', { exact: true }).setInputFiles({ name: 'broken.astraea.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await expect(page.getByText('Could not load broken.astraea.json', { exact: true })).toBeVisible();
  await expect(name).toHaveValue('Preview acceptance rocket');
  await page.getByRole('button', { name: 'Dismiss disclosure', exact: true }).click();
  pass('project/OpenRocket round trips; malformed import preserves project');

  // D1/D2: a project the user names `.astraea` must open, and must bring its
  // mission with it rather than the defaults or whatever the session holds.
  assert.match(files.project.name, /\.astraea\.json$/, 'Save suggests the canonical project extension');
  await stage('Mission');
  await site.fill('Somewhere else');
  await expect(site).toHaveValue('Somewhere else');
  await page.getByLabel('Import file', { exact: true }).setInputFiles({ name: 'p1.astraea', mimeType: 'application/octet-stream', buffer: files.project.bytes });
  await expect(page.getByText('Could not load p1.astraea', { exact: true })).toHaveCount(0);
  await expect(site).toHaveValue('Huntsville, AL (journey)');
  await expect(page.getByText('Student Launch 2027').first()).toBeVisible();
  await expect(name).toHaveValue('Preview acceptance rocket');
  pass('.astraea project opens and restores its mission');

  await stage('Flight');
  await page.getByRole('tab', { name: 'Monte Carlo', exact: true }).click();
  const runs = page.getByRole('spinbutton', { name: 'Monte Carlo nRuns', exact: true });
  // D5: at 1280×800 every control and the Run button are fully on screen.
  await page.setViewportSize({ width: 1280, height: 800 });
  const controls = page.locator('[data-mc-controls="true"]');
  await expect(controls).toBeVisible();
  for (const field of ['nRuns', 'seed', 'windAzimuthDegSigma', 'railAngleDegSigma', 'impulsePctSigma']) {
    await expect(page.getByRole('spinbutton', { name: `Monte Carlo ${field}`, exact: true })).toBeInViewport({ ratio: 1 });
  }
  await expect(page.getByRole('button', { name: /^Run \d+ flights$/ })).toBeInViewport({ ratio: 1 });
  assert.ok(await controls.evaluate((el) => el.scrollWidth <= el.clientWidth), 'Monte Carlo controls must not overflow horizontally');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Flight page must not scroll sideways at 1280×800');
  await page.setViewportSize({ width: 1600, height: 1000 });
  pass('1280×800 Monte Carlo controls and Run button fully visible');
  await runs.fill('10');
  await page.getByRole('button', { name: 'Run 10 flights', exact: true }).click();
  await page.getByText(/10\s*\/\s*10/).waitFor({ timeout: 60_000 });
  await expect(page.getByRole('img', { name: '10 simulated landing points', exact: true })).toBeVisible();
  await runs.fill('1000');
  await page.getByRole('button', { name: 'Run 1000 flights', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByText(/cancelled/i).first().waitFor();
  await expect(page.getByRole('img', { name: /simulated landing points/ })).toHaveCount(0);
  pass('Monte Carlo completion; cancellation discards partial results');

  await stage('Verify');
  await openValidation(page);
  await page.getByRole('textbox', { name: 'Altimeter CSV data', exact: true }).fill('time_ms,altitude_ft\n0,0\n1000,100\n2000,200\n3000,150\n4000,0');
  await page.getByRole('button', { name: 'Parse', exact: true }).click();
  await expect(page.locator('main')).toContainText(/Time unit\s*milliseconds \(from header\)/);
  await expect(page.locator('main')).toContainText(/Altitude unit\s*feet \(from header\)/);
  await page.getByRole('button', { name: 'Resample', exact: true }).click();
  await expect(page.locator('main')).toContainText('61.0 m');
  pass('real unit conversion and telemetry resampling');

  await stage('Motor');
  await page.getByRole('radio', { name: 'Chamber & nozzle', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Nozzle performance table' })).toContainText('307.0', { timeout: 60_000 });
  await page.getByRole('radio', { name: 'BATES grain', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Burn area versus burned web sparkline' })).toBeVisible();
  pass('chamber/nozzle and grain panels compute');

  await page.getByRole('radio', { name: 'Curve editor', exact: true }).click();
  const thrust = page.getByRole('spinbutton', { name: 'Point 1 thrust', exact: true });
  await thrust.fill(String(Number(await thrust.inputValue()) + 1));
  await thrust.press('Tab');
  await page.getByRole('textbox', { name: 'Edited motor name', exact: true }).fill('Acceptance derived motor');
  await page.getByRole('button', { name: 'Save as new motor', exact: true }).click();
  await expect(page.locator('main')).toContainText('Saved Acceptance derived motor');
  pass('curve edits save a derived motor');
}

/**
 * Runs after the other journeys, on a fresh load: it replaces the open project.
 *
 * Drag calibration, end to end in the built app: open the Cosmic Cargo design,
 * preview the real Altimeter Cloud #2986 extract and refuse unsupported application.
 * Then use a separately named synthetic vertical coast/design to exercise
 * conditional application, labels, save/reopen and removal. Neither workflow
 * establishes measured flight accuracy.
 */
export async function calibrationJourney(page, origin) {
  const stage = (name) => page.getByRole('navigation', { name: 'Pipeline stages' }).getByRole('button', { name, exact: true }).click();
  const menu = async (name) => {
    await page.getByRole('button', { name: 'Project menu', exact: true }).click();
    await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  };
  const pass = (name) => console.log(`Preview acceptance passed: ${name}`);
  await page.goto(new URL('app/', origin).href);
  const logCsv = await readFile(new URL('../docs/flight-validation/cosmic-cargo-2986-coast.csv', import.meta.url));
  const design = await readFile(new URL('./fixtures/cosmic-cargo-2986.astraea.json', import.meta.url));
  const apogeeLabel = page.locator('[aria-label^="Apogee (committed run) "]');
  const readApogee = async () => {
    const label = await apogeeLabel.getAttribute('aria-label');
    const match = /Apogee \(committed run\) ([\d,.]+) m, (\w+)/.exec(label ?? '');
    assert.ok(match, `Apogee label must read "<n> m, <level>" (got ${label})`);
    return { metres: Number(match[1].replaceAll(',', '')), level: match[2] };
  };
  const run = async () => {
    await page.getByRole('banner').getByRole('button', { name: /Run simulation/ }).click();
    await expect(page.getByRole('banner').getByRole('button', { name: /Run simulation/ })).toBeEnabled({ timeout: 60_000 });
    await apogeeLabel.waitFor({ timeout: 60_000 });
  };
  const chips = page.locator('[data-drag-calibration]');
  const fitValues = () => page.locator('[data-drag-fit]').evaluate((el) =>
    Object.fromEntries([...el.querySelectorAll('span[data-value]')].map((v) => [v.previousElementSibling.textContent, v.getAttribute('data-value')])));

  // A fresh page has not seen the stored revision yet, and the browser slot refuses a stale save by
  // design: open what is stored first, as a user would, then bring in the design to calibrate.
  await menu('Open saved project');
  await page.keyboard.press('Escape');
  // The Studio no longer carries a second copy of the recovery card; Recovery keeps it.
  await stage('Mission');
  await page.getByLabel('Import file', { exact: true }).setInputFiles({ name: 'cosmic-cargo-2986.astraea.json', mimeType: 'application/json', buffer: design });
  await expect(page.getByRole('textbox', { name: 'Vehicle name' })).toHaveValue('Cosmic Cargo (estimated)');
  await run();
  let before = await readApogee();
  assert.equal(before.level, 'Modeled', 'An uncalibrated run reads Modeled');
  assert.equal(await chips.count(), 0, 'No calibration chip before any calibration');
  await stage('Verify');
  await openValidation(page);
  assert.equal(await page.getByLabel('Recovery bay').count(), 0, 'Verify must not mount the recovery card');
  await expect(page.locator('main')).toContainText('Flight evidence');
  await stage('Recovery');
  await expect(page.getByLabel('Recovery bay')).toBeVisible();
  await stage('Verify');
  await openValidation(page);

  // Import the real log; nothing is pre-filled as if it were the user's.
  await page.getByLabel('Flight log file').setInputFiles({ name: 'cosmic-cargo-2986-coast.csv', mimeType: 'text/csv', buffer: logCsv });
  await expect(page.locator('[data-log-provenance="source"]')).toContainText('cosmic-cargo-2986-coast.csv');
  await expect(page.locator('[data-log-provenance="checksum"]')).toContainText(/[0-9a-f]{64}/);
  await page.getByRole('button', { name: 'Fit drag to this log', exact: true }).click();
  await page.locator('[data-drag-fit]').waitFor({ timeout: 60_000 });
  const fit = await fitValues();
  const cd = Number(fit['Fitted effective Cd']);
  const modelCd = Number(fit['Model coast Cd']);
  let scale = Number(fit['Drag scale']);
  assert.ok(cd > 0.45 && cd < 0.52, `Fitted Cd should land near the signed estimate for this flight (got ${cd})`);
  assert.ok(modelCd > 0.54 && modelCd < 0.57, `Model coast Cd (got ${modelCd})`);
  assert.ok(Math.abs(scale - cd / modelCd) < 0.002, 'Scale is fitted / model');
  assert.ok(scale > 0.8 && scale < 0.95, `Scale (got ${scale})`);
  const [windowStart, windowEnd] = fit['Data window'].split('–').map(Number.parseFloat);
  assert.ok(windowStart > 2.2 && windowStart < 2.5 && windowEnd > 7 && windowEnd <= 7.45, `Coast window (got ${fit['Data window']})`);
  const used = Number(fit['Points used']);
  assert.ok(used > 300, `Points used (got ${used})`);
  await expect(page.locator('main')).toContainText(/Highest logged altitude \/ model apogee\s*291\.\d m \/ 37\d\.\d m/);
  console.log(`Calibration fit: Cd ${cd}, model Cd ${modelCd}, scale ${scale}, window ${fit['Data window']}, ${used} points used, ${fit['Points excluded']} excluded, RMSE ${fit['In-sample equivalent-force RMSE']}, coast mass ${fit['Coast mass']}`);
  pass('drag fit from the real log shows window, counts, Cd, model Cd, scale');

  const apply = page.getByRole('button', { name: 'Apply to this project', exact: true });
  await expect(apply).toBeDisabled();
  await expect(page.locator('[data-calibration-eligibility]')).not.toHaveAttribute('data-calibration-eligibility', 'conditional');
  // These event times come from the already-examined source metadata. Do not
  // alter them to make this real-flight extract eligible: recovery intersects
  // its filter support, even before the unverified motion review is considered.
  await page.getByLabel('Log event source and clock basis', { exact: true }).fill('Altimeter Cloud #2986 metadata: refined burnout 1887 ms, ejection 7205 ms; source/imported clock, uncertainty not independently qualified.');
  for (const side of ['earliest', 'latest']) await page.getByLabel(`Log final burnout ${side} (s)`, { exact: true }).fill('1.887');
  await page.getByLabel('Log recovery evidence', { exact: true }).selectOption('first-event');
  for (const side of ['earliest', 'latest']) await page.getByLabel(`Log first recovery ${side} (s)`, { exact: true }).fill('7.205');
  await expect(page.locator('[data-calibration-eligibility]')).toHaveAttribute('data-calibration-eligibility', 'unsupported');
  await expect(page.locator('[data-calibration-eligibility]')).toContainText('filter support may include recovery');
  await expect(apply).toBeDisabled();
  pass('real extract remains analysis-only when source recovery intersects smoothing support');

  // Use an explicitly synthetic fixture for application mechanics. The real
  // case above retains its measured regression assertions and refusal result.
  const synthetic = syntheticCalibrationCoast();
  const controlled = JSON.parse(design.toString());
  controlled.vehicle.name = 'Synthetic vertical calibration workflow';
  controlled.workspace.launch.railElevationDeg = 90;
  controlled.workspace.launch.windSpeedMps = 0;
  controlled.workspace.launch.finCantDeg = 0;
  controlled.mission.name = 'Synthetic workflow — no empirical validation';
  await stage('Mission');
  await page.getByLabel('Import file', { exact: true }).setInputFiles({ name: 'synthetic-calibration-workflow.astraea.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(controlled)) });
  await expect(page.getByRole('textbox', { name: 'Vehicle name' })).toHaveValue(controlled.vehicle.name);
  await run();
  before = await readApogee();
  await stage('Verify');
  await openValidation(page);
  await page.getByLabel('Flight log file').setInputFiles({ name: synthetic.fileName, mimeType: 'text/csv', buffer: synthetic.bytes });
  await expect(page.locator('[data-log-provenance="source"]')).toContainText(synthetic.fileName);
  await page.getByRole('button', { name: 'Fit drag to this log', exact: true }).click();
  await page.locator('[data-drag-fit]').waitFor({ timeout: 60_000 });
  await expect(apply).toBeDisabled();
  const controlledFit = await fitValues();
  scale = Number(controlledFit['Drag scale']);
  assert.ok(scale > 0.25 && scale < 1, `Synthetic lower-drag workflow fixture scale (got ${scale})`);
  await page.getByLabel('Log event source and clock basis', { exact: true }).fill(synthetic.evidenceSource);
  for (const side of ['earliest', 'latest']) await page.getByLabel(`Log final burnout ${side} (s)`, { exact: true }).fill(String(synthetic.burnoutS));
  await page.getByLabel('Log recovery evidence', { exact: true }).selectOption('first-event');
  for (const side of ['earliest', 'latest']) await page.getByLabel(`Log first recovery ${side} (s)`, { exact: true }).fill(String(synthetic.recoveryS));
  await page.getByLabel('Motion and mass evidence note', { exact: true }).fill(synthetic.evidenceSource + ' Model is an axisymmetric zero-cant fixture with vertical guide and zero wind; native events bound its coast support.');
  for (const label of ['Log approximately vertical air-relative motion', 'Log constant mass across filter support', 'Model approximately vertical air-relative motion', 'Model constant mass across filter support']) {
    await page.getByLabel(label, { exact: true }).selectOption('supported');
  }
  await page.getByRole('button', { name: 'Refit within reviewed events', exact: true }).click();
  await expect(page.locator('[data-drag-fit]')).toHaveAttribute('data-coast-selection', 'reviewed-events-v1');
  scale = Number((await fitValues())['Drag scale']);
  assert.ok(scale > 0.25 && scale < 1, `Event-qualified synthetic scale (got ${scale})`);
  await expect(page.locator('[data-calibration-eligibility]')).toHaveAttribute('data-calibration-eligibility', 'conditional');
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(page.locator('[data-drag-calibration-applied]')).toBeVisible();
  // Applying stales the run made without it, and says so.
  await expect(page.getByRole('banner')).toContainText('since run');
  await run();
  const after = await readApogee();
  assert.equal(after.level, 'Calibrated', 'A calibrated run reads Calibrated');
  assert.ok(after.metres > before.metres, `Scale below 1 lowers drag, so apogee rises (${before.metres} -> ${after.metres})`);
  assert.ok(await chips.first().isVisible(), 'The header carries the calibration chip');
  assert.equal(await chips.first().getAttribute('data-drag-calibration'), scale.toFixed(3));
  await stage('Flight');
  await expect(chips.first()).toBeVisible();
  console.log(`Synthetic workflow: apogee ${before.metres} m (Modeled) -> ${after.metres} m (Calibrated), scale ${scale}; no measured-flight accuracy claim`);
  pass('apply -> run -> result labelled Calibrated, apogee moves with the drag');

  // Save to the browser slot, reload, reopen: the calibration is still on the project.
  // An earlier "ok" is still showing: wait for THIS save's revision, not just any ok.
  await page.getByRole('button', { name: 'Project menu', exact: true }).click();
  const projectStatus = page.locator('[data-project-status]');
  const previousStatus = await projectStatus.count() ? await projectStatus.first().textContent() : null;
  await page.getByRole('button', { name: /^Save to this browser/ }).click();
  await expect(projectStatus).toContainText(/Saved locally \(revision \d+\)/);
  if (previousStatus) await expect(projectStatus).not.toHaveText(previousStatus);
  await page.keyboard.press('Escape');
  await page.reload();
  await menu('Open saved project');
  await page.keyboard.press('Escape');
  await stage('Verify');
  await openValidation(page);
  await expect(page.locator('[data-drag-calibration-applied]')).toHaveAttribute('data-drag-calibration-applied', scale.toFixed(3));
  await expect(page.locator('[data-drag-calibration-applied]')).toContainText(synthetic.fileName);
  await run();
  assert.equal((await readApogee()).level, 'Calibrated', 'The reopened project still runs calibrated');
  assert.equal((await readApogee()).metres, after.metres, 'and gives the same apogee');
  pass('calibration survives save, reload and reopen from the browser slot');

  // Through a file: export the project from Build, change it, import it back.
  await stage('Build');
  await page.getByRole('radio', { name: 'Off', exact: true }).click();
  await page.locator('[data-format="project"]').getByRole('button', { name: 'Review export' }).click();
  const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Confirm export', exact: true }).click();
  const exported = await readFile(await (await downloadPromise).path());
  const savedProject = JSON.parse(exported.toString());
  const savedCalibration = savedProject.dragCalibration;
  const expectedEngineSha = createHash('sha256').update(await readFile(new URL('../src/engine/astraea_engine.wasm', import.meta.url))).digest('hex');
  const schemaSource = await readFile(new URL('../src/formats/projectJson.ts', import.meta.url), 'utf8');
  const expectedSchema = schemaSource.match(/PROJECT_SCHEMA_VERSION\s*=\s*'([^']+)'/)?.[1];
  assert.ok(expectedSchema, 'project schema constant must be readable');
  assert.equal(savedProject.schemaVersion, expectedSchema, 'Model-bound run inputs use the current schema');
  assert.deepEqual(savedCalibration.fitProvenance.engineIdentity, { kind: 'production-rust-wasm', sha256: expectedEngineSha }, 'Saved calibration identifies the exact production bytes');
  assert.ok(savedProject.cases.length >= 2, 'Baseline and calibrated runs survive saving');
  for (const savedCase of savedProject.cases) {
    assert.ok(savedCase.inputs?.motorRecord.motor.thrustCurve.length > 1, 'Each new case archives its effective curve');
    assert.ok(savedCase.inputs?.engineOptions, 'Each new case archives its executed options');
    assert.equal(savedCase.inputs.version, 2, 'New captures version their model selection');
    assert.equal(savedCase.inputs.flightModel.modelId, 'flight-signed-normal-plus-wind-drag-v1');
    assert.deepEqual(savedCase.engineIdentity, { kind: 'production-rust-wasm', sha256: expectedEngineSha }, 'Each case retains its invocation identity');
  }
  assert.equal(savedCalibration.scale.toFixed(3), scale.toFixed(3), 'The exported project file carries the calibration');
  assert.equal(savedCalibration.fitProvenance.eligibility, 'conditional');
  assert.ok(savedCalibration.fitProvenance.uncalibratedRunKey, 'The reviewed model input identity survives export');
  assert.ok(savedCalibration.fitProvenance.logWindow.supportEndS < synthetic.recoveryS, 'Saved filter support excludes fixture recovery');
  await stage('Verify');
  await openValidation(page);
  await page.getByRole('button', { name: 'Remove calibration', exact: true }).click();
  await expect(page.locator('[data-drag-calibration-applied]')).toHaveCount(0);
  await stage('Mission');
  await page.getByLabel('Import file', { exact: true }).setInputFiles({ name: 'calibrated.astraea.json', mimeType: 'application/json', buffer: exported });
  await stage('Verify');
  await openValidation(page);
  await expect(page.locator('[data-drag-calibration-applied]')).toHaveAttribute('data-drag-calibration-applied', scale.toFixed(3));
  pass('calibration survives save and open through a project file');

  // Remove: scale 1 again, the old numbers come back, and no label is left.
  await page.getByRole('button', { name: 'Remove calibration', exact: true }).click();
  await expect(page.locator('[data-drag-calibration-applied]')).toHaveCount(0);
  await run();
  const removed = await readApogee();
  assert.equal(removed.level, 'Modeled', 'After removal the run reads Modeled again');
  assert.equal(removed.metres, before.metres, 'and gives the uncalibrated apogee');
  assert.equal(await chips.count(), 0, 'and no calibration chip remains');
  pass('remove calibration restores scale 1 and drops the label');

  // Loading identical saved inputs must still detach the current result and
  // require an explicit fresh Run; historical summaries stay historical.
  await stage('Build');
  const savedRuns = page.getByRole('region', { name: 'Saved runs', exact: true });
  const loadSaved = savedRuns.getByRole('button', { name: 'Load saved inputs', exact: true });
  await expect(loadSaved.last()).toBeEnabled();
  await loadSaved.last().click();
  await expect(apogeeLabel).toHaveCount(0);
  await run();
  assert.equal((await readApogee()).metres, before.metres, 'Explicit saved-input rerun reproduces the unscaled result');
  pass('saved inputs detach current results and reproduce through an explicit native WASM run');
}

/**
 * Share this flight, end to end in the built app: import a real log (with a
 * byte-order mark the app's text decoding would drop), leave Verify and come
 * back, fill the form, export, and inspect the downloaded zip: its files, that
 * the log inside is byte-identical to the file picked, and its checksum.
 */
export async function shareFlightJourney(page, origin) {
  await page.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }));
  const stage = (name) => page.getByRole('navigation', { name: 'Pipeline stages' }).getByRole('button', { name, exact: true }).click();
  const pass = (name) => console.log(`Preview acceptance passed: ${name}`);
  await page.goto(new URL('app/', origin).href);
  const csv = await readFile(new URL('../docs/flight-validation/cosmic-cargo-2986-coast.csv', import.meta.url));
  const logBytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), csv]);
  const logSha = createHash('sha256').update(logBytes).digest('hex');
  let downloads = 0;
  page.on('download', () => { downloads += 1; });
  const exportButton = page.getByRole('button', { name: 'Export flight bundle', exact: true });

  await stage('Verify');
  await openValidation(page);
  await exportButton.scrollIntoViewIfNeeded();
  await expect(page.getByText(/Import a flight log above first/)).toBeVisible();
  await exportButton.click();
  await expect(page.getByText(/there is nothing to share without it/i)).toBeVisible();
  assert.equal(downloads, 0, 'No bundle without a log');

  await page.getByLabel('Flight log file').setInputFiles({ name: 'my flight.csv', mimeType: 'text/csv', buffer: logBytes });
  await expect(page.locator('[data-log-provenance="checksum"]')).toContainText(logSha);

  // Leaving Verify must not lose the log.
  await stage('Flight');
  await stage('Verify');
  await openValidation(page);
  await expect(page.locator('[data-log-provenance="source"]')).toContainText('my flight.csv');
  await expect(page.locator('[data-log-provenance="checksum"]')).toContainText(logSha);
  pass('the imported log survives Verify -> Flight -> Verify');

  // Required answers are enforced.
  await exportButton.scrollIntoViewIfNeeded();
  await exportButton.click();
  await expect(page.getByText(/Enter the measured liftoff mass/)).toBeVisible();
  await expect(page.getByText(/Enter the launch date/)).toBeVisible();
  await expect(page.getByText(/Tick the box to agree/)).toBeVisible();
  assert.equal(downloads, 0, 'No bundle without mass, date and consent');

  // 95 g is far from this design's mass: warned about, not blocked.
  await page.getByLabel('Liftoff mass (g)', { exact: false }).fill('95');
  await page.getByLabel('Launch date', { exact: false }).fill('2026-10-18');
  await page.getByLabel('Launch site', { exact: false }).fill('Black Rock');
  await page.getByLabel('Rail length (m)', { exact: false }).fill('1.8');
  await page.getByLabel('Logger model', { exact: false }).fill('Altus Metrum EasyMini');
  await expect(page.getByText(/× the design/)).toBeVisible({ timeout: 30_000 });
  await exportButton.click();
  await expect(page.getByText(/Tick the box to agree/)).toBeVisible();
  assert.equal(downloads, 0, 'No bundle without consent');
  await page.getByLabel(/I agree this data may be used to validate Astraea/).check();
  const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
  await exportButton.click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /\.zip$/);
  const zip = await JSZip.loadAsync(await readFile(await download.path()));
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  const sizes = await Promise.all(names.map(async (n) => `${n} ${(await zip.file(n).async('uint8array')).byteLength}`));
  console.log(`Flight bundle ${download.suggestedFilename()}: ${sizes.join('; ')}`);
  for (const required of ['README.txt', 'flight-info.json', 'flight-log/my flight.csv', 'flight-log/provenance.json']) assert.ok(names.includes(required), `Bundle holds ${required} (got ${names})`);
  assert.ok(names.some((n) => n.endsWith('.astraea.json')) && names.some((n) => n.endsWith('.eng')), 'Bundle holds the project and the motor curve');
  const back = Buffer.from(await zip.file('flight-log/my flight.csv').async('uint8array'));
  assert.ok(back.equals(logBytes), 'The log in the bundle is byte-identical to the file picked');
  const provenance = JSON.parse(await zip.file('flight-log/provenance.json').async('string'));
  assert.equal(provenance.sha256, logSha, 'Provenance checksum is the checksum of those bytes');
  const info = JSON.parse(await zip.file('flight-info.json').async('string'));
  assert.equal(info.liftoffMassG, 95);
  assert.equal(info.consent.agreed, true);
  assert.equal(info.siteName, 'Black Rock');
  const project = JSON.parse(await zip.file(names.find((n) => n.endsWith('.astraea.json'))).async('string'));
  assert.ok(project.vehicle?.components?.length > 0, 'The project in the bundle carries the vehicle');
  pass('share this flight: bundle files, log bytes and checksum');
}
