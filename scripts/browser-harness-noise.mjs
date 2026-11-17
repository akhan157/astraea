// Console errors raised by the test harness itself, not by the app. Only
// Playwright's Firefox instrumentation (Juggler, chrome://juggler/...) is
// listed: it can report NS_BINDING_ABORTED from its own worker when a request
// is torn down at the end of a journey (public CI run 44172726167, attempt 1;
// the re-run passed). Ignored messages are still printed so they stay visible.
export function isHarnessNoise(text) {
  if (/chrome:\/\/juggler\//.test(text)) {
    console.log(`(ignored harness noise: ${text})`);
    return true;
  }
  return false;
}
