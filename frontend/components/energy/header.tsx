'use client'

import type { Apartment } from '@/lib/energy-data'
import { ChevronDown, Leaf, Zap } from 'lucide-react'

export function Header({
  apartments,
  selected,
  onSelect,
  connected,
}: {
  apartments: Apartment[]
  /** 'global' for the condo view, or an apartment id. */
  selected: string
  onSelect: (value: string) => void
  connected: boolean
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <div className="relative grid size-10 place-items-center rounded-xl bg-primary/15 ring-1 ring-primary/30">
            <Leaf className="size-5 text-primary" aria-hidden />
            <Zap className="absolute -bottom-1 -right-1 size-4 rounded-full bg-background p-0.5 text-warning" aria-hidden />
          </div>
          <div className="leading-tight">
            <h1 className="text-balance text-base font-semibold tracking-tight sm:text-lg">
              Smart Condo Energy Manager
            </h1>
            <p className="text-xs text-muted-foreground">Gestione carichi &amp; anti-blackout</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <label className="relative">
            <span className="sr-only">Seleziona vista appartamento</span>
            <select
              value={selected}
              onChange={(e) => onSelect(e.target.value)}
              className="appearance-none rounded-lg border border-input bg-card py-2 pl-3 pr-9 text-sm font-medium text-foreground shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="global">Vista Condominio (Globale)</option>
              {apartments.map((apt) => (
                <option key={apt.id} value={apt.id}>
                  {apt.name}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
          </label>

          <span
            className="inline-flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs font-medium text-success"
            role="status"
          >
            <span className="relative flex size-2">
              {connected && (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
              )}
              <span className={`relative inline-flex size-2 rounded-full ${connected ? 'bg-success' : 'bg-muted-foreground'}`} />
            </span>
            <span className="hidden sm:inline">
              {connected ? 'Connected to Cloud · Realtime' : 'Riconnessione…'}
            </span>
            <span className="sm:hidden">{connected ? 'Live' : '…'}</span>
          </span>
        </div>
      </div>
    </header>
  )
}
