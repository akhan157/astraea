/**
 * Ambient types for Vite `?raw` imports.
 *
 * Tests load real fixture files (public flight logs under docs/flight-validation)
 * as strings through Vite's `?raw` suffix rather than node:fs, so the project
 * keeps its DOM-only lib set and needs no @types/node dependency.
 */
declare module '*?raw' {
  const content: string;
  export default content;
}
