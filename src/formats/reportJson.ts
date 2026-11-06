/** JSON for validated plain project/trace DTOs, preserving binary64 -0.
 * JSON.stringify alone changes -0 to +0. Use a collision-free temporary string
 * only during encoding, then emit the valid JSON floating-number token -0.0.
 * The input must be plain, stable JSON data, not stateful getters/toJSON objects.
 * Other numbers, strings, keys, order, indentation and omission retain standard
 * JSON.stringify behavior. No sentinel is stored in the resulting document.
 */
export function stringifyReportJson(value: unknown, space = 2): string {
  const ordinary = JSON.stringify(value, null, space);
  if (ordinary === undefined) throw new TypeError('Report JSON requires a JSON value');
  let marker = '__astraea_negative_zero__';
  // Test the WHOLE encoded text, including keys and escaped string fragments.
  // This prevents a replacement from changing any original string/key token.
  while (ordinary.includes(JSON.stringify(marker))) marker += '_';
  const encoded = JSON.stringify(value, (_key, item) => Object.is(item, -0) ? marker : item, space)!;
  return encoded.split(JSON.stringify(marker)).join('-0.0');
}
