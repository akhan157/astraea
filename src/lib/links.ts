/** Public places the app points people to. */
export const REPO_URL = 'https://github.com/akhan157/astraea';
export const ACCURACY_URL = `${REPO_URL}/blob/main/docs/accuracy.md`;
export const DATA_REQUEST_URL = `${REPO_URL}/blob/main/docs/team-data-request.md`;
/** The "Simulation vs. real flight" issue form. */
export const FLIGHT_ISSUE_URL = `${REPO_URL}/issues/new?template=model_question.yml`;
/** The "Bug report" issue form. */
export const BUG_ISSUE_URL = `${REPO_URL}/issues/new?template=bug_report.yml`;

type Where = 'Website (browser)' | 'Desktop app — Windows' | 'Desktop app — macOS' | 'Desktop app — Linux';

/** Which bug-form "Where" option this runtime is (the form's exact option text). */
export function reportWhere(desktop: boolean, userAgent: string): Where {
  if (!desktop) return 'Website (browser)';
  if (/Windows/i.test(userAgent)) return 'Desktop app — Windows';
  if (/Mac OS X|Macintosh/i.test(userAgent)) return 'Desktop app — macOS';
  return 'Desktop app — Linux';
}

/**
 * A pre-filled bug report: only the app version, where it runs and the
 * browser/OS string are filled in. No project, coordinates or file content is
 * sent; the person writes the rest on GitHub and attaches files only if they
 * choose to.
 */
export function reportProblemUrl(version: string, desktop: boolean, userAgent: string): string {
  const params = new URLSearchParams({
    template: 'bug_report.yml',
    where: reportWhere(desktop, userAgent),
    version: `${version} · ${userAgent}`.slice(0, 300),
  });
  return `${REPO_URL}/issues/new?${params.toString()}`;
}
