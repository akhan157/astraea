/**
 * Product landing page (/). Plain HTML and CSS so visitors load a small page,
 * not the workstation; the app itself lives at /app/.
 */
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/jetbrains-mono/400.css';
import './landing.css';

type Os = 'windows' | 'mac' | 'linux';

const OS_NAMES: Record<Os, string> = { windows: 'Windows', mac: 'macOS', linux: 'Linux' };

/** Best-effort desktop OS of the visitor; null on phones, tablets and unknowns. */
export function detectOs(ua: string, platform: string): Os | null {
  const s = `${platform} ${ua}`.toLowerCase();
  if (/android|iphone|ipad|ipod/.test(s)) return null;
  if (s.includes('win')) return 'windows';
  if (s.includes('mac')) return 'mac';
  if (s.includes('linux') || s.includes('x11')) return 'linux';
  return null;
}

function init(): void {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const os = detectOs(navigator.userAgent, nav.userAgentData?.platform ?? navigator.platform ?? '');
  if (!os) return;
  for (const el of document.querySelectorAll<HTMLElement>('[data-download-label]')) {
    el.textContent = `Desktop preview for ${OS_NAMES[os]}`;
  }
  document.querySelector<HTMLElement>(`.dl[data-os="${os}"]`)?.classList.add('dl-yours');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}
