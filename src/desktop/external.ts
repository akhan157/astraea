/**
 * External links. In the desktop window a target="_blank" link has no browser
 * tab to open, so it goes to the system browser through the opener plugin
 * (its capability allows only the project's own GitHub pages). In a browser
 * this is a plain new tab.
 */
interface OpenerGlobals { opener?: { openUrl(url: string): Promise<void> } }

function opener(): OpenerGlobals['opener'] | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { __TAURI__?: OpenerGlobals }).__TAURI__?.opener ?? null;
}

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && (window as unknown as { __TAURI__?: unknown }).__TAURI__ !== undefined;
}

export async function openExternal(url: string): Promise<void> {
  const native = opener();
  if (native) {
    await native.openUrl(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Desktop only: route every http(s) target="_blank" link click to the system browser. */
export function installExternalLinkHandler(doc: Document = document): () => void {
  if (!opener()) return () => undefined;
  const onClick = (event: MouseEvent) => {
    const anchor = (event.target as Element | null)?.closest?.('a[target="_blank"]') as HTMLAnchorElement | null;
    if (!anchor || !/^https?:/i.test(anchor.href) || anchor.origin === window.location.origin) return;
    event.preventDefault();
    void openExternal(anchor.href);
  };
  doc.addEventListener('click', onClick, true);
  return () => doc.removeEventListener('click', onClick, true);
}
