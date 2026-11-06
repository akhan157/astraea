/**
 * Backend status: the WebAssembly engine plus network. The bridge fails
 * closed without the engine; these predicates let studios render honest
 * offline states instead of attempting calls that cannot succeed.
 */
import { engineAvailable } from '../engine';

/** True when the engine can run here (WebAssembly workers, or a test engine). */
export function isEngineAvailable(): boolean {
  return engineAvailable();
}

/** True when the browser reports an online network link. */
export function isNetworkOnline(): boolean {
  try {
    return navigator.onLine !== false;
  } catch {
    return true;
  }
}
