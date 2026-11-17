// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installExternalLinkHandler, openExternal } from './external';

type Scope = { __TAURI__?: unknown };
afterEach(() => { delete (window as unknown as Scope).__TAURI__; document.body.innerHTML = ''; vi.restoreAllMocks(); });

function link(href: string) {
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.textContent = 'x';
  document.body.append(a);
  return a;
}

describe('external links', () => {
  it('opens a new tab in a browser and installs no handler', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await openExternal('https://github.com/akhan157/astraea');
    expect(open).toHaveBeenCalledWith('https://github.com/akhan157/astraea', '_blank', 'noopener,noreferrer');
    const remove = installExternalLinkHandler();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link('https://github.com/akhan157/astraea/releases').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    remove();
  });

  it('sends desktop target=_blank links to the system browser, but not same-origin ones', () => {
    const openUrl = vi.fn(async () => undefined);
    (window as unknown as Scope).__TAURI__ = { opener: { openUrl } };
    const remove = installExternalLinkHandler();
    const external = new MouseEvent('click', { bubbles: true, cancelable: true });
    link('https://github.com/akhan157/astraea/releases').dispatchEvent(external);
    expect(external.defaultPrevented).toBe(true);
    expect(openUrl).toHaveBeenCalledWith('https://github.com/akhan157/astraea/releases');
    const local = new MouseEvent('click', { bubbles: true, cancelable: true });
    link(`${window.location.origin}/third-party-notices.txt`).dispatchEvent(local);
    expect(local.defaultPrevented).toBe(false);
    expect(openUrl).toHaveBeenCalledTimes(1);
    remove();
  });
});
