// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Checkbox, Range, Select } from './Controls';
import { Disclosure } from './Disclosure';

afterEach(cleanup);

function SelectHarness(): React.JSX.Element {
  const [value, setValue] = useState('b');
  return (
    <Select ariaLabel="Test select" value={value} onChange={setValue}>
      <option value="a">A</option>
      <option value="b">B</option>
    </Select>
  );
}

describe('themed controls keep their native roles and names', () => {
  it('Select remains a combobox', () => {
    render(<SelectHarness />);
    const select = screen.getByRole('combobox', { name: 'Test select' }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'a' } });
    expect(select.value).toBe('a');
  });

  it('Checkbox remains a checkbox', () => {
    let last = false;
    render(<Checkbox ariaLabel="Test checkbox" checked={false} onChange={(v: boolean) => { last = v; }} />);
    const box = screen.getByRole('checkbox', { name: 'Test checkbox' });
    fireEvent.click(box);
    expect(last).toBe(true);
  });

  it('Range remains a slider and reports the numeric value', () => {
    let last = 0;
    render(<Range ariaLabel="Test range" value={5} min={0} max={10} step={1} onChange={(v: number) => { last = v; }} />);
    const slider = screen.getByRole('slider', { name: 'Test range' });
    fireEvent.change(slider, { target: { value: '7' } });
    expect(last).toBe(7);
  });

  it('Disclosure remains a native details/summary pair', () => {
    const { container } = render(<Disclosure summary="More information"><p>Full text</p></Disclosure>);
    const details = container.querySelector('details[data-kit-disclosure]');
    expect(details).not.toBeNull();
    const summary = details?.querySelector('summary');
    expect(summary?.textContent).toContain('More information');
    expect(summary?.hasAttribute('aria-expanded')).toBe(false);
  });
});
