// Included only by the opt-in debug native fixture. Uses native plugin globals.
(() => {
  const run = async () => {
    const api = window.__TAURI__;
    const report = { fixture: 'UP1c', cases: [], globals: !!api?.updater?.check };
    try {
      if (!report.globals) throw new Error('native updater global unavailable');
      for (const name of ['defer', 'valid', 'bad-signature', 'tampered', 'version-mismatch']) {
        const result = { name, events: [], offered: false, resolved: false, closed: false };
        let update;
        try {
          update = await api.updater.check({ timeout: 3000, headers: { 'X-Astraea-Fixture-Case': name } });
          if (!update) throw new Error('expected offer missing');
          result.offered = true;
          result.currentVersion = update.currentVersion;
          result.version = update.version;
          if (name === 'defer') {
            result.deferred = true;
          } else {
            await update.download(event => result.events.push(event), { timeout: 3000 });
            // Native download resolves only after signature and signed-version checks.
            result.resolved = true;
          }
        } catch (error) {
          result.error = String(error);
        } finally {
          if (update) {
            try { await update.close(); result.closed = true; }
            catch (error) { result.closeError = String(error); }
          }
        }
        report.cases.push(result);
      }
      report.ok = report.cases.every(result => result.offered && result.closed &&
        (result.name === 'defer' ? result.deferred && !result.resolved && !result.error :
          result.name === 'valid' ? result.resolved && !result.error : !result.resolved && !!result.error));
    } catch (error) {
      report.ok = false;
      report.error = String(error);
    }
    await api.core.invoke('updater_fixture_report', { report });
  };
  // Native initialization scripts precede application page scripts.
  addEventListener('DOMContentLoaded', () => { void run(); }, { once: true });
})();
