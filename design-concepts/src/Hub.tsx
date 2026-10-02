import { motion } from 'motion/react';
import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';

type Card = { id: string; letter: string; name: string; line: string; who: string; tries: string[]; preview: ReactNode };

const CONSOLE_FAMILY: Card[] = [
  {
    id: 'refined', letter: 'A1+', name: 'Console, refined',
    line: 'A1 taken further. Every edit is undoable and compared against the last committed run: changed fields glow amber, deltas sit next to every result, and a ghost outline of the committed rocket stays in the viewport until you re-run.',
    who: 'The default workstation if Console is the direction',
    tries: ['⌘K then type “span 170” or “K550W”', 'Watch the amber ghost and the Δ chips in the status bar', 'Hover a changed field and click revert, or use History', 'Right-click the viewport · drag panel edges · press ?'],
    preview: <PreviewRefined />
  },
  {
    id: 'ribbon', letter: 'A2', name: 'Ribbon',
    line: 'Parametric CAD in the Fusion 360 / Onshape / SolidWorks tradition. Ribbon toolbar, feature browser with visibility toggles, view cube, OK/Cancel feature dialogs, and a history timeline you can roll back.',
    who: 'Teams coming from mechanical CAD',
    tries: ['Drag the orange rollback marker in the timeline', 'Edit a feature, then Cancel to see it revert', 'INSPECT → Section and Measure', 'SIMULATE → Flight or Monte Carlo'],
    preview: <PreviewRibbon />
  },
  {
    id: 'quad', letter: 'A3', name: 'Quad',
    line: 'Classic drafting CAD in the AutoCAD / CATIA mould. Four synchronized viewports, a command line with autocomplete, blue grips for direct editing, a properties palette, and live cursor coordinates in millimetres.',
    who: 'Precision work and keyboard-heavy users',
    tries: ['Just start typing: SPAN 110, MOTOR K550W, STABILITY', 'Drag the blue grips on the fins in the Front view', 'Ctrl+Z / Ctrl+Y · VIEW aft · maximize a viewport', 'Scroll to zoom a 2D view, drag to pan'],
    preview: <PreviewQuad />
  },
  {
    id: 'solver', letter: 'A4', name: 'Solver',
    line: 'A simulation workbench in the ANSYS / COMSOL style. Study tree, banded contour results on the rocket, Max/Min probes, a scrubbable flight timeline, streaming solver residuals, and a details pane for every node.',
    who: 'Analysis-heavy reviews and structures/aero leads',
    tries: ['Switch Cp / Pressure / Temp / Stress', 'Press play, or scrub to max-Q', 'Click Solve and watch residuals converge', 'Edit Geometry in the Details pane, then re-solve'],
    preview: <PreviewSolver />
  },
  {
    id: 'console', letter: 'A1', name: 'Console (original)',
    line: 'The first Console: a dense, keyboard-first workstation with a ⌘K palette, scrubbable fields, live 3D, and a persistent status rail. Kept for comparison with A1+.',
    who: 'Baseline for comparison',
    tries: ['⌘K and swap the motor', 'Press 1–8 for stages', 'Drag a field label to scrub'],
    preview: <PreviewConsole />
  }
];

const OTHER: Card[] = [
  {
    id: 'drafting', letter: 'B', name: 'Drafting Table',
    line: 'The rocket as a living engineering drawing set. Edit geometry directly on a dimensioned sheet, read the hand-calc trail in the margin, and issue revisions like a real drawing package.',
    who: 'Design reviews, mentors, and documentation-heavy programs',
    tries: ['Drag the orange handles on the fins and nose', 'Click a dimension and type a new value', 'Click the end view to change fin count', 'Issue Rev C from the top-right button'],
    preview: <PreviewDrafting />
  },
  {
    id: 'flow', letter: 'C', name: 'Flow',
    line: 'The whole pipeline as a node graph. Data dependencies are visible, changes mark everything downstream as stale, and one Run recomputes only what is needed.',
    who: 'Teams who want to see and extend the analysis chain',
    tries: ['Click a node, change a value, watch downstream go stale', 'Hit Run to cascade the recompute', 'Hover a node to trace its lineage', 'Add a Fin flutter node from the toolbar'],
    preview: <PreviewFlow />
  },
  {
    id: 'launch', letter: 'D', name: 'Launch',
    line: 'A guided, cinematic studio for first-time builders. Six plain-language steps, a copilot that proposes concrete fixes, and a launch you can watch.',
    who: 'New members, outreach, and quick what-if exploration',
    tries: ['Walk the six steps with Next', 'Shrink fin size and accept a Copilot fix', 'Compare predicted apogee across motors', 'Launch the simulation and ride along'],
    preview: <PreviewLaunch />
  }
];

export default function Hub() {
  return (
    <div className="thin-scroll h-full overflow-y-auto font-geist text-[#E8E9EB]" style={{ background: '#0B0C0E' }}>
      <div className="mx-auto max-w-6xl px-4 pt-14 pb-24 sm:px-8">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="font-geist-mono text-[12px] tracking-[0.12em] text-[#6E737B] uppercase">Astraea · interface directions · round 2</div>
          <h1 className="mt-3 max-w-3xl text-[34px] leading-[1.1] font-semibold tracking-[-0.02em] text-balance sm:text-[44px]">The Console family: five takes on engineering software.</h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[#9BA0A8]">
            Each one keeps the CAD-workstation feel of Console and commits to a different tradition: a refined Console, parametric CAD, drafting CAD, and a simulation workbench. They share one live preview model of <span className="text-[#E8E9EB]">Kestrel IV</span>, so an edit in one shows up in all of them. Numbers come from a lightweight Barrowman and point-mass model built for these prototypes, not the Astraea engine.
          </p>
        </motion.div>
        <Grid cards={CONSOLE_FAMILY} />
        <h2 className="mt-16 text-[13px] font-medium tracking-[0.1em] text-[#6E737B] uppercase">Round 1 · other directions</h2>
        <Grid cards={OTHER} small />
        <p className="mt-10 text-[13px] text-[#6E737B]">Desktop-first. Use the tab on the right edge of any prototype to jump between them.</p>
      </div>
    </div>
  );
}

function Grid({ cards, small }: { cards: Card[]; small?: boolean }) {
  return (
    <div className={`mt-8 grid gap-5 ${small ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
      {cards.map((c, i) => (
        <motion.a
          key={c.id}
          href={`#${c.id}`}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.06 * i + 0.1 }}
          className={`group flex flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-[#111215] transition-colors hover:border-white/20 focus-visible:border-white/40 focus-visible:outline-none ${!small && i === 0 ? 'md:col-span-2 md:grid md:grid-cols-[1.25fr_1fr]' : ''}`}
        >
          <div className="relative aspect-[16/9] max-w-full overflow-hidden border-b border-white/[0.06]">{c.preview}</div>
          <div className="flex flex-1 flex-col p-5">
            <div className="flex items-baseline gap-3">
              <span className="font-geist-mono text-[13px] text-[#6E737B]">{c.letter}</span>
              <h2 className={`${small ? 'text-[17px]' : 'text-[20px]'} font-semibold tracking-tight`}>{c.name}</h2>
              <ArrowUpRight size={18} className="ml-auto text-[#6E737B] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white" />
            </div>
            <p className={`mt-2 ${small ? 'text-[13px]' : 'text-[14px]'} leading-relaxed text-[#9BA0A8]`}>{c.line}</p>
            {!small && <>
              <div className="mt-4 text-[12px] text-[#6E737B]">Built for: <span className="text-[#C4C7CC]">{c.who}</span></div>
              <ul className="mt-3 grid gap-1.5 border-t border-white/[0.06] pt-3 text-[13px] text-[#C4C7CC]">
                {c.tries.map((t) => <li key={t} className="flex gap-2"><span className="text-[#6E737B]">→</span>{t}</li>)}
              </ul>
            </>}
          </div>
        </motion.a>
      ))}
    </div>
  );
}

/* Small abstract previews drawn in each concept's own palette. */

function PreviewConsole() {
  return (
    <svg viewBox="0 0 320 180" className="h-full w-full" aria-hidden>
      <rect width="320" height="180" fill="#0A0B0D" />
      <rect width="320" height="12" fill="#0F1114" /><rect x="250" y="3" width="30" height="6" rx="2" fill="#67E8F9" />
      <rect y="12" width="10" height="160" fill="#0F1114" /><rect x="10" y="12" width="56" height="160" fill="#0F1114" stroke="#1C1F24" />
      {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x="16" y={22 + i * 10} width={30 + (i % 3) * 8} height="4" rx="1" fill={i === 4 ? '#67E8F9' : '#2A2F36'} />)}
      <rect x="258" y="12" width="62" height="160" fill="#0F1114" stroke="#1C1F24" />
      {[0, 1, 2, 3].map((i) => <g key={i}><rect x="264" y={24 + i * 18} width="30" height="3" rx="1" fill="#3A3F46" /><rect x="264" y={31 + i * 18} width="50" height="2" rx="1" fill="#1F2328" /><rect x="264" y={31 + i * 18} width={20 + i * 7} height="2" rx="1" fill="#67E8F9" /></g>)}
      <g transform="translate(90 70) rotate(-4)"><rect x="0" y="0" width="120" height="10" rx="5" fill="#D7DBE0" /><path d="M120 0 Q150 5 120 10Z" fill="#E8EBEE" /><path d="M0 0 L-8 -10 L14 0Z M0 10 L-8 20 L14 10Z" fill="#67E8F9" /><circle cx="40" cy="5" r="7" fill="none" stroke="#FB7185" /><circle cx="62" cy="5" r="7" fill="none" stroke="#38BDF8" /></g>
      <rect x="66" y="126" width="192" height="46" fill="#0F1114" stroke="#1C1F24" />
      {[0, 1, 2].map((i) => <rect key={i} x="74" y={136 + i * 10} width={110 - i * 28} height="4" rx="2" fill={['#FB923C', '#A78BFA', '#67E8F9'][i]} opacity=".8" />)}
      <rect y="172" width="320" height="8" fill="#0F1114" />
    </svg>
  );
}

function PreviewDrafting() {
  return (
    <svg viewBox="0 0 320 180" className="h-full w-full" aria-hidden>
      <rect width="320" height="180" fill="#DCE2E9" />
      <rect x="24" y="12" width="272" height="160" fill="#F7F8F6" />
      <rect x="30" y="18" width="260" height="148" fill="none" stroke="#1B2B4B" strokeWidth="1" />
      <line x1="40" x2="250" y1="80" y2="80" stroke="#7F9CC9" strokeDasharray="10 2 2 2" strokeWidth=".6" />
      <path d="M50 80 Q80 70 100 72 L230 72 L230 88 L100 88 Q80 90 50 80Z" fill="none" stroke="#1B2B4B" strokeWidth="1.2" />
      <path d="M200 72 L214 54 L224 54 L230 72Z" fill="#F7F8F6" stroke="#1B2B4B" strokeWidth="1.2" />
      <line x1="50" x2="230" y1="46" y2="46" stroke="#4A5A78" strokeWidth=".6" /><text x="140" y="44" fontSize="6" textAnchor="middle" fill="#1B2B4B" fontFamily="IBM Plex Mono">2,500</text>
      <circle cx="150" cy="80" r="4" fill="#F7F8F6" stroke="#1B2B4B" /><circle cx="175" cy="80" r="4" fill="#F7F8F6" stroke="#D9481C" />
      <path d="M140 66 q4 -4 8 0 q4 -4 8 0 q4 -4 8 0 q4 -4 8 0 q4 -4 8 0 q4 -4 8 0 v28 q-4 4 -8 0 q-4 4 -8 0 q-4 4 -8 0 q-4 4 -8 0 q-4 4 -8 0 q-4 4 -8 0z" fill="none" stroke="#D9481C" strokeWidth=".8" />
      <circle cx="214" cy="54" r="3" fill="#F7F8F6" stroke="#D9481C" strokeWidth="1.2" />
      <rect x="180" y="132" width="110" height="34" fill="none" stroke="#1B2B4B" /><line x1="180" x2="290" y1="144" y2="144" stroke="#1B2B4B" strokeWidth=".6" /><text x="186" y="141" fontSize="7" fill="#1B2B4B" fontFamily="Barlow Condensed" fontWeight="700">KESTREL IV · GA</text>
    </svg>
  );
}

function PreviewFlow() {
  const nodes = [[20, 40, '#5EEAD4'], [20, 110, '#FB923C'], [100, 30, '#C4B5FD'], [100, 95, '#7DD3FC'], [180, 62, '#F9A8D4'], [250, 40, '#FDE68A'], [250, 105, '#86EFAC']] as const;
  const edges = [[0, 2], [0, 3], [1, 2], [1, 4], [2, 3], [3, 4], [2, 4], [4, 5], [4, 6]];
  return (
    <svg viewBox="0 0 320 180" className="h-full w-full" aria-hidden>
      <defs><pattern id="pdots" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".6" fill="#23252B" /></pattern></defs>
      <rect width="320" height="180" fill="#0D0E11" /><rect width="320" height="180" fill="url(#pdots)" />
      {edges.map(([a, b]) => { const [x1, y1] = nodes[a], [x2, y2] = nodes[b]; return <path key={`${a}${b}`} d={`M${x1 + 52},${y1 + 6} C${x1 + 75},${y1 + 6} ${x2 - 23},${y2 + 6} ${x2},${y2 + 6}`} stroke={nodes[a][2]} strokeOpacity=".5" fill="none" />; })}
      {nodes.map(([x, y, c], i) => <g key={i}><rect x={x} y={y} width="52" height="34" rx="5" fill="#16171B" stroke={i === 4 ? c : '#26282E'} /><rect x={x + 5} y={y + 4} width="7" height="5" rx="1" fill={c} opacity=".5" /><rect x={x + 15} y={y + 5} width="26" height="3" rx="1" fill="#ECEDEF" opacity=".7" /><rect x={x + 5} y={y + 16} width="40" height="2" rx="1" fill="#2A2C32" /><rect x={x + 5} y={y + 23} width="30" height="2" rx="1" fill="#2A2C32" /><circle cx={x + 47} cy={y + 7} r="1.6" fill={i === 5 || i === 6 ? '#FBBF24' : '#4ADE80'} /></g>)}
    </svg>
  );
}

function PreviewLaunch() {
  return (
    <svg viewBox="0 0 320 180" className="h-full w-full" aria-hidden>
      <defs><linearGradient id="psky" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#141433" /><stop offset=".55" stopColor="#2E2552" /><stop offset=".8" stopColor="#B5583A" /><stop offset="1" stopColor="#F2A066" /></linearGradient></defs>
      <rect width="320" height="180" fill="url(#psky)" />
      {[[30, 20], [80, 40], [200, 15], [270, 35], [140, 30], [300, 60]].map(([x, y]) => <circle key={x} cx={x} cy={y} r=".8" fill="#fff" opacity=".7" />)}
      <path d="M0 128 L40 110 L80 124 L130 104 L180 122 L230 108 L280 120 L320 112 L320 180 L0 180Z" fill="#2B2343" />
      <rect y="132" width="320" height="48" fill="#3B2A35" />
      <g transform="translate(160 54)"><rect x="-3" y="10" width="6" height="56" fill="#F5EFE6" /><path d="M-3 10 Q0 -8 3 10Z" fill="#FF7A3D" /><path d="M-3 58 L-9 68 L-3 66Z M3 58 L9 68 L3 66Z" fill="#FF7A3D" /><path d="M-2 66 L0 86 L2 66Z" fill="#FFB547" /></g>
      <rect x="96" y="140" width="128" height="34" rx="9" fill="rgba(16,18,36,.7)" stroke="rgba(255,255,255,.1)" />
      <rect x="104" y="148" width="40" height="4" rx="2" fill="#FF7A3D" /><rect x="104" y="157" width="80" height="6" rx="2" fill="#F5EFE6" opacity=".9" />
      <rect x="236" y="14" width="72" height="22" rx="7" fill="rgba(16,18,36,.7)" stroke="rgba(255,255,255,.1)" /><rect x="244" y="22" width="40" height="5" rx="2" fill="#F5EFE6" />
    </svg>
  );
}

function PreviewRefined() {
  return (
    <svg viewBox="0 0 320 180" className="h-full w-full" aria-hidden>
      <rect width="320" height="180" fill="#0B0C0E" />
      <rect width="320" height="12" fill="#101215" /><rect x="70" y="3" width="44" height="6" rx="2" fill="none" stroke="#F5B544" strokeWidth=".6" /><rect x="262" y="3" width="30" height="6" rx="2" fill="#6EE7F7" />
      <rect y="12" width="14" height="160" fill="#101215" /><rect x="14" y="12" width="56" height="160" fill="#101215" stroke="#1C1F24" />
      {[0, 1, 2, 3, 4, 5].map((i) => <g key={i}><rect x="20" y={24 + i * 10} width={24} height="3" rx="1" fill={i === 4 ? '#6EE7F7' : '#2A2F36'} /><rect x="48" y={25 + i * 10} width={14} height="1.5" rx="1" fill="#2A2F36" /></g>)}
      <rect x="250" y="12" width="70" height="160" fill="#101215" stroke="#1C1F24" />
      {[0, 1, 2, 3].map((i) => <g key={i}>{i === 2 && <circle cx="256" cy={26 + i * 18} r="1.5" fill="#F5B544" />}<rect x="260" y={24 + i * 18} width="28" height="3" rx="1" fill="#3A3F46" /><rect x="256" y={31 + i * 18} width="56" height="2" rx="1" fill="#1F2328" /><rect x="256" y={31 + i * 18} width={20 + i * 7} height="2" rx="1" fill={i === 2 ? '#F5B544' : '#6EE7F7'} /></g>)}
      <g transform="translate(92 66) rotate(-4)"><rect x="0" y="0" width="120" height="10" rx="5" fill="#D5D9DE" /><path d="M120 0 Q150 5 120 10Z" fill="#E6E9EC" /><path d="M0 0 L-8 -10 L14 0Z M0 10 L-8 20 L14 10Z" fill="#6EE7F7" /><path d="M0 0 L-12 -14 L14 0Z" fill="none" stroke="#F5B544" strokeDasharray="2 1.5" strokeWidth=".8" /></g>
      <rect x="196" y="18" width="50" height="22" rx="3" fill="#101215" stroke="#1C1F24" /><rect x="200" y="30" width="42" height="2" rx="1" fill="#1F2328" /><rect x="215" y="28" width="2" height="6" fill="#E7E9EC" />
      <rect x="70" y="122" width="180" height="50" fill="#101215" stroke="#1C1F24" />
      {[0, 1, 2].map((i) => <g key={i}><rect x="78" y={132 + i * 11} width={100 - i * 26} height="3" rx="1.5" fill={['#FB923C', '#A78BFA', '#6EE7F7'][i]} opacity=".8" /><rect x="224" y={131 + i * 11} width="16" height="4" rx="1" fill={i === 0 ? '#F5B544' : 'transparent'} opacity=".7" /></g>)}
      <rect y="172" width="320" height="8" fill="#101215" /><rect x="60" y="174" width="30" height="3" rx="1" fill="#F5B544" opacity=".7" />
    </svg>
  );
}

function PreviewRibbon() {
  return (
    <svg viewBox="0 0 320 180" className="h-full w-full" aria-hidden>
      <defs><linearGradient id="prb" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#F8F9FB" /><stop offset="1" stopColor="#E1E6EC" /></linearGradient></defs>
      <rect width="320" height="180" fill="url(#prb)" />
      <rect width="320" height="10" fill="#E3E6EA" /><rect y="10" width="320" height="28" fill="#fff" stroke="#D8DCE2" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <g key={i}><rect x={10 + i * 26 + (i > 4 ? 8 : 0)} y="15" width="12" height="11" rx="2" fill="none" stroke={i === 2 ? '#0D6EFD' : '#5F6873'} strokeWidth="1" /><rect x={8 + i * 26 + (i > 4 ? 8 : 0)} y="29" width="16" height="2" rx="1" fill="#B7BDC6" /></g>)}
      <rect y="38" width="56" height="124" fill="#fff" stroke="#D8DCE2" />
      {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={8 + (i > 1 ? 8 : 0)} y={46 + i * 9} width="30" height="3" rx="1" fill={i === 4 ? '#0D6EFD' : '#C3C9D1'} />)}
      <g transform="translate(110 92) rotate(-10)"><rect width="130" height="12" rx="6" fill="#C9CED6" stroke="#2A313A" strokeWidth=".6" /><path d="M130 0 Q160 6 130 12Z" fill="#D6DAE0" stroke="#2A313A" strokeWidth=".6" /><path d="M0 0 L-8 -12 L16 0Z M0 12 L-8 24 L16 12Z" fill="#5B9BFF" stroke="#2A313A" strokeWidth=".6" /></g>
      <rect x="64" y="46" width="64" height="44" rx="3" fill="#fff" stroke="#D8DCE2" /><rect x="64" y="46" width="64" height="8" rx="3" fill="#F6F7F9" />{[0, 1, 2].map((i) => <rect key={i} x="90" y={59 + i * 9} width="32" height="6" rx="1" fill="none" stroke="#D8DCE2" />)}<rect x="110" y="84" width="14" height="4" rx="1" fill="#0D6EFD" />
      <g transform="translate(286 48)"><path d="M0 6 L12 0 L24 6 L24 20 L12 26 L0 20Z" fill="#F4F6F9" stroke="#9AA3AE" strokeWidth=".6" /></g>
      <rect y="162" width="320" height="18" fill="#ECEEF1" stroke="#D8DCE2" />
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => <rect key={i} x={60 + i * 14} y="166" width="10" height="10" rx="1.5" fill="#fff" stroke="#C3C9D1" opacity={i > 6 ? 0.4 : 1} />)}<rect x="160" y="165" width="3" height="12" rx="1" fill="#F59E0B" />
    </svg>
  );
}

function PreviewQuad() {
  const rocket = (x: number, y: number, s: number) => <g transform={`translate(${x} ${y}) scale(${s})`} fill="none" stroke="#C9CED6" strokeWidth={0.8 / s}><path d="M0 5 Q20 0 30 0 L110 0 L110 10 L30 10 Q20 10 0 5Z" /><path d="M96 0 L102 -10 L108 -10 L110 0" stroke="#3FA9F5" strokeDasharray="2 1" /><line x1="-6" x2="116" y1="5" y2="5" stroke="#4F7A55" strokeDasharray="6 2 1 2" /><circle cx="62" cy="5" r="2.5" stroke="#5EC2F2" /><circle cx="78" cy="5" r="2.5" stroke="#F26D6D" /></g>;
  return (
    <svg viewBox="0 0 320 180" className="h-full w-full" aria-hidden>
      <rect width="320" height="180" fill="#1F2227" />
      <rect width="320" height="8" fill="#191B1F" /><rect x="4" y="2" width="5" height="4" fill="#F0A43A" />
      <rect x="1" y="9" width="129" height="64" fill="#17191D" stroke="#F0A43A" strokeWidth=".6" /><rect x="131" y="9" width="129" height="64" fill="#17191D" />
      <rect x="1" y="74" width="129" height="64" fill="#17191D" /><rect x="131" y="74" width="129" height="64" fill="#17191D" />
      {rocket(10, 38, 1)}{rocket(10, 103, 1)}
      <g transform="translate(160 40) rotate(-12)"><rect width="80" height="8" rx="4" fill="#7B838E" /><path d="M80 0 Q96 4 80 8Z" fill="#8B939E" /><path d="M0 0 L-5 -8 L10 0Z M0 8 L-5 16 L10 8Z" fill="#3FA9F5" /></g>
      <g transform="translate(195 106)" stroke="#C9CED6" fill="none"><circle r="9" /><line x1="0" y1="-9" x2="0" y2="-24" stroke="#3FA9F5" strokeWidth="1.5" /><line x1="8" y1="5" x2="20" y2="12" stroke="#3FA9F5" strokeWidth="1.5" /><line x1="-8" y1="5" x2="-20" y2="12" stroke="#3FA9F5" strokeWidth="1.5" /></g>
      <rect x="261" y="9" width="59" height="129" fill="#262A31" />
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => <g key={i}><rect x="264" y={14 + i * 12} width="22" height="3" rx="1" fill="#646B75" /><rect x="292" y={14 + i * 12} width="22" height="3" rx="1" fill="#A4AAB3" /></g>)}
      <rect y="139" width="320" height="32" fill="#15171A" /><rect x="6" y="145" width="120" height="2.5" fill="#646B75" /><rect x="6" y="151" width="90" height="2.5" fill="#646B75" /><rect x="6" y="160" width="10" height="4" fill="#F0A43A" /><rect x="20" y="160" width="40" height="4" fill="#D5D9DF" />
      <rect y="171" width="320" height="9" fill="#191B1F" />{[0, 1, 2, 3].map((i) => <rect key={i} x={230 + i * 20} y="174" width="14" height="3" fill={i === 1 ? '#646B75' : '#3FA9F5'} />)}
    </svg>
  );
}

function PreviewSolver() {
  const bands = ['#0000FF', '#0060FF', '#00B4FF', '#00FFD0', '#00FF50', '#90FF00', '#FFF000', '#FF9000', '#FF0000'];
  return (
    <svg viewBox="0 0 320 180" className="h-full w-full" aria-hidden>
      <defs><linearGradient id="psv" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#3A4B66" /><stop offset=".6" stopColor="#1A2333" /><stop offset="1" stopColor="#0F151F" /></linearGradient>
        <linearGradient id="psr" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#0060FF" /><stop offset=".55" stopColor="#00B4FF" /><stop offset=".72" stopColor="#00FF50" /><stop offset=".86" stopColor="#FFF000" /><stop offset=".95" stopColor="#FF9000" /><stop offset="1" stopColor="#FF0000" /></linearGradient></defs>
      <rect width="320" height="180" fill="#0F141B" />
      <rect width="320" height="10" fill="#121821" /><rect x="70" y="2" width="20" height="6" rx="1" fill="#2563EB" />
      <rect y="10" width="62" height="170" fill="#151C25" />
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => <rect key={i} x={6 + Math.min(i, 4) * 4} y={16 + i * 9} width="34" height="3" rx="1" fill={i === 6 ? '#4FB3FF' : '#3A4757'} />)}
      <rect x="62" y="10" width="258" height="104" fill="url(#psv)" />
      {bands.slice().reverse().map((c, i) => <rect key={c} x="68" y={18 + i * 6} width="5" height="6" fill={c} />)}
      <g transform="translate(120 58) rotate(-6)"><rect width="140" height="11" rx="5.5" fill="url(#psr)" /><path d="M140 0 Q170 5.5 140 11Z" fill="#FF2000" /><path d="M0 0 L-8 -12 L16 0Z M0 11 L-8 23 L16 11Z" fill="#00B4FF" /></g>
      <rect x="62" y="114" width="258" height="8" fill="#151C25" /><rect x="90" y="117" width="200" height="2" fill="#263140" /><rect x="90" y="117" width="70" height="2" fill="#4FB3FF" />
      <rect x="62" y="122" width="88" height="58" fill="#151C25" stroke="#263140" />{[0, 1, 2, 3, 4].map((i) => <g key={i}><rect x="66" y={128 + i * 9} width="30" height="2.5" fill="#5B6B7D" /><rect x="104" y={128 + i * 9} width="36" height="2.5" fill="#A9B8C9" /></g>)}
      <path d="M158 170 C185 168 195 132 210 132 C228 132 240 160 312 168" stroke="#F87171" fill="none" strokeWidth="1.2" /><line x1="210" x2="210" y1="126" y2="174" stroke="#FACC15" strokeDasharray="2 2" />
    </svg>
  );
}
