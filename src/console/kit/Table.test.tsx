// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { DataTable } from './Table';

type Row = { id: string; name: string };
const COLUMNS = [
  { key: 'name', label: 'Part', render: (r: Row) => r.name },
  { key: 'share', label: 'Share of dry mass', width: '2fr', render: (r: Row) => `${r.id}%` },
];

afterEach(cleanup);

describe('DataTable', () => {
  it('never lets a column header wrap', () => {
    render(<DataTable rows={[{ id: 'a', name: 'A' }]} rowKey={(r) => r.id} columns={COLUMNS} />);
    const headers = [...document.querySelectorAll('[role="columnheader"]')];
    expect(headers).toHaveLength(2);
    for (const header of headers) expect(header.className).toContain('whitespace-nowrap');
  });

  it('draws a divider before a labelled section and dims its quiet rows', () => {
    render(<DataTable
      sections={[
        { key: 'lifting', rows: [{ id: 'nose', name: 'Nose' }] },
        { key: 'secondary', label: 'Not lifting surfaces', rows: [{ id: 'tube', name: 'Tube' }], quiet: true },
      ]}
      rowKey={(r) => r.id}
      columns={COLUMNS}
    />);
    const divider = document.querySelector('[data-table-divider="secondary"]');
    expect(divider?.textContent).toBe('Not lifting surfaces');
    expect(divider?.querySelector('[role="cell"]')?.getAttribute('aria-colspan')).toBe('2');
    const quiet = document.querySelector('[data-table-section="secondary"]');
    expect(quiet?.className).toContain('opacity-70');
    const lifting = document.querySelector('[data-table-section="lifting"]');
    expect(lifting?.className).not.toContain('opacity-70');
  });

  it('keeps the flat rows form unchanged for existing callers', () => {
    render(<DataTable rows={[{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]} rowKey={(r) => r.id} columns={COLUMNS} />);
    expect(document.querySelectorAll('[data-table-section="all"]')).toHaveLength(2);
    expect(document.querySelector('[data-table-divider]')).toBeNull();
  });
});
