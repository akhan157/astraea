/**
 * The few Node built-ins the tests use: loading the shipped WebAssembly
 * file, and an independent SHA-256 to check checksums against (the project
 * carries no @types/node). Test-only: the app
 * itself never imports Node modules.
 */
declare module 'node:fs' {
  export function readFileSync(path: string): Uint8Array;
}
declare module 'node:url' {
  export function fileURLToPath(url: URL | string): string;
}
declare module 'node:crypto' {
  export function createHash(algorithm: 'sha256'): { update(data: Uint8Array): { digest(encoding: 'hex'): string } };
}
