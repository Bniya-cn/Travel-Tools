import { BedDouble, Bus, Landmark, MapPin, Mountain, Train, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import type { PlaceKind } from './plannerUtils';

type Props = { kind: PlaceKind; size?: number };

export function PlaceTypeGlyph({ kind, size = 18 }: Props) {
  const iconByKind: Record<PlaceKind, LucideIcon> = {
    museum: Landmark,
    attraction: Mountain,
    transport: Bus,
    subway: Train,
    hotel: BedDouble,
    restaurant: UtensilsCrossed,
    other: MapPin,
  };
  const Icon = iconByKind[kind];
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" focusable="false" />;
}
