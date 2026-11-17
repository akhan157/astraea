import { beforeEach, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createIndexedDbBackend } from '../formats/projectStorage';
import { writeProject, type MotorRecord } from '../formats/projectJson';
import { parseRaspEng } from '../formats/engParser';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import { currentPreflight } from '../console/store';
import { adoptProject, exportableProject, openProjectJson, resolveMotorRecord, useProjectStore } from './project';
import { captureWorkingSession, restoreWorkingSession, workingSessionSlot } from './workingSession';

beforeEach(() => useProjectStore.getState().newProject());
function bind(record: MotorRecord) {
  const s = useProjectStore.getState();
  useProjectStore.setState({ project: { ...s.project, motorRecords: [...s.project.motorRecords, record], workspace: { ...s.project.workspace, motorId: record.id } }, motors: { ...s.motors, [record.id]: record } });
}
function verify(record: MotorRecord) {
  expect(useProjectStore.getState().motors[record.id]).toEqual(record);
  expect(currentPreflight().issues.map(i => i.message).join('\n')).not.toContain('not in the catalog');
}
const restored = (): MotorRecord => ({ id: 'restored_test', motor: structuredClone(CERTIFIED_MOTORS.estes_c6), provenance: { source: 'certified' } });
const imported = (): MotorRecord => ({ id: 'imported_test', motor: parseRaspEng('Estes C6 18 70 Estes 8.8 6.06 14.2 0.0125 0.0248\n0 0\n0.18 14.2\n1.86 0\n'), provenance: { source: 'import', sourceFile: 'test.eng' } });
async function session(record: MotorRecord) {
  bind(record); const factory = new IDBFactory(); const backend = createIndexedDbBackend('test', factory);
  const slot = workingSessionSlot(backend); await slot.load(); await slot.save(captureWorkingSession());
  useProjectStore.getState().newProject(); const saved = await workingSessionSlot(backend).load(); restoreWorkingSession(saved!); verify(record);
}
function file(record: MotorRecord) {
  bind(record); const text = writeProject(exportableProject()); useProjectStore.getState().newProject(); openProjectJson(text); verify(record);
}
it('restores a certified saved-run motor through working-session rehydration', async () => session(restored()));
it('restores a certified saved-run motor through project file open', () => file(restored()));
it('retains an imported eng motor through working-session rehydration', async () => session(imported()));
it('retains an imported eng motor through project file open', () => file(imported()));
it('does not re-register a certified record under a bundled ID', () => {
 const p = exportableProject(); const motor = CERTIFIED_MOTORS.estes_c6;
 adoptProject({ ...p, motorRecords: [{ id: 'estes_c6', motor: { ...motor, designation: 'collision' }, provenance: { source: 'certified' } }] });
 expect(useProjectStore.getState().motors.estes_c6).toBeUndefined();
 expect(resolveMotorRecord('estes_c6', useProjectStore.getState().motors)?.motor).toEqual(motor);
});
