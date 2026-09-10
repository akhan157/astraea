/**
 * Monte Carlo web-worker entrypoint (Q12: Vite module worker).
 *
 * Instantiated by the host as:
 *   new Worker(new URL('./monteCarloWorker.ts', import.meta.url), { type: 'module' })
 * so Vite bundles the sim engine into the worker asset with correct
 * cross-origin worker loading. The worker computes ONE chunk of the ensemble
 * per request and replies; the host drives chunk indices sequentially to
 * surface live progress and keep cancellation cheap (any chunk is a safe
 * stopping point — the chunk API never mutates shared state).
 *
 * Protocol (untyped MessagePort data; structured clone between realms):
 *   in  { type: 'montecarlo:run', id, request: MonteCarloChunkRequest }
 *   out { type: 'montecarlo:chunk', id, result: MonteCarloChunkResult }
 *   in  { type: 'montecarlo:cancel', id }   // drop any pending run
 *   in  { type: 'montecarlo:ping', id }     // liveness probe
 *   out { type: 'montecarlo:pong', id, at }
 *
 * Per-run exceptions never cross the boundary: runMonteCarloChunk returns
 * failure bookkeeping, and the host merges it through
 * accumulateMonteCarloChunks / finalizeMonteCarloChunks. An ensemble whose
 * first chunk fails loudly is surfaced by finalize (all-failed throw) on the
 * main thread, exactly like the synchronous path.
 */

import { runMonteCarloChunk, MonteCarloChunkResult } from './monteCarlo';

export interface MonteCarloChunkRequest {
  baseInput: Parameters<typeof runMonteCarloChunk>[0];
  perturbations: Parameters<typeof runMonteCarloChunk>[1];
  nRuns: number;
  seed: number;
  chunkIndex: number;
  chunkSize: number;
}

export type MonteCarloWorkerMessage =
  | { type: 'montecarlo:run'; id: number; request: MonteCarloChunkRequest }
  | { type: 'montecarlo:cancel'; id: number }
  | { type: 'montecarlo:ping'; id: number };

export type MonteCarloWorkerReply =
  | { type: 'montecarlo:chunk'; id: number; result: MonteCarloChunkResult }
  | { type: 'montecarlo:pong'; id: number; at: number };

declare const self: Worker;

let cancelledId: number | null = null;

self.onmessage = (event: MessageEvent<MonteCarloWorkerMessage>) => {
  const message = event.data;
  if (!message || typeof message !== 'object') return;

  switch (message.type) {
    case 'montecarlo:cancel': {
      cancelledId = message.id;
      return;
    }
    case 'montecarlo:ping': {
      const reply: MonteCarloWorkerReply = { type: 'montecarlo:pong', id: message.id, at: Date.now() };
      self.postMessage(reply);
      return;
    }
    case 'montecarlo:run': {
      // A fresh run id clears any stale cancel so a previously-terminated
      // ensemble can never shadow a new one.
      cancelledId = null;
      const result = runMonteCarloChunk(
        message.request.baseInput,
        message.request.perturbations,
        message.request.nRuns,
        message.request.seed,
        message.request.chunkIndex,
        message.request.chunkSize,
      );
      if (cancelledId === message.id) return; // cancelled while computing
      const reply: MonteCarloWorkerReply = { type: 'montecarlo:chunk', id: message.id, result };
      self.postMessage(reply);
      return;
    }
  }
};