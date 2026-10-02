import { useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import type { Route } from './App';

export const CONCEPTS: { id: Exclude<Route, ''>; letter: string; name: string }[] = [
  { id: 'console', letter: 'A1', name: 'Console' },
  { id: 'refined', letter: 'A1+', name: 'Console refined' },
  { id: 'ribbon', letter: 'A2', name: 'Ribbon' },
  { id: 'quad', letter: 'A3', name: 'Quad' },
  { id: 'solver', letter: 'A4', name: 'Solver' },
  { id: 'drafting', letter: 'B', name: 'Drafting Table' },
  { id: 'flow', letter: 'C', name: 'Flow' },
  { id: 'launch', letter: 'D', name: 'Launch' }
];

/** Edge tab for hopping between prototypes. Not part of any design. */
export function ConceptSwitcher({ route }: { route: Route }) {
  const [open, setOpen] = useState(false);
  const cur = CONCEPTS.find((c) => c.id === route);
  return (
    <nav aria-label="Design concepts" className="fixed top-1/2 right-0 z-[100] flex -translate-y-1/2 items-center font-geist text-[11px]" onMouseLeave={() => setOpen(false)}>
      {open && (
        <div className="mr-1 flex flex-col gap-0.5 rounded-xl border border-white/15 bg-black/85 p-1 text-white/75 shadow-2xl backdrop-blur-md">
          <a href="#" className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-white/10 hover:text-white"><LayoutGrid size={12} /> All concepts</a>
          <span className="mx-2 my-0.5 h-px bg-white/15" />
          {CONCEPTS.map((c) => (
            <a key={c.id} href={`#${c.id}`} onClick={() => setOpen(false)} className={`flex gap-2 rounded-lg px-2.5 py-1.5 whitespace-nowrap ${route === c.id ? 'bg-white text-black' : 'hover:bg-white/10 hover:text-white'}`}>
              <span className="w-7 font-geist-mono">{c.letter}</span>{c.name}
            </a>
          ))}
        </div>
      )}
      <button onClick={() => setOpen(!open)} onMouseEnter={() => setOpen(true)} aria-expanded={open} className="flex flex-col items-center gap-1.5 rounded-l-lg border border-r-0 border-white/15 bg-black/80 px-1 py-2.5 text-white/75 shadow-2xl backdrop-blur-md hover:text-white">
        <LayoutGrid size={12} />
        <span className="font-geist-mono text-[10px] [writing-mode:vertical-rl]">{cur?.letter}</span>
      </button>
    </nav>
  );
}
