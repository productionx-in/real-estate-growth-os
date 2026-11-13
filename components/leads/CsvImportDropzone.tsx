'use client'
// components/leads/CsvImportDropzone.tsx
import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  UploadCloud,
  FileText,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  ArrowRight,
} from 'lucide-react'
import { parseAndValidateCsv, CSV_TEMPLATE_CONTENT, type ValidatedCsvRow } from '@/lib/csv/parser'
import { cn } from '@/lib/utils/cn'

interface Project {
  id: string
  name: string
}

interface CsvImportDropzoneProps {
  orgSlug: string
  projects: Project[]
}

export function CsvImportDropzone({ orgSlug, projects }: CsvImportDropzoneProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<ValidatedCsvRow[]>([])
  const [validCount, setValidCount] = useState(0)
  const [invalidCount, setInvalidCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [successCount, setSuccessCount] = useState<number | null>(null)

  function handleFileSelected(selectedFile: File) {
    if (!selectedFile.name.endsWith('.csv')) {
      setError('Please upload a valid .csv file.')
      return
    }

    setError(null)
    setFile(selectedFile)

    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      if (!content) {
        setError('The selected file appears to be empty.')
        return
      }

      const parsed = parseAndValidateCsv(content)
      setRows(parsed.rows)
      setValidCount(parsed.validCount)
      setInvalidCount(parsed.invalidCount)
      setTotalCount(parsed.totalCount)
    }
    reader.readAsText(selectedFile)
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0])
    }
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
  }

  function handleDownloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE_CONTENT], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'leads_import_template.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  function handleReset() {
    setFile(null)
    setRows([])
    setValidCount(0)
    setInvalidCount(0)
    setTotalCount(0)
    setError(null)
    setSuccessCount(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleImport() {
    const validRows = rows.filter((r) => r.isValid).map((r) => r.data)
    if (validRows.length === 0) {
      setError('No valid rows available to import.')
      return
    }

    setError(null)

    startTransition(async () => {
      try {
        const response = await fetch('/api/leads/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: selectedProjectId || null,
            leads: validRows,
          }),
        })

        const data = await response.json()
        if (!response.ok) {
          setError(data.error ?? 'Import failed')
          return
        }

        setSuccessCount(data.importedCount)
        router.refresh()
      } catch {
        setError('Network error. Failed to complete import.')
      }
    })
  }

  if (successCount !== null) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8 text-center max-w-xl mx-auto space-y-4">
        <div className="w-12 h-12 rounded-full bg-green-50 text-green-600 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">
          Import Successful
        </h2>
        <p className="text-[13px] text-[var(--foreground-muted)]">
          Successfully imported <strong className="text-[var(--foreground)]">{successCount}</strong> leads into your workspace.
        </p>
        <div className="pt-2 flex justify-center gap-3">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-[13px] font-medium text-[var(--foreground)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--surface-hover)] transition-colors"
          >
            Import Another File
          </button>
          <button
            onClick={() => router.push(`/${orgSlug}/leads`)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium text-white bg-[var(--brand)] rounded-md hover:bg-[var(--brand-hover)] transition-colors"
          >
            Go to Leads <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header bar with template download */}
      <div className="flex items-center justify-between bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
        <div>
          <h2 className="text-[13px] font-semibold text-[var(--foreground)]">
            Upload CSV Spreadsheet
          </h2>
          <p className="text-[12px] text-[var(--foreground-muted)]">
            Columns: <code className="text-xs font-mono">name</code>, <code className="text-xs font-mono">phone</code>, <code className="text-xs font-mono">email</code>, <code className="text-xs font-mono">source</code>, <code className="text-xs font-mono">priority</code>, <code className="text-xs font-mono">budget_min</code>, <code className="text-xs font-mono">budget_max</code>, <code className="text-xs font-mono">notes</code>
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownloadTemplate}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[var(--brand)] bg-[var(--brand-light)] border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Download Template
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-[var(--danger-bg)] border border-red-200 text-[13px] text-[var(--danger)] flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Upload area or active preview */}
      {!file ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-[var(--border-strong)] rounded-xl p-10 text-center cursor-pointer hover:border-[var(--brand)] hover:bg-[var(--surface-hover)] transition-all bg-[var(--surface)]"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileSelected(e.target.files[0])
              }
            }}
          />
          <div className="w-12 h-12 rounded-full bg-[var(--brand-light)] text-[var(--brand)] flex items-center justify-center mx-auto mb-3">
            <UploadCloud className="w-6 h-6" />
          </div>
          <h3 className="text-[14px] font-medium text-[var(--foreground)]">
            Click to upload or drag and drop
          </h3>
          <p className="mt-1 text-[12px] text-[var(--foreground-muted)]">
            CSV files only up to 5MB (up to 500 leads per batch)
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* File details & options card */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-[var(--brand)] flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[13px] font-medium text-[var(--foreground)]">
                    {file.name}
                  </div>
                  <div className="text-[11px] text-[var(--foreground-muted)]">
                    {(file.size / 1024).toFixed(1)} KB · {totalCount} total rows
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 text-[12px]">
                  <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 px-2 py-0.5 rounded font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {validCount} valid
                  </span>
                  {invalidCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 px-2 py-0.5 rounded font-medium">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {invalidCount} invalid
                    </span>
                  )}
                </div>
                <button
                  onClick={handleReset}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--foreground-muted)] hover:bg-[var(--surface-hover)] transition-colors"
                  aria-label="Remove file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Target Project selection */}
            <div className="flex items-center gap-4">
              <label htmlFor="importProject" className="text-[13px] font-medium text-[var(--foreground)] w-36">
                Assign to Project:
              </label>
              <select
                id="importProject"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="flex-1 max-w-sm px-3 py-1.5 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)]"
              >
                <option value="">— No project assigned —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Parsed rows preview table */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-[var(--surface-hover)] border-b border-[var(--border)] flex justify-between items-center">
              <span className="text-[12px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
                Preview Rows (First {Math.min(rows.length, 10)} of {rows.length})
              </span>
              <span className="text-[12px] text-[var(--foreground-muted)]">
                Invalid rows will be skipped during import
              </span>
            </div>

            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-gray-50/50">
                    <th className="px-3 py-2 text-left w-12 font-medium text-[var(--foreground-muted)]">#</th>
                    <th className="px-3 py-2 text-left font-medium text-[var(--foreground-muted)]">Status</th>
                    <th className="px-3 py-2 text-left font-medium text-[var(--foreground-muted)]">Name</th>
                    <th className="px-3 py-2 text-left font-medium text-[var(--foreground-muted)]">Phone</th>
                    <th className="px-3 py-2 text-left font-medium text-[var(--foreground-muted)]">Email</th>
                    <th className="px-3 py-2 text-left font-medium text-[var(--foreground-muted)]">Source</th>
                    <th className="px-3 py-2 text-left font-medium text-[var(--foreground-muted)]">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 10).map((row) => (
                    <tr
                      key={row.rowIndex}
                      className={cn(
                        'border-b border-[var(--border)] last:border-0 transition-colors',
                        row.isValid ? 'hover:bg-[var(--surface-hover)]' : 'bg-red-50/40'
                      )}
                    >
                      <td className="px-3 py-2 text-[var(--foreground-subtle)] font-mono">
                        {row.rowIndex}
                      </td>
                      <td className="px-3 py-2">
                        {row.isValid ? (
                          <span className="inline-flex items-center text-green-700 gap-1 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Valid
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-red-600 gap-1 font-medium" title={row.errors.join(', ')}>
                            <AlertCircle className="w-3.5 h-3.5" /> Invalid
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-medium text-[var(--foreground)]">
                        {row.data.name || <span className="text-red-500 italic">Missing</span>}
                      </td>
                      <td className="px-3 py-2 text-[var(--foreground-muted)]">
                        {row.data.phone || <span className="text-red-500 italic">Missing</span>}
                      </td>
                      <td className="px-3 py-2 text-[var(--foreground-muted)]">
                        {row.data.email || '—'}
                      </td>
                      <td className="px-3 py-2 text-[var(--foreground-muted)] capitalize">
                        {row.data.source?.replace('_', ' ') || 'csv import'}
                      </td>
                      <td className="px-3 py-2 text-[var(--foreground-muted)] capitalize">
                        {row.data.priority || 'medium'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 text-[13px] font-medium text-[var(--foreground)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--surface-hover)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={isPending || validCount === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium text-white bg-[var(--brand)] rounded-md hover:bg-[var(--brand-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isPending ? 'Importing leads…' : `Import ${validCount} Valid Leads`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
