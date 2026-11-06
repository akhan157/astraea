/**
 * Export bundles: one file plus its trace, offered through the app's file
 * seams. The project's own save/open seams live in `src/io/files.ts`; this
 * module only adds the "pack a trace next to an artefact" step and reuses
 * `saveProjectTo` so the Tauri shell (when present) writes through its dialog
 * and a browser falls back to a download.
 *
 * The archive is a real ZIP (jszip, deflate), so an export with a trace is one
 * portable file rather than a stored-mode byte blob. A ZIP is only ever
 * offered and saved as `.zip`: the file keeps its own name and extension
 * inside the archive, so no tool is handed a ZIP labelled as `.eng` or `.rkt`.
 */
import JSZip from 'jszip';
import { saveProjectTo, type SaveVia } from './files';

const encoder = new TextEncoder();

/** Bytes for a text or binary payload. */
export function payloadBytes(data: string | Uint8Array | ArrayBuffer): Uint8Array {
  if (typeof data === 'string') return encoder.encode(data);
  return data instanceof ArrayBuffer ? new Uint8Array(data) : data;
}

export interface BundleFile {
  name: string;
  data: string | Uint8Array | ArrayBuffer;
}

/**
 * A ZIP archive of the given files (deflate), as bytes. jszip takes strings
 * and byte arrays directly; every other type is a caller error.
 */
export async function zipFiles(files: readonly BundleFile[]): Promise<Uint8Array> {
  if (files.length === 0) throw new Error('zipFiles: at least one file is required');
  const zip = new JSZip();
  for (const file of files) zip.file(file.name, file.data);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

export interface ExportResult {
  /** How the file left the app. */
  via: SaveVia;
  /** What was saved: the file name actually written, plus the members of an archive. */
  offered: string;
  /** The file name actually written; null when the save was cancelled. */
  savedAs: string | null;
}

/**
 * Offer an export, packing it with its trace into one ZIP when a trace is
 * given. Resolves with how it was offered; throws with the transport's own
 * message on a real failure (a cancelled save resolves as `cancelled`).
 */
export async function saveExport(
  name: string,
  data: string | Uint8Array | ArrayBuffer,
  trace: string | null,
): Promise<ExportResult> {
  if (trace === null) {
    const saved = await saveProjectTo(name, typeof data === 'string' ? data : payloadBytes(data), mimeOf(name));
    return { via: saved.via, offered: saved.name ?? name, savedAs: saved.name };
  }
  const archive = `${name.replace(/\.[^.]+$/, '')}.zip`;
  const bytes = await zipFiles([
    { name, data },
    { name: `${name}.trace.json`, data: trace },
  ]);
  const saved = await saveProjectTo(archive, bytes, 'application/zip', { enforceExt: 'zip' });
  return {
    via: saved.via,
    offered: `${saved.name ?? archive} (${name} + ${name}.trace.json)`,
    savedAs: saved.name,
  };
}

const MIME_BY_EXT: Record<string, string> = {
  json: 'application/json',
  rkt: 'application/xml',
  step: 'model/step',
  stl: 'model/stl',
  svg: 'image/svg+xml',
  eng: 'text/plain',
};

function mimeOf(name: string): string {
  const ext = name.split('.').pop() ?? '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}
