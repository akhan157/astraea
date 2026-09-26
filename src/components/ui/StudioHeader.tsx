import type { JSX, ReactNode } from 'react';

export function StudioHeader({ icon, title, subtitle, chips, titleId }: { icon: ReactNode; title: string; subtitle: string; chips?: ReactNode; titleId?: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="p-2 rounded-md bg-white/5 border border-white/8 text-zinc-300 shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 id={titleId} className="text-[13px] font-semibold tracking-tight text-white">
            {title}
          </h2>
          <p className="text-xs text-zinc-400">{subtitle}</p>
        </div>
      </div>
      {chips ? <div className="flex items-center gap-2 shrink-0">{chips}</div> : null}
    </div>
  );
}
