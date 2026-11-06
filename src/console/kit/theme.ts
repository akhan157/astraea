/** Console refined (A1+) tokens. Amber is reserved for "changed since the committed run". */
export const C = {
  bg: '#0B0C0E', panel: '#101215', raised: '#16191D', sunken: '#0D0F11', hover: 'rgba(255,255,255,0.035)', line: 'rgba(255,255,255,0.065)', lineStrong: 'rgba(255,255,255,0.12)',
  fg: '#E7E9EC', muted: '#8B9199', dim: '#5E646D', faint: '#3D4249',
  accent: '#6EE7F7', changed: '#F5B544', ok: '#3DD68C', warn: '#F5B544', bad: '#F87185', unknown: '#9AA3AD',
  cg: '#38BDF8', cp: '#FB7185',
  /** Chart series, validated for the dark surface (dataviz validator): blue, orange, violet in this order. */
  s1: '#3A98C8', s2: '#C9803A', s3: '#9877DD'
} as const;
