/**
 * Project lifecycle: import (the seam both the drop target and the TopBar
 * menu call), the durable browser slot, and native project files.
 *
 * Fail-closed posture, pinned here: a refused import leaves the project
 * untouched, a stale save is rejected with the newer commit intact, corrupt
 * stored bytes are reported and never overwritten, and an empty slot is a
 * message rather than an error.
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createProjectEnvelope, writeProject, PROJECT_SCHEMA_VERSION } from '../formats/projectJson';
import { largeProject } from '../io/largeProject.fixture';
import { PROJECT_STORAGE_KEY } from '../formats/projectStorage';
import { parseRaspEng } from '../formats/engParser';
import { DEFAULT_WORKSPACE } from '../application/workspace';
import { isCandidateFlightModel } from '../application/flightModel';
import { buildCandidateRequest, declarationVehicleSha256 } from '../application/candidate';
import { captureCandidateRunInputs } from '../application/runInputs';
import { withRunCases } from '../application/runCases';
import { CANDIDATE_VEHICLE, candidateDerivation, candidateProjectWithSha, candidateSelectionWithSha, candidateResult } from '../application/candidate.fixture';
import type { AnalysisRecord } from './analysis';
import { adoptProject, exportableProject, useProjectStore } from './project';
import { useAnalysisStore } from './analysis';
import {
  importProjectFile,
  openProjectFromFilePicker,
  openProjectFromSlot,
  resetProjectSlot,
  saveProjectToFile,
  saveProjectToSlot,
  useProjectIo,
} from './projectIo';

/** The certified Estes C6 curve, in the RASP .eng layout. */
const SAMPLE_ENG = [
  '; Estes C6 certified thrust curve (RASP .eng layout)',
  'Estes C6 18 70 Estes 8.8 6.06 14.2 0.0125 0.0248',
  '0.00 0.0',
  '0.18 14.2',
  '0.50 4.8',
  '1.86 0.0',
  '',
].join('\n');

/** A minimal valid RockSim (.rkt) document: one nose cone and one body tube. */
const SAMPLE_RKT = `<?xml version="1.0" encoding="utf-8"?>
<RockSimDocument>
  <FileVersion>4</FileVersion>
  <DesignInformation>
    <RocketDesign>
      <Name>Imported Test Rocket</Name>
      <Designer>Test Rig</Designer>
      <Stage3Parts>
        <NoseCone>
          <PartName>Ogive Nose Cone</PartName>
          <ShapeCode>1</ShapeCode>
          <Len>180.0</Len>
          <AftDia>29.0</AftDia>
          <WallThickness>1.5</WallThickness>
        </NoseCone>
        <BodyTube>
          <PartName>29mm Fuselage</PartName>
          <Len>600.0</Len>
          <OD>29.0</OD>
          <ID>27.0</ID>
        </BodyTube>
      </Stage3Parts>
    </RocketDesign>
  </DesignInformation>
</RockSimDocument>`;

const report = () => useProjectIo.getState().report;

beforeEach(() => {
  localStorage.clear();
  useProjectStore.getState().newProject();
  useProjectIo.setState({ report: null, status: null });
  resetProjectSlot();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('importProjectFile', () => {
  it.each(['envelope','bare'] as const)('refuses unsupported %s file and stored model selections without changing project or stored bytes', async (kind) => {
    const before=useProjectStore.getState().project;
    const invalid={...exportableProject(),flightModel:{schemaId:'astraea-flight-model-selection/1.0.0',modelId:'candidate-sb1-not-enabled'}};
    const text=JSON.stringify(kind==='bare'?{...invalid.vehicle,flightModel:invalid.flightModel}:invalid);
    await importProjectFile(new File([text],'unsupported-model.astraea.json'));
    expect(report()?.message).toMatch(/flightModel/);
    expect(useProjectStore.getState().project).toBe(before);
    localStorage.setItem(PROJECT_STORAGE_KEY,text);
    await openProjectFromSlot();
    expect(useProjectIo.getState().status?.kind).toBe('error');
    await saveProjectToSlot();
    expect(useProjectIo.getState().status?.kind).toBe('error');
    expect(localStorage.getItem(PROJECT_STORAGE_KEY)).toBe(text);
    expect(useProjectStore.getState().project).toBe(before);
  });
  it('refuses a malformed candidate archive without replacing the open project', async () => {
    const before = useProjectStore.getState().project;
    const sha = await declarationVehicleSha256(CANDIDATE_VEHICLE);
    const candidateProject = candidateProjectWithSha(sha);
    const model = candidateProject.flightModel;
    if (!model || !isCandidateFlightModel(model)) throw new Error('candidate fixture selection missing');
    const selection = candidateSelectionWithSha(model.declarationVehicleSha256);
    const motor = candidateProject.motorRecords[0];
    const request = buildCandidateRequest(candidateProject.vehicle, motor.motor, selection, candidateProject.workspace.launch, candidateDerivation());
    const inputs = captureCandidateRunInputs(candidateProject, motor, selection, 'cand-malformed', request, candidateDerivation());
    const result = candidateResult();
    const source = request.adapter.sourceIdentity;
    const geometryIdentity = `frontend-external-profile-SB1/1.0.0:${source}`;
    result.identities.callerSourceIdentity = source;
    result.identities.geometryIdentity = geometryIdentity;
    result.identities.mechanicalSourceId = request.mechanicalSourceId;
    result.identities.environmentSourceId = request.environmentSourceId;
    result.identities.axialProviderId = selection.axial.providerId;
    result.identities.axialInputIdentity = selection.axial.inputIdentity;
    result.model.geometry.identity = geometryIdentity;
    result.model.environment = { ...request.environment, environmentSourceId: request.environmentSourceId };
    const record: AnalysisRecord = {
      kind: 'flight', status: 'completed', inputKey: 'cand-malformed', startedAt: '2026-10-29T00:00:00.000Z',
      finishedAt: '2026-10-29T00:00:01.000Z', error: null, token: 1, runInputs: inputs,
      payload: { model: 'candidate', design: { motorId: 'estes_c6' }, result, request, engineIdentity: { kind: 'production-rust-wasm', sha256: 'e'.repeat(64) } },
    };
    const doc = JSON.parse(writeProject(withRunCases(candidateProject, [record]))) as Record<string, unknown>;
    const cases = doc.cases as Array<Record<string, unknown>>;
    const archive = cases[0].candidateResult as Record<string, unknown>;
    const identities = archive.identities as Record<string, unknown>;
    identities.environmentModelId = 'unsupported-weather-model';
    await importProjectFile(new File([JSON.stringify(doc)], 'malformed-candidate.astraea.json'));
    expect(report()?.title).toMatch(/Could not load/);
    expect(useProjectStore.getState().project).toBe(before);
  });

  it('replaces the vehicle as one undoable edit', async () => {
    const before = useProjectStore.getState().project.vehicle;
    const boundMotor = useProjectStore.getState().project.workspace.motorId;

    await importProjectFile(new File([SAMPLE_RKT], 'test.rkt', { type: 'application/xml' }));

    const project = useProjectStore.getState().project;
    expect(project.vehicle.name).toBe('Imported Test Rocket');
    expect(project.vehicle.components.map((c) => c.type)).toEqual(expect.arrayContaining(['nosecone', 'bodytube']));
    expect(project.workspace.motorId).toBe(boundMotor);
    // The importer reports what it did; the report's wording is product copy.
    expect(report()).not.toBeNull();

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project.vehicle).toBe(before);
  });

  it('refuses a malformed .rkt file and leaves the project untouched', async () => {
    const before = useProjectStore.getState().project;

    await importProjectFile(new File(['# not a RockSim document\n1, 2\n'], 'invalid.rkt'));

    expect(report()).not.toBeNull();
    expect(useProjectStore.getState().project).toBe(before);
  });

  it('registers an imported motor with the file provenance and leaves the bound motor alone', async () => {
    const boundMotor = useProjectStore.getState().project.workspace.motorId;

    await importProjectFile(new File([SAMPLE_ENG], 'estes-c6.eng', { type: 'text/plain' }));

    const record = useProjectStore.getState().motorRecords().find((r) => r.provenance.sourceFile === 'estes-c6.eng');
    expect(record?.provenance.source).toBe('import');
    expect(record?.id).not.toBe('estes_c6');
    expect(useProjectStore.getState().project.motorRecords).toContainEqual(record);
    expect(useProjectStore.getState().project.workspace.motorId).toBe(boundMotor);
    expect(report()?.message).toMatch(/registered in the catalog/);
  });

  it('adopts a project envelope: vehicle, workspace and motor records together', async () => {
    const vehicle = useProjectStore.getState().project.vehicle;
    const motor = { ...parseRaspEng(SAMPLE_ENG), id: 'imported_c6', designation: 'Imported C6' };
    const json = writeProject(
      createProjectEnvelope({
        vehicle: { ...vehicle, name: 'Adopted Project' },
        motorRecords: [{ id: 'imported_c6', motor, provenance: { source: 'import', sourceFile: 'imported.eng' } }],
        workspace: { ...DEFAULT_WORKSPACE, launch: { ...DEFAULT_WORKSPACE.launch, railLengthM: 4.5 } },
      }),
    );

    await importProjectFile(new File([json], 'adopted.json', { type: 'application/json' }));

    expect(useProjectStore.getState().project.vehicle.name).toBe('Adopted Project');
    expect(useProjectStore.getState().project.workspace.launch.railLengthM).toBe(4.5);
    expect(useProjectStore.getState().motors['imported_c6']?.motor.designation).toBe('Imported C6');
    expect(useProjectIo.getState().status?.message).toMatch(/Opened project "Adopted Project"/);
    expect(report()).toBeNull();
  });

  it('refuses an unknown file type and leaves the project untouched', async () => {
    const before = useProjectStore.getState().project;

    await importProjectFile(new File(['notes'], 'notes.txt', { type: 'text/plain' }));

    expect(report()?.title).toBe('Could not load notes.txt');
    expect(report()?.message).toMatch(/unsupported type/);
    expect(useProjectStore.getState().project).toBe(before);
  });
});

describe('durable browser slot', () => {
  it('reports an empty slot as a message, not an error', async () => {
    expect(await openProjectFromSlot()).toEqual({ kind: 'ok', message: 'No project saved in this browser yet' });
    expect(useProjectIo.getState().status?.kind).toBe('ok');
  });

  it('commits a revision and restores it after later edits', async () => {
    const committed = await saveProjectToSlot();
    expect(committed.message).toMatch(/Saved locally \(revision 1\)/);
    const stored = JSON.parse(localStorage.getItem(PROJECT_STORAGE_KEY) as string);
    expect(stored.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(stored.revision).toBe(1);
    expect(useProjectStore.getState().file).toEqual({ kind: 'saved', revision: 1 });

    const edited = useProjectStore.getState().project;
    useProjectStore.getState().editProject({
      label: 'Rename',
      key: 'name',
      project: { ...edited, vehicle: { ...edited.vehicle, name: 'Edited After Save' } },
    });
    expect(useProjectStore.getState().project.vehicle.name).toBe('Edited After Save');

    const opened = await openProjectFromSlot();
    expect(opened.message).toMatch(/Opened saved project \(revision 1\)/);
    expect(useProjectStore.getState().project.vehicle.name).toBe(stored.vehicle.name);
  });

  it('reports corrupt stored bytes and never overwrites them', async () => {
    localStorage.setItem(PROJECT_STORAGE_KEY, '{ not a project');
    resetProjectSlot();

    const opened = await openProjectFromSlot();
    expect(opened.kind).toBe('error');
    expect(opened.message).toMatch(/^Open failed: Invalid project/);

    const saved = await saveProjectToSlot();
    expect(saved.kind).toBe('error');
    expect(saved.message).toMatch(/Save failed: Invalid project/);
    expect(localStorage.getItem(PROJECT_STORAGE_KEY)).toBe('{ not a project');
  });

  it('refuses a save behind a newer stored commit and leaves it untouched', async () => {
    await openProjectFromSlot(); // syncs the revision base to the empty slot
    localStorage.setItem(
      PROJECT_STORAGE_KEY,
      writeProject(createProjectEnvelope({ vehicle: useProjectStore.getState().project.vehicle, revision: 999 })),
    );

    const refused = await saveProjectToSlot();

    expect(refused.kind).toBe('error');
    expect(refused.message).toMatch(/stale write rejected/);
    expect(JSON.parse(localStorage.getItem(PROJECT_STORAGE_KEY) as string).revision).toBe(999);
  });
});

describe('failed saves and opens leave a recoverable, explained state', () => {
  const rename = (name: string) => {
    const p = useProjectStore.getState().project;
    useProjectStore.getState().editProject({ label: 'Rename', key: 'name', project: { ...p, vehicle: { ...p.vehicle, name } } });
  };

  it('a storage write failure keeps the open design, the stored revision and the unsaved state, explains it, and a retry works', async () => {
    await saveProjectToSlot();
    const storedBefore = localStorage.getItem(PROJECT_STORAGE_KEY);
    rename('Edited before quota');
    const before = writeProject(exportableProject());
    const quota = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota exceeded'); });
    const failed = await saveProjectToSlot();
    expect(failed.kind).toBe('error');
    expect(failed.message).toMatch(/^Save failed: .*quota exceeded\. Nothing in this browser was changed and your design is still open\. Use Save project file… to keep a copy\.$/);
    expect(useProjectIo.getState().status).toEqual(failed);
    expect(localStorage.getItem(PROJECT_STORAGE_KEY)).toBe(storedBefore);
    expect(writeProject(exportableProject())).toBe(before);
    expect(useProjectStore.getState().file.kind).toBe('dirty-unsaved');
    quota.mockRestore();
    expect((await saveProjectToSlot()).message).toBe('Saved locally (revision 2)');
    expect(JSON.parse(localStorage.getItem(PROJECT_STORAGE_KEY) as string).vehicle.name).toBe('Edited before quota');
  });

  it('a save behind another tab names both ways forward', async () => {
    await openProjectFromSlot();
    const newer = writeProject(createProjectEnvelope({ vehicle: useProjectStore.getState().project.vehicle, revision: 7 }));
    localStorage.setItem(PROJECT_STORAGE_KEY, newer);
    rename('Mine');
    const refused = await saveProjectToSlot();
    expect(refused.message).toMatch(/^Save failed: .+\. Another tab or window saved a newer revision\. Your design is still open: use Save project file… to keep it, or Open saved project to load the newer one\.$/);
    expect(useProjectStore.getState().project.vehicle.name).toBe('Mine');
    expect(localStorage.getItem(PROJECT_STORAGE_KEY)).toBe(newer);
  });

  it.each([
    ['malformed RockSim', () => new File(['<RockSimDocument><broken'], 'bad.rkt'), /^.+\. Your current design was not changed\.$/],
    ['malformed motor', () => new File(['not a motor'], 'bad.eng'), /^.+\. No motor was added and your current design was not changed\.$/],
    ['unsupported type', () => new File(['x'], 'notes.docx'), /^.+\. Your current design was not changed\.$/],
    ['older schema declaring newer fields', () => {
      const doc = JSON.parse(writeProject(exportableProject()));
      doc.schemaVersion = '1.8.0';
      doc.motorRecords = [...doc.motorRecords, { id: 'conflict_c6', motor: { ...parseRaspEng(SAMPLE_ENG), id: 'conflict_c6' }, provenance: { source: 'import', sourceFile: 'c6.eng' } }];
      doc.cases = [{ id: 'c', kind: 'flight', createdAt: '2026-10-01T00:00:00.000Z', motorRecordId: 'conflict_c6', events: [] }];
      return new File([JSON.stringify(doc)], 'conflict.astraea.json');
    }, /cannot declare case events.*\. Your current design was not changed\.$/],
  ] as const)('a refused %s import explains that nothing changed and leaves the document as it was', async (_name, make, message) => {
    rename('Before import');
    const before = writeProject(exportableProject());
    const motorsBefore = Object.keys(useProjectStore.getState().motors).length;
    await importProjectFile(make());
    expect(report()?.title).toMatch(/^Could not load /);
    expect(report()?.message).toMatch(message);
    expect(writeProject(exportableProject())).toBe(before);
    expect(Object.keys(useProjectStore.getState().motors)).toHaveLength(motorsBefore);
  });

  it('an unreadable stored copy is explained on open and on save, and never replaces the design', async () => {
    rename('Current design');
    localStorage.setItem(PROJECT_STORAGE_KEY, '{ not a project');
    resetProjectSlot();
    const opened = await openProjectFromSlot();
    expect(opened.message).toMatch(/^Open failed: Invalid project.*\. Your current design was not replaced\.$/);
    const saved = await saveProjectToSlot();
    expect(saved.message).toMatch(/^Save failed: Invalid project.*\. The copy stored in this browser is unreadable and was left untouched\. Your design is still open: use Save project file… to keep a copy\.$/);
    expect(useProjectStore.getState().project.vehicle.name).toBe('Current design');
  });

  it('a failed file write explains that the design is still open', async () => {
    const scope = window as unknown as { showSaveFilePicker?: unknown };
    scope.showSaveFilePicker = async () => ({ createWritable: async () => ({ write: async () => { throw new Error('disk full'); }, close: async () => undefined }) });
    try {
      const status = await saveProjectToFile();
      expect(status.kind).toBe('error');
      expect(status.message).toMatch(/^Save failed: .*disk full\. Your design is still open; try again, or use Save to this browser \(a separate quota-bound option, not a guaranteed backup\)\.$/);
    } finally {
      delete scope.showSaveFilePicker;
    }
  });
});

describe('native project archive budget', () => {
  it('opens a valid project larger than the foreign import budget', async () => {
    const text = writeProject(largeProject(4));
    expect(new TextEncoder().encode(text).byteLength).toBeGreaterThan(8 * 1024 * 1024);
    await importProjectFile(new File([text], 'large.astraea.json', { type: 'application/json' }));
    const project = useProjectStore.getState().project;
    expect(project.cases).toHaveLength(4);
    expect(project.cases.every((entry) => entry.telemetry?.length === 5000)).toBe(true);
  }, 120_000);

  it('refuses to write an over-budget project file and leaves the design untouched', async () => {
    const huge = largeProject(18);
    adoptProject(huge);
    const before = useProjectStore.getState().project;
    const picker = vi.fn();
    const scope = window as unknown as { showSaveFilePicker?: unknown };
    const previousPicker = scope.showSaveFilePicker;
    scope.showSaveFilePicker = picker;
    const createObjectURL = vi.spyOn(URL, 'createObjectURL');
    try {
      const status = await saveProjectToFile();
      expect(status.kind).toBe('error');
      expect(status.message).toMatch(/Save failed: .*64 MB/);
      expect(status.message).toMatch(/no file was written/);
      expect(status.message).toMatch(/current design remains open/);
      expect(status.message).toMatch(/quota-bound option, not a guaranteed backup/);
      expect(picker).not.toHaveBeenCalled();
      expect(createObjectURL).not.toHaveBeenCalled();
      expect(useProjectStore.getState().project.cases).toHaveLength(18);
      expect(useProjectStore.getState().project.vehicle.name).toBe(before.vehicle.name);
    } finally {
      if (previousPicker === undefined) delete scope.showSaveFilePicker;
      else scope.showSaveFilePicker = previousPicker;
      createObjectURL.mockRestore();
    }
  }, 180_000);
});

describe('native project files', () => {
  it('writes the project through the download seam with the motor records included', async () => {
    const downloads: { filename: string; blob: Blob }[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      downloads.push({ filename: '', blob: blob as Blob });
      return 'blob:test';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function capture(this: HTMLAnchorElement) {
      const last = downloads[downloads.length - 1];
      if (last !== undefined) last.filename = this.download;
    });

    await importProjectFile(new File([SAMPLE_ENG], 'estes-c6.eng', { type: 'text/plain' }));
    const status = await saveProjectToFile();

    expect(status.kind).toBe('ok');
    expect(status.message).toMatch(/to your downloads/);
    const download = downloads[downloads.length - 1];
    expect(download.filename.endsWith('.astraea.json')).toBe(true);
    const doc = JSON.parse(await download.blob.text());
    expect(doc.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    const imported = doc.motorRecords.find((r: { provenance: { sourceFile?: string } }) => r.provenance.sourceFile === 'estes-c6.eng');
    expect(imported?.provenance.source).toBe('import');
    expect(imported?.motor.designation).toBe('Estes C6');
  });

  it("writes through the browser's Save dialog where it exists", async () => {
    const written: Array<string | Uint8Array> = [];
    let suggested = '';
    const scope = window as unknown as { showSaveFilePicker?: unknown };
    scope.showSaveFilePicker = async ({ suggestedName }: { suggestedName: string }) => {
      suggested = suggestedName;
      return {
        createWritable: async () => ({
          write: async (data: string | Uint8Array) => void written.push(data),
          close: async () => undefined,
        }),
      };
    };
    try {
      const status = await saveProjectToFile();
      expect(status).toEqual({ kind: 'ok', message: `Saved ${suggested}` });
      expect(suggested.endsWith('.astraea.json')).toBe(true);
      expect(JSON.parse(written[0] as string).schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    } finally {
      delete scope.showSaveFilePicker;
    }
  });

  it("reports a cancelled browser Save dialog and falls back to a download when it refuses", async () => {
    const scope = window as unknown as { showSaveFilePicker?: unknown };
    scope.showSaveFilePicker = async () => {
      throw Object.assign(new Error('user cancelled'), { name: 'AbortError' });
    };
    try {
      expect((await saveProjectToFile()).message).toMatch(/Save cancelled/);
      vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:test');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
      scope.showSaveFilePicker = async () => {
        throw Object.assign(new Error('needs a user gesture'), { name: 'SecurityError' });
      };
      expect((await saveProjectToFile()).message).toMatch(/to your downloads/);
    } finally {
      delete scope.showSaveFilePicker;
    }
  });

  it('says the picker was cancelled instead of failing', async () => {
    const picking = openProjectFromFilePicker();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    input.dispatchEvent(new Event('cancel'));
    await picking;

    expect(useProjectIo.getState().status).toEqual({ kind: 'ok', message: 'Open cancelled — nothing was loaded.' });
    expect(report()).toBeNull();
  });

  it('exports every motor record the session holds, store-only ones included', async () => {
    await importProjectFile(new File([SAMPLE_ENG], 'estes-c6.eng', { type: 'text/plain' }));
    // A curve edit registers in the store's registry only (exactly what the
    // Console's draft commit does); the export must still carry it.
    const motor = { ...parseRaspEng(SAMPLE_ENG), id: 'store_only', designation: 'Store Only' };
    useProjectStore.setState({
      motors: {
        ...useProjectStore.getState().motors,
        store_only: { id: 'store_only', motor, provenance: { source: 'derived' } },
      },
    });

    const exported = exportableProject();
    expect(exported.motorRecords.find((r) => r.provenance.sourceFile === 'estes-c6.eng')?.motor.designation).toBe('Estes C6');
    expect(exported.motorRecords.map((r) => r.id)).toContain('store_only');
    // The envelope the exporter writes accepts the merged records.
    expect(writeProject(exported)).toContain('store_only');
  });
});

/** A desktop shell whose Save dialog "returns" the path the user typed. */
function installTauri(typedPath: string | null) {
  const written = new Map<string, string | Uint8Array>();
  const dialogs: Array<{ defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }> = [];
  (window as unknown as { __TAURI__?: unknown }).__TAURI__ = {
    dialog: {
      save: async (opts: (typeof dialogs)[number]) => {
        dialogs.push(opts);
        return typedPath;
      },
    },
    fs: {
      writeTextFile: async (path: string, text: string) => void written.set(path, text),
      writeFile: async (path: string, data: Uint8Array) => void written.set(path, data),
    },
  };
  return { written, dialogs };
}

describe('desktop save then open', () => {
  afterEach(() => {
    delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  });

  it('reopens a project saved under the default extension the user typed (.astraea)', async () => {
    const shell = installTauri('C:\\acc\\files\\p1.astraea');
    useProjectStore.getState().loadPreset('nasaStudent');
    const saved = await saveProjectToFile();
    expect(saved.kind).toBe('ok');
    const text = shell.written.get('C:\\acc\\files\\p1.astraea') as string;
    expect(JSON.parse(text).schemaVersion).toBe(PROJECT_SCHEMA_VERSION);

    useProjectStore.getState().newProject();
    await importProjectFile(new File([text], 'p1.astraea'));

    expect(report()).toBeNull();
    expect(useProjectStore.getState().project.vehicle.name).toBe(JSON.parse(text).vehicle.name);
    expect(useProjectIo.getState().status?.message).toMatch(/^Opened project/);
  });

  it('names the file the user chose in the dialog, not the suggestion', async () => {
    installTauri('C:\\acc\\files\\p1.astraea');
    const status = await saveProjectToFile();
    expect(status.message).toBe('Saved p1.astraea');
  });

  it('offers a project file type that covers both project extensions in the native dialog', async () => {
    const shell = installTauri('/tmp/x.astraea.json');
    await saveProjectToFile();
    expect(shell.dialogs[0].defaultPath).toMatch(/\.astraea\.json$/);
    const extensions = shell.dialogs[0].filters?.flatMap((f) => f.extensions) ?? [];
    expect(extensions).toEqual(expect.arrayContaining(['json', 'astraea']));
  });

  it('keeps mission name, target apogee, site label and shear override through save and open', async () => {
    const shell = installTauri('/tmp/nsl.astraea.json');
    useProjectStore.getState().loadPreset('nasaStudent');
    expect(useProjectStore.getState().mission).toEqual({ name: 'Student Launch 2027 · practice flight', site: 'Huntsville, AL', targetApogeeM: 550 });
    useProjectStore.setState({ shearPa: 9.5e9 });
    await saveProjectToFile();
    const text = shell.written.get('/tmp/nsl.astraea.json') as string;

    // A different session state: another preset, no override.
    useProjectStore.getState().loadPreset('estesAlpha');
    useProjectStore.setState({ shearPa: undefined });
    expect(useProjectStore.getState().mission.name).toBe('Park flyer');

    await importProjectFile(new File([text], 'nsl.astraea.json'));

    expect(useProjectStore.getState().mission).toEqual({ name: 'Student Launch 2027 · practice flight', site: 'Huntsville, AL', targetApogeeM: 550 });
    expect(useProjectStore.getState().shearPa).toBe(9.5e9);
    // And a saved-then-reopened edit, not just a preset.
    useProjectStore.setState({ mission: { name: 'Edited', site: 'Black Rock, NV', targetApogeeM: 4200 } });
    await saveProjectToFile();
    useProjectStore.getState().newProject();
    await importProjectFile(new File([shell.written.get('/tmp/nsl.astraea.json') as string], 'again.astraea.json'));
    expect(useProjectStore.getState().mission).toEqual({ name: 'Edited', site: 'Black Rock, NV', targetApogeeM: 4200 });
  });

  it('opens an older project without a mission using the default mission', async () => {
    const doc = JSON.parse(writeProject(exportableProject()));
    delete doc.mission;
    doc.schemaVersion = '1.2.0';
    await importProjectFile(new File([JSON.stringify(doc)], 'old.astraea.json'));
    expect(report()).toBeNull();
    expect(useProjectStore.getState().mission).toEqual({ name: 'Untitled mission', site: 'Unspecified site', targetApogeeM: 1000 });
  });
});


// Real parser/storage regressions with only file-read timing controlled.
for (const change of ['edit', 'new document'] as const) {
  it(`save completion cannot mark an intervening ${change} saved`, async () => {
    const savedName = useProjectStore.getState().project.vehicle.name;
    const saving = saveProjectToSlot();
    if (change === 'new document') useProjectStore.getState().newProject();
    else {
      const project = useProjectStore.getState().project;
      useProjectStore.getState().editProject({ label: 'Rename', key: 'name', project: { ...project, vehicle: { ...project.vehicle, name: 'Unsaved edit' } } });
    }
    await saving;
    expect(JSON.parse(localStorage.getItem(PROJECT_STORAGE_KEY)!).vehicle.name).toBe(savedName);
    expect(useProjectStore.getState().file.kind).toBe('dirty-unsaved');
  });
}

function pendingFile(name: string) {
  const vehicle = useProjectStore.getState().project.vehicle;
  const text = writeProject(createProjectEnvelope({ vehicle: { ...vehicle, name } }));
  let finish!: () => void;
  const file = new File([], `${name}.astraea`);
  Object.defineProperty(file, 'text', { value: () => new Promise<string>((resolve) => { finish = () => resolve(text); }) });
  return { file, finish: () => finish() };
}

it('overlapping imports must keep the last requested document after reversed read completion', async () => {
  const a = pendingFile('A');
  const b = pendingFile('B');
  const openingA = importProjectFile(a.file);
  const openingB = importProjectFile(b.file);
  b.finish();
  await openingB;
  expect(useProjectStore.getState().project.vehicle.name).toBe('B');
  a.finish();
  await openingA;
  expect(useProjectStore.getState().project.vehicle.name).toBe('B');
});

it('an import started before New must not replace the new document later', async () => {
  const a = pendingFile('Old request A');
  const openingA = importProjectFile(a.file);
  useProjectStore.getState().newProject();
  const current = useProjectStore.getState().project;
  a.finish();
  await openingA;
  expect(useProjectStore.getState().project).toBe(current);
});

function deferredFile(filename: string) {
  let resolve!: (text: string) => void;
  let reject!: (error: Error) => void;
  const file = new File([], filename);
  Object.defineProperty(file, 'text', { value: () => new Promise<string>((yes, no) => { resolve = yes; reject = no; }) });
  return { file, resolve: (text: string) => resolve(text), reject: (error: Error) => reject(error) };
}

for (const kind of ['motor', 'geometry', 'project'] as const) {
  for (const change of ['new', 'edit'] as const) {
    it(`pending ${kind} import cannot alter a document after ${change}`, async () => {
      const incoming = deferredFile(kind === 'motor' ? 'delayed.eng' : kind === 'geometry' ? 'delayed.rkt' : 'delayed.astraea');
      const text = kind === 'motor' ? SAMPLE_ENG : kind === 'geometry' ? SAMPLE_RKT : writeProject(exportableProject());
      const importing = importProjectFile(incoming.file);
      if (change === 'new') useProjectStore.getState().newProject();
      else {
        const project = useProjectStore.getState().project;
        useProjectStore.getState().editProject({ label: 'Rename', key: 'name', project: { ...project, vehicle: { ...project.vehicle, name: 'Keep this edit' } } });
      }
      const expected = writeProject(exportableProject());
      incoming.resolve(text);
      await importing;
      expect(writeProject(exportableProject())).toBe(expected);
      expect(useProjectIo.getState().report).toBeNull();
      if (change === 'new') expect(useProjectIo.getState().status).toBeNull();
      else expect(useProjectIo.getState().status?.message).toMatch(/document changed while loading/);
    });
  }
}

it('an obsolete failed import cannot overwrite a newer refusal report', async () => {
  const old = deferredFile('old.astraea');
  const importing = importProjectFile(old.file);
  await importProjectFile(new File(['notes'], 'new.txt'));
  const currentReport = report();
  old.reject(new Error('Old read failed'));
  await importing;
  expect(report()).toBe(currentReport);
});

it('a newer refused import still supersedes an older valid request', async () => {
  const old = pendingFile('Old');
  const importing = importProjectFile(old.file);
  await importProjectFile(new File(['notes'], 'new.txt'));
  const current = useProjectStore.getState().project;
  old.finish();
  await importing;
  expect(useProjectStore.getState().project).toBe(current);
  expect(report()?.title).toBe('Could not load new.txt');
});

it('starting the picker supersedes an older read even when the picker is cancelled', async () => {
  const old = pendingFile('Old');
  const importing = importProjectFile(old.file);
  const current = useProjectStore.getState().project;
  const picking = openProjectFromFilePicker();
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  input.dispatchEvent(new Event('cancel'));
  await picking;
  old.finish();
  await importing;
  expect(useProjectStore.getState().project).toBe(current);
  expect(useProjectIo.getState().status?.message).toMatch(/Open cancelled/);
});

it('a dropped import supersedes an already pending slot open', async () => {
  await saveProjectToSlot();
  const opening = openProjectFromSlot();
  const latest = pendingFile('Latest');
  const importing = importProjectFile(latest.file);
  await opening;
  latest.finish();
  await importing;
  expect(useProjectStore.getState().project.vehicle.name).toBe('Latest');
});

for (const outcome of ['success', 'error'] as const) {
  it(`late save ${outcome} feedback cannot overwrite a newer Open outcome`, async () => {
    if (outcome === 'error') vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const saving = saveProjectToSlot();
    const opening = openProjectFromSlot();
    await Promise.all([saving, opening]);
    expect(useProjectIo.getState().status?.message).toMatch(/Opened saved project|No project saved/);
  });
}

it('saving a prior snapshot reports later edits as still unsaved', async () => {
  const saving = saveProjectToSlot();
  const store = useProjectStore.getState();
  store.editProject({ label: 'Mission', key: 'mission', project: store.project, mission: { ...store.mission, name: 'Unsaved mission' } });
  const status = await saving;
  expect(status.message).toMatch(/earlier snapshot.*current changes remain unsaved/);
  expect(useProjectStore.getState().file.kind).toBe('dirty-unsaved');
});

for (const outcome of ['success', 'error'] as const) {
  it(`older native file save ${outcome} cannot overwrite a newer import's feedback`, async () => {
    let finish!: (path: string) => void;
    let fail!: (error: Error) => void;
    const scope = window as unknown as { __TAURI__?: unknown };
    scope.__TAURI__ = {
      dialog: { save: () => new Promise<string>((resolve, reject) => { finish = resolve; fail = reject; }) },
      fs: { writeTextFile: async () => undefined },
    };
    try {
      const saving = saveProjectToFile();
      await importProjectFile(new File([writeProject(exportableProject())], 'latest.astraea'));
      const latestStatus = useProjectIo.getState().status;
      if (outcome === 'success') finish('/tmp/earlier.astraea');
      else fail(new Error('Old dialog failed'));
      await saving;
      expect(useProjectIo.getState().status).toBe(latestStatus);
    } finally {
      delete scope.__TAURI__;
    }
  });
}

it('an older save cannot mark the file saved after a newer request on identical content', async () => {
  const saving = saveProjectToSlot();
  await importProjectFile(new File(['notes'], 'newer.txt'));
  await saving;
  expect(JSON.parse(localStorage.getItem(PROJECT_STORAGE_KEY)!).revision).toBe(1);
  expect(useProjectStore.getState().file.kind).toBe('dirty-unsaved');
  expect(report()?.title).toBe('Could not load newer.txt');
});

it('background completed runs do not cancel an explicit pending project load', async () => {
  const incoming = pendingFile('Incoming');
  const importing = importProjectFile(incoming.file);
  const analysis = useAnalysisStore.getState();
  const token = analysis.start('ensemble', 'new-completed-input');
  analysis.resolve('ensemble', token, {
    design: { motorId: 'aerotech_k550w' }, dispersion: { landings: [], ok: 2, failed: 0 },
  });
  incoming.finish();
  await importing;
  expect(useProjectStore.getState().project.vehicle.name).toBe('Incoming');
  expect(exportableProject().cases).toEqual([]);
  expect(useProjectIo.getState().status?.message).toMatch(/Opened project/);
});

it('changed-document cancellation also explains an obsolete read failure', async () => {
  const incoming = deferredFile('pending.astraea');
  const importing = importProjectFile(incoming.file);
  const store = useProjectStore.getState();
  store.editProject({ label: 'Mission', key: 'mission', project: store.project, mission: { ...store.mission, name: 'Keep new mission' } });
  incoming.reject(new Error('Read failed'));
  await importing;
  expect(report()).toBeNull();
  expect(useProjectIo.getState().status?.message).toMatch(/document changed while loading/);
});

it('a completed run after Save remains unsaved in the current exported snapshot', async () => {
  const saving = saveProjectToSlot();
  const analysis = useAnalysisStore.getState();
  const token = analysis.start('ensemble', 'new-after-save');
  analysis.resolve('ensemble', token, {
    design: { motorId: 'aerotech_k550w' }, dispersion: { landings: [], ok: 2, failed: 0 },
  });
  const status = await saving;
  expect(JSON.parse(localStorage.getItem(PROJECT_STORAGE_KEY)!).cases).toEqual([]);
  expect(exportableProject().cases).toHaveLength(1);
  expect(useProjectStore.getState().file.kind).toBe('dirty-unsaved');
  expect(status.message).toMatch(/earlier snapshot.*current changes remain unsaved/);
});
