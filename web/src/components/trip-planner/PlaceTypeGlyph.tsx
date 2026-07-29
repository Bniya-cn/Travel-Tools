import type { PlaceKind } from './plannerUtils';

type Props = { kind: PlaceKind; size?: number };

export function PlaceTypeGlyph({ kind, size = 18 }: Props) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (kind === 'museum') return <svg {...common}><path d="m3 10 9-6 9 6" /><path d="M5 10v8m4-8v8m6-8v8m4-8v8M3 20h18" /></svg>;
  if (kind === 'attraction') return <svg {...common}><path d="M4 20 9 9l3 5 3-8 5 14" /><path d="M3 20h18" /></svg>;
  if (kind === 'transport') return <svg {...common}><rect x="5" y="3" width="14" height="17" rx="3" /><path d="M8 7h8M8 12h2m4 0h2M8 20l-2 2m12-2 2 2" /></svg>;
  if (kind === 'subway') return <svg {...common}><path d="M5 4h14v11a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V4Z" /><path d="M8 8h8M9 14h.01M15 14h.01M8 19l-2 3m10-3 2 3" /></svg>;
  if (kind === 'hotel') return <svg {...common}><path d="M3 20V9m0 6h18v5M7 15v-4a2 2 0 0 1 2-2h3a3 3 0 0 1 3 3v3" /></svg>;
  if (kind === 'restaurant') return <svg {...common}><path d="M7 3v8m-3-8v5a3 3 0 0 0 6 0V3m7 0v18m0-18c3 1 3 6 0 7" /></svg>;
  return <svg {...common}><path d="M12 21s7-5.4 7-12a7 7 0 1 0-14 0c0 6.6 7 12 7 12Z" /><circle cx="12" cy="9" r="2.2" /></svg>;
}
