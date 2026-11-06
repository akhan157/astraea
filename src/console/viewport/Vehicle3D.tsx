/**
 * Derived 3D view of the parametric part tree. The axial layout comes from the
 * native `stability` assembly (per-contribution axial extents and CG), read
 * through `useStability`, or, when the selected aero model publishes no
 * component breakdown, from the native `aggregate_mass` geometry rollup. Both
 * are native and model-independent of the aerodynamics; nothing is laid out
 * from a TS mass model. Nose tip at +Y; x along the body from the tip.
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import type { RocketVehicle, RocketComponent, NoseconeComponent, TrapezoidFinSetComponent, EllipticalFinSetComponent, FreeformFinSetComponent } from '../../core/types';
import type { VehicleMassRollup } from '../../core/mass';
import type { AeroModelSelection } from '../../application/aeroModel';
import type { MotorSpec } from '../../propulsion/motorDatabase';
import type { StabilityBreakdown } from '../data/contract';
import { useStabilityOf } from '../hooks';
import { C } from '../kit/theme';
import { SEAM_COLOR, SELECTION_EMISSIVE, partTone, resolvePartAppearance, sectionJoints } from './appearance';

export interface LayoutPart { start: number; end: number; cg: number; mass: number }
export interface Layout { length: number; parts: Record<string, LayoutPart>; radiusAt: (x: number) => number; refR: number }

/** Axial layout from the native stability contributions. */
export function layoutFrom(stability: StabilityBreakdown): Layout {
  return layoutFromParts(stability.parts, stability.refDiameter);
}

/**
 * The same layout from the native geometry+mass rollup (`aggregate_mass`),
 * which no aero model owns. Used only when the selected model publishes no
 * labelled breakdown, so the drawn shape survives a model swap while the
 * CG/CP markers stay the selected model's own totals.
 */
export function layoutFromGeometry(rollup: VehicleMassRollup): Layout {
  return layoutFromParts(
    rollup.components.map((c) => ({ id: c.id, axialStart: c.axialStart, axialEnd: c.axialEnd, cg: c.globalCG, mass: c.mass })),
    rollup.referenceDiameter,
  );
}

function layoutFromParts(
  parts: ReadonlyArray<{ id: string; axialStart: number; axialEnd: number; cg: number; mass: number }>,
  refDiameter: number,
): Layout {
  const byId: Record<string, LayoutPart> = {};
  for (const p of parts) byId[p.id] = { start: p.axialStart, end: p.axialEnd, cg: p.cg, mass: p.mass };
  const length = parts.reduce((max, p) => Math.max(max, p.axialEnd), 0);
  const refR = refDiameter / 2;
  return { length: length > 0 ? length : 1, parts: byId, radiusAt: () => refR, refR };
}

/**
 * A layout paired with the vehicle and native breakdown that produced it.
 * While the next vehicle's stability is in flight, the last ready snapshot is
 * returned, so the 3D view keeps drawing the last laid-out shape instead of
 * rendering nothing on every slider step.
 */
export interface LayoutSnapshot {
  layout: Layout;
  vehicle: RocketVehicle;
  breakdown: StabilityBreakdown;
}

export function useLayoutSnapshot(vehicle: RocketVehicle, aeroModel?: AeroModelSelection): LayoutSnapshot | null {
  const { breakdown, geometry } = useStabilityOf(vehicle, aeroModel);
  const current = useMemo<LayoutSnapshot | null>(() => {
    if (breakdown === null) return null;
    // The selected model owns the markers. It owns the shape only when it
    // publishes a labelled component breakdown; otherwise the shape comes from
    // the model-independent native rollup (and stays absent until it arrives,
    // so the last ready snapshot keeps the view instead of a fake 1 m body).
    const layout = breakdown.parts.length > 0
      ? layoutFrom(breakdown)
      : geometry === null ? null : layoutFromGeometry(geometry);
    return layout === null ? null : { layout, vehicle, breakdown };
  }, [breakdown, geometry, vehicle]);
  const lastReady = useRef<LayoutSnapshot | null>(null);
  useEffect(() => {
    if (current !== null) lastReady.current = current;
  }, [current]);
  return current ?? lastReady.current;
}

/** Layout for a vehicle, from the cached native stability result (last ready layout while the next loads). */
export function useLayout(vehicle: RocketVehicle, aeroModel?: AeroModelSelection): Layout | null {
  return useLayoutSnapshot(vehicle, aeroModel)?.layout ?? null;
}

export function noseR(c: NoseconeComponent, x: number): number {
  const R = c.baseDiameter / 2, Ln = c.length, u = Math.min(Math.max(x / Ln, 0), 1);
  switch (c.shape) {
    case 'conical': return R * u;
    case 'elliptical': return R * Math.sqrt(Math.max(0, 1 - (1 - u) ** 2));
    case 'parabolic': return R * (2 * u - u * u);
    case 'vonkarman': { const th = Math.acos(1 - 2 * u); return (R / Math.sqrt(Math.PI)) * Math.sqrt(th - Math.sin(2 * th) / 2); }
    default: { const rho = (R * R + Ln * Ln) / (2 * R); return Math.sqrt(Math.max(0, rho * rho - (Ln - x) ** 2)) + R - rho; }
  }
}

export interface Look { selected?: string | null; hovered?: string | null; ghost?: boolean; xray?: boolean; changedParts?: Set<string>; opacity?: number }

export function VehicleModel({ vehicle, layout, motor, look = {}, cg, cp, onPick, onHover }: { vehicle: RocketVehicle; layout: Layout; motor?: MotorSpec; look?: Look; cg?: number; cp?: number; onPick?: (id: string) => void; onHover?: (id: string | null) => void }) {
  const L = layout.length;
  const Y = (x: number) => L - x;
  const ev = (id: string) => ({
    onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); onPick?.(id); },
    onPointerOver: (e: { stopPropagation: () => void }) => { e.stopPropagation(); onHover?.(id); },
    onPointerOut: () => onHover?.(null)
  });
  /**
   * Part colour and finish come from the design (`component.color`), then the
   * material family, then the part type — see `appearance.ts`. Selection swaps
   * the tone for the accent and dims every other part; hover only adds a low
   * emissive glow, so a hover never darkens the rest of the rocket.
   */
  const mat = (c: RocketComponent): ReactNode => {
    if (look.ghost) return <meshBasicMaterial color={C.changed} wireframe transparent opacity={look.opacity ?? 0.18} depthWrite={false} />;
    const sel = look.selected === c.id, hov = look.hovered === c.id;
    const appearance = resolvePartAppearance(c);
    const opacity = (look.opacity ?? 1) * (look.xray ? 0.28 : 1);
    const shared = {
      color: partTone(c, look),
      emissive: sel || hov ? C.accent : '#000000',
      emissiveIntensity: sel ? SELECTION_EMISSIVE : hov ? 0.14 : 0,
      metalness: appearance.metalness,
      roughness: appearance.roughness * (sel ? 0.6 : 1),
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity === 1,
      side: THREE.DoubleSide
    };
    // Clearcoat only where the material has a finish to show; matte and metal
    // parts stay on the cheaper standard shader.
    return appearance.clearcoat > 0
      ? <meshPhysicalMaterial {...shared} clearcoat={appearance.clearcoat} clearcoatRoughness={0.28} />
      : <meshStandardMaterial {...shared} />;
  };
  const seams = useMemo(() => (look.ghost ? [] : sectionJoints(vehicle, layout)), [vehicle, layout, look.ghost]);
  const seamThickness = Math.max(0.0009, layout.refR * 0.021);

  return (
    <group>
      {vehicle.components.map((c) => {
        const p = layout.parts[c.id]; if (!p) return null;
        if (c.type === 'nosecone') return <Lathe key={c.id} profile={(x) => noseR(c, x)} x0={p.start} len={c.length} Y={Y} {...ev(c.id)}>{mat(c)}</Lathe>;
        if (c.type === 'bodytube') return <mesh key={c.id} position={[0, Y((p.start + p.end) / 2), 0]} {...ev(c.id)}><cylinderGeometry args={[c.outerDiameter / 2, c.outerDiameter / 2, c.length, 64, 1, true]} />{mat(c)}</mesh>;
        if (c.type === 'transition') return <mesh key={c.id} position={[0, Y((p.start + p.end) / 2), 0]} {...ev(c.id)}><cylinderGeometry args={[c.foreDiameter / 2, c.aftDiameter / 2, c.length, 64, 1, true]} />{mat(c)}</mesh>;
        if (c.type === 'trapezoidfinset' || c.type === 'ellipticalfinset' || c.type === 'freeformfinset') return <Fins key={c.id} c={c} start={p.start} r={layout.radiusAt(p.start + 0.001)} Y={Y} ev={ev(c.id)}>{mat(c)}</Fins>;
        if (c.type === 'parachute' || c.type === 'masscomponent') {
          if (!look.xray && look.selected !== c.id && look.hovered !== c.id) return null;
          const len = c.type === 'parachute' ? c.packedLengthM ?? 0.12 : c.length;
          const rr = layout.radiusAt(p.start) * 0.72;
          return <mesh key={c.id} position={[0, Y(p.start + len / 2), 0]} {...ev(c.id)}><cylinderGeometry args={[rr, rr, Math.max(len, 0.02), 32]} /><meshBasicMaterial color={look.selected === c.id ? C.accent : c.type === 'parachute' ? C.s3 : C.s1} transparent opacity={0.45} depthWrite={false} /></mesh>;
        }
        return null;
      })}
      {/* A thin unlit ring at each section joint: where a part starts and ends. */}
      {seams.map((seam) => (
        <mesh key={`seam-${seam.station.toFixed(5)}`} position={[0, Y(seam.station), 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[seam.radius, seamThickness, 8, 96]} />
          <meshBasicMaterial color={SEAM_COLOR} />
        </mesh>
      ))}
      {motor && !look.ghost && <Motor vehicle={vehicle} lay={layout} motor={motor} Y={Y} />}
      {!look.ghost && cg !== undefined && <Marker y={Y(cg)} r={layout.refR} color={C.cg} />}
      {!look.ghost && cp !== undefined && Number.isFinite(cp) && <Marker y={Y(cp)} r={layout.refR} color={C.cp} />}
    </group>
  );
}

function Lathe({ profile, x0, len, Y, children, ...rest }: { profile: (x: number) => number; x0: number; len: number; Y: (x: number) => number; children: React.ReactNode } & Record<string, unknown>) {
  const geo = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 48; i++) { const x = (i / 48) * len; pts.push(new THREE.Vector2(Math.max(profile(x), 0.0004), Y(x0 + x))); }
    return new THREE.LatheGeometry(pts, 64);
  }, [profile, x0, len, Y]);
  return <mesh geometry={geo} {...rest}>{children}</mesh>;
}

function Fins({ c, start, r, Y, ev, children }: { c: TrapezoidFinSetComponent | EllipticalFinSetComponent | FreeformFinSetComponent; start: number; r: number; Y: (x: number) => number; ev: Record<string, unknown>; children: React.ReactNode }) {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    // Shape in (span, axial-up) coordinates, root leading edge at (0, 0), trailing edge at (0, -cr).
    if (c.type === 'freeformfinset') {
      c.points.forEach((q, i) => (i === 0 ? s.moveTo(q.y, -q.x) : s.lineTo(q.y, -q.x)));
      s.closePath();
    } else if (c.type === 'trapezoidfinset') {
      const cr = c.rootChord;
      s.moveTo(0, 0); s.lineTo(c.span, -c.sweepLength); s.lineTo(c.span, -c.sweepLength - c.tipChord); s.lineTo(0, -cr); s.lineTo(0, 0);
    } else {
      const cr = c.rootChord;
      s.moveTo(0, 0);
      for (let i = 0; i <= 32; i++) { const a = (i / 32) * Math.PI; s.lineTo(Math.sin(a) * c.span, -cr / 2 + (Math.cos(a) * cr) / 2 - cr / 2 + cr / 2); }
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: c.thickness, bevelEnabled: false });
    g.translate(r * 0.995, 0, -c.thickness / 2);
    return g;
  }, [c, r]);
  return (
    <group position={[0, Y(start), 0]}>
      {Array.from({ length: c.finCount }).map((_, i) => (
        <mesh key={i} geometry={geo} rotation={[0, (i / c.finCount) * Math.PI * 2, 0]} {...ev}>{children}</mesh>
      ))}
    </group>
  );
}

/**
 * Aft station the motor is drawn at: the end of the last motor-mount body
 * tube, else the last body tube, else the layout end. `null` means the vehicle
 * has no body tube at all. Exported so the fallback can be asserted without a
 * WebGL context.
 */
export function motorAftStation(vehicle: RocketVehicle, lay: Layout): number | null {
  const mount = [...vehicle.components].reverse().find((c) => c.type === 'bodytube' && c.isMotorMount)
    ?? [...vehicle.components].reverse().find((c) => c.type === 'bodytube');
  if (!mount) return null;
  return lay.parts[mount.id]?.end ?? lay.length;
}

function Motor({ vehicle, lay, motor, Y }: { vehicle: RocketVehicle; lay: Layout; motor: MotorSpec; Y: (x: number) => number }) {
  const aft = motorAftStation(vehicle, lay);
  if (aft === null) return null;
  const R = motor.diameter / 2;
  return (
    <group>
      <mesh position={[0, Y(aft - motor.length / 2), 0]}><cylinderGeometry args={[R, R, motor.length, 32]} /><meshStandardMaterial color="#4B5058" metalness={0.6} roughness={0.35} transparent opacity={0.35} depthWrite={false} /></mesh>
      <mesh position={[0, Y(aft + 0.02), 0]}><cylinderGeometry args={[R * 0.55, R * 0.8, 0.04, 32]} /><meshStandardMaterial color="#3F3F46" metalness={0.8} roughness={0.3} /></mesh>
    </group>
  );
}

function Marker({ y, r, color }: { y: number; r: number; color: string }) {
  return (
    <group position={[0, y, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={10}><torusGeometry args={[r * 1.4, r * 0.05, 12, 64]} /><meshBasicMaterial color={color} depthTest={false} transparent opacity={0.95} /></mesh>
      <mesh renderOrder={11}><sphereGeometry args={[r * 0.2, 20, 20]} /><meshBasicMaterial color={color} depthTest={false} /></mesh>
    </group>
  );
}

/** Body-to-nav quaternion (ENU) → three.js rotation for a +Y-nose model in a Y-up scene. */
export function attitudeToThree(q: { w: number; x: number; y: number; z: number }): THREE.Quaternion {
  const qNav = new THREE.Quaternion(q.x, q.y, q.z, q.w);
  // Nav (E, N, U) → scene (x = E, y = U, z = −N): rotate −90° about X.
  const m = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  return m.multiply(qNav);
}
