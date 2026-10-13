'use client'

import GrafanaPanel from '@/components/ui/GrafanaPanel'
import { ApartmentView } from '@/components/energy/apartment-view'
import { CondoView } from '@/components/energy/condo-view'
import { Header } from '@/components/energy/header'
import {
  type Apartment,
  type Condo,
  type Priority,
  appliancePowerW,
  type LoadState,
  type ApplianceCategory,
  type Appliance,
} from '@/lib/energy-data'
import { useState, useEffect } from 'react'

/**
 * Converte il Digital Twin restituito da Python (FastAPI)
 * nella struttura dati ESATTA usata in energy-data.ts
 */
function mapDigitalTwinToCondo(dt: any, prevCondo: Condo): Condo {
  if (!dt) return prevCondo

  const apartments: Apartment[] = Object.entries(dt.appartamenti || {}).map(
    ([appId, appData]: [string, any]) => {
      const appliances: Appliance[] = Object.entries(appData.carichi || {}).map(
        ([caricoId, caricoData]: [string, any]) => {
          // 1. Mappatura esatta dello stato (LoadState)
          let state: LoadState = 'off'
          if (caricoData.sganciato_da_cloud) {
            state = 'shed'
          } else if (caricoData.stato) {
            state = 'on'
          }

          // 2. Lettura potenza
          const ratedW = caricoData.potenza_w

          // 3. Assegnazione di una 'ApplianceCategory' valida
          let category: ApplianceCategory = 'lighting'
          const nomeLower = (caricoData.nome || '').toLowerCase()
          if (nomeLower.includes('frigo')) category = 'fridge'
          else if (nomeLower.includes('lava')) category = 'washer'
          else if (nomeLower.includes('clima')) category = 'climate'
          else if (nomeLower.includes('forno')) category = 'oven'
          else if (nomeLower.includes('auto') || nomeLower.includes('ev')) category = 'ev'

          return {
            id: caricoId,
            name: caricoData.nome || caricoId,
            category: category,
            ratedW: ratedW,
            state: state,
            priority: (caricoData.priorita || 3) as Priority,
          }
        }
      )

      return {
        id: appId,
        name: appId.replace('_', ' ').toUpperCase(),
        contractLimitW: appData.contratto_w || 3000,
        appliances: appliances,
      }
    }
  )

  return {
    ...prevCondo,
    name: prevCondo.name || 'Condominio Smart',
    totalCapacityW: dt.limite_condominio_w || 8000,
    apartments: apartments,
  }
}

// Stato iniziale vuoto
const emptyCondo: Condo = {
  name: 'Condominio Smart',
  totalCapacityW: 8000,
  apartments: [],
}

export default function Page() {
  const [condo, setCondo] = useState<Condo>(emptyCondo)
  const [view, setView] = useState<string>('global') // 'global' | apartment id

  // Interroga il server Python ogni 1 secondo per sincronizzare i dati
  useEffect(() => {
    const fetchState = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/digital_twin')
        if (res.ok) {
          const dt = await res.json()
          setCondo((prev) => mapDigitalTwinToCondo(dt, prev))
        }
      } catch (err) {
        // Ignora se il server Python non è ancora avviato
      }
    }

    fetchState()
    const interval = setInterval(fetchState, 1000)

    return () => clearInterval(interval)
  }, [])

  function updateApartment(id: string, updater: (apt: Apartment) => Apartment) {
    setCondo((prev) => ({
      ...prev,
      apartments: prev.apartments.map((apt) =>
        apt.id === id ? updater(apt) : apt,
      ),
    }))
  }

  // --- Gestori di eventi (interazioni dell'utente) ---

  async function handleToggleAppliance(aptId: string, applianceId: string) {
    const targetApt = condo.apartments.find((a) => a.id === aptId)
    const targetAppliance = targetApt?.appliances.find((a) => a.id === applianceId)

    if (!targetAppliance) return

    const isCurrentlyOn = targetAppliance.state === 'on'
    const nuovaAzione = isCurrentlyOn ? 'OFF' : 'ON'

    updateApartment(aptId, (apt) => ({
      ...apt,
      appliances: apt.appliances.map((a) => {
        if (a.id !== applianceId) return a
        return { ...a, state: nuovaAzione === 'ON' ? 'on' : 'off' }
      }),
    }))

    try {
      await fetch('http://localhost:8000/api/comando', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appartamento_id: aptId,
          carico_id: applianceId,
          azione: nuovaAzione,
        }),
      })
    } catch (err) {
      console.error("Errore durante l'invio del comando a Python:", err)
    }
  }

  async function handlePriorityChange(
    aptId: string,
    applianceId: string,
    priority: Priority
  ) {
    const targetApt = condo.apartments.find((a) => a.id === aptId)
    const targetAppliance = targetApt?.appliances.find((a) => a.id === applianceId)
    if (!targetAppliance) return

    updateApartment(aptId, (apt) => ({
      ...apt,
      appliances: apt.appliances.map((a) =>
        a.id === applianceId ? { ...a, priority } : a
      ),
    }))

    try {
      await fetch('http://localhost:8000/api/configura_carico', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appartamento_id: aptId,
          carico_id: applianceId,
          nuovo_nome: targetAppliance.name,
          nuova_priorita: priority,
        }),
      })
    } catch (err) {
      console.error("Errore nell'invio della nuova priorità a Python:", err)
    }
  }

  async function handleContractChange(aptId: string, limitW: number) {
    updateApartment(aptId, (apt) => ({ ...apt, contractLimitW: limitW }))

    try {
      await fetch('http://localhost:8000/api/imposta_contratto', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appartamento_id: aptId,
          nuovo_limite_w: limitW,
        }),
      })
    } catch (err) {
      console.error("Errore nell'invio del nuovo contratto a Python:", err)
    }
  }

  async function handleCapacityChange(capacityW: number) {
    try {
      const response = await fetch(
        'http://localhost:8000/api/imposta_limite_condominio',
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ nuovo_limite_w: capacityW }),
        }
      )

      if (!response.ok) {
        throw new Error('Errore nel salvataggio sul server')
      }

      setCondo((prev) => ({ ...prev, totalCapacityW: capacityW }))
    } catch (error) {
      console.error('Impossibile aggiornare il limite del condominio:', error)
    }
  }

  const activeApartment = condo.apartments.find((apt) => apt.id === view)

  return (
    <div className="min-h-screen bg-background">
      <Header
        apartments={condo.apartments}
        selected={view}
        onSelect={setView}
        connected
      />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {activeApartment ? (
          <ApartmentView
            apartment={activeApartment}
            onBack={() => setView('global')}
            onToggleAppliance={(applianceId) =>
              handleToggleAppliance(activeApartment.id, applianceId)
            }
            onPriorityChange={(applianceId, priority) =>
              handlePriorityChange(activeApartment.id, applianceId, priority)
            }
            onContractChange={handleContractChange}
          />
        ) : (
          <div className="space-y-8">
            {/* Vista Generale del Condominio */}
            <CondoView
              condo={condo}
              onOpenApartment={setView}
              onCapacityChange={handleCapacityChange}
            />

            {/* Sezione Analytics Grafana */}
            <section className="space-y-4 pt-6 border-t border-border">
              <h2 className="text-xl font-bold tracking-tight">
                Telemetria e Grafici Condominiali
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <GrafanaPanel
                  title="Consumo Condominiale vs Limite"
                  src="http://localhost:3000/d-solo/adhq4bp/dashboard-iot?orgId=1&panelId=panel-1&from=now-30m&to=now&refresh=3s&theme=dark&kiosk"
                />
                <GrafanaPanel
                  title="Consumo per Singolo Appartamento"
                  src="http://localhost:3000/d-solo/adhq4bp/dashboard-iot?orgId=1&panelId=panel-2&from=now-30m&to=now&refresh=3s&theme=dark&kiosk"
                />
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}