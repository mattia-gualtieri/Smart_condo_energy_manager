'use client'

import { type Appliance, type LoadState, type Priority, appliancePowerW } from '@/lib/energy-data'
import { Power, ShieldAlert } from 'lucide-react'
import { ApplianceIcon, LOAD_STATE_CONFIG, formatW } from './status'

const PRIORITIES: { value: Priority; label: string; hint: string }[] = [
  { value: 1, label: 'P1', hint: 'Alta' },
  { value: 2, label: 'P2', hint: 'Media' },
  { value: 3, label: 'P3', hint: 'Bassa' },
]

export function ApplianceCard({
  appliance,
  onToggle,
  onPriorityChange,
}: {
  appliance: Appliance
  onToggle: (id: string) => void
  onPriorityChange: (id: string, priority: Priority) => void
}) {
  const power = appliancePowerW(appliance)
  const stateCfg = LOAD_STATE_CONFIG[appliance.state]
  const isShed = appliance.state === 'shed'
  const isOn = appliance.state === 'on'

  return (
    <article className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`grid size-11 place-items-center rounded-xl ring-1 ${
              isOn
                ? 'bg-success/15 text-success ring-success/30'
                : isShed
                  ? 'bg-danger/15 text-danger ring-danger/30'
                  : 'bg-secondary text-muted-foreground ring-border'
            }`}
          >
            <ApplianceIcon category={appliance.category} className="size-5" />
          </span>
          <div>
            <h3 className="font-semibold leading-tight">{appliance.name}</h3>
            <span className={`text-xs font-medium ${stateCfg.text}`}>{stateCfg.label}</span>
          </div>
        </div>
        <div className="text-right font-mono">
          <div className="text-lg font-semibold tabular-nums">{isOn ? formatW(power) : '0 W'}</div>
          <div className="text-[11px] text-muted-foreground">nom. 3000 W</div>
        </div>
      </div>

      {isShed && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          <ShieldAlert className="size-4 shrink-0" aria-hidden />
          Distaccato automaticamente dall&apos;algoritmo per rientrare nel limite.
        </div>
      )}

      {/* Manual override */}
      <div className="mt-4">
        <span className="text-xs font-medium text-muted-foreground">Override Manuale</span>
        <button
          type="button"
          onClick={() => onToggle(appliance.id)}
          aria-pressed={isOn}
          className={`mt-1.5 flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition ${
            isOn
              ? 'border-success/40 bg-success/15 text-success'
              : 'border-border bg-secondary text-foreground hover:bg-accent'
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <Power className="size-4" aria-hidden />
            {isOn ? 'Acceso' : isShed ? 'Riattiva Carico' : 'Spento'}
          </span>
          <span
            className={`relative h-6 w-11 rounded-full transition ${isOn ? 'bg-success' : 'bg-input'}`}
            aria-hidden
          >
            <span
              className={`absolute top-0.5 size-5 rounded-full bg-background shadow transition-all ${
                isOn ? 'left-[calc(100%-1.375rem)]' : 'left-0.5'
              }`}
            />
          </span>
        </button>
      </div>

      {/* Priority selector */}
      <div className="mt-4">
        <span className="text-xs font-medium text-muted-foreground">Priorità Distacco</span>
        <div
          role="radiogroup"
          aria-label={`Priorità per ${appliance.name}`}
          className="mt-1.5 grid grid-cols-3 gap-1.5 rounded-xl bg-secondary p-1"
        >
          {PRIORITIES.map((p) => {
            const active = appliance.priority === p.value
            return (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onPriorityChange(appliance.id, p.value)}
                className={`flex flex-col items-center rounded-lg px-2 py-2 text-center transition ${
                  active
                    ? 'bg-card text-foreground shadow-sm ring-1 ring-primary/40'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="text-sm font-semibold">{p.label}</span>
                <span className="text-[10px] leading-tight text-pretty">{p.hint}</span>
              </button>
            )
          })}
        </div>
      </div>
    </article>
  )
}
