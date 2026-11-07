import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewcube } from '@react-three/drei';
import * as THREE from 'three';
import type { RocketVehicle } from '../../core/types';
import type { MotorSpec } from '../../propulsion/motorDatabase';
import { attitudeToThree, useLayoutSnapshot, VehicleModel, type LayoutSnapshot, type Look } from './Vehicle3D';
import { vehicleBounds, type Bounds } from './appearance';
import {
  FIT_FRACTION, convexHull, envelopePoints, envelopeRadius, fitDistance, framePoints, ndcBoxToPixels, projectedBox, projectedFraction,
  projectedPoints, rotatePoints, silhouettePoints, upFor, type Rect, type Vector,
} from './framing';
import { canvasOverlayRects, VIEWCUBE_MARGIN, viewcubeRect } from './overlays';
import type { AeroModelSelection } from '../../application/aeroModel';
import { WEBGL_FALLBACK_TITLE, canUseWebGL, useWebGLLoss } from './webgl';
import { ensureViewportRenderer, releaseViewportRenderer } from './viewportRenderer';
import { C } from '../kit/theme';
import { Segmented } from '../kit/Fields';

export type ViewPreset = 'iso' | 'side' | 'top' | 'aft';

const FIT_FOV = 32;
/** Degrees the camera must turn before the orbit probe counts a change. */
const ORBIT_TURN_EPSILON = 1;

/** The four existing view directions, unchanged; only the framing is fitted. */
const DIRECTIONS: Record<'horizontal' | 'upright', Record<ViewPreset, [number, number, number]>> = {
  horizontal: { iso: [0.18, 0.32, 0.82], side: [0, 0, 1], top: [0, 1, 0.001], aft: [-1, 0, 0.001] },
  upright: { iso: [0.62, 0.2, 0.62], side: [0, 0, 1], top: [0.001, 1, 0], aft: [0.001, -1, 0] },
};

interface OrbitLike {
  object: THREE.PerspectiveCamera;
  target: THREE.Vector3;
  update: () => void;
  addEventListener?: (type: 'start' | 'change' | 'end', listener: () => void) => void;
  removeEventListener?: (type: 'start' | 'change' | 'end', listener: () => void) => void;
}

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/** Cheap equality for measured overlay rects, at the precision a layout cares about. */
function sameRects(a: readonly Rect[], b: readonly Rect[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i].x0 - b[i].x0) > 0.5 || Math.abs(a[i].y0 - b[i].y0) > 0.5
      || Math.abs(a[i].x1 - b[i].x1) > 0.5 || Math.abs(a[i].y1 - b[i].y1) > 0.5) return false;
  }
  return true;
}

/**
 * Frames the model at 80% of the canvas's limiting dimension and keeps it
 * framed while the vehicle length or the canvas size changes.
 *
 * Rule: a preset click (or the reset button) snaps to that preset's direction
 * and re-frames from scratch. A length or size change keeps the camera's
 * *current* direction — so a refit never fights a rotation — and only moves the
 * distance, preserving whatever zoom the user dialled in. No tween: every
 * change is instant, so there is no motion to reduce.
 *
 * The Flight stage draws the same model rotated by an attitude quaternion that
 * changes every frame, under a toolbar, a pose card and a scrubber. There the
 * fit uses the pose-invariant envelope (so no pose can leave the frame and the
 * distance does not pulse during playback) and the free canvas region left by
 * those overlays plus the viewcube, centring the model in it rather than in the
 * canvas.
 */
function CameraFit({ preset, nonce, bounds, points, upright, overlays, chromeReady, reserveGizmo, frame, attitude, probe }: {
  preset: ViewPreset; nonce: number; bounds: Bounds; points: readonly Vector[]; upright: boolean;
  overlays: readonly Rect[]; chromeReady: boolean;
  /** Flight also keeps the viewcube's bottom-right footprint clear. */
  reserveGizmo: boolean;
  frame: RefObject<FitFrame | null>;
  /** Live engine attitude, read without making the fit depend on the pose. */
  attitude: RefObject<{ w: number; x: number; y: number; z: number } | null>;
  probe: RefObject<HTMLDivElement | null>;
}) {
  const { camera, controls, size } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera;
    controls: OrbitLike | null;
    size: { width: number; height: number };
  };
  const lastKey = useRef<string | null>(null);
  const lastFit = useRef(0);
  const zoom = useRef(1);
  const writing = useRef(false);
  // Orbit probe: how many times, and by how much, the camera has turned outside
  // our own fits. A viewcube click animates the camera through the controls, so
  // this is what proves the cube still orients the view.
  const liveDir = useRef<THREE.Vector3 | null>(null);
  const orbitVersion = useRef(0);
  const orbitTurned = useRef(0);

  // A user zoom is measured from the orbit controls' own `change` events, against
  // the fit for the geometry on screen, and our writes are excluded with a flag.
  // A length drag has no gesture, so it can never be mistaken for a zoom: the
  // distance stays exactly the fit and does not drift. The same events drive the
  // orbit probe; a turn is only counted once it exceeds a degree, so damping
  // noise cannot fake a view change.
  useEffect(() => {
    const el = probe.current;
    if (el) {
      el.setAttribute('data-orbit-version', String(orbitVersion.current));
      el.setAttribute('data-orbit-turned', orbitTurned.current.toFixed(2));
    }
    if (!controls?.addEventListener) return;
    liveDir.current = controls.object.position.clone().sub(controls.target).normalize();
    const onChange = () => {
      const direction = controls.object.position.clone().sub(controls.target).normalize();
      const previous = liveDir.current;
      liveDir.current = direction;
      // Our own fit writes are not a user turn, but they still move the camera:
      // record the new direction first so the next real turn is measured from it.
      if (writing.current) return;
      if (previous) {
        const degrees = THREE.MathUtils.radToDeg(direction.angleTo(previous));
        if (degrees > ORBIT_TURN_EPSILON) {
          orbitVersion.current += 1;
          orbitTurned.current += degrees;
          probe.current?.setAttribute('data-orbit-version', String(orbitVersion.current));
          probe.current?.setAttribute('data-orbit-turned', orbitTurned.current.toFixed(2));
        }
      }
      if (lastFit.current <= 1e-6) return;
      const distance = controls.object.position.distanceTo(controls.target);
      zoom.current = clamp(distance / lastFit.current, 0.4, 3);
    };
    controls.addEventListener('change', onChange);
    return () => controls.removeEventListener?.('change', onChange);
  }, [controls, probe]);

  useEffect(() => {
    if (size.width <= 0 || size.height <= 0) return;
    // No layout yet (engine still starting): keep the default camera rather
    // than dividing by an empty silhouette.
    if (points.length < 2) return;
    // Flight frames the model into the free region, so it needs the chrome that
    // is actually on the canvas; measuring it takes one extra render on mount
    // and fitting before that would put the rocket under the pose card.
    if (upright && !chromeReady) return;
    const aspect = size.width / size.height;
    if (camera.aspect !== aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); }

    const key = `${preset}|${nonce}|${upright ? 'upright' : 'horizontal'}`;
    const snap = lastKey.current !== key;
    const target = new THREE.Vector3(0, upright ? bounds.halfLength : 0, 0);
    const direction = new THREE.Vector3(...DIRECTIONS[upright ? 'upright' : 'horizontal'][preset]).normalize();
    const current = camera.position.clone().sub(target);
    // Read the distance before normalising anything: the fit below needs the
    // distance the camera actually had.
    const currentDistance = current.length();
    if (!snap && currentDistance > 1e-4) direction.copy(current).normalize();

    if (snap) zoom.current = 1;
    let distance: number;
    let region: Rect = { x0: 0, y0: 0, x1: size.width, y1: size.height };
    const shift = new THREE.Vector3();
    let achieved: { x: number; y: number };
    if (upright) {
      const envelope = envelopePoints(envelopeRadius(bounds.halfLength, bounds.radius));
      // The viewcube is drawn in the HUD, not the DOM, so the measured chrome
      // cannot see it: reserve its footprint explicitly.
      const free = reserveGizmo ? [...overlays, viewcubeRect(size.width, size.height)] : overlays;
      const framed = framePoints(envelope, direction, camera.fov, size, free, FIT_FRACTION);
      lastFit.current = framed.distance;
      // The envelope's projected centre sits on the view axis, so the centring
      // shift scales linearly with the distance the user zoomed to.
      shift.set(framed.shift.x, framed.shift.y, framed.shift.z).multiplyScalar(zoom.current);
      region = framed.region;
      distance = Math.max(framed.distance * zoom.current, 1e-3);
      achieved = framed.span;
    } else {
      lastFit.current = fitDistance(points, direction, camera.fov, aspect, FIT_FRACTION);
      distance = Math.max(lastFit.current * zoom.current, 1e-3);
      achieved = projectedFraction(points, direction, camera.fov, aspect, distance);
    }

    target.add(shift);
    camera.position.copy(target).addScaledVector(direction, distance);
    camera.up.set(...upFor(direction));
    controls?.target.copy(target);
    writing.current = true;
    controls?.update();
    writing.current = false;
    lastKey.current = key;

    // The fitted camera, for the frame report and for re-projecting a new pose
    // without a refit.
    frame.current = {
      direction: { x: direction.x, y: direction.y, z: direction.z },
      distance,
      shift: { x: shift.x, y: shift.y, z: shift.z },
      fov: camera.fov,
      aspect,
      width: size.width,
      height: size.height,
    };
    const live = attitude.current;
    const scene = live ? attitudeToThree(live) : null;
    writeFrameReport(
      probe.current, frame.current, points,
      scene ? { w: scene.w, x: scene.x, y: scene.y, z: scene.z } : null,
      live ? `${live.w.toFixed(6)},${live.x.toFixed(6)},${live.y.toFixed(6)},${live.z.toFixed(6)}` : '',
    );

    // Probe hooks, next to the shell's data-layout-* attributes: the browser
    // journeys read the camera the viewport actually used.
    const el = probe.current;
    if (el) {
      el.setAttribute('data-camera-dir', `${direction.x.toFixed(4)},${direction.y.toFixed(4)},${direction.z.toFixed(4)}`);
      el.setAttribute('data-camera-distance', distance.toFixed(4));
      // The length this fit was computed for, written with the distance: a probe
      // that pairs the distance with the *rendered* length can otherwise catch
      // the one-frame gap between a commit and this effect and read a refit as
      // camera jitter.
      el.setAttribute('data-camera-length', (bounds.halfLength * 2).toFixed(4));
      el.setAttribute('data-camera-target', `${target.x.toFixed(4)},${target.y.toFixed(4)},${target.z.toFixed(4)}`);
      el.setAttribute('data-camera-fov', camera.fov.toFixed(2));
      el.setAttribute('data-camera-aspect', aspect.toFixed(4));
      el.setAttribute('data-camera-pose', upright ? 'upright' : 'horizontal');
      el.setAttribute('data-fit-fraction', Math.max(achieved.x, achieved.y).toFixed(4));
      el.setAttribute('data-safe-region', `${region.x0.toFixed(1)},${region.y0.toFixed(1)},${region.x1.toFixed(1)},${region.y1.toFixed(1)}`);
      el.setAttribute('data-viewport-size', `${size.width.toFixed(1)},${size.height.toFixed(1)}`);
    }
  }, [preset, nonce, bounds.halfLength, bounds.radius, points, upright, overlays, chromeReady, reserveGizmo, frame, attitude, camera, controls, size, size.width, size.height, probe]);

  return null;
}

/**
 * The camera the fit wrote, in the form the frame report needs. Kept in a ref so
 * a pose change can re-project the silhouette without re-running the fit (which
 * would pump the zoom while the Flight scrubber plays).
 */
interface FitFrame {
  direction: Vector; distance: number; shift: Vector;
  fov: number; aspect: number; width: number; height: number;
}

/**
 * Write the drawn rocket's screen box and silhouette for the probe. `pose` is
 * the *scene* quaternion the pose group applies (`attitudeToThree`), not the raw
 * engine quaternion: the drawn rocket is what the probe must measure.
 */
function writeFrameReport(el: HTMLElement | null, frame: FitFrame | null, points: readonly Vector[], pose: { w: number; x: number; y: number; z: number } | null, attitudeLabel: string): void {
  if (!el || !frame || points.length < 2) return;
  const posed = pose ? rotatePoints(points, pose) : points;
  const canvas = { width: frame.width, height: frame.height };
  const box = projectedBox(posed, frame.direction, frame.fov, frame.aspect, frame.distance, frame.shift);
  const px = ndcBoxToPixels(box, canvas);
  const screen = projectedPoints(posed, frame.direction, frame.fov, frame.aspect, frame.distance, frame.shift, canvas);
  const hull = convexHull(screen);
  el.setAttribute('data-rocket-bbox', `${px.x0.toFixed(1)},${px.y0.toFixed(1)},${px.x1.toFixed(1)},${px.y1.toFixed(1)}`);
  // The silhouette, not its box: a tilted rocket's axis-aligned box covers most
  // of the floor, while the hull is the drawn body itself.
  el.setAttribute('data-rocket-hull', hull.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
  el.setAttribute('data-pose-q', attitudeLabel);
}

/**
 * Re-reports the drawn rocket's screen box when the Flight pose changes. The fit
 * itself does not re-run on a pose change, so the camera is stable while the
 * scrubber plays.
 */
function RocketFrameProbe({ frame, points, attitude, probe }: {
  frame: RefObject<FitFrame | null>;
  points: readonly Vector[];
  attitude?: { w: number; x: number; y: number; z: number } | null;
  probe: RefObject<HTMLDivElement | null>;
}) {
  useEffect(() => {
    const scene = attitude ? attitudeToThree(attitude) : null;
    writeFrameReport(
      probe.current, frame.current, points,
      scene ? { w: scene.w, x: scene.x, y: scene.y, z: scene.z } : null,
      attitude ? `${attitude.w.toFixed(6)},${attitude.x.toFixed(6)},${attitude.y.toFixed(6)},${attitude.z.toFixed(6)}` : '',
    );
  }, [frame, points, attitude, attitude?.w, attitude?.x, attitude?.y, attitude?.z, probe]);
  return null;
}

function GhostVehicleModel({ vehicle, aeroModel, look }: { vehicle: RocketVehicle; aeroModel?: AeroModelSelection; look: Look }) {
  const snapshot: LayoutSnapshot | null = useLayoutSnapshot(vehicle, aeroModel);
  if (snapshot === null) return null;
  return <VehicleModel vehicle={snapshot.vehicle} layout={snapshot.layout} look={look} />;
}

export function Viewport({ vehicle, aeroModel, ghostAeroModel, motor, ghost, look, markers = false, attitude, onPick, onHover, readout, toolbar, showGhost = true, ghostOpacity, ghostLabel = 'committed run' }: {
  vehicle: RocketVehicle; aeroModel?: AeroModelSelection; ghostAeroModel?: AeroModelSelection; motor?: MotorSpec; ghost?: RocketVehicle | null; look?: Look; markers?: boolean;
  /** Pose the rocket with an engine attitude quaternion (flight scrubber). */
  attitude?: { w: number; x: number; y: number; z: number } | null;
  onPick?: (id: string) => void; onHover?: (id: string | null) => void; readout?: ReactNode; toolbar?: ReactNode; showGhost?: boolean;
  ghostOpacity?: number; ghostLabel?: string;
}) {
  const [preset, setPreset] = useState<ViewPreset>('iso');
  const [nonce, setNonce] = useState(0);
  const snapshot = useLayoutSnapshot(vehicle, aeroModel);
  const length = snapshot?.layout.length ?? 1;
  const bounds = snapshot === null ? { halfLength: 0.5, radius: 0.1 } : vehicleBounds(snapshot.vehicle, snapshot.layout);
  const upright = attitude !== undefined && attitude !== null;
  const points = useMemo(() => (snapshot === null ? [] : silhouettePoints(snapshot.vehicle, snapshot.layout, upright)), [snapshot, upright]);
  // Markers are an explicit per-view choice and always come from the breakdown
  // that produced the drawn shape, so the stale window keeps them visible and a
  // project/vehicle switch cannot carry them over.
  const shownCg = markers ? snapshot?.breakdown.cg.value : undefined;
  const shownCp = markers ? snapshot?.breakdown.cp.value : undefined;
  const layoutState = snapshot === null ? 'empty' : snapshot.vehicle === vehicle ? 'ready' : 'stale';
  const markerState = markers ? (snapshot === null ? 'waiting' : 'present') : 'off';
  const pose = useRef<THREE.Group>(null);
  const frame = useRef<FitFrame | null>(null);
  const attitudeRef = useRef(attitude ?? null);
  attitudeRef.current = attitude ?? null;
  // A missing or lost context never blocks editing: the canvas is replaced by
  // a labeled notice, and every other surface (tree, inspectors, exports) stays live.
  const shell = useRef<HTMLDivElement | null>(null);
  const canvasHost = useRef<HTMLDivElement | null>(null);
  // One renderer for the page, not one per stage mount: WebKit keeps a lost
  // context in its 16-slot active set until GC, so a new context per stage
  // eventually recycles an already-lost one. The replacement renderer is also
  // the Restore availability check: creating it is the probe, so a restore
  // spends one real context, not a throwaway context plus a replacement.
  const recoverRenderer = useCallback(() => {
    releaseViewportRenderer();
    return ensureViewportRenderer() !== null;
  }, []);
  const { lost, retry, epoch } = useWebGLLoss(shell, canUseWebGL, recoverRenderer);
  const shared = useMemo(() => (lost ? null : ensureViewportRenderer()), [lost, epoch]);
  // A shared renderer can outlive the viewport that lost it. A later stage
  // mount inherits that lost context; the probe is already satisfied, so the
  // context's own state must put the new mount on the labeled fallback instead
  // of mounting a canvas that cannot draw.
  const contextLost = shared !== null && shared.renderer.getContext().isContextLost();
  const fallback = lost || shared === null || contextLost;
  useEffect(() => {
    // Pose about mid-length so the rocket stays framed while it turns.
    if (pose.current && attitude) pose.current.quaternion.copy(attitudeToThree(attitude));
  }, [attitude]);
  // The shared canvas is not a React child (React must not destroy it when a
  // stage unmounts), so attach it to whichever viewport host is active. The
  // parent check makes a stale cleanup harmless if the next mount already
  // moved the same canvas into its own host.
  useLayoutEffect(() => {
    const host = canvasHost.current;
    if (!host || shared === null || fallback) return;
    const { canvas } = shared;
    if (canvas.parentElement !== host) host.prepend(canvas);
    return () => {
      if (canvas.parentElement === host) canvas.remove();
    };
  }, [shared, fallback]);
  // R3F still renders its own <canvas> as the event/measure element, but the
  // real pixels come from the shared renderer's canvas. Hide the contextless
  // placeholder so exactly one canvas is visible and assistive tech sees one.
  useLayoutEffect(() => {
    const host = canvasHost.current;
    if (!host || shared === null || fallback) return;
    for (const canvas of Array.from(host.querySelectorAll('canvas'))) {
      if (canvas === shared.canvas) continue;
      canvas.style.visibility = 'hidden';
      canvas.setAttribute('aria-hidden', 'true');
    }
  });

  const groundY = upright ? -0.002 : -Math.max(0.15, length * 0.12);
  const span = Math.max(length, bounds.radius * 4);

  // Chrome drawn over the canvas — the viewport's own toolbar and whatever a
  // stage floats on top (the Flight pose card and scrubber). Measured after
  // layout and re-measured when the canvas or a stage overlay changes size:
  // the Flight free region depends on it.
  const [chrome, setChrome] = useState<{ rects: Rect[]; ready: boolean }>({ rects: [], ready: false });
  useEffect(() => {
    const shellEl = shell.current;
    if (!shellEl) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      // The viewcube is painted in the HUD, so report the footprint the fit
      // reserves for it. Same helper, same numbers: the two cannot drift.
      const cube = viewcubeRect(shellEl.clientWidth, shellEl.clientHeight);
      shellEl.setAttribute('data-gizmo-rect', `${Math.round(cube.x0)},${Math.round(cube.y0)},${Math.round(cube.x1)},${Math.round(cube.y1)}`);
      const rects = canvasOverlayRects(shellEl);
      setChrome((prev) => (sameRects(prev.rects, rects) ? (prev.ready ? prev : { rects: prev.rects, ready: true }) : { rects, ready: true }));
    };
    const schedule = () => { if (frame === 0) frame = requestAnimationFrame(measure); };
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    const mo = typeof MutationObserver === 'undefined' ? null : new MutationObserver(schedule);
    if (ro) ro.observe(shellEl);
    if (mo) mo.observe(shellEl, { childList: true });
    let node: HTMLElement | null = shellEl.parentElement;
    for (let level = 0; node && level < 3; level++, node = node.parentElement) {
      ro?.observe(node);
      mo?.observe(node, { childList: true });
    }
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, [lost, upright, preset]);

  return (
    <div className="flex h-full w-full" style={{ background: 'radial-gradient(ellipse at 50% 40%, #14171B 0%, #0B0C0E 70%)' }}>
      <div ref={shell} className="relative min-w-0 flex-1" data-layout-state={layoutState} data-layout-length={snapshot?.layout.length ?? ''} data-layout-parts={snapshot === null ? '' : Object.keys(snapshot.layout.parts).length} data-markers={markerState} data-marker-cg={shownCg ?? ''} data-marker-cp={shownCp ?? ''} data-look-selected={look?.selected ?? ''} data-look-hovered={look?.hovered ?? ''}>
        <div ref={canvasHost} className="absolute inset-0">
          {!fallback && shared ? (
            <Canvas key={epoch} gl={shared.renderer} eventSource={canvasHost} style={{ position: 'absolute', inset: 0 }} camera={{ fov: FIT_FOV, near: 0.01, far: 200, position: [2, 1.5, 2] }} dpr={[1, 2]} onPointerMissed={() => onPick?.('')}
              onCreated={({ gl }) => {
                // ACES is R3F's default; pinned here so a later `flat` cannot drop it.
                gl.toneMapping = THREE.ACESFilmicToneMapping;
                gl.toneMappingExposure = 1.05;
              }}>
              <hemisphereLight args={['#CFE8FF', '#1A1D22', 0.6]} />
              <directionalLight position={[span * 0.85, (upright ? length * 0.55 : 0) + span * 0.95, span * 0.8]} intensity={2} />
              <directionalLight color="#6EE7F7" position={[-span * 0.9, span * 0.35, -span * 0.8]} intensity={1.2} />
              <directionalLight position={[-span * 0.4, -span * 0.3, span * 1.1]} intensity={0.35} />
              <Suspense fallback={null}>
                {attitude ? (
                  <group position={[0, length / 2, 0]}>
                    <group ref={pose}>
                      <group position={[0, -length / 2, 0]}>
                        {snapshot && <VehicleModel vehicle={snapshot.vehicle} layout={snapshot.layout} motor={motor} look={look} cg={shownCg} cp={shownCp} onPick={onPick} onHover={onHover} />}
                      </group>
                    </group>
                  </group>
                ) : (
                  // Lay the +Y-nose model on its side: nose toward +X, centred on the origin.
                  <group rotation={[0, 0, -Math.PI / 2]} position={[-length / 2, 0, 0]}>
                    {snapshot && <VehicleModel vehicle={snapshot.vehicle} layout={snapshot.layout} motor={motor} look={look} cg={shownCg} cp={shownCp} onPick={onPick} onHover={onHover} />}
                    {showGhost && ghost && <GhostVehicleModel vehicle={ghost} aeroModel={ghostAeroModel ?? aeroModel} look={{ ghost: true, opacity: ghostOpacity }} />}
                  </group>
                )}
              </Suspense>
              <Grid position={[0, groundY, 0]} args={[10, 10]} cellSize={0.1} cellThickness={0.5} cellColor="#1C2025" sectionSize={0.5} sectionThickness={0.8} sectionColor="#262B31" fadeDistance={length * 4 + 4} infiniteGrid />
              <OrbitControls makeDefault enableDamping dampingFactor={0.12} />
              <CameraFit preset={preset} nonce={nonce} bounds={bounds} points={points} upright={upright} overlays={chrome.rects} chromeReady={chrome.ready} reserveGizmo={upright} frame={frame} attitude={attitudeRef} probe={shell} />
              <RocketFrameProbe frame={frame} points={points} attitude={attitude} probe={shell} />
              <GizmoHelper alignment="bottom-right" margin={[VIEWCUBE_MARGIN, VIEWCUBE_MARGIN]}>
                <GizmoViewcube color="#16191D" textColor="#8B9199" strokeColor="#3D4249" hoverColor="#22414A" opacity={0.95} />
              </GizmoHelper>
            </Canvas>
          ) : (
            <div role="alert" data-webgl-fallback="true" className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
              <p className="text-[13px] font-semibold" style={{ color: C.fg }}>{WEBGL_FALLBACK_TITLE}</p>
              <p className="max-w-md text-[11.5px]" style={{ color: C.muted }}>
                No WebGL context is available. The parts tree, every inspector field, the metrics and the
                exports keep working — fix the GPU driver or the browser setting, then restore the view.
              </p>
              <button type="button" onClick={retry} className="rounded px-2.5 py-1.5 text-[11.5px]" style={{ border: `1px solid ${C.line}`, color: C.fg }}>
                Restore viewport
              </button>
            </div>
          )}
        </div>
        <div className="absolute top-2 left-2 flex items-center gap-2" data-canvas-overlay="" data-viewport-toolbar="">
          {toolbar}
          {!fallback && <Segmented size="sm" value={preset} onChange={(v) => { setPreset(v); setNonce((n) => n + 1); }} options={[{ value: 'iso', label: 'ISO' }, { value: 'side', label: 'SIDE' }, { value: 'top', label: 'NOSE' }, { value: 'aft', label: 'AFT' }]} />}
        </div>
        {!fallback && showGhost && ghost && !attitude && <div data-canvas-overlay="" className="pointer-events-none absolute bottom-2 left-3 font-geist-mono text-[11px]" style={{ color: C.changed }}>- - - ghost = {ghostLabel}</div>}
      </div>
      {readout && <div className="w-[250px] shrink-0 overflow-y-auto p-2">{readout}</div>}
    </div>
  );
}
