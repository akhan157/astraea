/**
 * Export bundles: a user must never receive a file whose extension lies about
 * its format. With a trace the export is a ZIP and is saved as `.zip`, however
 * the user names it in the dialog; without one it is the plain file.
 */
// @vitest-environment jsdom
import JSZip from 'jszip';
import { afterEach, describe, expect, it } from 'vitest';
import { saveExport } from './bundle';

const ENG = 'Estes C6 18 70 Estes 8.8 6.06 14.2 0.0125 0.0248\n0.00 0.0\n1.86 0.0\n';
const TRACE = JSON.stringify({ astraeaTrace: 1 });

function installTauri(typedPath: string | null) {
  const written = new Map<string, string | Uint8Array>();
  (window as unknown as { __TAURI__?: unknown }).__TAURI__ = {
    dialog: { save: async () => typedPath },
    fs: {
      writeTextFile: async (path: string, text: string) => void written.set(path, text),
      writeFile: async (path: string, data: Uint8Array) => void written.set(path, data),
    },
  };
  return written;
}

afterEach(() => {
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
});

describe('saveExport', () => {
  it('saves a traced export as a .zip even when the user types the payload name', async () => {
    const written = installTauri('C:\\out\\motor.eng');
    const result = await saveExport('motor.eng', ENG, TRACE);

    expect([...written.keys()]).toEqual(['C:\\out\\motor.eng.zip']);
    expect(result.savedAs).toBe('motor.eng.zip');
    expect(result.offered).toContain('motor.eng.zip');
    const zip = await JSZip.loadAsync(written.get('C:\\out\\motor.eng.zip') as Uint8Array);
    expect(await zip.file('motor.eng')?.async('string')).toBe(ENG);
    expect(await zip.file('motor.eng.trace.json')?.async('string')).toBe(TRACE);
  });

  it('keeps a .zip name the user chose and reports the name actually written', async () => {
    const written = installTauri('/home/me/my-motor.zip');
    const result = await saveExport('motor.eng', ENG, TRACE);
    expect([...written.keys()]).toEqual(['/home/me/my-motor.zip']);
    expect(result.savedAs).toBe('my-motor.zip');
  });

  it('writes the plain, readable file under its real extension when the trace is off', async () => {
    const written = installTauri('/home/me/motor.eng');
    const result = await saveExport('motor.eng', ENG, null);
    expect(written.get('/home/me/motor.eng')).toBe(ENG);
    expect(result.savedAs).toBe('motor.eng');
  });

  it('reports a cancelled dialog without writing', async () => {
    const written = installTauri(null);
    const result = await saveExport('motor.eng', ENG, TRACE);
    expect(result.via).toBe('cancelled');
    expect(result.savedAs).toBeNull();
    expect(written.size).toBe(0);
  });
});
