'use client'

import {
  CAPACITY_OPTIONS,
  type Condo,
  apartmentPowerW,
  apartmentStatus,
  appliancePowerW,
} from '@/lib/energy-data'
import { AlertTriangle, ArrowRight, Building2, Check, CircleCheck, Power, SlidersHorizontal, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PowerBar } from './power-bar'
import { APARTMENT_STATUS_CONFIG, ApplianceIcon, StatusBadge, formatW } from './status'

function SummaryCard({
  icon,
  label,
  children,
  accent,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
  accent?: string
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className={`grid size-8 place-items-center rounded-lg ${accent ?? 'bg-secondary text-foreground'}`}>
          {icon}
        </span>
        {label}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  )
}

export function CondoView({
  condo,
  onOpenApartment,
  onCapacityChange,
}: {
  condo: Condo
  onOpenApartment: (id: string) => void
  onCapacityChange: (capacityW: number) => void
}) {
  const totalPower = condo.apartments.reduce((sum, apt) => sum + apartmentPowerW(apt), 0)
  const overloadEvents = condo.apartments.filter((apt) => apartmentStatus(apt) === 'shedding').length
  const activeApartments = condo.apartments.filter((apt) => apartmentPowerW(apt) > 0).length
  const isOverload = totalPower > condo.totalCapacityW
  const capacityPct = Math.min(100, (totalPower / condo.totalCapacityW) * 100)

  // Inline editor for the building-wide capacity ceiling.
  const [editingCapacity, setEditingCapacity] = useState(false)
  const [draftCapacity, setDraftCapacity] = useState(condo.totalCapacityW)
  useEffect(() => {
    setDraftCapacity(condo.totalCapacityW)
  }, [condo.totalCapacityW])

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <section aria-label="Riepilogo condominio" className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm md:col-span-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
                <Zap className="size-4" aria-hidden />
              </span>
              Potenza Totale
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                isOverload
                  ? 'bg-danger/15 text-danger ring-danger/30'
                  : 'bg-success/10 text-success ring-success/30'
              }`}
            >
              {isOverload ? <AlertTriangle className="size-3" /> : <CircleCheck className="size-3" />}
              {isOverload ? 'Sovraccarico' : 'OK'}
            </span>
          </div>
          <div className="mb-3 mt-4 flex items-baseline gap-1.5 font-mono">
            <span className="text-3xl font-semibold tabular-nums text-foreground">
              {totalPower.toLocaleString('it-IT')}
            </span>
            <span className="text-sm text-muted-foreground">
              W / {condo.totalCapacityW.toLocaleString('it-IT')} W
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isOverload ? 'bg-danger' : 'bg-primary'}`}
              style={{ width: `${capacityPct}%` }}
            />
          </div>

          {/* Building-wide capacity ceiling editor */}
          <div className="mt-4 border-t border-border pt-3">
            {editingCapacity ? (
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="capacity" className="sr-only">
                  Capacità massima del condominio
                </label>
                <select
                  id="capacity"
                  value={draftCapacity}
                  onChange={(e) => setDraftCapacity(Number(e.target.value))}
                  className="appearance-none rounded-lg border border-input bg-secondary py-1.5 pl-3 pr-8 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {CAPACITY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {(opt / 1000).toFixed(1)} kW
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    onCapacityChange(draftCapacity)
                    setEditingCapacity(false)
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                >
                  <Check className="size-3.5" aria-hidden />
                  Salva
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraftCapacity(condo.totalCapacityW)
                    setEditingCapacity(false)
                  }}
                  className="rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition hover:text-foreground"
                >
                  Annulla
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditingCapacity(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
              >
                <SlidersHorizontal className="size-3.5" aria-hidden />
                Modifica capacità massima
              </button>
            )}
          </div>
        </div>

        <SummaryCard
          icon={<AlertTriangle className="size-4" />}
          label="Eventi di Sovraccarico"
          accent={overloadEvents > 0 ? 'bg-danger/15 text-danger' : 'bg-secondary text-foreground'}
        >
          <div className="flex items-baseline gap-2 font-mono">
            <span className="text-3xl font-semibold tabular-nums">{overloadEvents}</span>
            <span className="text-sm text-muted-foreground">attivi ora</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Appartamenti con distacco carichi in corso</p>
        </SummaryCard>

        <SummaryCard
          icon={<Building2 className="size-4" />}
          label="Appartamenti Attivi"
          accent="bg-secondary text-foreground"
        >
          <div className="flex items-baseline gap-2 font-mono">
            <span className="text-3xl font-semibold tabular-nums">{activeApartments}</span>
            <span className="text-sm text-muted-foreground">/ {condo.apartments.length} totali</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Con almeno un carico attivo</p>
        </SummaryCard>
      </section>

      {/* Apartment grid */}
      <section aria-label="Panoramica appartamenti" className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Panoramica Appartamenti</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {condo.apartments.map((apt) => {
            const power = apartmentPowerW(apt)
            const status = apartmentStatus(apt)
            const cfg = APARTMENT_STATUS_CONFIG[status]
            return (
              <article
                key={apt.id}
                className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{apt.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      Contratto {(apt.contractLimitW / 1000).toFixed(1)} kW
                    </p>
                  </div>
                  <StatusBadge status={status} />
                </div>

                <div className="my-4">
                  <PowerBar value={power} max={apt.contractLimitW} barClassName={cfg.bar} />
                </div>

                <div className="flex items-center gap-2">
                  {apt.appliances.map((a) => {
                    const on = appliancePowerW(a) > 0
                    const shed = a.state === 'shed'
                    return (
                      <span
                        key={a.id}
                        title={`${a.name} — ${on ? formatW(a.ratedW) : shed ? 'Staccato' : 'Spento'}`}
                        className={`grid size-9 place-items-center rounded-lg ring-1 transition ${
                          on
                            ? 'bg-success/15 text-success ring-success/30'
                            : shed
                              ? 'bg-danger/15 text-danger ring-danger/30'
                              : 'bg-secondary text-muted-foreground ring-border'
                        }`}
                      >
                        <ApplianceIcon category={a.category} className="size-4" />
                      </span>
                    )
                  })}
                  <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                    <Power className="size-3.5" aria-hidden />
                    {apt.appliances.filter((a) => a.state === 'on').length}/{apt.appliances.length}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenApartment(apt.id)}
                  className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-medium text-foreground transition hover:bg-accent"
                >
                  Gestisci / Dettagli
                  <ArrowRight className="size-4" aria-hidden />
                </button>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}
