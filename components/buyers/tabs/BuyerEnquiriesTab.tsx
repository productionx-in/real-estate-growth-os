'use client'
// components/buyers/tabs/BuyerEnquiriesTab.tsx
import React from 'react'
import { Users, PhoneCall, Calendar, Building2, TrendingUp, Clock } from 'lucide-react'
import type { Buyer360Data } from '@/lib/buyers/types'
import { formatDate } from '@/lib/utils/format'

interface BuyerEnquiriesTabProps {
  data: Buyer360Data
}

export function BuyerEnquiriesTab({ data }: BuyerEnquiriesTabProps) {
  const { leads, timeline } = data

  return (
    <div className="space-y-6">
      {/* 1. Associated Enquiries & Leads */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
            <Users className="h-4 w-4 text-[var(--brand)]" />
            Originating Enquiries & CRM Records ({leads.length})
          </h3>
        </div>

        {leads.length === 0 ? (
          <p className="text-xs text-[var(--foreground-muted)] italic py-4 text-center">
            No active or past leads directly linked to this buyer profile.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--border)] text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider bg-[var(--surface-muted)]">
                <tr>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Lead Name</th>
                  <th className="px-3 py-2.5">Source</th>
                  <th className="px-3 py-2.5">Interested Project</th>
                  <th className="px-3 py-2.5">CRM Status</th>
                  <th className="px-3 py-2.5">Deal Stage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {leads.map((l) => (
                  <tr key={l.id} className="hover:bg-[var(--surface-muted)] transition-colors">
                    <td className="px-3 py-2.5 text-[var(--foreground-muted)]">{formatDate(l.created_at)}</td>
                    <td className="px-3 py-2.5 font-medium text-[var(--foreground)]">{l.name}</td>
                    <td className="px-3 py-2.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                        {l.source}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-[var(--foreground)]">
                      {l.project ? l.project.name : <span className="text-[var(--foreground-muted)]">General Enquiry</span>}
                    </td>
                    <td className="px-3 py-2.5 capitalize text-[var(--foreground)]">{l.status}</td>
                    <td className="px-3 py-2.5">
                      {l.deal ? (
                        <span className="font-semibold text-emerald-700 uppercase text-[10px]">
                          {l.deal.stage.replace(/_/g, ' ')}
                        </span>
                      ) : (
                        <span className="text-[var(--foreground-muted)]">No active deal</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 2. Unified Communication & Follow-up Timeline */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm space-y-4">
        <div className="border-b border-[var(--border)] pb-3">
          <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
            <Clock className="h-4 w-4 text-[var(--brand)]" />
            Complete Interaction & Audit Timeline
          </h3>
        </div>

        <div className="relative pl-6 space-y-6 before:absolute before:bottom-0 before:left-2 before:top-2 before:w-0.5 before:bg-[var(--border)]">
          {timeline.map((item) => (
            <div key={item.id} className="relative text-xs space-y-1">
              <div
                className={`absolute -left-6 top-1 h-2.5 w-2.5 rounded-full ring-4 ring-[var(--surface)] ${
                  item.type === 'payment'
                    ? 'bg-emerald-500'
                    : item.type === 'document'
                    ? 'bg-blue-500'
                    : 'bg-[var(--brand)]'
                }`}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-[var(--foreground)]">{item.title}</span>
                <span className="text-[11px] text-[var(--foreground-muted)]">{formatDate(item.timestamp)}</span>
              </div>
              <p className="text-[var(--foreground-muted)]">{item.description}</p>
              {item.actor_name && (
                <p className="text-[10px] text-[var(--foreground-muted)]">By: {item.actor_name}</p>
              )}
            </div>
          ))}
          {timeline.length === 0 && (
            <p className="text-xs text-[var(--foreground-muted)] italic py-2">
              No historical interactions recorded yet.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
