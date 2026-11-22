'use client'
// components/settings/WorkspacePrefs.tsx — the workspace settings that client screens need without a fetch (the
// area units new units start with). Provided once by the workspace layout; read with useWorkspacePrefs().
import { createContext, useContext } from 'react'
import type { AreaUnit } from '@/lib/settings/workspace'

export interface WorkspacePrefs { areaUnitBuilt: AreaUnit; areaUnitLand: AreaUnit }

const Prefs = createContext<WorkspacePrefs>({ areaUnitBuilt: 'sqft', areaUnitLand: 'sqyd' })

export function WorkspacePrefsProvider({ value, children }: { value: WorkspacePrefs; children: React.ReactNode }) {
  return <Prefs.Provider value={value}>{children}</Prefs.Provider>
}

export function useWorkspacePrefs(): WorkspacePrefs {
  return useContext(Prefs)
}
