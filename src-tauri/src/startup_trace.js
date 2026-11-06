// Injected only when native startup tracing is enabled. No App/main dependency.
(() => {
  if (window.top !== window) return;
  const queue = [];
  const counts = new Map();
  let sent = 0;
  let busy = false;
  let stopped = false;
  const note = (event) => {
    if (stopped || (counts.get(event) || 0) >= 4 || queue.length >= 32 || sent + queue.length >= 64) return;
    counts.set(event, (counts.get(event) || 0) + 1);
    queue.push(event);
  };
  // Raw messages, promise reasons, blocked URLs and document text never leave here.
  addEventListener('error', (event) => {
    const tag = event.target?.tagName;
    note(tag === 'SCRIPT' ? 'script_resource_error' : tag === 'LINK' ? 'style_resource_error' :
      tag ? 'other_resource_error' : 'js_error');
  }, true);
  addEventListener('unhandledrejection', () => note('rejected_promise'));
  addEventListener('securitypolicyviolation', (event) => {
    const directive = event.effectiveDirective || event.violatedDirective || '';
    note(directive.startsWith('script-src') ? 'csp_script' : directive === 'worker-src' ? 'csp_worker' :
      directive === 'connect-src' ? 'csp_connect' : directive.startsWith('style-src') ? 'csp_style' : 'csp_other');
  });
  addEventListener('DOMContentLoaded', () => note('dom_content_loaded'), { once: true });
  addEventListener('load', () => note('window_load'), { once: true });
  note('document_init');
  const watchdogs = [5, 15, 60].map((seconds) => setTimeout(() => {
    const populated = (document.getElementById('root')?.childElementCount || 0) > 0;
    note(`root_${populated ? 'present' : 'empty'}_${seconds}s`);
  }, seconds * 1000));
  const timer = setInterval(() => {
    if (stopped || busy || queue.length === 0 || sent >= 64) return;
    const invoke = window.__TAURI__?.core?.invoke;
    if (typeof invoke !== 'function') return; // Bridge initialization order varies by WebView.
    busy = true;
    const event = queue.shift();
    sent += 1;
    // One bounded attempt per observation, at most ~7/s. Native side also caps writes.
    Promise.resolve().then(() => invoke('startup_trace_event', { event })).catch(() => {}).finally(() => { busy = false; });
  }, 150);
  setTimeout(() => {
    stopped = true;
    clearInterval(timer);
    watchdogs.forEach(clearTimeout);
    queue.length = 0;
  }, 240000);
})();
