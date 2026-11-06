/** Identity of the exact runtime bytes, never a version label or a refetched asset. */
export type EngineIdentity =
  | { readonly kind: 'production-rust-wasm'; readonly sha256: string | null }
  | { readonly kind: 'test-engine'; readonly sha256: null }
  | { readonly kind: 'unavailable'; readonly sha256: null };

export function parseEngineIdentity(value: unknown): EngineIdentity {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('engineIdentity must be an object');
  const raw = value as Record<string, unknown>;
  if (raw.kind === 'production-rust-wasm' && (raw.sha256 === null || (typeof raw.sha256 === 'string' && /^[0-9a-f]{64}$/.test(raw.sha256)))) {
    return Object.freeze({ kind: raw.kind, sha256: raw.sha256 });
  }
  if ((raw.kind === 'test-engine' || raw.kind === 'unavailable') && raw.sha256 === null) return Object.freeze({ kind: raw.kind, sha256: null });
  throw new Error('engineIdentity must identify production SHA-256 (or unknown), a test engine, or an unavailable engine');
}

/** Missing legacy metadata and unavailable checksums never establish equality. */
export function compareEngineIdentity(recorded: EngineIdentity | undefined, current: EngineIdentity | undefined): 'same' | 'different' | 'unknown' {
  if (!recorded || !current) return 'unknown';
  if (recorded.kind !== current.kind) return 'different';
  if (recorded.sha256 === null || current.sha256 === null) return 'unknown';
  return recorded.sha256 === current.sha256 ? 'same' : 'different';
}

export function describeEngineIdentity(identity: EngineIdentity | undefined): string {
  if (identity === undefined) return 'engine identity unknown (legacy record)';
  if (identity.kind === 'test-engine') return 'test engine; production WASM identity unknown';
  if (identity.kind === 'unavailable') return 'engine unavailable; identity unknown';
  return identity.sha256 === null ? 'production WASM; SHA-256 unavailable' : `production WASM SHA-256 ${identity.sha256}`;
}

/** Fetch once: the privately owned buffer is shared by hashing and compilation. */
export async function loadEngineModule(url: string): Promise<{ module: WebAssembly.Module; engineIdentity: EngineIdentity }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Astraea engine: WASM fetch failed (${response.status})`);
  const bytes = await response.arrayBuffer();
  const checksum = (async (): Promise<string | null> => {
    try {
      if (!globalThis.crypto?.subtle) return null;
      const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      return null;
    }
  })();
  const [module, sha256] = await Promise.all([WebAssembly.compile(bytes), checksum]);
  return { module, engineIdentity: Object.freeze({ kind: 'production-rust-wasm', sha256 }) };
}
