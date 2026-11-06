/**
 * Session store: UI-only state. Studio selection, unit display, viewport
 * toggles, and notifications. Never engineering content: nothing here enters
 * run keys or the project envelope. Unit choice persists in localStorage.
 */

import { create } from 'zustand';
import type { EnvironmentSelection } from '../application/candidate';
import type { UnitSystem } from '../lib/quantity';
import type { StudioId } from './project';

export type { StudioId } from './project';

const UNITS_KEY = 'astraea.units.v1';

function loadUnits(): UnitSystem {
  try {
    const raw = localStorage.getItem(UNITS_KEY);
    return raw === 'imperial' ? 'imperial' : 'metric';
  } catch {
    return 'metric';
  }
}

export type PaneRegion = 'context' | 'workspace' | 'inspector';

/** Display unit system; alias so consumers can say `Units`. */
export type Units = UnitSystem;

export type ContrastMode = 'standard' | 'more';

const CONTRAST_KEY = 'astraea.contrast.v1';

function loadContrast(): ContrastMode {
  try {
    return localStorage.getItem(CONTRAST_KEY) === 'more' ? 'more' : 'standard';
  } catch {
    return 'standard';
  }
}

interface Notice {
  id: number;
  message: string;
  tone: 'info' | 'error';
  /** ISO-8601 creation time, for the notification-history popover. */
  at: string;
}

const HISTORY_LIMIT = 50;

/** Console shells / stage ids the workstation rail selects between. */
export type ConsoleStage = 'mission' | 'airframe' | 'motor' | 'aero' | 'flight' | 'recovery' | 'verify' | 'build';

/** Confidence-mark treatment chosen in the status bar. */
export type ConfidenceStyle = 'A' | 'B';

const CONFIDENCE_KEY = 'astraea.confidence.v1';

function loadConfidenceStyle(): ConfidenceStyle {
  try {
    return localStorage.getItem(CONFIDENCE_KEY) === 'B' ? 'B' : 'A';
  } catch {
    return 'A';
  }
}

/** Patch accepted by `setConsole`: the console shell's UI-only fields. */
export interface SessionConsolePatch extends Partial<
  Pick<SessionState, 'stage' | 'selectedId' | 'hoverId' | 'scrubT' | 'leftOpen' | 'rightOpen' | 'onboarding' | 'selectedGate' | 'units' | 'confidenceStyle'>
> {}

interface SessionState {
  studio: StudioId;
  selectStudio: (studio: StudioId) => void;
  units: UnitSystem;
  setUnits: (units: UnitSystem) => void;
  contrast: ContrastMode;
  setContrast: (contrast: ContrastMode) => void;
  pane: PaneRegion;
  setPane: (pane: PaneRegion) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
  historyOpen: boolean;
  setHistoryOpen: (open: boolean) => void;
  /** Live toasts (last 5, newest last). Errors persist; info auto-dismisses. */
  notices: Notice[];
  /** Notification history: newest first, capped at 50. */
  history: Notice[];
  notify: (message: string, tone?: Notice['tone']) => void;
  dismissNotice: (id: number) => void;
  clearHistory: () => void;

  /* Console shell: stage rail, selection, panels, and the confidence style. */
  stage: ConsoleStage;
  setStage: (stage: ConsoleStage) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  hoverId: string | null;
  setHoverId: (id: string | null) => void;
  confidenceStyle: ConfidenceStyle;
  setConfidenceStyle: (style: ConfidenceStyle) => void;
  /** Flight-time cursor, seconds; null when nothing is scrubbed. */
  scrubT: number | null;
  setScrubT: (t: number | null) => void;
  leftOpen: boolean;
  setLeftOpen: (open: boolean) => void;
  rightOpen: boolean;
  setRightOpen: (open: boolean) => void;
  /** Guided-tour step, or null when the tour is closed. */
  onboarding: number | null;
  setOnboarding: (step: number | null) => void;
  selectedGate: string | null;
  setSelectedGate: (id: string | null) => void;
  /** Verify's Validation card starts closed and stays open for the session. */
  validationOpen: boolean;
  setValidationOpen: (open: boolean) => void;
  /**
   * Session-scoped E1 environment profile. Deliberately not project state: the
   * profile is a prepared atmosphere document, archived with the run that used
   * it and restored by "Load saved inputs", exactly like an imported flight log.
   */
  environmentProfile: EnvironmentSelection | null;
  setEnvironmentProfile: (profile: EnvironmentSelection | null) => void;
  /**
   * Batch setter for the console's chrome fields. `units` and
   * `confidenceStyle` persist; the rest is session-only.
   */
  setConsole: (patch: SessionConsolePatch) => void;
}

let noticeCounter = 0;

export const useSessionStore = create<SessionState>((set, get) => ({
  studio: 'airframe',
  selectStudio: (studio) => set({ studio }),
  units: loadUnits(),
  setUnits: (units) => {
    try {
      localStorage.setItem(UNITS_KEY, units);
    } catch {
      // Display preference only; a storage failure never blocks engineering work.
    }
    set({ units });
  },
  contrast: loadContrast(),
  setContrast: (contrast) => {
    try {
      localStorage.setItem(CONTRAST_KEY, contrast);
    } catch {
      // Display preference only; a storage failure never blocks engineering work.
    }
    set({ contrast });
  },
  pane: 'workspace',
  setPane: (pane) => set({ pane }),
  paletteOpen: false,
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  helpOpen: false,
  setHelpOpen: (open) => set({ helpOpen: open }),
  historyOpen: false,
  setHistoryOpen: (open) => set({ historyOpen: open }),
  notices: [],
  history: [],
  notify: (message, tone = 'info') => {
    noticeCounter += 1;
    const notice: Notice = { id: noticeCounter, message, tone, at: new Date().toISOString() };
    set({
      notices: [...get().notices.slice(-4), notice],
      history: [notice, ...get().history].slice(0, HISTORY_LIMIT),
    });
  },
  dismissNotice: (id) => set({ notices: get().notices.filter((n) => n.id !== id) }),
  clearHistory: () => set({ history: [] }),

  stage: 'airframe',
  setStage: (stage) => set({ stage }),
  selectedId: null,
  setSelectedId: (selectedId) => set({ selectedId }),
  hoverId: null,
  setHoverId: (hoverId) => set({ hoverId }),
  confidenceStyle: loadConfidenceStyle(),
  setConfidenceStyle: (confidenceStyle) => {
    try {
      localStorage.setItem(CONFIDENCE_KEY, confidenceStyle);
    } catch {
      // Display preference only.
    }
    set({ confidenceStyle });
  },
  scrubT: null,
  setScrubT: (scrubT) => set({ scrubT }),
  leftOpen: true,
  setLeftOpen: (leftOpen) => set({ leftOpen }),
  rightOpen: true,
  setRightOpen: (rightOpen) => set({ rightOpen }),
  onboarding: null,
  setOnboarding: (onboarding) => set({ onboarding }),
  selectedGate: null,
  validationOpen: false,
  setValidationOpen: (validationOpen) => set({ validationOpen }),
  environmentProfile: null,
  setEnvironmentProfile: (environmentProfile) => set({ environmentProfile }),
  setSelectedGate: (selectedGate) => set({ selectedGate }),
  setConsole: (patch) => {
    if (patch.units !== undefined) get().setUnits(patch.units);
    if (patch.confidenceStyle !== undefined) get().setConfidenceStyle(patch.confidenceStyle);
    set((state) => {
      const next = { ...patch };
      delete next.units;
      delete next.confidenceStyle;
      return { ...state, ...next };
    });
  },
}));
