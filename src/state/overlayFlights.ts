/** Project-scoped imported overlay archive; chart controls remain local UI state. */
import { create } from 'zustand';
import type { FlightLog } from '../console/evidence/SimFlightOverlay';
import { useProjectStore } from './project';

export const useOverlayFlights = create<{ logs: FlightLog[]; setLogs: (update: (logs: FlightLog[]) => FlightLog[]) => void }>((set) => ({
  logs: [],
  setLogs: (update) => set((state) => ({ logs: update(state.logs) })),
}));
useProjectStore.subscribe((state, previous) => {
  if (state.projectEpoch !== previous.projectEpoch) useOverlayFlights.setState({ logs: [] });
});
