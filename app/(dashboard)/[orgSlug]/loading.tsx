// Workspace pages: the building animation inside the shell while a page's data loads (sidebar and header stay put).
import { ShellLoader } from '@/components/brand/ShellLoader'

export default function Loading() {
  return <ShellLoader label="Loading…" />
}
