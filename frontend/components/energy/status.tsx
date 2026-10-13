import type { ApartmentStatus, ApplianceCategory, LoadState } from '@/lib/energy-data'
import {
  AirVent,
  BatteryCharging,
  Flame,
  Lightbulb,
  type LucideIcon,
  Microwave,
  Refrigerator,
  Utensils,
  WashingMachine,
} from 'lucide-react'

export const APARTMENT_STATUS_CONFIG: Record<
  ApartmentStatus,
  { label: string; dot: string; text: string; ring: string; bar: string }
> = {
  normal: {
    label: 'Normale',
    dot: 'bg-success',
    text: 'text-success',
    ring: 'ring-success/30 bg-success/10',
    bar: 'bg-success',
  },
  warning: {
    label: 'Vicino alla soglia',
    dot: 'bg-warning',
    text: 'text-warning',
    ring: 'ring-warning/30 bg-warning/10',
    bar: 'bg-warning',
  },
  shedding: {
    label: 'Distacco Carichi in Corso',
    dot: 'bg-danger',
    text: 'text-danger',
    ring: 'ring-danger/30 bg-danger/10',
    bar: 'bg-danger',
  },
}

export const LOAD_STATE_CONFIG: Record<LoadState, { label: string; text: string; chip: string }> = {
  on: { label: 'Acceso', text: 'text-success', chip: 'bg-success/15 text-success ring-1 ring-success/30' },
  off: { label: 'Spento', text: 'text-muted-foreground', chip: 'bg-muted text-muted-foreground ring-1 ring-border' },
  shed: {
    label: 'Staccato da Algoritmo',
    text: 'text-danger',
    chip: 'bg-danger/15 text-danger ring-1 ring-danger/30',
  },
}

const CATEGORY_ICONS: Record<ApplianceCategory, LucideIcon> = {
  climate: AirVent,
  washer: WashingMachine,
  waterHeater: Flame,
  oven: Microwave,
  fridge: Refrigerator,
  ev: BatteryCharging,
  lighting: Lightbulb,
  dishwasher: Utensils,
}

export function ApplianceIcon({
  category,
  className,
}: {
  category: ApplianceCategory
  className?: string
}) {
  const Icon = CATEGORY_ICONS[category]
  return <Icon className={className} aria-hidden />
}

export function StatusBadge({ status }: { status: ApartmentStatus }) {
  const cfg = APARTMENT_STATUS_CONFIG[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${cfg.ring} ${cfg.text}`}
    >
      <span className={`size-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

export function formatW(watts: number): string {
  return `${watts.toLocaleString('it-IT')} W`
}
