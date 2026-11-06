import { ChevronRight } from 'lucide-react';
import type { CSSProperties, DetailsHTMLAttributes, ReactNode } from 'react';
import { C } from './theme';
import { cn } from './units';

/**
 * Native `<details>/<summary>` disclosure with the browser triangle replaced by
 * a themed chevron. Role, accessible name and keyboard behaviour stay native.
 */
export function Disclosure({ summary, children, className, summaryClassName, summaryStyle, defaultOpen, chevron = true, ...rest }: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  summaryClassName?: string;
  summaryStyle?: CSSProperties;
  defaultOpen?: boolean;
  chevron?: boolean;
} & Omit<DetailsHTMLAttributes<HTMLDetailsElement>, 'children'>) {
  return (
    <details data-kit-disclosure className={cn('group', className)} open={defaultOpen || undefined} {...rest}>
      <summary
        className={cn('cursor-pointer list-none select-none focus-visible:ring-1 focus-visible:ring-con-accent [&::-webkit-details-marker]:hidden', chevron && 'flex items-center gap-1.5', summaryClassName)}
        style={summaryStyle}
      >
        {chevron && <ChevronRight size={11} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-90" style={{ color: C.dim }} />}
        {summary}
      </summary>
      {children}
    </details>
  );
}
