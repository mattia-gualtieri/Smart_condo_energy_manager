// -----------------------------------------------------------------------------
// Digital Twin data model + mock state.
//
// This module is the single source of truth for the front-end "digital twin".
// In production these shapes mirror the payloads served by the FastAPI backend.
//
// Suggested REST endpoints to wire up later:
//   GET    /api/condo                       -> Condo (all apartments + live power)
//   GET    /api/apartments/:id              -> Apartment
//   PATCH  /api/apartments/:id/contract     -> { contractLimitW }
//   POST   /api/apartments/:id/loads/:load/override  -> { state }
//   PATCH  /api/apartments/:id/loads/:load/priority  -> { priority }
//   WS     /ws/telemetry                     -> realtime power updates
// -----------------------------------------------------------------------------

export type LoadState = 'on' | 'off' | 'shed'
export type Priority = 1 | 2 | 3
export type ApplianceCategory =
  | 'climate'
  | 'washer'
  | 'waterHeater'
  | 'oven'
  | 'fridge'
  | 'ev'
  | 'lighting'
  | 'dishwasher'

export interface Appliance {
  id: string
  name: string
  category: ApplianceCategory
  /** Nominal draw when the appliance is running, in watts. */
  ratedW: number
  state: LoadState
  priority: Priority
}

export interface Apartment {
  id: string
  name: string
  /** Contractual power ceiling in watts. */
  contractLimitW: number
  appliances: Appliance[]
}

export interface Condo {
  name: string
  /** Total simultaneous capacity for the whole building, in watts. */
  totalCapacityW: number
  apartments: Apartment[]
}

/** Live power drawn by an appliance given its current state. */
export function appliancePowerW(a: Appliance): number {
  return a.state === 'on' ? a.ratedW : 0
}

/** Sum of live power for an apartment. */
export function apartmentPowerW(apt: Apartment): number {
  return apt.appliances.reduce((sum, a) => sum + appliancePowerW(a), 0)
}

export type ApartmentStatus = 'normal' | 'warning' | 'shedding'

/** Derive an apartment's status from its live load vs. contract limit. */
export function apartmentStatus(apt: Apartment): ApartmentStatus {
  const power = apartmentPowerW(apt)
  const hasShed = apt.appliances.some((a) => a.state === 'shed')
  if (power > apt.contractLimitW || hasShed) return 'shedding'
  if (power >= apt.contractLimitW * 0.85) return 'warning'
  return 'normal'
}

export const CONTRACT_OPTIONS = [3000, 4500, 6000] as const

/** Selectable building-wide capacity ceilings, in watts. */
export const CAPACITY_OPTIONS = [4500, 6000, 8000, 10000, 12000, 15000, 18000] as const


