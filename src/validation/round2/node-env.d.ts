/** Node built-ins the opt-in round-2 harness uses to write its predictions (merged with src/types/node-test.d.ts). */
declare module 'node:fs' {
  export function writeFileSync(path: string, data: string): void;
}
declare const process: { env: Record<string, string | undefined> };
