import { describe, expect, it } from 'vitest';
import { reportProblemUrl, reportWhere } from './links';

const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/140.0';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
const LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15';

describe('report a problem', () => {
  it('picks the bug form option for the runtime', () => {
    expect(reportWhere(false, WIN)).toBe('Website (browser)');
    expect(reportWhere(true, WIN)).toBe('Desktop app — Windows');
    expect(reportWhere(true, MAC)).toBe('Desktop app — macOS');
    expect(reportWhere(true, LINUX)).toBe('Desktop app — Linux');
  });

  it('pre-fills only the form, version and platform', () => {
    const url = new URL(reportProblemUrl('0.11.0', true, LINUX));
    expect(url.origin + url.pathname).toBe('https://github.com/akhan157/astraea/issues/new');
    expect([...url.searchParams.keys()]).toEqual(['template', 'where', 'version']);
    expect(url.searchParams.get('template')).toBe('bug_report.yml');
    expect(url.searchParams.get('where')).toBe('Desktop app — Linux');
    expect(url.searchParams.get('version')).toBe(`0.11.0 · ${LINUX}`);
  });
});
