/** Parse display input without silently accepting partial or ambiguous numbers. */
export function parseNumberInput(input: string): number | null {
  const text = input.trim();
  let normalized: string;
  // A three-digit comma group is thousands, including the ambiguous "1,500".
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) normalized = text.replace(/,/g, '');
  else if (/^-?\d+,\d{1,2}$/.test(text) || /^-?\d+,\d{4,}$/.test(text)) normalized = text.replace(',', '.');
  else if (/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(text)) normalized = text;
  else return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
