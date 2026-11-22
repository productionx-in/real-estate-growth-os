'use client'
// components/projects/ProjectCardMenu.tsx — the "Manage" menu on a project card: open, edit, plot map and (owners and
// admins) delete. Sits over the card link, so clicks here never open the project by accident.
import Link from 'next/link'
import { MoreHorizontal, Pencil, MapPinned, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { DeleteProjectDialog } from './DeleteProjectDialog'

export function ProjectCardMenu({ projectId, projectName, orgSlug, canEdit, canDelete }: { projectId: string; projectName: string; orgSlug: string; canEdit: boolean; canDelete: boolean }) {
  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="size-8" aria-label={`Manage ${projectName}`}><MoreHorizontal aria-hidden /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canEdit && <DropdownMenuItem asChild><Link href={`/${orgSlug}/projects/${projectId}/edit`}><Pencil aria-hidden /> Edit project</Link></DropdownMenuItem>}
          <DropdownMenuItem asChild><Link href={`/${orgSlug}/projects/${projectId}/map`}><MapPinned aria-hidden /> Plot map</Link></DropdownMenuItem>
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DeleteProjectDialog projectId={projectId} projectName={projectName} orgSlug={orgSlug}
                trigger={<DropdownMenuItem destructive onSelect={(e) => e.preventDefault()}><Trash2 aria-hidden /> Delete project</DropdownMenuItem>} />
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
