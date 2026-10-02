import { motion } from 'motion/react';
import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';

const CARDS: { id: string; letter: string; name: string; line: string; who: string; tries: string[]; preview: ReactNode }[] = [
  {
    id: 'console', letter: 'A', name: 'Console',
    line: 'A dense, keyboard-first engineering workstation. Every stage of the pipeline sits one keystroke away, with a persistent status rail that never lets a stale or failing result hide.',
    who: 'Experienced teams who live in the tool all day',
    tries: ['Press ⌘K / Ctrl K and swap the motor', 'Drag a field label left or right to scrub its value', 'Press 1–8 to jump between pipeline stages', 'Change anything, then ⌘↵ to re-run'],
    preview: <PreviewConsole />
  },
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
          <div className="font-geist-mono text-[12px] tracking-[0.12em] text-[#6E737B] uppercase">Astraea · interface directions · Oct 2026</div>
          <h1 className="mt-3 max-w-3xl text-[34px] leading-[1.1] font-semibold tracking-[-0.02em] text-balance sm:text-[44px]">Four ways to design a rocket end to end, in one application.</h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[#9BA0A8]">
            Each prototype takes a different stance on the same product. They share one live preview model of <span className="text-[#E8E9EB]">Kestrel IV</span>, a 10,000 ft Spaceport America Cup vehicle, so a change made in one shows up in the others. Numbers come from a lightweight Barrowman and point-mass model built for these prototypes, not the Astraea engine.
          </p>
        </motion.div>
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {CARDS.map((c, i) => (
            <motion.a
              key={c.id}
              href={`#${c.id}`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.08 * i + 0.1 }}
              className="group flex flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-[#111215] transition-colors hover:border-white/20 focus-visible:border-white/40 focus-visible:outline-none"
            >
              <div className="relative aspect-[16/9] max-w-full overflow-hidden border-b border-white/[0.06]">{c.preview}</div>
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-baseline gap-3">
                  <span className="font-geist-mono text-[13px] text-[#6E737B]">{c.letter}</span>
                  <h2 className="text-[20px] font-semibold tracking-tight">{c.name}</h2>
                  <ArrowUpRight size={18} className="ml-auto text-[#6E737B] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white" />
                </div>
                <p className="mt-2 text-[14px] leading-relaxed text-[#9BA0A8]">{c.line}</p>
                <div className="mt-4 text-[12px] text-[#6E737B]">Built for: <span className="text-[#C4C7CC]">{c.who}</span></div>
                <ul className="mt-3 grid gap-1.5 border-t border-white/[0.06] pt-3 text-[13px] text-[#C4C7CC]">
                  {c.tries.map((t) => <li key={t} className="flex gap-2"><span className="text-[#6E737B]">→</span>{t}</li>)}
                </ul>
              </div>
            </motion.a>
          ))}
        </div>
        <p className="mt-10 text-[13px] text-[#6E737B]">Desktop-first. Use the pill at the bottom of any prototype to jump between them.</p>
      </div>
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
