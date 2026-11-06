import { ledgerEntryId, validateLedgerEntry, type LedgerKind, type LedgerReview } from '../../application/evidenceLedger';
import { buildLogProvenance } from '../../evidence/logProvenance';
import type { AltimeterParse } from '../../evidence/altimetry';
import { downloadText } from '../../io/files';
import { useProjectStore } from '../../state/project';
import { currentRunKey, editProject } from '../store';
import { C } from '../kit/theme';
import { Select } from '../kit/Controls';

export async function recordEvidence(
  rawText: string,
  kind: LedgerKind,
  sourceFileName: string | null,
  sampleCount: number,
  units?: Omit<AltimeterParse, 'samples'>,
  rawBytes?: Uint8Array,
): Promise<void> {
  const provenance = await buildLogProvenance({ rawText, rawBytes, fileName: sourceFileName, rowCount: sampleCount, units });
  const entry = validateLedgerEntry({
    id: ledgerEntryId(), kind, title: sourceFileName ?? 'Pasted flight log', createdAt: new Date().toISOString(),
    sourceFileName, sha256Hex: provenance.sha256Hex, rawText, sampleCount,
    unitsNote: kind === 'gps-gpx' ? 'GPX WGS84; altitude m; timestamps UTC' : `${provenance.timeUnitAssumption}; ${provenance.altitudeUnitAssumption}`,
    processingSteps: ['Parsed source; original bytes preserved'], review: 'unreviewed', linkedRunKey: currentRunKey(), note: null,
  });
  editProject('Import flight evidence', `ledger:${entry.id}`, (project) => ({ ...project, ledger: [...project.ledger, entry] }));
}

export function ProjectLedger() {
  const entries = useProjectStore((state) => state.project.ledger);
  return <section className="space-y-2 rounded p-4" style={{ border: `1px solid ${C.line}` }}>
    <h3 className="text-[14px]">Project evidence ledger</h3>
    <p className="text-[11.5px]" style={{ color: C.muted }}>Source bytes, checksum, review and linked input key travel with Save/Open. These are local workflow records, not signatures or a calibration signoff.</p>
    {entries.length === 0 && <p>No evidence imported into this project.</p>}
    {entries.map((entry) => <article key={entry.id} className="space-y-1 border-t border-white/10 py-2 text-[12px]">
      <div className="flex flex-wrap items-center gap-3"><strong>{entry.title}</strong><span>{entry.sampleCount ?? 'N/A'} samples</span><span>{entry.createdAt}</span>
        <label className="inline-flex items-center">Review<span className="ml-2"><Select ariaLabel={`Review ${entry.title}`} value={entry.review} onChange={(value) => editProject('Review evidence', `review:${entry.id}`, (project) => ({ ...project, ledger: project.ledger.map((row) => row.id === entry.id ? { ...row, review: value as LedgerReview } : row) }))}>{(['unreviewed', 'accepted', 'rejected'] as const).map((review) => <option key={review}>{review}</option>)}</Select></span></label>
        <button className="rounded border px-2 py-1" onClick={() => downloadText(entry.sourceFileName ?? `${entry.id}.txt`, entry.rawText)}>Download original source</button>
      </div>
      <p className="break-all font-geist-mono text-[10.5px]">SHA-256 {entry.sha256Hex === 'unavailable' ? 'checksum unavailable' : entry.sha256Hex}</p>
      <p>{entry.unitsNote} · linked key {entry.linkedRunKey?.slice(0, 20) ?? 'none'}</p>
    </article>)}
  </section>;
}
