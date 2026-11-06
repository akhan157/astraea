declare module 'node:fs/promises' {
  export function readFile(path: string): Promise<Uint8Array>;
  export function mkdtemp(prefix: string): Promise<string>;
  export function writeFile(path: string, data: string | Uint8Array): Promise<void>;
  export function rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
}
declare module 'node:path' {
  export function join(...parts: string[]): string;
}
declare module 'node:os' {
  export function tmpdir(): string;
}
