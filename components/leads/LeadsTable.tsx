'use client'
// components/leads/LeadsTable.tsx
// Renders the lead list with inline assign action for managers.
import { useState } from 'react'
import Link from 'next/link'
import { UserPlus } from 'lucide-react'
import { formatDate } from '@/lib/utils/format'
import { LeadStatusBadge } from './LeadStatusBadge'
import { AssignLeadDialog } from './AssignLeadDialog'
import type { LeadStatus, LeadSource } from '@/types/database'

type LeadRow = {
  id: string
  name: string
  phone: string
  email: string | null
  status: LeadStatus
  priority: string
  source: LeadSource
  created_at: string
  project: { id: string; name: string } | null
  assignee: { id: string; full_name: string } | null
}

interface LeadsTableProps {
  leads: LeadRow[]
  orgSlug: string
  orgId: string
  /** Current user's role — determines whether assign button appears */
  viewerRole: 'owner' | 'admin' | 'manager' | 'sales_exec' | 'readonly'
}

const SOURCE_LABELS: Record<string, string> = {
  website: 'Website',
  meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
  '99acres': '99acres',
  housing: 'Housing.com',
  magicbricks: 'Magicbricks',
  whatsapp: 'WhatsApp',
  referral: 'Referral',
  walk_in: 'Walk-in',
  csv_import: 'CSV Import',
  other: 'Other',
}

const MANAGER_ROLES = ['owner', 'admin', 'manager']

export function LeadsTable({ leads, orgSlug, orgId, viewerRole }: LeadsTableProps) {
  const isManager = MANAGER_ROLES.includes(viewerRole)

  const [assignDialog, setAssignDialog] = useState<{
    leadId: string
    leadName: string
    currentAssigneeId: string | null
  } | null>(null)

  return (
    <>
      <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--surface)]">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-hover)]">
              <th className="text-left px-4 py-2.5 font-medium text-[var(--foreground-muted)]">
                Name
              </th>
              <th className="text-left px-4 py-2.5 font-medium text-[var(--foreground-muted)]">
                Contact
              </th>
              <th className="text-left px-4 py-2.5 font-medium text-[var(--foreground-muted)]">
                Status
              </th>
              <th className="text-left px-4 py-2.5 font-medium text-[var(--foreground-muted)]">
                Project
              </th>
              <th className="text-left px-4 py-2.5 font-medium text-[var(--foreground-muted)]">
                Source
              </th>
              <th className="text-left px-4 py-2.5 font-medium text-[var(--foreground-muted)]">
                Assigned to
              </th>
              <th className="text-left px-4 py-2.5 font-medium text-[var(--foreground-muted)]">
                Added
              </th>
              {isManager && (
                <th className="px-4 py-2.5 w-10" aria-label="Actions" />
              )}
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr
                key={lead.id}
                className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-hover)] transition-colors group"
              >
                {/* Name */}
                <td className="px-4 py-3">
                  <Link
                    href={`/${orgSlug}/leads/${lead.id}`}
                    className="font-medium text-[var(--foreground)] hover:text-[var(--brand)] transition-colors"
                  >
                    {lead.name}
                  </Link>
                </td>

                {/* Contact */}
                <td className="px-4 py-3 text-[var(--foreground-muted)]">
                  <div>{lead.phone}</div>
                  {lead.email && (
                    <div className="text-[11px] text-[var(--foreground-subtle)]">{lead.email}</div>
                  )}
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  <LeadStatusBadge status={lead.status} />
                </td>

                {/* Project */}
                <td className="px-4 py-3 text-[var(--foreground-muted)]">
                  {lead.project?.name ?? (
                    <span className="text-[var(--foreground-subtle)]">—</span>
                  )}
                </td>

                {/* Source */}
                <td className="px-4 py-3 text-[var(--foreground-muted)]">
                  {SOURCE_LABELS[lead.source] ?? lead.source}
                </td>

                {/* Assigned to */}
                <td className="px-4 py-3">
                  {lead.assignee ? (
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full bg-[var(--brand-light)] flex items-center justify-center flex-shrink-0">
                        <span className="text-[9px] font-bold text-[var(--brand)]">
                          {lead.assignee.full_name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="text-[var(--foreground-muted)] truncate max-w-[100px]">
                        {lead.assignee.full_name}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[var(--foreground-subtle)] italic text-[12px]">
                      Unassigned
                    </span>
                  )}
                </td>

                {/* Added date */}
                <td className="px-4 py-3 text-[var(--foreground-muted)]">
                  {formatDate(lead.created_at)}
                </td>

                {/* Assign action — managers only */}
                {isManager && (
                  <td className="px-4 py-3">
                    <button
                      onClick={() =>
                        setAssignDialog({
                          leadId: lead.id,
                          leadName: lead.name,
                          currentAssigneeId: lead.assignee?.id ?? null,
                        })
                      }
                      className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--foreground-subtle)] hover:text-[var(--brand)] hover:bg-[var(--brand-light)] transition-colors opacity-0 group-hover:opacity-100"
                      title="Assign lead"
                      aria-label={`Assign ${lead.name}`}
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Assign dialog */}
      {assignDialog && (
        <AssignLeadDialog
          leadId={assignDialog.leadId}
          leadName={assignDialog.leadName}
          currentAssigneeId={assignDialog.currentAssigneeId}
          orgId={orgId}
          onClose={() => setAssignDialog(null)}
        />
      )}
    </>
  )
}
