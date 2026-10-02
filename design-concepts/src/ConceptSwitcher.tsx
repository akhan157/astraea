import { useState } from 'react';
import { LayoutGrid, ChevronUp } from 'lucide-react';
import type { Route } from './App';

export const CONCEPTS: { id: Exclude<Route, ''>; letter: string; name: string }[] = [
  { id: 'console', letter: 'A', name: 'Console' },
  { id: 'drafting', letter: 'B', name: 'Drafting Table' },
  { id: 'flow', letter: 'C', name: 'Flow' },
  { id: 'launch', letter: 'D', name: 'Launch' }
];

/** Small neutral pill for hopping between prototypes. Not part of any design. */
export function ConceptSwitcher({ route }: { route: Route }) {
  const [open, setOpen] = useState(false);
  const cur = CONCEPTS.find((c) => c.id === route);
  return (
    <nav
      aria-label="Design concepts"
      onMouseLeave={() => setOpen(false)}
      className="fixed bottom-9 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-white/15 bg-black/80 p-1 font-geist text-[11px] text-white/70 shadow-2xl backdrop-blur-md"
      style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {!open ? (
        <button onClick={() => setOpen(true)} onMouseEnter={() => setOpen(true)} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 hover:text-white">
          <LayoutGrid size={12} /> Concept {cur?.letter} <ChevronUp size={12} />
        </button>
      ) : (
        <>
          <a href="#" className="flex items-center gap-1.5 rounded-full px-2.5 py-1 hover:bg-white/10 hover:text-white" title="All concepts">
            <LayoutGrid size={12} /> <span className="hidden sm:inline">All</span>
          </a>
          <span className="mx-0.5 h-3 w-px bg-white/15" />
          {CONCEPTS.map((c) => (
            <a key={c.id} href={`#${c.id}`} onClick={() => setOpen(false)} title={c.name} className={`rounded-full px-2.5 py-1 whitespace-nowrap ${route === c.id ? 'bg-white text-black' : 'hover:bg-white/10 hover:text-white'}`}>
              {c.letter}<span className="hidden md:inline"> · {c.name}</span>
            </a>
          ))}
        </>
      )}
    </nav>
  );
}
