/**
 * File I/O: browser downloads, file picking, and format adapters.
 *
 * Thin glue over the format engines in src/formats/*: this module owns the
 * DOM seams (anchor downloads, file inputs, Tauri save dialog) and maps
 * files to engine calls. It never parses formats itself and never touches
 * the network. Every failure throws an Error with context; failures never
 * pop up modal dialogs.
 */

import type { RocketVehicle } from '../core/types';
import type { MotorSpec } from '../propulsion/motorDatabase';
import {
  createProjectEnvelope,
  readProject,
  writeProject,
  type MotorRecord,
  type ProjectEnvelope,
} from '../formats/projectJson';
import { exportToOrk, parseOrkFile } from '../formats/orkParser';
import { parseRktString } from '../formats/rktParser';
import { exportRkt } from '../formats/rktExport';
import {
  describeEngPreview,
  describeRktPreview,
  describeRsePreview,
  slugify,
} from '../formats/exportPreview';
import { exportToEng, exportToRse, parseRaspEng, parseRseXml } from '../formats/engParser';
import { exportBlueprintSvg as renderBlueprintSvg } from '../formats/blueprint';

/**
 * Native Astraea project archive budget (Save/Open project file and project
 * export). It is an explicit software resource policy, not a physical or
 * measurement tolerance: one full-telemetry run is ~4.8 MB of pretty-printed
 * project JSON, so 64 MiB covers roughly thirteen such retained runs. Above it
 * the app refuses before reading or writing, so it never creates a project file
 * it cannot reopen.
 */
export const MAX_PROJECT_ARCHIVE_BYTES = 64 * 1024 * 1024;

/** Foreign vehicle/motor imports keep the smaller pre-parse protection. */
export const MAX_FOREIGN_IMPORT_BYTES = 8 * 1024 * 1024;

const MIB = 1024 * 1024;

export type ProjectArchiveBudget =
  | { ok: true; bytes: number }
  | { ok: false; bytes: number; message: string };

/** Measure serialized project text as UTF-8 bytes, matching `File.size` on open. */
export function projectArchiveBudget(text: string, filename = 'project'): ProjectArchiveBudget {
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes <= MAX_PROJECT_ARCHIVE_BYTES) return { ok: true, bytes };
  const mb = (bytes / MIB).toFixed(1);
  return {
    ok: false,
    bytes,
    message:
      `Project "${filename}" would be ${mb} MB; Astraea project files are limited to ` +
      `${MAX_PROJECT_ARCHIVE_BYTES / MIB} MB, so no file was written. ` +
      'Project files keep every saved run’s telemetry.',
  };
}

/** Pre-read refusal text for a native project file; it is never parsed. */
function oversizedProjectMessage(name: string, bytes: number): string {
  return `File "${name}" is ${(bytes / MIB).toFixed(1)} MB; Astraea project files are limited to ` +
    `${MAX_PROJECT_ARCHIVE_BYTES / MIB} MB and were not read. ` +
    'Project files keep every saved run’s telemetry.';
}

export type ImportKind = 'ork' | 'rkt' | 'json' | 'eng' | 'rse' | 'unknown';

export interface ImportDescription {
  name: string;
  kind: ImportKind;
  sizeBytes: number;
  ok: boolean;
  message: string;
}

/**
 * Canonical project file name suffix: plain JSON that says what it is. Save
 * suggests it; Open also takes the bare `.astraea` a user may type and any
 * `.json`, so everything Save can produce reopens.
 */
export const PROJECT_FILE_EXT = '.astraea.json';

/** The project file name Save suggests for a vehicle. */
export function projectFileName(vehicleName: string): string {
  return `${slugify(vehicleName)}${PROJECT_FILE_EXT}`;
}

/** Extensions (no dot) that are read as an Astraea project document. */
const PROJECT_EXTENSIONS = ['json', 'astraea'];

/** Picker `accept` list for Open: every extension `describeImport` takes. */
export const OPEN_FILE_ACCEPT = '.astraea,.json,.ork,.rkt,.eng,.rse,application/json';

const KIND_LABEL: Record<ImportKind, string> = {
  ork: 'OpenRocket vehicle (.ork)',
  rkt: 'RockSim vehicle (.rkt)',
  json: 'Astraea project (.astraea.json, .astraea or .json)',
  eng: 'RASP motor (.eng)',
  rse: 'RockSim motor (.rse)',
  unknown: 'unknown file type',
};

/**
 * Names the import kind for a file and refuses oversized or unsupported
 * files up front. Pure and DOM-free so drops can be vetted before reading.
 */
export function describeImport(file: { name: string; size: number }): ImportDescription {
  const base = file.name.split(/[\\/]/).pop() ?? file.name;
  const dot = base.lastIndexOf('.');
  const ext = dot < 0 ? '' : base.slice(dot + 1).toLowerCase();
  const kind: ImportKind = PROJECT_EXTENSIONS.includes(ext)
    ? 'json'
    : ext === 'ork' || ext === 'rkt' || ext === 'eng' || ext === 'rse'
      ? ext
      : 'unknown';
  const budget = kind === 'json' ? MAX_PROJECT_ARCHIVE_BYTES : MAX_FOREIGN_IMPORT_BYTES;
  if (file.size > budget) {
    const mb = (file.size / MIB).toFixed(1);
    return {
      name: file.name,
      kind,
      sizeBytes: file.size,
      ok: false,
      message: kind === 'json'
        ? oversizedProjectMessage(file.name, file.size)
        : `File "${file.name}" is ${mb} MB; imports over ${MAX_FOREIGN_IMPORT_BYTES / MIB} MB are refused. ` +
          'Split the file or trim its content, then retry.',
    };
  }
  if (kind === 'unknown') {
    return {
      name: file.name,
      kind,
      sizeBytes: file.size,
      ok: false,
      message:
        `File "${file.name}" has an unsupported type. ` +
        'Open accepts .astraea.json, .astraea or .json projects, .ork and .rkt vehicles, and .eng and .rse motors.',
    };
  }
  return {
    name: file.name,
    kind,
    sizeBytes: file.size,
    ok: true,
    message: `Ready to import "${file.name}" as ${KIND_LABEL[kind]}.`,
  };
}
/**
 * Downloads text through an anchor element. The object URL is revoked on a
 * deferred timer so the navigation has settled before the blob is released.
 */
export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') {
    throw new Error(`downloadText: browser download is unavailable for "${filename}"`);
  }
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  triggerDownload(url, filename);
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Downloads binary bytes through an anchor element with deferred revoke. */
export function downloadBytes(
  filename: string,
  data: Uint8Array | ArrayBuffer,
  mime = 'application/octet-stream',
): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') {
    throw new Error(`downloadBytes: browser download is unavailable for "${filename}"`);
  }
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }));
  triggerDownload(url, filename);
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 4000);
}


function triggerDownload(url: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Opens a native file picker via an input element. Resolves null when the
 * user cancels. Requires a browser document.
 */
export function pickFile(accept = ''): Promise<File | null> {
  if (typeof document === 'undefined') {
    throw new Error('pickFile: file picker requires a browser document');
  }
  // Executor form: the Promise constructor is the required API here; the
  // resolver must be captured to settle from DOM event callbacks.
  return new Promise<File | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.style.display = 'none';
    let settled = false;
    const done = (value: File | null): void => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };
    input.addEventListener('change', () => {
      done(input.files && input.files.length > 0 ? input.files[0] : null);
    });
    input.addEventListener('cancel', () => done(null));
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Reads a dropped project file through the versioned envelope reader, which
 * also migrates legacy bare vehicles. Fails closed with file context.
 */
export async function readDroppedProject(file: File): Promise<ProjectEnvelope> {
  if (file.size > MAX_PROJECT_ARCHIVE_BYTES) throw new Error(oversizedProjectMessage(file.name, file.size));
  let text: string;
  try {
    text = await file.text();
  } catch (err) {
    throw new Error(`Cannot read dropped file "${file.name}": ${(err as Error).message}`);
  }
  try {
    return readProject(text);
  } catch (err) {
    throw new Error(`Dropped file "${file.name}" is not a readable project: ${(err as Error).message}`);
  }
}

export interface VehicleImport {
  vehicle: RocketVehicle;
  motors: MotorRecord[];
  warnings: string[];
  /**
   * The parsed envelope for the `.json` path, so a caller can replace the
   * whole project (workspace and ledger included) instead of the vehicle
   * alone. Absent for the geometry-only formats.
   */
  envelope?: ProjectEnvelope;
}

/**
 * Imports a vehicle file by extension: .ork via parseOrkFile, .rkt via
 * parseRktString, .json via readProject (legacy bare vehicles included).
 * Geometry-only formats return no motor records plus notes on what the
 * format cannot carry; the envelope path returns its stored records.
 */
export async function importVehicleFile(file: File): Promise<VehicleImport> {
  const gate = describeImport({ name: file.name, size: file.size });
  if (!gate.ok) throw new Error(gate.message);
  try {
    if (gate.kind === 'ork') {
      const buffer = await file.arrayBuffer();
      const vehicle = await parseOrkFile(new Uint8Array(buffer));
      return {
        vehicle,
        motors: [],
        warnings: [
          'Geometry only: stage containers flatten into one airframe; motor assignments, simulation results, and appearance ' +
            'settings in the .ork file are not imported.',
        ],
      };
    }
    if (gate.kind === 'rkt') {
      const vehicle = parseRktString(await file.text());
      return {
        vehicle,
        motors: [],
        warnings: [
          'Single-stage geometry only: staging blocks flatten into one airframe ' +
            'and motor assignments are not imported. Materials and attached-part axial offsets use defaults; ' +
            'review mass and CG before engineering reuse. Active or ambiguous KnownMass/KnownCG overrides are refused; ' +
            'only explicitly disabled (false/0) override metadata is accepted.',
        ],
      };
    }
    if (gate.kind === 'json') {
      const envelope = readProject(await file.text());
      const warnings: string[] = [];
      if (envelope.cases.length > 0) {
        warnings.push(
          `History note: ${envelope.cases.length} stored sim cases travel as history ` +
            'and are not re-run on import.',
        );
      }
      if (envelope.snapshots.length > 0) {
        warnings.push(
          `History note: ${envelope.snapshots.length} stored snapshots travel as history ` +
            'and are not re-run on import.',
        );
      }
      return {
        vehicle: envelope.vehicle,
        motors: envelope.motorRecords,
        warnings,
        envelope,
      };
    }
    throw new Error(
      `File "${file.name}" is a motor file; import it through the motor import path.`,
    );
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('File "')) throw err;
    throw new Error(`Cannot import vehicle file "${file.name}": ${(err as Error).message}`);
  }
}

/**
 * Imports a motor file by extension: .eng via parseRaspEng, .rse via
 * parseRseXml. The tabulated curve stays the authority in both dialects.
 */
export async function importMotorFile(file: File): Promise<MotorSpec> {
  const gate = describeImport({ name: file.name, size: file.size });
  if (!gate.ok) throw new Error(gate.message);
  try {
    if (gate.kind === 'eng') return parseRaspEng(await file.text());
    if (gate.kind === 'rse') return parseRseXml(await file.text());
    throw new Error(
      `File "${file.name}" is a vehicle file; import it through the vehicle import path.`,
    );
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('File "')) throw err;
    throw new Error(`Cannot import motor file "${file.name}": ${(err as Error).message}`);
  }
}

export type VehicleExportFormat = 'ork' | 'rkt' | 'json';

export interface VehicleExportResult {
  filename: string;
  mime: string;
  text?: string;
  bytes?: Uint8Array;
  omissions: string[];
}

/**
 * Exports a vehicle: .ork bytes via exportToOrk, .rkt text via exportRkt,
 * .json envelope text via writeProject (built from the vehicle when no
 * envelope is supplied). Omission notes come from the exportPreview
 * describe functions where one exists. Refused exports throw.
 */
export async function exportVehicleFile(
  vehicle: RocketVehicle,
  format: VehicleExportFormat,
  opts: { envelope?: ProjectEnvelope } = {},
): Promise<VehicleExportResult> {
  if (!vehicle) throw new Error('exportVehicleFile: vehicle is required');
  const slug = slugify(vehicle.name || 'vehicle') || 'vehicle';
  switch (format) {
    case 'ork': {
      const bytes = await exportToOrk(vehicle);
      return {
        filename: `${slug}.ork`,
        mime: 'application/zip',
        bytes,
        omissions: [
          'Only the first fin set is written, nested under the last body tube; ' +
            'extra fin sets are dropped.',
          'Motor configurations, simulation results, and appearance settings are not serialized.',
        ],
      };
    }
    case 'rkt': {
      const preview = describeRktPreview(vehicle);
      if (!preview.canExport) {
        throw new Error(`RockSim export refused: ${preview.refused.join(' ')}`);
      }
      return {
        filename: preview.filename,
        mime: 'application/xml',
        text: exportRkt(vehicle),
        omissions: preview.omissions,
      };
    }
    case 'json': {
      const envelope = opts.envelope ?? createProjectEnvelope({ vehicle });
      const filename = `${slug}${PROJECT_FILE_EXT}`;
      const text = writeProject(envelope);
      const budget = projectArchiveBudget(text, filename);
      if (!budget.ok) throw new Error(budget.message);
      return {
        filename,
        mime: 'application/json',
        text,
        omissions: [],
      };
    }
    default:
      throw new Error(
        `exportVehicleFile: unsupported format "${String(format)}" (expected ork, rkt, or json)`,
      );
  }
}

export type MotorExportFormat = 'eng' | 'rse';

export interface MotorExportResult {
  filename: string;
  text: string;
  omissions: string[];
}

/**
 * Exports a motor record: .eng via exportToEng, .rse via exportToRse, with
 * the matching describe-preview omission notes. Invalid records throw.
 */
export function exportMotorFile(motor: MotorSpec, format: MotorExportFormat): MotorExportResult {
  if (!motor) throw new Error('exportMotorFile: motor is required');
  const preview = format === 'eng' ? describeEngPreview(motor) : describeRsePreview(motor);
  if (!preview.canExport) {
    throw new Error(`${preview.title} export refused: ${preview.refused.join(' ')}`);
  }
  const text = format === 'eng' ? exportToEng(motor) : exportToRse(motor);
  return { filename: preview.filename, text, omissions: preview.omissions };
}

/** Exports a print-ready blueprint SVG of the vehicle (light theme). */
export function exportBlueprintSvg(vehicle: RocketVehicle): string {
  if (!vehicle) throw new Error('exportBlueprintSvg: vehicle is required');
  return renderBlueprintSvg(vehicle, { theme: 'light' });
}

/** What a save dialog should offer for a file: a label and the extensions it covers. */
interface SaveType {
  description: string;
  mime: string;
  /** Extensions without the dot; the first is the dialog's default. */
  extensions: string[];
}

const SAVE_TYPES: Record<string, Omit<SaveType, 'extensions'>> = {
  zip: { description: 'ZIP archive', mime: 'application/zip' },
  json: { description: 'JSON file', mime: 'application/json' },
  eng: { description: 'RASP motor', mime: 'text/plain' },
  rse: { description: 'RockSim motor', mime: 'application/xml' },
  rkt: { description: 'RockSim vehicle', mime: 'application/xml' },
  ork: { description: 'OpenRocket vehicle', mime: 'application/zip' },
  step: { description: 'STEP model', mime: 'model/step' },
  stl: { description: 'STL mesh', mime: 'model/stl' },
  svg: { description: 'SVG drawing', mime: 'image/svg+xml' },
  png: { description: 'PNG image', mime: 'image/png' },
  kml: { description: 'KML flight track', mime: 'application/vnd.google-earth.kml+xml' },
};

function extensionOf(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dot = base.lastIndexOf('.');
  return dot < 0 ? '' : base.slice(dot + 1).toLowerCase();
}

/**
 * The dialog file type for a suggested name, so native and browser dialogs
 * agree with each other and with what Open accepts. Null for an unknown
 * extension (the dialog then shows all files).
 */
export function saveTypeOf(filename: string): SaveType | null {
  if (filename.toLowerCase().endsWith(PROJECT_FILE_EXT)) {
    return { description: 'Astraea project', mime: 'application/json', extensions: PROJECT_EXTENSIONS };
  }
  const ext = extensionOf(filename);
  const known = SAVE_TYPES[ext];
  return known ? { ...known, extensions: [ext] } : null;
}

interface TauriSaveHooks {
  pickSavePath: (filename: string) => Promise<string | null>;
  writeFile: (path: string, content: string | Uint8Array) => Promise<void>;
}

/**
 * Tauri shell hooks when window.__TAURI__ exposes a dialog save entry plus a
 * file write entry (either the legacy or the plugins namespace shape).
 * Returns null in a plain browser so callers fall back to downloads.
 */
function tauriSaveHooks(): TauriSaveHooks | null {
  try {
    const scope = window as unknown as { __TAURI__?: Record<string, any> };
    const tauri = scope.__TAURI__;
    if (!tauri || typeof tauri !== 'object') return null;
    const dialog = tauri.dialog ?? tauri.plugins?.dialog;
    const fs = tauri.fs ?? tauri.plugins?.fs;
    if (typeof dialog?.save !== 'function') return null;
    const writeTextFile: unknown = fs?.writeTextFile;
    const writeFile: unknown = fs?.writeFile;
    if (typeof writeTextFile !== 'function' && typeof writeFile !== 'function') return null;
    const save: (opts?: unknown) => Promise<unknown> = dialog.save.bind(dialog);
    return {
      pickSavePath: async (filename: string): Promise<string | null> => {
        const type = saveTypeOf(filename);
        const picked = await save({
          defaultPath: filename,
          ...(type ? { filters: [{ name: type.description, extensions: type.extensions }] } : {}),
        });
        if (picked === null || picked === undefined) return null;
        if (typeof picked !== 'string') {
          throw new Error('Tauri save dialog returned an unexpected path');
        }
        return picked;
      },
      writeFile: async (path: string, content: string | Uint8Array): Promise<void> => {
        if (typeof content === 'string' && typeof writeTextFile === 'function') {
          await (writeTextFile as (path: string, text: string) => Promise<void>)(path, content);
          return;
        }
        if (typeof writeFile === 'function') {
          const bytes =
            typeof content === 'string' ? new TextEncoder().encode(content) : content;
          await (writeFile as (path: string, data: Uint8Array) => Promise<void>)(path, bytes);
          return;
        }
        throw new Error('Tauri file write is unavailable for this content type');
      },
    };
  } catch {
    return null;
  }
}

export type SaveVia = 'tauri' | 'picker' | 'browser' | 'cancelled';

/** How a save ended and the file name that was actually written (null when cancelled). */
export interface SaveResult {
  via: SaveVia;
  name: string | null;
}

interface SaveFilePickerWindow {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<{
    name?: string;
    createWritable(): Promise<{ write(data: string | Uint8Array): Promise<void>; close(): Promise<void> }>;
  }>;
}

/**
 * The browser's own Save dialog (File System Access API: Chrome, Edge).
 * Returns null where the API is missing or refuses to open (no user
 * gesture, embedded frame), so the caller falls back to a download.
 */
async function saveWithFilePicker(filename: string, content: string | Uint8Array): Promise<SaveResult | null> {
  const picker = (window as unknown as SaveFilePickerWindow).showSaveFilePicker;
  if (typeof picker !== 'function') return null;
  const type = saveTypeOf(filename);
  let handle;
  try {
    handle = await picker.call(window, {
      suggestedName: filename,
      ...(type
        ? { types: [{ description: type.description, accept: { [type.mime]: type.extensions.map((e) => `.${e}`) } }] }
        : {}),
    });
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') return { via: 'cancelled', name: null };
    return null;
  }
  const name = typeof handle.name === 'string' && handle.name.length > 0 ? handle.name : filename;
  try {
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  } catch (err) {
    throw new Error(`Save failed for "${name}": ${(err as Error).message}`);
  }
  return { via: 'picker', name };
}

export interface SaveOptions {
  /**
   * Extension (no dot) the written file must carry. A native path that lacks
   * it gets it appended, so a ZIP is never saved under another format's name.
   */
  enforceExt?: string;
}

/**
 * Saves content to a file the user picks: the native dialog in the desktop
 * app, the browser's Save dialog where it exists, otherwise a download.
 * Resolves with how it left and the name actually written, which may differ
 * from the suggestion. Never throws on cancel; write failures throw with file
 * context.
 */
export async function saveProjectTo(
  filename: string,
  content: string | Uint8Array,
  mime = 'text/plain',
  options: SaveOptions = {},
): Promise<SaveResult> {
  const hooks = typeof window === 'undefined' ? null : tauriSaveHooks();
  if (hooks) {
    try {
      let path = await hooks.pickSavePath(filename);
      if (path === null) return { via: 'cancelled', name: null };
      const want = options.enforceExt;
      if (want !== undefined && extensionOf(path) !== want.toLowerCase()) path = `${path}.${want}`;
      await hooks.writeFile(path, content);
      return { via: 'tauri', name: path.split(/[\\/]/).pop() ?? path };
    } catch (err) {
      throw new Error(`Tauri save failed for "${filename}": ${(err as Error).message}`);
    }
  }
  if (typeof window !== 'undefined') {
    const picked = await saveWithFilePicker(filename, content);
    if (picked !== null) return picked;
  }
  if (typeof content === 'string') downloadText(filename, content, mime);
  else downloadBytes(filename, content, mime);
  return { via: 'browser', name: filename };
}

/** Opens a project-grade file through the browser file picker. */
export function openProjectFromFile(): Promise<File | null> {
  return pickFile(OPEN_FILE_ACCEPT);
}
