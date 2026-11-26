// lib/plots/version-groups.ts — how the project map page lays out map versions (components/plots/MapDocuments.tsx).
// Per map (phase): the version buyers and the team see now ("live"), the one being worked on ("in progress"), and the
// rest folded away ("earlier"). Plus the next step on the in-progress version and who it is waiting on, so the client
// and the RE team never have to read a review history to know whose turn it is. Pure; the server still checks every
// step (POST /api/plot-maps/versions/[id]/review).

export interface GroupableVersion { id: string; layoutId: string; versionNo: number; status: string; renderStatus: 'pending' | 'ready' | 'failed' }

export interface VersionGroup<V extends GroupableVersion> {
  layoutId: string
  live: V | null
  inProgress: V | null
  earlier: V[]
}

const WORKING = new Set(['draft', 'in_review', 'approved', 'rejected'])

/**
 * Groups versions by map, in the order the maps are listed. "Live" is the published version; "in progress" is the
 * newest version still moving through review (or still rendering). Superseded versions and older drafts go to
 * "earlier", newest first. Maps with no versions are left out.
 */
export function groupVersions<V extends GroupableVersion>(layoutIds: string[], versions: V[]): VersionGroup<V>[] {
  const out: VersionGroup<V>[] = []
  const ids = [...layoutIds, ...versions.map((v) => v.layoutId).filter((id) => !layoutIds.includes(id))]
  for (const layoutId of [...new Set(ids)]) {
    const mine = versions.filter((v) => v.layoutId === layoutId).sort((a, b) => b.versionNo - a.versionNo)
    if (mine.length === 0) continue
    const live = mine.find((v) => v.status === 'published' && v.renderStatus === 'ready') ?? null
    const inProgress = mine.find((v) => v !== live && (v.renderStatus !== 'ready' || WORKING.has(v.status)) && (!live || v.versionNo > live.versionNo)) ?? null
    out.push({ layoutId, live, inProgress, earlier: mine.filter((v) => v !== live && v !== inProgress) })
  }
  return out
}

export type WaitingOn = 'you' | 'approver' | 'drawing' | 'qa'
export interface NextStep { label: string; waitingOn: WaitingOn }

/**
 * What happens next to a version and who it waits on, from the viewer's side. `canApprove` = owner or admin (the
 * developer's sign-off); `qaPassed` = QA passed since the last submission.
 */
export function nextStep(v: Pick<GroupableVersion, 'status' | 'renderStatus'>, canApprove: boolean, qaPassed: boolean): NextStep | null {
  if (v.renderStatus === 'failed') return { label: 'The page did not render. Render it again.', waitingOn: 'you' }
  if (v.renderStatus === 'pending') return { label: 'The page is still being prepared.', waitingOn: 'you' }
  switch (v.status) {
    case 'draft': return { label: 'Draw each plot and link it to its unit, then submit for review.', waitingOn: 'drawing' }
    case 'rejected': return { label: 'Sent back. Make the changes asked for and submit again.', waitingOn: 'drawing' }
    case 'in_review': return qaPassed
      ? { label: canApprove ? 'QA passed. Check the map and approve it, or send it back.' : 'QA passed. Waiting for the owner or an admin to approve.', waitingOn: canApprove ? 'you' : 'approver' }
      : { label: 'Being checked: every plot outlined and linked to the right unit.', waitingOn: 'qa' }
    case 'approved': return { label: canApprove ? 'Approved. Publish it when you are ready; buyers see it at once.' : 'Approved. Waiting for the owner or an admin to publish.', waitingOn: canApprove ? 'you' : 'approver' }
    default: return null
  }
}

export const WAITING_LABEL: Record<WaitingOn, string> = {
  you: 'Your turn', approver: 'Waiting on owner or admin', drawing: 'Drawing plots', qa: 'In QA',
}

/** QA passed since the latest submission (history is newest first). */
export function qaPassedSinceSubmit(history: { action: string }[]): boolean {
  const lastSubmit = history.findIndex((h) => h.action === 'submitted')
  return history.slice(0, lastSubmit < 0 ? 0 : lastSubmit).some((h) => h.action === 'qa_passed')
}
