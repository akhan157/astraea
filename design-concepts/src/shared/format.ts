export const ft = (m: number) => m * 3.28084;
export const fmt = (n: number, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export const mm = (m: number) => `${fmt(m * 1000)} mm`;
export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
