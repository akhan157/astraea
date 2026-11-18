// Linux: drive the desktop update banner of an INSTALLED release build:
// wait for the offer, press "Later" (the banner must go away and nothing
// installs), re-open the offer, then press "Install and restart".
// Verification that the install actually replaced the app is done by the
// workflow from outside the app (file hash / registry / Info.plist).
//
//   node drive.mjs webdriver <application-path> <expected-version>   (Linux: tauri-driver on :4444)
//   node drive.mjs check-name <application-path> <name>              (after the update: was the unsaved edit restored?)
// With RECOVERY_MARK set, the first mode types that Vehicle name, unsaved, before installing.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

const [mode, ...rest] = process.argv.slice(2);
const expected = rest.at(-1);
const log = [];
const note = (line) => { console.log(line); log.push(`${new Date().toISOString()} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OFFER_TIMEOUT_MS = 90_000;

async function webdriver(application, checkName = null) {
  const base = 'http://127.0.0.1:4444';
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    const json = await res.json();
    if (json.value && json.value.error) throw new Error(`${method} ${path}: ${json.value.error}: ${json.value.message}`);
    return json.value;
  };
  const open = async () => (await call('POST', '/session', { capabilities: { alwaysMatch: { 'tauri:options': { application } } } })).sessionId;
  const bannerText = async (id) => {
    try { return await call('POST', `/session/${id}/execute/sync`, { script: 'const b=document.querySelector("[data-update-banner]");return b?b.innerText:null', args: [] }); } catch { return null; }
  };
  const waitOffer = async (id) => {
    const until = Date.now() + OFFER_TIMEOUT_MS;
    while (Date.now() < until) {
      const text = await bannerText(id);
      if (text && /is available/.test(text)) return text;
      await sleep(1000);
    }
    throw new Error(`no update offer within ${OFFER_TIMEOUT_MS / 1000}s`);
  };
  const button = async (id, label) => {
    // Find by visible text inside the banner and click it in the page (a real
    // DOM click on the same handler a person's click reaches).
    const clicked = await call('POST', `/session/${id}/execute/sync`, {
      script: 'const b=[...document.querySelectorAll("[data-update-banner] button")].find(x=>x.textContent.trim()===arguments[0]);if(!b)return false;b.click();return true',
      args: [label],
    });
    assert.ok(clicked, `button "${label}" not found in the update banner`);
  };

  const NAME_JS = 'return document.querySelector(\'input[aria-label="Vehicle name"]\')?.value ?? null';
  const setName = async (id, value) => call('POST', `/session/${id}/execute/sync`, {
    // React reads the native value setter plus an input event, as typing does.
    script: 'const i=document.querySelector(\'input[aria-label="Vehicle name"]\');if(!i)return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(i,arguments[0]);i.dispatchEvent(new Event("input",{bubbles:true}));return true',
    args: [value],
  });

  if (checkName) {
    const id = await open();
    const until = Date.now() + 60_000;
    let value = null;
    while (Date.now() < until) {
      value = await call('POST', `/session/${id}/execute/sync`, { script: NAME_JS, args: [] }).catch(() => null);
      if (value === checkName) break;
      await sleep(1000);
    }
    note(`after the update, Vehicle name = ${JSON.stringify(value)} (unsaved edit was ${JSON.stringify(checkName)})`);
    assert.equal(value, checkName, 'the unsaved edit must be restored after the update');
    await call('DELETE', `/session/${id}`).catch(() => {});
    return;
  }

  let id = await open();
  note(`session 1 open; app version ${await call('POST', `/session/${id}/execute/sync`, { script: 'return window.__TAURI__?.app ? window.__TAURI__.app.getVersion() : null', args: [] }).catch(() => 'unknown')}`);
  let text = await waitOffer(id);
  note(`offer: ${text.replace(/\s+/g, ' ')}`);
  assert.ok(text.includes(`Astraea ${expected} is available`), `offer must name ${expected}`);
  await button(id, 'Later');
  await sleep(1500);
  assert.equal(await bannerText(id), null, '"Later" must remove the banner');
  note('"Later": banner removed, nothing installed');
  await call('DELETE', `/session/${id}`);
  await sleep(2000);

  id = await open();
  text = await waitOffer(id);
  note(`offer again after relaunch: ${text.replace(/\s+/g, ' ')}`);
  if (process.env.RECOVERY_MARK) {
    assert.ok(await setName(id, process.env.RECOVERY_MARK), 'Vehicle name field not found');
    await sleep(2500); // the working session saves 500 ms after a change
    note(`unsaved edit before installing: Vehicle name = ${JSON.stringify(await call('POST', `/session/${id}/execute/sync`, { script: NAME_JS, args: [] }))}`);
  }
  await button(id, 'Install and restart');
  note('"Install and restart" clicked');
  // Leave the session open: closing it would kill the app mid-download. Watch
  // the banner until the app replaces itself and exits (the session then
  // stops answering) or reports a failure.
  const until = Date.now() + 240_000;
  let last = '';
  while (Date.now() < until) {
    let t;
    try {
      t = await call('POST', `/session/${id}/execute/sync`, { script: 'const b=document.querySelector("[data-update-banner]");return b?b.innerText:""', args: [] });
    } catch (e) {
      note(`app stopped answering (restarting into the new version): ${String(e.message).slice(0, 120)}`);
      return;
    }
    const flat = (t ?? '').replace(/\s+/g, ' ').trim();
    if (flat !== last) { note(`banner: ${flat || '(none)'}`); last = flat; }
    if (/failed/i.test(flat)) throw new Error(flat);
    await sleep(500);
  }
  note('app still answering after 240 s');
}

try {
  if (mode === 'webdriver') await webdriver(rest[0]);
  else if (mode === 'check-name') await webdriver(rest[0], rest[1]);
  else throw new Error(`unknown mode ${mode}`);
  note('driver finished');
} finally {
  writeFileSync(process.env.DRIVE_LOG ?? 'drive.log', log.join('\n') + '\n');
}
