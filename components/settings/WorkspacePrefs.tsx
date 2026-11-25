'use client'
// components/settings/WorkspacePrefs.tsx — the workspace settings that client screens need without a fetch (the
// area units new units start with, whether the viewer may delete units, what the workspace calls each unit status). Provided once by the workspace layout; read with useWorkspacePrefs().
import { createContext, useContext } from 'react'
import { DEFAULT_STATUS_LABELS, type AreaUnit, type UnitStatus } from '@/lib/settings/workspace'

export interface WorkspacePrefs {
  areaUnitBuilt: AreaUnit
  areaUnitLand: AreaUnit
  /** Owners and admins may delete units (the server checks again). */
  canDeleteInventory: boolean
  /** The workspace's names for unit statuses (Settings → Inventory). */
  statusLabels: Record<UnitStatus, string>
}

const Prefs = createContext<WorkspacePrefs>({ areaUnitBuilt: 'sqft', areaUnitLand: 'sqyd', canDeleteInventory: false, statusLabels: DEFAULT_STATUS_LABELS })

export function WorkspacePrefsProvider({ value, children }: { value: WorkspacePrefs; children: React.ReactNode }) {
  return <Prefs.Provider value={value}>{children}</Prefs.Provider>
}

export function useWorkspacePrefs(): WorkspacePrefs {
  return useContext(Prefs)
}

/** The workspace's name for a unit status; outside a workspace (buyer pages) the standard names. */
export function useStatusLabels(): Record<UnitStatus, string> {
  return useContext(Prefs).statusLabels
}
