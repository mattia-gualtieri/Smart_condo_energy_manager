'use client'

import {
  type Apartment,
  CONTRACT_OPTIONS,
  type Priority,
  apartmentPowerW,
  apartmentStatus,
} from '@/lib/energy-data'
import { AlertTriangle, ArrowLeft, Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ApplianceCard } from './appliance-card'
import { APARTMENT_STATUS_CONFIG } from './status'

function Gauge({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(1, value / max)
  const radius = 80
  const circumference = Math.PI * radius // half circle
  const dash = pct * circumference
  return (
    <div className="relative flex flex-col items-center">
      <svg viewBox="0 0 200 110" className="w-56 max-w-full" role="img" aria-label="Indicatore potenza">
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="var(--secondary)"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          className="transition-all duration-500 ease-out"
        />
      </svg>
      <div className="-mt-14 text-center font-mono">
        <div className="text-4xl font-semibold tabular-nums">{value.toLocaleString('it-IT')}</div>
        <div className="text-sm text-muted-foreground">W consumati</div>
      </div>
    </div>
  )
}

export function ApartmentView({
  apartment,
  onBack,
  onToggleAppliance,
  onPriorityChange,
  onContractChange,
}: {
  apartment: Apartment
  onBack: () => void
  onToggleAppliance: (id: string) => void
  onPriorityChange: (id: string, priority: Priority) => void
  onContractChange: (id: string, limitW: number) => void
}) {
  const power = apartmentPowerW(apartment)
  const status = apartmentStatus(apartment)
  const cfg = APARTMENT_STATUS_CONFIG[status]
  const shedCount = apartment.appliances.filter((a) => a.state === 'shed').length
  const gaugeColor =
    status === 'shedding' ? 'var(--danger)' : status === 'warning' ? 'var(--warning)' : 'var(--primary)'

  // Local draft for the contract setter (synced when switching apartments).
  const [draftLimit, setDraftLimit] = useState(apartment.contractLimitW)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    setDraftLimit(apartment.contractLimitW)
    setSaved(false)
  }, [apartment.id, apartment.contractLimitW])

  const dirty = draftLimit !== apartment.contractLimitW

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Torna alla Vista Condominio
      </button>

      {/* Status header */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-lg font-semibold">{apartment.name}</h2>
            <span className={`size-2 rounded-full ${cfg.dot}`} />
            <span className={`text-sm font-medium ${cfg.text}`}>{cfg.label}</span>
          </div>
          <Gauge value={power} max={apartment.contractLimitW} color={gaugeColor} />
          <p className="mt-3 font-mono text-sm text-muted-foreground">
            Limite contratto{' '}
            <span className="text-foreground">{apartment.contractLimitW.toLocaleString('it-IT')} W</span>
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {status === 'shedding' ? (
            <div className="flex items-start gap-3 rounded-2xl border border-danger/40 bg-danger/10 p-5 text-danger">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">Attenzione: superata la soglia di contratto!</p>
                <p className="mt-1 text-sm text-danger/90">
                  Algoritmo di distacco attivo: {shedCount}{' '}
                  {shedCount === 1 ? 'carico è stato staccato' : 'carichi sono stati staccati'} a bassa
                  priorità (P3) per rientrare nel limite ed evitare il blackout. Riducendo il carico o
                  aumentando il contratto verranno riattivati automaticamente.
                </p>
              </div>
            </div>
          ) : status === 'warning' ? (
            <div className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-5 text-warning">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">Vicino al limite di contratto</p>
                <p className="mt-1 text-sm text-warning/90">
                  Margine residuo:{' '}
                  <span className="font-mono">
                    {(apartment.contractLimitW - power).toLocaleString('it-IT')} W
                  </span>
                  . Accendere altri carichi potrebbe attivare il distacco automatico.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-2xl border border-success/30 bg-success/10 p-5 text-success">
              <Check className="mt-0.5 size-5 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">Consumo entro i limiti</p>
                <p className="mt-1 text-sm text-success/90">
                  Margine disponibile:{' '}
                  <span className="font-mono">
                    {(apartment.contractLimitW - power).toLocaleString('it-IT')} W
                  </span>
                  . Nessun distacco necessario.
                </p>
              </div>
            </div>
          )}

          {/* Contract limit setter */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <label htmlFor="contract" className="text-sm font-medium">
              Limite di Contratto
            </label>
            <p className="mb-3 text-xs text-muted-foreground">
              Adegua la potenza massima contrattuale dell&apos;appartamento.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <select
                  id="contract"
                  value={draftLimit}
                  onChange={(e) => {
                    setDraftLimit(Number(e.target.value))
                    setSaved(false)
                  }}
                  className="appearance-none rounded-lg border border-input bg-secondary py-2 pl-3 pr-8 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {CONTRACT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {(opt / 1000).toFixed(1)} kW
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                disabled={!dirty}
                onClick={() => {
                  onContractChange(apartment.id, draftLimit)
                  setSaved(true)
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Aggiorna Contratto
              </button>
              {saved && !dirty && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                  <Check className="size-3.5" aria-hidden />
                  Aggiornato
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Appliance controls */}
      <section aria-label="Controllo carichi e prese smart" className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Carichi &amp; Prese Smart</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {apartment.appliances.map((appliance) => (
            <ApplianceCard
              key={appliance.id}
              appliance={appliance}
              onToggle={onToggleAppliance}
              onPriorityChange={onPriorityChange}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
