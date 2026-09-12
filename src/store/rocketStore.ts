/**
 * Astraea Vehicle State Store (Zustand)
 * Manages active rocket assembly, real-time stability analysis, viewport settings, and undo/redo history.
 */

import { create } from 'zustand';
import { RocketVehicle, RocketComponent, StabilityAnalysis } from '../core/types';
import type { MotorSpec } from '../propulsion/motorDatabase';
import { normalizeMotorId } from '../propulsion/motorDatabase';
import { computeRocketStability } from '../aero/barrowman';

export type ViewMode = 'solid' | 'wireframe' | 'xray';

export const PRESET_ESTES_ALPHA: RocketVehicle = {
  id: 'preset-estes-alpha',
  name: 'Estes Alpha III Replica',
  version: '1.0',
  author: 'Estes Industries / Astraea Preset',
  notes: 'Classic starter model rocket, high subsonic stability.',
  components: [
    {
      id: 'alpha-nc',
      name: 'Ogive Nosecone',
      type: 'nosecone',
      shape: 'ogive',
      length: 0.165,
      baseDiameter: 0.0248, // BT-50 (24.8mm)
      wallThickness: 0.0015,
      isHollow: true,
      materialId: 'pla_3dprint',
      color: '#ef4444', // Red
    },
    {
      id: 'alpha-bt',
      name: 'Main Body Tube (BT-50)',
      type: 'bodytube',
      length: 0.311, // 311 mm
      outerDiameter: 0.0248,
      innerDiameter: 0.0241,
      isMotorMount: true, // Estes C6 seats at this tube's aft end
      materialId: 'cardboard',
      color: '#ffffff',
    },
    {
      id: 'alpha-fins',
      name: 'Stabilizer Fins (3-Fin)',
      type: 'trapezoidfinset',
      finCount: 3,
      rootChord: 0.070,
      tipChord: 0.028,
      span: 0.051,
      sweepLength: 0.038,
      thickness: 0.002,
      crossSection: 'rounded',
      axialOffset: 0.241, // Near aft
      materialId: 'pla_3dprint',
      color: '#ef4444',
    },
    {
      id: 'alpha-chute',
      name: '12" Parachute',
      type: 'parachute',
      diameter: 0.305,
      cd: 0.8,
      mass: 0.008,
      axialOffset: 0.05,
      materialId: 'cardboard',
    },
  ],
};

export const PRESET_NASA_STUDENT_LAUNCH: RocketVehicle = {
  id: 'preset-nasa-sl',
  name: 'NASA Student Launch Target Vehicle',
  version: '1.0',
  author: 'University Rocketry Team',
  notes: 'High-power collegiate competition rocket (6-inch airframe, dual-deployment).',
  components: [
    {
      id: 'nsl-nc',
      name: 'Von Kármán Nosecone',
      type: 'nosecone',
      shape: 'vonkarman',
      length: 0.65,
      baseDiameter: 0.152, // 6 inches (152mm)
      wallThickness: 0.0035,
      isHollow: true,
      materialId: 'fiberglass',
      color: '#06b6d4', // Cyan
    },
    {
      id: 'nsl-bt1',
      name: 'Payload & Avionics Bay',
      type: 'bodytube',
      length: 0.75,
      outerDiameter: 0.152,
      innerDiameter: 0.145,
      materialId: 'fiberglass',
      color: '#18181b',
    },
    {
      id: 'nsl-trans',
      name: 'Airframe Transition',
      type: 'transition',
      length: 0.12,
      foreDiameter: 0.152,
      aftDiameter: 0.152,
      wallThickness: 0.003,
      isHollow: true,
      materialId: 'aluminum',
      color: '#71717a',
    },
    {
      id: 'nsl-bt2',
      name: 'Booster & Motor Section',
      type: 'bodytube',
      length: 1.45,
      outerDiameter: 0.152,
      innerDiameter: 0.145,
      isMotorMount: true, // high-power motor seats at this section's aft end
      materialId: 'fiberglass',
      color: '#18181b',
    },
    {
      id: 'nsl-fins',
      name: 'High-Power Clipped Delta Fins',
      type: 'trapezoidfinset',
      finCount: 4,
      rootChord: 0.32,
      tipChord: 0.12,
      span: 0.18,
      sweepLength: 0.18,
      thickness: 0.0048,
      crossSection: 'airfoil',
      axialOffset: 1.10,
      materialId: 'carbonfiber',
      color: '#06b6d4',
    },
    {
      id: 'nsl-drogue',
      name: 'Drogue Parachute (Apogee)',
      type: 'parachute',
      diameter: 0.60,
      cd: 1.2,
      mass: 0.18,
      axialOffset: 0.20,
      materialId: 'cardboard',
    },
    {
      id: 'nsl-main',
      name: 'Main Parachute (700ft AGL)',
      type: 'parachute',
      diameter: 2.40,
      cd: 1.5,
      mass: 0.75,
      axialOffset: 0.85,
      materialId: 'cardboard',
    },
  ],
};

export const PRESET_SPACEPORT_AMERICA: RocketVehicle = {
  id: 'preset-sac-30k',
  name: 'Spaceport America 30k Sounding Rocket',
  version: '1.0',
  author: 'Astraea Aerostructures',
  notes: 'Transonic/supersonic target altitude rocket with minimal drag fin profile.',
  components: [
    {
      id: 'sac-nc',
      name: 'Aluminum-Tip Von Kármán Nosecone',
      type: 'nosecone',
      shape: 'vonkarman',
      length: 0.70,
      baseDiameter: 0.102, // 4 inches (102mm)
      wallThickness: 0.003,
      isHollow: true,
      materialId: 'carbonfiber',
      color: '#f59e0b', // Amber
    },
    {
      id: 'sac-bt1',
      name: 'Carbon Fiber Filament Wound Fuselage',
      type: 'bodytube',
      length: 2.10,
      outerDiameter: 0.102,
      innerDiameter: 0.096,
      materialId: 'carbonfiber',
      color: '#27272a',
    },
    {
      id: 'sac-boattail',
      name: 'Aft Boattail Conical Transition',
      type: 'transition',
      length: 0.15,
      foreDiameter: 0.102,
      aftDiameter: 0.088, // 102mm down to 88mm
      wallThickness: 0.003,
      isHollow: true,
      materialId: 'aluminum',
      color: '#71717a',
    },
    {
      id: 'sac-fins',
      name: 'Supersonic Double-Wedge Fins',
      type: 'trapezoidfinset',
      finCount: 3,
      rootChord: 0.28,
      tipChord: 0.08,
      span: 0.14,
      sweepLength: 0.18,
      thickness: 0.004,
      crossSection: 'double_wedge',
      axialOffset: 1.80,
      materialId: 'aluminum',
      color: '#f59e0b',
    },
  ],
};

export const PRESETS: Record<string, RocketVehicle> = {
  estes_alpha: PRESET_ESTES_ALPHA,
  nasa_student_launch: PRESET_NASA_STUDENT_LAUNCH,
  spaceport_america: PRESET_SPACEPORT_AMERICA,
};

interface RocketStoreState {
  vehicle: RocketVehicle;
  selectedComponentId: string | null;
  /** Shared flight motor selection (FlightSimulationTab, PropulsionStudio,
   *  TrajectoryStudio all read/drive this one id). Defaults to the Estes C6. */
  selectedMotorId: string;
  customMotors: Record<string, MotorSpec>;
  /** Replace-or-insert by the NORMALIZED id: an existing record with the
   *  same normalized key is overwritten, otherwise the record is added.
   *  Never touches vehicle history. */
  upsertCustomMotor: (motor: MotorSpec) => void;
  /** Import policy wrapper over the upsert primitive: on a normalized-id
   *  collision with a DIFFERENT designation the new record's id is suffixed
   *  _2/_3/... so existing imports are never silently overwritten. Idempotent:
   *  a re-import of the identical designation replaces in place wherever it
   *  already lives (the base key or any suffixed sibling), never minting a new
   *  suffix. */
  importCustomMotor: (motor: MotorSpec) => void;
  // Shared actions
  selectMotor: (id: string) => void;
  stability: StabilityAnalysis;
  viewMode: ViewMode;
  showCG: boolean;
  showCP: boolean;
  showAxes: boolean;
  showGrid: boolean;
  showDimensions: boolean;
  cameraResetTrigger: number;
  history: RocketVehicle[];
  future: RocketVehicle[];
  updateVehicleName: (name: string) => void;
  // Actions
  selectComponent: (id: string | null) => void;
  updateComponent: (id: string, updates: Partial<RocketComponent>) => void;
  addComponent: (component: RocketComponent, index?: number) => void;
  removeComponent: (id: string) => void;
  reorderComponents: (fromIndex: number, toIndex: number) => void;
  setVehicle: (vehicle: RocketVehicle) => void;
  loadPreset: (key: string) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleCG: () => void;
  toggleCP: () => void;
  toggleAxes: () => void;
  toggleGrid: () => void;
  resetStore: () => void;
  toggleDimensions: () => void;
  resetCamera: () => void;
  undo: () => void;
  redo: () => void;
}

/**
 * Pure single-record write shared by every custom-motor action: returns the
 * next customMotors map with `motor` stored under `key` (copy semantics — the
 * stored record is a new object carrying the normalized key as its id, so
 * callers can never alias their own record into the store).
 */
function putCustomMotor(motors: Record<string, MotorSpec>, motor: MotorSpec, key: string): Record<string, MotorSpec> {
  const next = { ...motors };
  next[key] = { ...motor, id: key };
  return next;
}

export const useRocketStore = create<RocketStoreState>((set, get) => {
  const initialVehicle = PRESET_ESTES_ALPHA;
  const initialStability = computeRocketStability(initialVehicle);

  return {
    vehicle: initialVehicle,
    selectedComponentId: initialVehicle.components[0].id,
    selectedMotorId: 'estes_c6',
    customMotors: {},
    selectMotor: (id) => set({ selectedMotorId: id }),
    upsertCustomMotor: (motor) => {
      // Replace-or-insert by normalized id: same-key records are overwritten,
      // new keys are added. Registry op only — vehicle history is untouched.
      set((state) => ({
        customMotors: putCustomMotor(state.customMotors, motor, normalizeMotorId(motor.id)),
      }));
    },
    importCustomMotor: (motor) => {
      set((state) => {
        // Import policy wrapper over the upsert primitive: on a normalized-id
        // collision with a DIFFERENT designation, suffix the new motor's id
        // _2/_3/... so an existing import is never silently overwritten.
        //
        // Idempotent: scan the whole key family — the base key plus every
        // contiguous suffixed sibling the allocator could have minted — for a
        // record with the SAME designation and replace in place there. Only
        // when no designation match exists anywhere in the family do we
        // allocate a fresh suffix, so re-importing a motor that already landed
        // at key_2 replaces key_2 instead of leaking key_3.
        const key = normalizeMotorId(motor.id);
        if (key in state.customMotors) {
          for (let n = 1; ; n++) {
            const candidate = n === 1 ? key : `${key}_${n}`;
            if (!(candidate in state.customMotors)) {
              break;
            }
            if (state.customMotors[candidate].designation === motor.designation) {
              return { customMotors: putCustomMotor(state.customMotors, motor, candidate) };
            }
          }
          let n = 2;
          let candidate = `${key}_${n}`;
          while (candidate in state.customMotors) {
            n += 1;
            candidate = `${key}_${n}`;
          }
          return { customMotors: putCustomMotor(state.customMotors, motor, candidate) };
        }
        return { customMotors: putCustomMotor(state.customMotors, motor, key) };
      });
    },
    stability: initialStability,
    viewMode: 'solid',
    showCG: true,
    showCP: true,
    showAxes: true,
    showGrid: true,
    showDimensions: true,
    cameraResetTrigger: 0,
    history: [],
    future: [],

    selectComponent: (id) => set({ selectedComponentId: id }),
    updateVehicleName: (name) => {
      const state = get();
      set({ vehicle: { ...state.vehicle, name } });
    },

    updateComponent: (id, updates) => {
      const state = get();
      const newHistory = [...state.history, state.vehicle].slice(-30);

      const newComponents = state.vehicle.components.map((comp) => {
        if (comp.id !== id) return comp;
        return { ...comp, ...updates } as RocketComponent;
      });

      const updatedVehicle: RocketVehicle = {
        ...state.vehicle,
        components: newComponents,
      };

      const stability = computeRocketStability(updatedVehicle);

      set({
        vehicle: updatedVehicle,
        stability,
        history: newHistory,
        future: [],
      });
    },

    addComponent: (component, index) => {
      const state = get();
      const newHistory = [...state.history, state.vehicle].slice(-30);
      const components = [...state.vehicle.components];

      if (index !== undefined && index >= 0 && index <= components.length) {
        components.splice(index, 0, component);
      } else {
        components.push(component);
      }

      const updatedVehicle = { ...state.vehicle, components };
      const stability = computeRocketStability(updatedVehicle);

      set({
        vehicle: updatedVehicle,
        stability,
        selectedComponentId: component.id,
        history: newHistory,
        future: [],
      });
    },

    removeComponent: (id) => {
      const state = get();
      if (state.vehicle.components.length <= 1) return; // Keep at least 1 component

      const newHistory = [...state.history, state.vehicle].slice(-30);
      const components = state.vehicle.components.filter((c) => c.id !== id);
      const updatedVehicle = { ...state.vehicle, components };
      const stability = computeRocketStability(updatedVehicle);

      set({
        vehicle: updatedVehicle,
        stability,
        selectedComponentId: components[0]?.id || null,
        history: newHistory,
        future: [],
      });
    },

    reorderComponents: (fromIndex, toIndex) => {
      const state = get();
      const newHistory = [...state.history, state.vehicle].slice(-30);
      const components = [...state.vehicle.components];

      const [moved] = components.splice(fromIndex, 1);
      components.splice(toIndex, 0, moved);

      const updatedVehicle = { ...state.vehicle, components };
      const stability = computeRocketStability(updatedVehicle);

      set({
        vehicle: updatedVehicle,
        stability,
        history: newHistory,
        future: [],
      });
    },

    setVehicle: (newVehicle) => {
      const state = get();
      const newHistory = [...state.history, state.vehicle].slice(-30);
      const stability = computeRocketStability(newVehicle);

      set({
        vehicle: newVehicle,
        stability,
        selectedComponentId: newVehicle.components[0]?.id || null,
        history: newHistory,
        future: [],
        cameraResetTrigger: state.cameraResetTrigger + 1,
      });
    },

    resetStore: () => {
      const initialVehicle = PRESET_ESTES_ALPHA;
      const initialStability = computeRocketStability(initialVehicle);
      set({
        vehicle: initialVehicle,
        selectedComponentId: initialVehicle.components[0].id,
        selectedMotorId: 'estes_c6',
        stability: initialStability,
        history: [],
        future: [],
      });
    },

    loadPreset: (key) => {
      const preset = PRESETS[key];
      if (!preset) return;
      get().setVehicle(preset);
    },

    setViewMode: (mode) => set({ viewMode: mode }),
    toggleCG: () => set((s) => ({ showCG: !s.showCG })),
    toggleCP: () => set((s) => ({ showCP: !s.showCP })),
    toggleAxes: () => set((s) => ({ showAxes: !s.showAxes })),
    toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
    toggleDimensions: () => set((s) => ({ showDimensions: !s.showDimensions })),
    resetCamera: () => set((s) => ({ cameraResetTrigger: s.cameraResetTrigger + 1 })),

    undo: () => {
      const state = get();
      if (state.history.length === 0) return;

      const previous = state.history[state.history.length - 1];
      const newHistory = state.history.slice(0, -1);
      const newFuture = [state.vehicle, ...state.future];
      const stability = computeRocketStability(previous);

      set({
        vehicle: previous,
        stability,
        history: newHistory,
        future: newFuture,
      });
    },

    redo: () => {
      const state = get();
      if (state.future.length === 0) return;

      const next = state.future[0];
      const newFuture = state.future.slice(1);
      const newHistory = [...state.history, state.vehicle];
      const stability = computeRocketStability(next);

      set({
        vehicle: next,
        stability,
        history: newHistory,
        future: newFuture,
      });
    },
  };
});
