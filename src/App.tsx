/**
 * Astraea root: the Console workstation, mounted over the unified app state.
 *
 * Import (a drop anywhere, or the TopBar project menu) is one seam in
 * `state/projectIo` over `src/io/files.ts`, so every entry point discloses its
 * outcome through the same inline `role="alert"` banner — never a modal.
 * Routine simulation runs live in the Flight stage; the WebAssembly engine is
 * the only compute path and fails closed where it cannot run, which the
 * engine notice states up front. The desktop app also offers updates.
 */
import React from 'react';
import Workstation from './console/Workstation';
import { BrowserPreviewBanner, ImportReportBanner } from './console/shell/ProjectChrome';
import { UpdateBanner } from './desktop/UpdateBanner';

export const App: React.FC = () => (
  <div className="flex flex-col h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 relative">
    <UpdateBanner />
    <BrowserPreviewBanner />
    <ImportReportBanner />
    <Workstation />
  </div>
);
