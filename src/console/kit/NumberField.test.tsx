// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NumberField } from './Fields';

afterEach(cleanup);
describe('NumberField edits', () => {
  it('abandons an edit on Escape', () => {
    const onChange = vi.fn();
    render(<NumberField value={550} kind="dist" onChange={onChange} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    act(() => input.focus()); fireEvent.change(input, { target: { value: '700' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('550');
  });
  it('commits a decimal comma', () => {
    const onChange = vi.fn();
    render(<NumberField value={1} kind="raw" onChange={onChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.focus(input); fireEvent.change(input, { target: { value: '1,5' } }); fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(1.5);
  });
  it('rejects invalid input and explains the retained value', () => {
    const onChange = vi.fn();
    render(<NumberField value={550} kind="dist" onChange={onChange} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.focus(input); fireEvent.change(input, { target: { value: '12abc' } }); fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('550');
    expect(screen.getByRole('status').textContent).toContain('Not a number');
  });
  it('does not clamp an untouched value outside a changed cap', () => {
    const onChange = vi.fn();
    render(<NumberField value={550} kind="dist" max={100} onChange={onChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.focus(input); fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });
  it('shows clamp feedback and clears it on editing', () => {
    const onChange = vi.fn();
    render(<NumberField value={550} kind="dist" min={10} max={50000} onChange={onChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.focus(input); fireEvent.change(input, { target: { value: '0' } }); fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(10);
    expect(screen.getByRole('status').textContent).toContain('Limited');
    fireEvent.focus(input); fireEvent.change(input, { target: { value: '12' } });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
