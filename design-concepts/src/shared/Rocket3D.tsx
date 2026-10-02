import { useMemo } from 'react';
import * as THREE from 'three';
import type { Design, NoseShape } from './model';
import { motorById } from './model';

export interface RocketLook {
  body: string;
  nose: string;
  fins: string;
  accent: string;
  metalness?: number;
  roughness?: number;
  wireframe?: boolean;
  opacity?: number;
  /** Color an individual part to show selection. */
  highlight?: string | null;
  highlightColor?: string;
  /** Parts to omit (feature rollback, visibility toggles). */
  hide?: string[];
  /** Section-view clipping planes. */
  clip?: THREE.Plane[];
  /** Draw silhouette edges over the shaded body (CAD "shaded with edges"). */
  edges?: string;
}

export function noseRadius(shape: NoseShape, x: number, Ln: number, R: number): number {
  const u = Math.min(Math.max(x / Ln, 0), 1);
  switch (shape) {
    case 'conical':
      return R * u;
    case 'elliptical':
      return R * Math.sqrt(Math.max(0, 1 - (1 - u) ** 2));
    case 'vonkarman': {
      const th = Math.acos(1 - 2 * u);
      return (R / Math.sqrt(Math.PI)) * Math.sqrt(th - Math.sin(2 * th) / 2);
    }
    case 'ogive':
    default: {
      const rho = (R * R + Ln * Ln) / (2 * R);
      return Math.sqrt(Math.max(0, rho * rho - (Ln - x) ** 2)) + R - rho;
    }
  }
}

/** Rocket assembly in tail-at-origin, nose-up (+Y) coordinates. */
export function RocketModel({ d, look, cg, cp, showMarkers = false }: { d: Design; look: RocketLook; cg?: number; cp?: number; showMarkers?: boolean }) {
  const R = d.diameter / 2;
  const L = d.noseLength + d.bodyLength;
  const motor = motorById(d.motorId);

  const noseGeo = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    const n = 40;
    for (let i = n; i >= 0; i--) {
      const x = (i / n) * d.noseLength;
      pts.push(new THREE.Vector2(Math.max(noseRadius(d.noseShape, x, d.noseLength, R), 0.0005), L - x));
    }
    return new THREE.LatheGeometry(pts, 64);
  }, [d.noseShape, d.noseLength, R, L]);

  const finGeo = useMemo(() => {
    const s = new THREE.Shape();
    const { finRoot: cr, finTip: ct, finSpan: sp, finSweep: sw } = d;
    s.moveTo(0, 0);
    s.lineTo(0, cr);
    s.lineTo(sp, cr - sw);
    s.lineTo(sp, Math.max(cr - sw - ct, -0.05));
    s.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: d.finThickness, bevelEnabled: false });
    g.translate(R * 0.98, 0, -d.finThickness / 2);
    return g;
  }, [d.finRoot, d.finTip, d.finSpan, d.finSweep, d.finThickness, R]);

  const mat = (color: string, part: string) => (
    <meshStandardMaterial
      color={look.highlight === part ? look.highlightColor ?? '#22d3ee' : color}
      metalness={look.metalness ?? 0.15}
      roughness={look.roughness ?? 0.45}
      wireframe={look.wireframe}
      transparent={(look.opacity ?? 1) < 1}
      opacity={look.opacity ?? 1}
      emissive={look.highlight === part ? look.highlightColor ?? '#22d3ee' : '#000000'}
      emissiveIntensity={look.highlight === part ? 0.35 : 0}
      clippingPlanes={look.clip}
      clipShadows
      side={look.clip?.length ? THREE.DoubleSide : THREE.FrontSide}
    />
  );

  const nozzleR = (motor.diameter / 1000) * 0.42;
  const show = (p: string) => !look.hide?.includes(p);
  const edge = (geo: THREE.BufferGeometry) => look.edges ? <lineSegments><edgesGeometry args={[geo, 25]} /><lineBasicMaterial color={look.edges} clippingPlanes={look.clip} /></lineSegments> : null;

  return (
    <group>
      {show('nose') && <group><mesh geometry={noseGeo} castShadow>{mat(look.nose, 'nose')}</mesh>{edge(noseGeo)}</group>}
      {show('body') && (
        <group position={[0, d.bodyLength / 2, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[R, R, d.bodyLength, 64, 1, false]} />
            {mat(look.body, 'body')}
          </mesh>
          {look.edges && <BodyEdges R={R} L={d.bodyLength} color={look.edges} clip={look.clip} />}
        </group>
      )}
      {show('band') && show('body') && (
        <mesh position={[0, d.bodyLength * 0.58, 0]}>
          <cylinderGeometry args={[R * 1.004, R * 1.004, 0.035, 64, 1, true]} />
          {mat(look.accent, 'band')}
        </mesh>
      )}
      {show('fins') && Array.from({ length: d.finCount }).map((_, i) => (
        <group key={i} rotation={[0, (i / d.finCount) * Math.PI * 2, 0]}>
          <mesh geometry={finGeo} castShadow>{mat(look.fins, 'fins')}</mesh>
          {edge(finGeo)}
        </group>
      ))}
      {show('motor') && <mesh position={[0, -0.03, 0]}>
        <cylinderGeometry args={[nozzleR * 0.8, nozzleR, 0.06, 32]} />
        <meshStandardMaterial color="#3f3f46" metalness={0.8} roughness={0.3} wireframe={look.wireframe} />
      </mesh>}
      {showMarkers && cg !== undefined && <Marker y={L - cg} r={R} color="#38bdf8" />}
      {showMarkers && cp !== undefined && <Marker y={L - cp} r={R} color="#f43f5e" />}
    </group>
  );
}

function Marker({ y, r, color }: { y: number; r: number; color: string }) {
  return (
    <group position={[0, y, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={10}>
        <torusGeometry args={[r * 1.35, r * 0.06, 12, 64]} />
        <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.95} />
      </mesh>
      <mesh renderOrder={11}>
        <sphereGeometry args={[r * 0.22, 24, 24]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
    </group>
  );
}

function BodyEdges({ R, L, color, clip }: { R: number; L: number; color: string; clip?: THREE.Plane[] }) {
  const geo = useMemo(() => {
    const pts: number[] = [];
    for (const y of [-L / 2, L / 2]) for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2, b = ((i + 1) / 64) * Math.PI * 2;
      pts.push(Math.cos(a) * R, y, Math.sin(a) * R, Math.cos(b) * R, y, Math.sin(b) * R);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [R, L]);
  return <lineSegments geometry={geo}><lineBasicMaterial color={color} clippingPlanes={clip} /></lineSegments>;
}
