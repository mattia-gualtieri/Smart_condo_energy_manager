import { formatW } from './status'

export function PowerBar({
  value,
  max,
  barClassName,
  warningAt = 0.85,
}: {
  value: number
  max: number
  barClassName: string
  /** Fraction of max where the amber warning marker sits. */
  warningAt?: number
}) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div className="space-y-1.5">
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${barClassName}`}
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute inset-y-0 w-px bg-foreground/40"
          style={{ left: `${warningAt * 100}%` }}
          aria-hidden
        />
      </div>
      <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
        <span className="tabular-nums text-foreground">{formatW(value)}</span>
        <span className="tabular-nums">/ {formatW(max)}</span>
      </div>
    </div>
  )
}
