'use client'
// components/inventory/BulkImportModal.tsx
// Multi-step bulk inventory import modal (CSV & XLSX) with mapping, preview, and history
import { useState, useRef, useCallback } from 'react'
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  RotateCcw,
  History,
  FileText,
} from 'lucide-react'
import type { ProjectCategory } from '@/types/database'
import { PROJECT_CATEGORY_LABELS } from '@/types/inventory'
import { CATEGORY_COLUMNS } from '@/lib/import/templates'
import {
  parseCsvContent,
  parseXlsxBuffer,
  normalizeHeader,
  sanitizeFormulaInjection,
  type ParsedSpreadsheet,
  MAX_FILE_SIZE_BYTES,
} from '@/lib/import/parser'
import {
  validateImportRows,
  type ValidationSummary,
} from '@/lib/import/validator'
import type { ImportHistoryRecord } from '@/lib/dal/import'
import { formatDate } from '@/lib/utils/format'

interface BulkImportModalProps {
  projectId: string
  projectCategory: ProjectCategory
  onClose: () => void
  onSuccess: () => void
}

type ImportStep = 'upload' | 'mapping' | 'preview' | 'importing' | 'completed'

export function BulkImportModal({
  projectId,
  projectCategory,
  onClose,
  onSuccess,
}: BulkImportModalProps) {
  const [activeTab, setActiveTab] = useState<'import' | 'history'>('import')
  const [step, setStep] = useState<ImportStep>('upload')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Uploaded file & parsed data
  const [parsedData, setParsedData] = useState<ParsedSpreadsheet | null>(null)
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [validationResult, setValidationResult] = useState<ValidationSummary | null>(null)

  // Execution state
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importResult, setImportResult] = useState<{
    referenceId: string
    successfulCount: number
    failedCount: number
    status: string
  } | null>(null)
  const [generalError, setGeneralError] = useState<string | null>(null)

  // Past Import History
  const [historyList, setHistoryList] = useState<ImportHistoryRecord[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Fetch past import history
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const res = await fetch(`/api/inventory/import/history?projectId=${projectId}`)
      const data = await res.json()
      if (data.history) setHistoryList(data.history)
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false)
    }
  }, [projectId])

  const switchToHistory = useCallback(() => {
    setActiveTab('history')
    void loadHistory()
  }, [loadHistory])

  // 1. Handle file selection & reading
  const handleFile = async (selectedFile: File) => {
    setGeneralError(null)

    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setGeneralError('File size exceeds the 10 MB limit.')
      return
    }

    const name = selectedFile.name.toLowerCase()
    const isCsv = name.endsWith('.csv')
    const isXlsx = name.endsWith('.xlsx') || name.endsWith('.xls')

    if (!isCsv && !isXlsx) {
      setGeneralError('Invalid file format. Please upload a .csv or .xlsx file.')
      return
    }

    try {
      let parsed: ParsedSpreadsheet

      if (isCsv) {
        const text = await selectedFile.text()
        parsed = parseCsvContent(text, selectedFile.name)
      } else {
        const buffer = await selectedFile.arrayBuffer()
        parsed = parseXlsxBuffer(buffer, selectedFile.name)
      }

      if (parsed.rawRows.length === 0) {
        setGeneralError('The uploaded file does not contain any data rows.')
        return
      }

      setParsedData(parsed)

      // Initialize automatic column mapping
      const initialMapping: Record<string, string> = {}
      for (const h of parsed.headers) {
        const canonical = normalizeHeader(h)
        if (canonical) {
          initialMapping[h] = canonical
        } else {
          initialMapping[h] = 'ignore' // default unmapped to custom_attributes
        }
      }
      setColumnMapping(initialMapping)
      setStep('mapping')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to parse file.'
      setGeneralError(msg)
    }
  }

  // 2. Perform Validation
  const handleProceedToValidation = async () => {
    if (!parsedData) return
    setGeneralError(null)

    try {
      // Fetch existing units in project to check for duplicates
      const res = await fetch(`/api/inventory?projectId=${projectId}`)
      const json = await res.json()
      const existingUnits = new Set<string>(
        (json.items || []).map((i: { unit_number: string }) => i.unit_number.toLowerCase())
      )

      const result = validateImportRows({
        rawRows: parsedData.rawRows,
        columnMapping,
        projectCategory,
        projectId,
        existingUnitNumbers: existingUnits,
      })

      setValidationResult(result)
      setStep('preview')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Validation failed'
      setGeneralError(msg)
    }
  }

  // 3. Execute Batch Import
  const handleExecuteImport = async () => {
    if (!validationResult || !parsedData) return
    setIsImporting(true)
    setGeneralError(null)
    setStep('importing')
    setImportProgress(20)

    try {
      const validRows = validationResult.rows.filter((r) => r.isValid).map((r) => r.data)
      const failedRows = validationResult.rows
        .filter((r) => !r.isValid)
        .map((r) => ({
          row: r.rowNumber,
          unit: r.data.unit_number || '—',
          error: r.errors.map((e) => e.message).join('; '),
        }))

      setImportProgress(40)

      const res = await fetch('/api/inventory/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          fileName: parsedData.fileName,
          fileType: parsedData.fileType,
          rows: validRows,
          failedRows,
        }),
      })

      setImportProgress(90)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to execute import')
      }

      setImportProgress(100)
      setImportResult({
        referenceId: data.referenceId,
        successfulCount: data.successfulCount,
        failedCount: data.failedCount,
        status: data.status,
      })
      setStep('completed')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Import failed'
      setGeneralError(msg)
      setStep('preview')
    } finally {
      setIsImporting(false)
    }
  }

  // 4. Download Error Report (protected against CSV formula injection)
  const handleDownloadErrorReport = () => {
    if (!validationResult) return
    const invalidRows = validationResult.rows.filter((r) => !r.isValid)
    if (invalidRows.length === 0) return

    const rowsData: string[][] = [
      ['Row #', 'Unit Number', 'Errors', 'Raw Data Preview'],
    ]

    invalidRows.forEach((r) => {
      const safeRow = String(r.rowNumber)
      const safeUnit = String(sanitizeFormulaInjection(r.data.unit_number || ''))
      const safeErrors = String(sanitizeFormulaInjection(r.errors.map((e) => `[${e.field}] ${e.message}`).join(' | ')))
      const rawSnippet = String(sanitizeFormulaInjection(JSON.stringify(r.rawValues).replace(/"/g, '""')))
      rowsData.push([safeRow, safeUnit, safeErrors, rawSnippet])
    })

    const csvContent = rowsData.map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `import_errors_${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const targetColumns = CATEGORY_COLUMNS[projectCategory] || CATEGORY_COLUMNS.apartments

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px] z-50 transition-opacity" onClick={onClose} />

      <div className="fixed inset-4 sm:inset-10 lg:inset-y-12 lg:inset-x-32 z-50 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in-50 duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface-hover)]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-50 text-[var(--brand)] border border-blue-200">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[var(--foreground)] flex items-center gap-2">
                <span>Bulk Inventory Import</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                  {PROJECT_CATEGORY_LABELS[projectCategory]}
                </span>
              </h2>
              <p className="text-xs text-[var(--foreground-muted)]">
                Upload CSV or Excel spreadsheets to batch-create inventory units
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tab Switcher */}
            <div className="inline-flex items-center rounded-lg border border-[var(--border)] p-0.5 bg-[var(--surface)] text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('import')}
                className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                  activeTab === 'import' ? 'bg-[var(--brand)] text-white shadow-2xs' : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                Upload & Import
              </button>
              <button
                type="button"
                onClick={switchToHistory}
                className={`px-3 py-1 rounded-md font-semibold transition-colors flex items-center gap-1 ${
                  activeTab === 'history' ? 'bg-[var(--brand)] text-white shadow-2xs' : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>History</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--foreground-muted)] hover:bg-[var(--surface)] transition-colors ml-2"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {generalError && (
            <div className="p-3.5 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{generalError}</span>
            </div>
          )}

          {/* TAB 1: UPLOAD WIZARD */}
          {activeTab === 'import' && (
            <>
              {/* Step 1: Upload & Download Templates */}
              {step === 'upload' && (
                <div className="space-y-6">
                  {/* Download Template Banner */}
                  <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-bold text-blue-950 uppercase tracking-wider">
                        Download Standard Templates
                      </h4>
                      <p className="text-xs text-blue-800 mt-0.5">
                        Includes formatted column headers tailored for {PROJECT_CATEGORY_LABELS[projectCategory]} with example data.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={`/api/inventory/import/template?category=${projectCategory}&format=csv`}
                        download
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-800 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors shadow-2xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>CSV Template</span>
                      </a>
                      <a
                        href={`/api/inventory/import/template?category=${projectCategory}&format=xlsx`}
                        download
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors shadow-2xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Excel (.xlsx) Template</span>
                      </a>
                    </div>
                  </div>

                  {/* Drag-and-Drop Zone */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        handleFile(e.dataTransfer.files[0])
                      }
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-[var(--border)] hover:border-[var(--brand)] rounded-2xl p-10 text-center cursor-pointer transition-colors bg-[var(--surface-hover)]/40 hover:bg-blue-50/20"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv, .xlsx, .xls"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleFile(e.target.files[0])
                        }
                      }}
                    />
                    <div className="w-12 h-12 rounded-full bg-blue-50 border border-blue-200 text-[var(--brand)] flex items-center justify-center mx-auto mb-3">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-bold text-[var(--foreground)]">
                      Click to upload or drag & drop your spreadsheet
                    </p>
                    <p className="text-xs text-[var(--foreground-muted)] mt-1">
                      Supports CSV and Excel (.xlsx) files up to 10 MB (max 5,000 rows)
                    </p>
                  </div>
                </div>
              )}

              {/* Step 2: Column Mapping */}
              {step === 'mapping' && parsedData && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
                    <div>
                      <h3 className="text-sm font-bold text-[var(--foreground)]">
                        Map Spreadsheet Columns
                      </h3>
                      <p className="text-xs text-[var(--foreground-muted)]">
                        Matched {Object.values(columnMapping).filter((v) => v !== 'ignore').length} of {parsedData.headers.length} detected columns. Unmapped columns will be safely preserved in custom attributes.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setStep('upload')}
                      className="text-xs font-semibold text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
                    >
                      Change File
                    </button>
                  </div>

                  <div className="border border-[var(--border)] rounded-xl overflow-hidden text-xs bg-[var(--surface)]">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--surface-hover)] font-semibold text-[11px] uppercase tracking-wider text-[var(--foreground-muted)]">
                          <th className="px-4 py-3">Spreadsheet Header</th>
                          <th className="px-4 py-3">Sample Value</th>
                          <th className="px-4 py-3">Destination Field</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {parsedData.headers.map((header) => {
                          const sample = parsedData.rawRows[0] ? String(parsedData.rawRows[0][header] || '') : '—'
                          const selectedCanonical = columnMapping[header] || 'ignore'

                          return (
                            <tr key={header} className="hover:bg-[var(--surface-hover)] transition-colors">
                              <td className="px-4 py-2.5 font-bold text-[var(--foreground)]">
                                {header}
                              </td>
                              <td className="px-4 py-2.5 text-[var(--foreground-muted)] font-mono text-[11px] truncate max-w-xs">
                                {sample}
                              </td>
                              <td className="px-4 py-2.5">
                                <select
                                  value={selectedCanonical}
                                  onChange={(e) => {
                                    const val = e.target.value
                                    setColumnMapping((prev) => ({ ...prev, [header]: val }))
                                  }}
                                  className="w-full max-w-xs px-2.5 py-1 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none text-[var(--foreground)]"
                                >
                                  <option value="ignore">Don&apos;t map (save to Custom Attributes)</option>
                                  {targetColumns.map((c) => (
                                    <option key={c.key} value={c.key}>
                                      {c.label} {c.required ? '(Required)' : ''}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setStep('upload')}
                      className="px-4 py-2 text-xs font-semibold text-[var(--foreground)] bg-[var(--surface)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-hover)]"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleProceedToValidation}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[var(--brand)] rounded-lg hover:bg-[var(--brand-hover)] shadow-xs"
                    >
                      <span>Validate & Preview</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Validation & Preview */}
              {step === 'preview' && validationResult && (
                <div className="space-y-5">
                  {/* KPI Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                      <span className="text-[11px] text-[var(--foreground-muted)] block font-medium">Total Rows</span>
                      <span className="text-xl font-bold text-[var(--foreground)] mt-0.5 block">{validationResult.totalRows}</span>
                    </div>
                    <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50">
                      <span className="text-[11px] text-emerald-800 block font-medium">Valid Rows</span>
                      <span className="text-xl font-bold text-emerald-700 mt-0.5 block">{validationResult.validRowsCount}</span>
                    </div>
                    <div className="p-3.5 rounded-xl border border-red-200 bg-red-50/50">
                      <span className="text-[11px] text-red-800 block font-medium">Invalid Rows</span>
                      <span className="text-xl font-bold text-red-700 mt-0.5 block">{validationResult.invalidRowsCount}</span>
                    </div>
                    <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/50">
                      <span className="text-[11px] text-amber-800 block font-medium">Duplicates / Warnings</span>
                      <span className="text-xl font-bold text-amber-700 mt-0.5 block">
                        {validationResult.duplicateInFileCount + validationResult.duplicateInProjectCount}
                      </span>
                    </div>
                  </div>

                  {/* Actions Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-[var(--foreground)]">Row Validation Preview</h3>
                      <p className="text-xs text-[var(--foreground-muted)]">
                        {validationResult.validRowsCount} of {validationResult.totalRows} rows ready to import
                      </p>
                    </div>

                    {validationResult.invalidRowsCount > 0 && (
                      <button
                        type="button"
                        onClick={handleDownloadErrorReport}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors shadow-2xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download Error Report ({validationResult.invalidRowsCount})</span>
                      </button>
                    )}
                  </div>

                  {/* Preview Rows Table */}
                  <div className="border border-[var(--border)] rounded-xl overflow-hidden max-h-72 overflow-y-auto text-xs bg-[var(--surface)]">
                    <table className="w-full text-left">
                      <thead className="sticky top-0 bg-[var(--surface-hover)] border-b border-[var(--border)]">
                        <tr className="font-semibold text-[11px] uppercase tracking-wider text-[var(--foreground-muted)]">
                          <th className="px-3 py-2 w-16">Row #</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Unit / Plot #</th>
                          <th className="px-3 py-2">Category</th>
                          <th className="px-3 py-2">Area</th>
                          <th className="px-3 py-2">Validation Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {validationResult.rows.slice(0, 100).map((r) => (
                          <tr key={r.rowNumber} className={r.isValid ? 'hover:bg-emerald-50/20' : 'bg-red-50/30'}>
                            <td className="px-3 py-2 text-[var(--foreground-muted)] font-mono">{r.rowNumber}</td>
                            <td className="px-3 py-2">
                              {r.isValid ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700">
                                  <AlertCircle className="w-3.5 h-3.5" /> Error
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 font-bold text-[var(--foreground)]">{r.data.unit_number || '—'}</td>
                            <td className="px-3 py-2">{r.data.category}</td>
                            <td className="px-3 py-2">{r.data.area_value} {r.data.area_unit}</td>
                            <td className="px-3 py-2 text-xs">
                              {r.errors.length > 0 ? (
                                <span className="text-red-700 font-medium">
                                  {r.errors.map((e) => e.message).join(' | ')}
                                </span>
                              ) : r.warnings.length > 0 ? (
                                <span className="text-amber-700">
                                  {r.warnings.map((w) => w.message).join('; ')}
                                </span>
                              ) : (
                                <span className="text-emerald-700">Passed all checks</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Actions Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
                    <button
                      type="button"
                      onClick={() => setStep('mapping')}
                      className="px-4 py-2 text-xs font-semibold text-[var(--foreground)] bg-[var(--surface)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-hover)]"
                    >
                      Back to Mapping
                    </button>

                    <button
                      type="button"
                      onClick={handleExecuteImport}
                      disabled={validationResult.validRowsCount === 0 || isImporting}
                      className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-[var(--brand)] rounded-lg hover:bg-[var(--brand-hover)] disabled:opacity-40 disabled:pointer-events-none transition-colors shadow-xs"
                    >
                      <span>Import {validationResult.validRowsCount} Valid Units</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Step 4: Importing in Progress */}
              {step === 'importing' && (
                <div className="py-12 text-center space-y-4">
                  <Loader2 className="w-10 h-10 animate-spin text-[var(--brand)] mx-auto" />
                  <h3 className="text-base font-bold text-[var(--foreground)]">Importing inventory in progress...</h3>
                  <p className="text-xs text-[var(--foreground-muted)] max-w-sm mx-auto">
                    Inserting validated units into the database in safe batches. Please do not close this window.
                  </p>
                  <div className="max-w-md mx-auto bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div className="bg-[var(--brand)] h-2.5 rounded-full transition-all duration-300" style={{ width: `${importProgress}%` }} />
                  </div>
                </div>
              )}

              {/* Step 5: Completed */}
              {step === 'completed' && importResult && (
                <div className="py-10 text-center space-y-4">
                  <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>

                  <h3 className="text-lg font-bold text-[var(--foreground)]">Import Completed Successfully</h3>
                  <p className="text-xs text-[var(--foreground-muted)] max-w-sm mx-auto">
                    Batch reference: <span className="font-mono font-bold text-[var(--foreground)]">{importResult.referenceId}</span>
                  </p>

                  <div className="flex items-center justify-center gap-4 py-2">
                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                      <span className="text-xs text-emerald-800 block">Successfully Added</span>
                      <span className="text-xl font-bold text-emerald-700">{importResult.successfulCount} units</span>
                    </div>
                    {importResult.failedCount > 0 && (
                      <div className="p-3 bg-red-50 rounded-xl border border-red-200">
                        <span className="text-xs text-red-800 block">Failed / Skipped</span>
                        <span className="text-xl font-bold text-red-700">{importResult.failedCount} units</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        onSuccess()
                        onClose()
                      }}
                      className="px-6 py-2 text-xs font-semibold text-white bg-[var(--brand)] rounded-lg hover:bg-[var(--brand-hover)] shadow-xs"
                    >
                      View in Inventory
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* TAB 2: IMPORT HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
                <div>
                  <h3 className="text-sm font-bold text-[var(--foreground)]">Past Inventory Imports</h3>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    Audit log of previous CSV and Excel uploads for this project
                  </p>
                </div>

                <button
                  type="button"
                  onClick={loadHistory}
                  disabled={loadingHistory}
                  className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
                  title="Refresh history"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {loadingHistory ? (
                <div className="py-12 text-center text-xs text-[var(--foreground-muted)]">
                  Loading import history...
                </div>
              ) : historyList.length > 0 ? (
                <div className="border border-[var(--border)] rounded-xl divide-y divide-[var(--border)] text-xs bg-[var(--surface)] overflow-hidden shadow-2xs">
                  {historyList.map((h) => (
                    <div key={h.id} className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-blue-600" />
                          <span className="font-bold text-[var(--foreground)]">{h.file_name}</span>
                          <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-gray-100 text-gray-700">
                            {h.file_type}
                          </span>
                          <span className="text-xs text-[var(--foreground-muted)] font-mono">({h.reference_id})</span>
                        </div>

                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-semibold capitalize ${
                            h.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : h.status === 'partial'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {h.status}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-[var(--foreground-muted)]">
                        <div className="flex items-center gap-3">
                          <span>
                            Total: <strong>{h.total_rows}</strong>
                          </span>
                          <span className="text-emerald-700">
                            Success: <strong>{h.successful_rows}</strong>
                          </span>
                          {h.failed_rows > 0 && (
                            <span className="text-red-700">
                              Failed: <strong>{h.failed_rows}</strong>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-[var(--foreground-subtle)]">
                          <span>by {h.initiator?.full_name || 'System'}</span>
                          <span>•</span>
                          <span>{formatDate(h.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-[var(--foreground-muted)] italic">
                  No previous imports recorded for this project.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
