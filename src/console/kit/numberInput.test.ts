import { describe, expect, it } from 'vitest';
import { parseNumberInput } from './numberInput';

describe('parseNumberInput', () => {
  it.each<[string, number | null]>([
    ['1,5', 1.5], ['25,5', 25.5], ['25,50', 25.5], ['1,500', 1500],
    ['1,797.5', 1797.5], ['-2,5', -2.5], ['1.5', 1.5], ['.5', 0.5],
    ['abc', null], ['', null], ['1,2,3', null], ['1e9', 1e9], ['1e-3', 0.001], ['2.5E2', 250], ['5.', 5], ['+5', 5], ['1e', null], ['e5', null],
    ['12,3456', 12.3456], ['1234,567', null], ['1,23.4', null],
  ])('parses %j as %s', (input, expected) => expect(parseNumberInput(input)).toBe(expected));
});
