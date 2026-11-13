'use client'
// components/leads/ExportLeadsButton.tsx
import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'

interface ExportLeadsButtonProps {
  orgSlug: string
  currentStatus?: string
  currentSource?: string
}

export function ExportLeadsButton({
  orgSlug,
  currentStatus,
  currentSource,
}: ExportLeadsButtonProps) {
  const [downloading, setDownloading] = useState(false)

  async function handleExport() {
    setDownloading(true)
    try {
      const params = new URLSearchParams({ orgSlug })
      if (currentStatus) params.set('status', currentStatus)
      if (currentSource) params.set('source', currentSource)

      const response = await fetch(`/api/leads/export?${params.toString()}`)
      if (!response.ok) {
        throw new Error('Failed to export leads')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `leads_${orgSlug}_${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
      alert('Could not export leads. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={downloading}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-[var(--foreground)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--surface-hover)] disabled:opacity-60 transition-colors"
      title="Export leads to CSV file"
    >
      {downloading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--brand)]" />
      ) : (
        <Download className="w-3.5 h-3.5" />
      )}
      {downloading ? 'Exporting…' : 'Export CSV'}
    </button>
  )
}
