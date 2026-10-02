import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { AnimatePresence, motion, useSpring, useTransform } from 'motion/react';
import { Slider } from 'radix-ui';
import { Toaster, toast } from 'sonner';
import { Sparkles, Check, ChevronRight, ChevronLeft, RotateCcw, Rocket, Wind as WindIcon, X, ArrowRight } from 'lucide-react';
import { useDesignStore, useEngineering } from '../../shared/store';
import { MOTORS, simulate, motorById, thrustAt, type Design, type NoseShape, type SimResult } from '../../shared/model';
import { RocketModel, noseRadius } from '../../shared/Rocket3D';
import { cn, fmt, ft } from '../../shared/format';
import { suggest } from './solve';

/* Dusk over the desert range: deep twilight, ember horizon. */
const K = { night: '#0A0E1F', dusk: '#1D1A3A', ember: '#FF7A3D', emberSoft: '#FFB38A', sand: '#F5EFE6', glass: 'rgba(16,18,36,0.62)', stroke: 'rgba(255,255,255,0.09)', muted: 'rgba(245,239,230,0.6)', good: '#7EE2A8', warn: '#FFC266', bad: '#FF7A8A' };

type Step = 'goal' | 'shape' | 'power' | 'fly' | 'recover' | 'review';
const STEPS: { id: Step; label: string; hint: string }[] = [
  { id: 'goal', label: 'Goal', hint: 'Where are you flying?' },
  { id: 'shape', label: 'Shape', hint: 'Body, nose and fins' },
  { id: 'power', label: 'Power', hint: 'Pick a motor' },
  { id: 'fly', label: 'Fly', hint: 'Launch conditions' },
  { id: 'recover', label: 'Recover', hint: 'Parachutes' },
  { id: 'review', label: 'Review', hint: 'Ready to build?' }
];

export default function Launch() {
  const eng = useEngineering();
  const [step, setStep] = useState<Step>('goal');
  const [flight, setFlight] = useState<{ phase: 'idle' | 'count' | 'flying' | 'done'; count: number }>({ phase: 'idle', count: 3 });
  const [hud, setHud] = useState({ t: 0, h: 0, v: 0, mach: 0 });
  const [copilot, setCopilot] = useState(() => typeof window === 'undefined' || window.innerWidth >= 768);
  const idx = STEPS.findIndex((s) => s.id === step);
  const flightRef = useRef<SimResult | null>(null);

  const launch = () => {
    flightRef.current = simulate(eng.design);
    setStep('fly');
    setFlight({ phase: 'count', count: 3 });
    let c = 3;
    const iv = setInterval(() => {
      c--;
      if (c > 0) setFlight({ phase: 'count', count: c });
      else { clearInterval(iv); setFlight({ phase: 'flying', count: 0 }); }
    }, 700);
  };
  const reset = () => { setFlight({ phase: 'idle', count: 3 }); setHud({ t: 0, h: 0, v: 0, mach: 0 }); };

  const skyT = Math.min(1, hud.h / 3000);

  return (
    <div className="relative h-full overflow-hidden font-figtree" style={{ color: K.sand, background: K.night }}>
      {/* sky */}
      <div className="absolute inset-0 transition-[background] duration-300" style={{ background: `linear-gradient(180deg, ${mix('#141433', '#03040A', skyT)} 0%, ${mix('#2E2552', '#0A0B1E', skyT)} 46%, ${mix('#B5583A', '#1A1530', skyT)} 72%, ${mix('#F2A066', '#2A1E3A', skyT)} 84%)` }} />
      <div className="absolute inset-0">
        <Canvas camera={{ position: [4.6, 1.1, 8.2], fov: 36 }} dpr={[1, 2]} gl={{ alpha: true, antialias: true }}>
          <Suspense fallback={null}>
            <Scene d={eng.design} flight={flight.phase} sim={flightRef.current} onHud={setHud} onDone={() => { setFlight({ phase: 'done', count: 0 }); }} />
          </Suspense>
        </Canvas>
      </div>

      {/* top bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4 sm:p-5">
        <div className="pointer-events-auto flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-2xl" style={{ background: K.ember }}><Rocket size={19} className="text-[#1B0E05]" /></div>
          <div className="leading-tight">
            <div className="font-unbounded text-[15px] font-semibold tracking-tight">{eng.design.name}</div>
            <div className="text-[12px]" style={{ color: K.muted }}>Spaceport America Cup · draft</div>
          </div>
        </div>
        <LiveStats />
      </header>

      {/* journey */}
      <nav className="absolute top-1/2 left-4 hidden -translate-y-1/2 flex-col gap-1 lg:flex" aria-label="Steps">
        {STEPS.map((s, i) => (
          <button key={s.id} onClick={() => setStep(s.id)} className="group flex items-center gap-3 rounded-2xl py-2 pr-4 pl-2 text-left transition-colors hover:bg-white/5" aria-current={step === s.id}>
            <span className={cn('grid size-8 place-items-center rounded-full border text-[12px] font-semibold transition-all', i < idx ? 'border-transparent' : '')} style={{ borderColor: step === s.id ? K.ember : i < idx ? 'transparent' : K.stroke, background: i < idx ? 'rgba(255,122,61,.2)' : step === s.id ? 'rgba(255,122,61,.12)' : 'transparent', color: i <= idx ? K.ember : K.muted }}>
              {i < idx ? <Check size={14} /> : i + 1}
            </span>
            <span>
              <span className="block text-[14px] font-semibold" style={{ color: step === s.id ? K.sand : K.muted }}>{s.label}</span>
              <span className="block text-[11.5px]" style={{ color: 'rgba(245,239,230,.4)' }}>{s.hint}</span>
            </span>
          </button>
        ))}
      </nav>

      {/* step card */}
      <AnimatePresence mode="wait">
        {flight.phase === 'idle' && (
          <motion.section
            key={step}
            initial={{ opacity: 0, y: 24, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
            transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
            className="absolute inset-x-3 bottom-16 mx-auto max-w-[620px] rounded-[28px] border p-5 backdrop-blur-2xl sm:bottom-20 sm:p-6 lg:right-auto lg:left-1/2 lg:w-[620px] lg:-translate-x-1/2"
            style={{ background: K.glass, borderColor: K.stroke, boxShadow: '0 30px 80px -30px rgba(0,0,0,.6)' }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-[11.5px] font-semibold tracking-[0.14em] uppercase" style={{ color: K.ember }}>Step {idx + 1} of 6</div>
                <h2 className="mt-1 font-unbounded text-[20px] leading-tight font-semibold tracking-tight sm:text-[22px]">{STEP_TITLES[step]}</h2>
              </div>
              <div className="flex gap-1.5">
                <button disabled={idx === 0} onClick={() => setStep(STEPS[idx - 1].id)} className="grid size-9 place-items-center rounded-full border disabled:opacity-30" style={{ borderColor: K.stroke }} aria-label="Back"><ChevronLeft size={16} /></button>
                {idx < STEPS.length - 1 && <button onClick={() => setStep(STEPS[idx + 1].id)} className="flex h-9 items-center gap-1 rounded-full pr-3 pl-4 text-[13px] font-semibold text-[#1B0E05]" style={{ background: K.sand }}>Next <ChevronRight size={15} /></button>}
              </div>
            </div>
            {step === 'goal' && <GoalStep />}
            {step === 'shape' && <ShapeStep />}
            {step === 'power' && <PowerStep />}
            {step === 'fly' && <FlyStep onLaunch={launch} />}
            {step === 'recover' && <RecoverStep />}
            {step === 'review' && <ReviewStep onLaunch={launch} />}
          </motion.section>
        )}
      </AnimatePresence>

      {/* flight overlay */}
      <AnimatePresence>
        {flight.phase === 'count' && (
          <motion.div key={flight.count} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} className="pointer-events-none absolute inset-0 grid place-items-center font-unbounded text-[120px] font-bold" style={{ color: K.sand, textShadow: '0 0 60px rgba(255,122,61,.6)' }}>
            {flight.count}
          </motion.div>
        )}
      </AnimatePresence>
      {(flight.phase === 'flying' || flight.phase === 'done') && <FlightHud hud={hud} target={eng.design.targetApogee} />}
      <AnimatePresence>
        {flight.phase === 'done' && flightRef.current && <ResultCard r={flightRef.current} d={eng.design} onReset={reset} onImprove={() => { reset(); setCopilot(true); }} />}
      </AnimatePresence>

      {/* copilot */}
      {flight.phase === 'idle' && <Copilot open={copilot} setOpen={setCopilot} />}
      <Toaster position="top-center" toastOptions={{ style: { background: 'rgba(16,18,36,.9)', color: K.sand, border: `1px solid ${K.stroke}`, borderRadius: 16, fontFamily: 'Figtree', backdropFilter: 'blur(12px)' } }} />
    </div>
  );
}

const STEP_TITLES: Record<Step, string> = {
  goal: 'What are you aiming for?',
  shape: 'Shape your rocket',
  power: 'Choose your motor',
  fly: 'Set the launch conditions',
  recover: 'Bring it home safely',
  review: 'Pre-flight review'
};

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => [(s >> 16) & 255, (s >> 8) & 255, s & 255];
  const [r1, g1, b1] = ch(pa), [r2, g2, b2] = ch(pb);
  return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`;
}

/* ───────────────────────── 3D scene ───────────────────────── */

const ALT_SCALE = 0.06;

function Scene({ d, flight, sim, onHud, onDone }: { d: Design; flight: 'idle' | 'count' | 'flying' | 'done'; sim: SimResult | null; onHud: (h: { t: number; h: number; v: number; mach: number }) => void; onDone: () => void }) {
  const rocket = useRef<THREE.Group>(null);
  const plume = useRef<THREE.Mesh>(null);
  const chute = useRef<THREE.Group>(null);
  const trail = useRef<THREE.Points>(null);
  const controls = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const t = useRef(0);
  const lastHud = useRef(0);
  const trailPos = useMemo(() => new Float32Array(600 * 3), []);
  const trailCount = useRef(0);
  const { camera } = useThree();
  const m = motorById(d.motorId);
  const maxThrust = useMemo(() => Math.max(...Array.from({ length: 50 }, (_, i) => thrustAt(m, (i / 49) * m.burn))), [m]);

  useEffect(() => {
    if (flight === 'idle') {
      t.current = 0; trailCount.current = 0;
      if (rocket.current) rocket.current.position.set(0, 0.25, 0);
      camera.position.set(4.6, 1.1, 8.2);
      controls.current?.target.set(0, 0.35, 0);
    }
  }, [flight, camera]);

  useFrame((state, dt) => {
    const g = rocket.current; if (!g) return;
    if (flight === 'flying' && sim) {
      t.current += dt * (t.current < 3 ? 1.2 : 3.2);
      const s = sim.series;
      let i = s.findIndex((p) => p.t >= t.current);
      if (i < 0 || t.current >= sim.tApogee) { i = s.findIndex((p) => p.t >= sim.tApogee) - 1; onHud({ t: sim.tApogee, h: sim.apogee, v: 0, mach: 0 }); onDone(); }
      const p = s[Math.max(0, i)];
      g.position.y = 0.25 + p.h * ALT_SCALE;
      g.position.x = p.x * ALT_SCALE;
      g.rotation.z = -(d.launchAngle * Math.PI) / 180;
      const F = thrustAt(m, t.current);
      if (plume.current) {
        const k = F / maxThrust;
        plume.current.visible = F > 0;
        plume.current.scale.set(0.8 + k * 0.4 + Math.random() * 0.1, 0.6 + k * 1.6 + Math.random() * 0.25, 0.8 + k * 0.4);
      }
      if (trail.current && trailCount.current < 600 && state.clock.elapsedTime - lastHud.current > 0.02) {
        const n = trailCount.current++;
        trailPos[n * 3] = g.position.x + (Math.random() - 0.5) * 0.08; trailPos[n * 3 + 1] = g.position.y - 0.1; trailPos[n * 3 + 2] = (Math.random() - 0.5) * 0.08;
        trail.current.geometry.setDrawRange(0, trailCount.current);
        trail.current.geometry.attributes.position.needsUpdate = true;
      }
      if (state.clock.elapsedTime - lastHud.current > 0.06) { lastHud.current = state.clock.elapsedTime; onHud({ t: t.current, h: p.h, v: p.v, mach: p.mach }); }
      // camera chase
      const look = new THREE.Vector3(g.position.x, g.position.y + 1.0, 0);
      camera.position.set(g.position.x + 3.4 + Math.min(4, t.current * 0.3), g.position.y - 0.6, 6.2 + Math.min(4, t.current * 0.3));
      camera.lookAt(look);
      controls.current?.target.copy(look);
    } else if (plume.current) plume.current.visible = flight === 'count' && Math.random() > 0.5;
    if (chute.current) {
      chute.current.visible = flight === 'done';
      if (flight === 'done') chute.current.scale.lerp(new THREE.Vector3(1, 1, 1), 0.08); else chute.current.scale.set(0.01, 0.01, 0.01);
    }
  });

  return (
    <>
      <ambientLight intensity={0.45} color="#C9C2FF" />
      <directionalLight position={[-6, 3, 4]} intensity={1.9} color="#FFB38A" />
      <directionalLight position={[4, 6, -3]} intensity={0.6} color="#8EA2FF" />
      <Stars radius={120} depth={40} count={2200} factor={3} fade speed={0.4} />
      <group ref={rocket} position={[0, 0.25, 0]}>
        <RocketModel d={d} look={{ body: '#F5EFE6', nose: '#FF7A3D', fins: '#FF7A3D', accent: '#1B1A2E', roughness: 0.42, metalness: 0.15 }} />
        <mesh ref={plume} position={[0, -0.32, 0]} rotation={[Math.PI, 0, 0]} visible={false}>
          <coneGeometry args={[d.diameter * 0.45, 0.6, 24, 1, true]} />
          <meshBasicMaterial color="#FFB547" transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        <pointLight position={[0, -0.4, 0]} intensity={flight === 'flying' ? 6 : 0} color="#FF9A3D" distance={6} />
        <group ref={chute} position={[0, d.noseLength + d.bodyLength + 0.9, 0]} visible={false}>
          <mesh><sphereGeometry args={[0.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#FF7A3D" side={THREE.DoubleSide} /></mesh>
        </group>
      </group>
      <points ref={trail}>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[trailPos, 3]} /></bufferGeometry>
        <pointsMaterial color="#E8E2F0" size={0.16} transparent opacity={0.35} depthWrite={false} />
      </points>
      {/* pad + rail */}
      <mesh position={[0.09, d.railLength * 0.3, 0]} rotation={[0, 0, -(d.launchAngle * Math.PI) / 180]}><boxGeometry args={[0.03, d.railLength * 0.6, 0.03]} /><meshStandardMaterial color="#2A2840" metalness={0.6} roughness={0.4} /></mesh>
      <mesh position={[0, 0.05, 0]}><cylinderGeometry args={[0.6, 0.7, 0.1, 6]} /><meshStandardMaterial color="#2A2840" /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}><circleGeometry args={[80, 64]} /><meshStandardMaterial color="#3B2A35" roughness={1} /></mesh>
      <Mountains />
      <OrbitControls ref={controls} makeDefault target={[0, 0.35, 0]} enablePan={false} minDistance={2.5} maxDistance={14} maxPolarAngle={Math.PI / 2.05} enabled={flight === 'idle' || flight === 'done'} />
    </>
  );
}

function Mountains() {
  const peaks = useMemo(() => Array.from({ length: 22 }, (_, i) => { const a = (i / 22) * Math.PI * 2 + 0.3; const r = 70 + (i % 3) * 8; return { x: Math.cos(a) * r, z: Math.sin(a) * r, h: 3 + ((i * 37) % 6), w: 12 + ((i * 13) % 8) }; }), []);
  return <>{peaks.map((p, i) => <mesh key={i} position={[p.x, p.h / 2, p.z]}><coneGeometry args={[p.w, p.h, 4]} /><meshStandardMaterial color="#2B2343" flatShading /></mesh>)}</>;
}

/* ───────────────────────── live stats ───────────────────────── */

function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const s = useSpring(value, { stiffness: 140, damping: 22 });
  const txt = useTransform(s, (v) => format(v));
  useEffect(() => { s.set(value); }, [value, s]);
  return <motion.span>{txt}</motion.span>;
}

function LiveStats() {
  const { design: d, a, r } = useEngineering();
  const stabOk = a.stability >= 1.5 && a.stability <= 3;
  const apErr = (r.apogee - d.targetApogee) / d.targetApogee;
  const apOk = Math.abs(apErr) <= 0.05;
  return (
    <div className="pointer-events-auto flex gap-2">
      <Gauge label="Stability" value={a.stability} min={0} max={5} lo={1.5} hi={3} unit="cal" ok={stabOk} />
      <div className="hidden w-48 rounded-2xl border px-4 py-2.5 backdrop-blur-xl sm:block" style={{ background: K.glass, borderColor: K.stroke }}>
        <div className="flex items-baseline justify-between text-[11.5px]" style={{ color: K.muted }}><span>Apogee</span><span style={{ color: apOk ? K.good : K.warn }}>{apErr >= 0 ? '+' : ''}{(apErr * 100).toFixed(1)}%</span></div>
        <div className="tnum font-unbounded text-[19px] font-semibold"><AnimatedNumber value={ft(r.apogee)} format={(v) => fmt(v)} /> <span className="text-[11px] font-normal" style={{ color: K.muted }}>ft</span></div>
        <div className="relative mt-1.5 h-1.5 rounded-full bg-white/10">
          <span className="absolute inset-y-0 rounded-full" style={{ left: '40%', width: '20%', background: 'rgba(126,226,168,.25)' }} />
          <motion.span className="absolute -top-0.5 size-2.5 -translate-x-1/2 rounded-full border-2" style={{ borderColor: K.night, background: apOk ? K.good : K.warn }} animate={{ left: `${Math.max(2, Math.min(98, 50 + apErr * 200))}%` }} />
        </div>
      </div>
    </div>
  );
}

function Gauge({ label, value, min, max, lo, hi, unit, ok }: { label: string; value: number; min: number; max: number; lo: number; hi: number; unit: string; ok: boolean }) {
  const ang = (v: number) => Math.PI * (1 - (Math.min(max, Math.max(min, v)) - min) / (max - min));
  const pt = (v: number, r: number) => [40 + Math.cos(ang(v)) * r, 40 - Math.sin(ang(v)) * r];
  const arc = (a: number, b: number, r: number) => { const [x1, y1] = pt(a, r), [x2, y2] = pt(b, r); return `M${x1},${y1} A${r},${r} 0 0,1 ${x2},${y2}`; };
  const [nx, ny] = pt(value, 26);
  return (
    <div className="flex items-center gap-2 rounded-2xl border py-1.5 pr-4 pl-2 backdrop-blur-xl" style={{ background: K.glass, borderColor: K.stroke }}>
      <svg width="64" height="40" viewBox="4 6 72 40" aria-hidden>
        <path d={arc(min, max, 30)} stroke="rgba(255,255,255,.12)" strokeWidth={6} fill="none" strokeLinecap="round" />
        <path d={arc(lo, hi, 30)} stroke="rgba(126,226,168,.55)" strokeWidth={6} fill="none" />
        <motion.line x1={40} y1={40} animate={{ x2: nx, y2: ny }} stroke={ok ? K.good : K.warn} strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={40} cy={40} r={3} fill={K.sand} />
      </svg>
      <div>
        <div className="text-[11.5px]" style={{ color: K.muted }}>{label}</div>
        <div className="tnum font-unbounded text-[17px] font-semibold"><AnimatedNumber value={value} format={(v) => v.toFixed(2)} /> <span className="text-[11px] font-normal" style={{ color: K.muted }}>{unit}</span></div>
      </div>
    </div>
  );
}

/* ───────────────────────── steps ───────────────────────── */

function Big({ label, value, onChange, min, max, step, format }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; format: (v: number) => ReactNode }) {
  return (
    <div className="py-2">
      <div className="mb-2.5 flex items-baseline justify-between"><span className="text-[13.5px]" style={{ color: K.muted }}>{label}</span><span className="tnum text-[15px] font-semibold">{format(value)}</span></div>
      <Slider.Root className="rs-root" style={{ height: 24 }} value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} aria-label={label}>
        <Slider.Track className="rs-track" style={{ height: 6, background: 'rgba(255,255,255,.1)' }}><Slider.Range className="rs-range" style={{ background: `linear-gradient(90deg, ${K.emberSoft}, ${K.ember})` }} /></Slider.Track>
        <Slider.Thumb className="rs-thumb outline-none focus-visible:ring-4 focus-visible:ring-[#FF7A3D]/40" style={{ width: 22, height: 22, background: K.sand, boxShadow: '0 4px 14px rgba(0,0,0,.4)' }} />
      </Slider.Root>
    </div>
  );
}

function Choice({ active, onClick, children, className }: { active: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button onClick={onClick} className={cn('relative rounded-2xl border p-3 text-left transition-all', className)} style={{ borderColor: active ? K.ember : K.stroke, background: active ? 'rgba(255,122,61,.1)' : 'rgba(255,255,255,.03)' }}>
      {active && <motion.span layoutId="choice-check" className="absolute top-2.5 right-2.5 grid size-5 place-items-center rounded-full" style={{ background: K.ember }}><Check size={12} className="text-[#1B0E05]" /></motion.span>}
      {children}
    </button>
  );
}

function GoalStep() {
  const d = useDesignStore((s) => s.design);
  const set = useDesignStore((s) => s.set);
  const goals = [
    { h: 1372, name: 'NASA Student Launch', sub: '4,500 ft · reusable vehicle', bar: 0.18 },
    { h: 3048, name: 'SA Cup · 10k', sub: '10,000 ft · commercial motor', bar: 0.4 },
    { h: 9144, name: 'SA Cup · 30k', sub: '30,000 ft · student motor', bar: 1 }
  ];
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {goals.map((g) => (
          <Choice key={g.h} active={d.targetApogee === g.h} onClick={() => set({ targetApogee: g.h })}>
            <div className="mb-3 flex h-16 items-end"><motion.div className="w-3 rounded-t-full" initial={false} animate={{ height: `${g.bar * 100}%` }} style={{ background: `linear-gradient(0deg, ${K.ember}, transparent)` }} /></div>
            <div className="text-[13.5px] leading-tight font-semibold">{g.name}</div>
            <div className="mt-0.5 text-[11.5px]" style={{ color: K.muted }}>{g.sub}</div>
          </Choice>
        ))}
      </div>
      <Big label="Payload" value={d.payload} onChange={(v) => set({ payload: v })} min={0} max={8} step={0.1} format={(v) => `${v.toFixed(1)} kg`} />
    </div>
  );
}

const FIN_PRESETS: { name: string; p: Partial<Design> }[] = [
  { name: 'Clipped delta', p: { finRoot: 0.26, finTip: 0.06, finSweep: 0.2 } },
  { name: 'Trapezoid', p: { finRoot: 0.24, finTip: 0.12, finSweep: 0.08 } },
  { name: 'Swept', p: { finRoot: 0.24, finTip: 0.08, finSweep: 0.13 } },
  { name: 'Raked', p: { finRoot: 0.2, finTip: 0.14, finSweep: 0.2 } }
];

function ShapeStep() {
  const d = useDesignStore((s) => s.design);
  const set = useDesignStore((s) => s.set);
  return (
    <div>
      <div className="mb-1 text-[12.5px]" style={{ color: K.muted }}>Nose</div>
      <div className="grid grid-cols-4 gap-2">
        {(['ogive', 'vonkarman', 'conical', 'elliptical'] as NoseShape[]).map((s) => (
          <Choice key={s} active={d.noseShape === s} onClick={() => set({ noseShape: s })} className="p-2.5">
            <NoseGlyph shape={s} />
            <div className="mt-1 text-[12px] font-semibold">{{ ogive: 'Ogive', vonkarman: 'Von Kármán', conical: 'Cone', elliptical: 'Round' }[s]}</div>
          </Choice>
        ))}
      </div>
      <div className="mt-3 mb-1 text-[12.5px]" style={{ color: K.muted }}>Fins</div>
      <div className="grid grid-cols-4 gap-2">
        {FIN_PRESETS.map((f) => {
          const active = d.finRoot === f.p.finRoot && d.finTip === f.p.finTip && d.finSweep === f.p.finSweep;
          return (
            <Choice key={f.name} active={active} onClick={() => set(f.p)} className="p-2.5">
              <svg viewBox="0 0 40 24" className="h-7 w-full" aria-hidden><polygon points={`2,22 ${2 + f.p.finSweep! * 100},4 ${2 + (f.p.finSweep! + f.p.finTip!) * 100},4 ${2 + f.p.finRoot! * 100},22`} fill={active ? K.ember : 'rgba(245,239,230,.5)'} /></svg>
              <div className="mt-1 text-[12px] font-semibold">{f.name}</div>
            </Choice>
          );
        })}
      </div>
      <Big label="Fin size" value={d.finSpan} onChange={(v) => set({ finSpan: v })} min={0.05} max={0.22} step={0.001} format={(v) => `${Math.round(v * 1000)} mm`} />
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className="mr-1 text-[12.5px]" style={{ color: K.muted }}>Airframe</span>
        {[[0.098, '98 mm'], [0.13, '130 mm'], [0.156, '156 mm']].map(([v, l]) => (
          <button key={l as string} onClick={() => set({ diameter: v as number })} className="rounded-full border px-3 py-1 text-[12.5px]" style={{ borderColor: d.diameter === v ? K.ember : K.stroke, background: d.diameter === v ? 'rgba(255,122,61,.12)' : 'transparent' }}>{l}</button>
        ))}
      </div>
    </div>
  );
}

function NoseGlyph({ shape }: { shape: NoseShape }) {
  const pts = Array.from({ length: 16 }, (_, i) => { const x = (i / 15) * 30; return [x, noseRadius(shape, x, 30, 9)]; });
  const p = `M${pts.map(([x, r]) => `${10 - r},${32 - x}`).join(' L')} L${pts.slice().reverse().map(([x, r]) => `${10 + r},${32 - x}`).join(' L')}Z`;
  return <svg viewBox="0 0 20 34" className="h-9 w-full" aria-hidden><path d={p} fill="rgba(245,239,230,.85)" /></svg>;
}

function PowerStep() {
  const d = useDesignStore((s) => s.design);
  const set = useDesignStore((s) => s.set);
  const preds = useMemo(() => MOTORS.map((m) => ({ m, ap: simulate({ ...d, motorId: m.id }).apogee })), [d]);
  const best = preds.reduce((b, x) => (Math.abs(x.ap - d.targetApogee) < Math.abs(b.ap - d.targetApogee) ? x : b));
  return (
    <div>
      <p className="mb-3 text-[13px]" style={{ color: K.muted }}>Predicted apogee is computed for your rocket with each motor. The best match for {fmt(ft(d.targetApogee))} ft is highlighted.</p>
      <div className="no-scrollbar -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
        {preds.map(({ m, ap }) => {
          const err = (ap - d.targetApogee) / d.targetApogee;
          return (
            <Choice key={m.id} active={d.motorId === m.id} onClick={() => set({ motorId: m.id })} className="w-36 shrink-0 snap-start">
              {best.m.id === m.id && <span className="absolute -top-2 left-3 rounded-full px-2 py-0.5 text-[10px] font-bold text-[#0E2016]" style={{ background: K.good }}>Best match</span>}
              <div className="font-unbounded text-[34px] leading-none font-bold" style={{ color: d.motorId === m.id ? K.ember : 'rgba(245,239,230,.85)' }}>{m.cls}</div>
              <div className="mt-2 text-[13px] font-semibold">{m.name}</div>
              <div className="text-[11.5px]" style={{ color: K.muted }}>{m.maker}</div>
              <div className="tnum mt-2 text-[15px] font-semibold">{fmt(ft(ap))} ft</div>
              <div className="text-[11px]" style={{ color: Math.abs(err) <= 0.05 ? K.good : Math.abs(err) < 0.15 ? K.warn : K.muted }}>{err >= 0 ? '+' : ''}{(err * 100).toFixed(0)}% vs goal</div>
            </Choice>
          );
        })}
      </div>
    </div>
  );
}

function FlyStep({ onLaunch }: { onLaunch: () => void }) {
  const d = useDesignStore((s) => s.design);
  const set = useDesignStore((s) => s.set);
  return (
    <div>
      <div className="grid gap-x-6 sm:grid-cols-2">
        <Big label="Wind at the pad" value={d.wind} onChange={(v) => set({ wind: v })} min={0} max={12} step={0.1} format={(v) => <span className="flex items-center gap-1.5"><WindIcon size={14} style={{ color: K.ember }} />{v.toFixed(1)} m/s · {Math.round(v * 2.237)} mph</span>} />
        <Big label="Rail tilt" value={d.launchAngle} onChange={(v) => set({ launchAngle: v })} min={0} max={15} step={0.5} format={(v) => `${v.toFixed(1)}°`} />
      </div>
      <button onClick={onLaunch} className="group relative mt-3 flex h-14 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl font-unbounded text-[15px] font-semibold text-[#1B0E05]" style={{ background: `linear-gradient(90deg, ${K.emberSoft}, ${K.ember})` }}>
        <span className="absolute inset-0 -translate-x-full bg-white/30 transition-transform duration-700 group-hover:translate-x-full" />
        <Rocket size={18} /> Launch simulation
      </button>
    </div>
  );
}

function RecoverStep() {
  const d = useDesignStore((s) => s.design);
  const set = useDesignStore((s) => s.set);
  const { r } = useEngineering();
  const pct = Math.min(1, r.descentMain / 12);
  return (
    <div>
      <div className="mb-2 rounded-2xl border p-4" style={{ borderColor: K.stroke, background: 'rgba(255,255,255,.03)' }}>
        <div className="flex items-baseline justify-between"><span className="text-[13px]" style={{ color: K.muted }}>Touchdown speed</span><span className="tnum font-unbounded text-[20px] font-semibold" style={{ color: r.descentMain <= 7.6 ? K.good : K.bad }}>{r.descentMain.toFixed(1)} m/s</span></div>
        <div className="relative mt-3 h-2.5 rounded-full" style={{ background: `linear-gradient(90deg, ${K.good} 0%, ${K.good} 55%, ${K.warn} 63%, ${K.bad} 100%)`, opacity: 0.85 }}>
          <motion.span className="absolute -top-1 h-4.5 w-1.5 -translate-x-1/2 rounded-full" style={{ background: K.sand, boxShadow: '0 0 0 3px rgba(10,14,31,.8)' }} animate={{ left: `${pct * 100}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px]" style={{ color: K.muted }}><span>Gentle</span><span>7.6 m/s limit</span><span>Damaging</span></div>
      </div>
      <Big label="Main parachute" value={d.mainChute} onChange={(v) => set({ mainChute: v })} min={0.8} max={4} step={0.02} format={(v) => `${v.toFixed(2)} m · ${Math.round(v * 39.37)} in`} />
      <Big label="Opens at" value={d.mainDeploy} onChange={(v) => set({ mainDeploy: v })} min={150} max={600} step={5} format={(v) => `${fmt(ft(v))} ft`} />
    </div>
  );
}

function ReviewStep({ onLaunch }: { onLaunch: () => void }) {
  const { gates } = useEngineering();
  const plain: Record<string, string> = { stab: 'Flies straight', rail: 'Fast enough off the rail', twr: 'Enough thrust', apogee: 'Hits the target altitude', mach: 'Stays in the trusted speed range', main: 'Lands softly', drift: 'Lands close by' };
  return (
    <div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {gates.map((g) => (
          <div key={g.id} className="flex items-center gap-2.5 rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,.03)' }}>
            <span className="grid size-5 shrink-0 place-items-center rounded-full" style={{ background: g.state === 'pass' ? K.good : g.state === 'warn' ? K.warn : K.bad }}>{g.state === 'pass' ? <Check size={12} className="text-[#0E2016]" /> : <span className="text-[11px] font-bold text-[#1B0E05]">!</span>}</span>
            <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold">{plain[g.id]}</span><span className="block text-[11px]" style={{ color: K.muted }}>{g.value} · needs {g.rule}</span></span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={onLaunch} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl border text-[13.5px] font-semibold" style={{ borderColor: K.stroke }}><Rocket size={15} /> Fly it again</button>
        <button onClick={() => toast.success('Build plan exported', { description: 'Parts list, fin template and checklist' })} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl text-[13.5px] font-semibold text-[#1B0E05]" style={{ background: K.sand }}>Export build plan <ArrowRight size={15} /></button>
      </div>
    </div>
  );
}

/* ───────────────────────── flight HUD + results ───────────────────────── */

function FlightHud({ hud, target }: { hud: { t: number; h: number; v: number; mach: number }; target: number }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pointer-events-none absolute top-24 left-1/2 flex -translate-x-1/2 gap-6 rounded-3xl border px-6 py-3 backdrop-blur-xl sm:gap-10" style={{ background: 'rgba(10,14,31,.45)', borderColor: K.stroke }}>
      {[['T+', `${hud.t.toFixed(1)} s`], ['Altitude', `${fmt(ft(hud.h))} ft`], ['Speed', `${fmt(Math.max(0, hud.v))} m/s`], ['Mach', hud.mach.toFixed(2)]].map(([k, v]) => (
        <div key={k} className="text-center"><div className="text-[11px] tracking-[0.14em] uppercase" style={{ color: K.muted }}>{k}</div><div className="tnum font-unbounded text-[18px] font-semibold sm:text-[22px]">{v}</div></div>
      ))}
      <div className="absolute inset-x-6 -bottom-px h-0.5 overflow-hidden rounded-full bg-white/10"><div className="h-full" style={{ width: `${Math.min(100, (hud.h / target) * 100)}%`, background: K.ember }} /></div>
    </motion.div>
  );
}

function ResultCard({ r, d, onReset, onImprove }: { r: SimResult; d: Design; onReset: () => void; onImprove: () => void }) {
  const err = (r.apogee - d.targetApogee) / d.targetApogee;
  return (
    <motion.div initial={{ opacity: 0, y: 30, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }} transition={{ type: 'spring', stiffness: 260, damping: 26, delay: 0.4 }} className="absolute inset-x-3 bottom-16 mx-auto max-w-[460px] rounded-[28px] border p-6 text-center backdrop-blur-2xl sm:bottom-20" style={{ background: K.glass, borderColor: K.stroke }}>
      <div className="text-[12px] font-semibold tracking-[0.16em] uppercase" style={{ color: K.ember }}>Apogee</div>
      <div className="tnum mt-1 font-unbounded text-[48px] leading-none font-bold">{fmt(ft(r.apogee))}<span className="ml-1 text-[18px] font-normal" style={{ color: K.muted }}>ft</span></div>
      <div className="mt-2 text-[14px]" style={{ color: Math.abs(err) <= 0.05 ? K.good : K.warn }}>{Math.abs(err) <= 0.05 ? 'Right on target.' : `${err > 0 ? 'Over' : 'Under'} your ${fmt(ft(d.targetApogee))} ft goal by ${Math.abs(err * 100).toFixed(1)} %.`}</div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-[12px]">
        {[['Top speed', `${fmt(r.vmax)} m/s`], ['Max g', `${(r.amax / 9.81).toFixed(1)} g`], ['Lands in', `${Math.round(r.tLanding)} s`]].map(([k, v]) => <div key={k} className="rounded-xl py-2" style={{ background: 'rgba(255,255,255,.04)' }}><div style={{ color: K.muted }}>{k}</div><div className="tnum text-[14px] font-semibold">{v}</div></div>)}
      </div>
      <div className="mt-4 flex gap-2">
        <button onClick={onReset} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl border text-[13.5px] font-semibold" style={{ borderColor: K.stroke }}><RotateCcw size={15} /> Back to pad</button>
        <button onClick={onImprove} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl text-[13.5px] font-semibold text-[#1B0E05]" style={{ background: K.sand }}><Sparkles size={15} /> Improve it</button>
      </div>
    </motion.div>
  );
}

/* ───────────────────────── copilot ───────────────────────── */

function Copilot({ open, setOpen }: { open: boolean; setOpen: (b: boolean) => void }) {
  const d = useDesignStore((s) => s.design);
  const set = useDesignStore((s) => s.set);
  const tips = useMemo(() => suggest(d), [d]);
  const fixes = tips.filter((t) => t.tone === 'fix').length;
  return (
    <div className="absolute top-24 right-4 z-10 flex w-[min(340px,calc(100vw-32px))] flex-col items-end">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-semibold backdrop-blur-xl" style={{ background: K.glass, borderColor: open ? 'rgba(255,122,61,.4)' : K.stroke }}>
        <Sparkles size={15} style={{ color: K.ember }} /> Copilot
        {fixes > 0 && <span className="grid size-5 place-items-center rounded-full text-[11px] text-[#1B0E05]" style={{ background: K.ember }}>{fixes}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.97 }} transition={{ duration: 0.2 }} className="mt-2 flex w-full origin-top-right flex-col gap-2">
            <AnimatePresence initial={false}>
              {tips.map((t) => (
                <motion.div key={t.id} layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20, height: 0, marginTop: -8 }} className="rounded-2xl border p-4 backdrop-blur-2xl" style={{ background: K.glass, borderColor: K.stroke }}>
                  <div className="flex items-start gap-2">
                    <span className="mt-1 size-2 shrink-0 rounded-full" style={{ background: t.tone === 'fix' ? K.ember : K.good }} />
                    <div className="flex-1">
                      <div className="text-[14px] font-semibold">{t.title}</div>
                      <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: K.muted }}>{t.body}</p>
                      {t.patch && (
                        <button onClick={() => { set(t.patch!); toast.success('Applied', { description: t.action }); }} className="mt-3 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-[#1B0E05]" style={{ background: K.sand }}>
                          {t.action} <ArrowRight size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            <button onClick={() => setOpen(false)} className="flex items-center gap-1 self-end px-2 text-[12px]" style={{ color: K.muted }}><X size={12} /> Hide</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
