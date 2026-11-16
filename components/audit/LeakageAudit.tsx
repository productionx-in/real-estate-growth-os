'use client'
// components/audit/LeakageAudit.tsx
// Self-serve lead-leakage audit. The file is parsed and analysed entirely in the browser — nothing is uploaded.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, FileSpreadsheet, Lock, Printer, RotateCcw } from 'lucide-react'
import { FIELD_LABELS, analyse, guessMapping, toAuditRows, wastedSpend, type FieldKey } from '@/lib/audit/leakage'
import { formatInr } from '@/lib/marketing/pricing'

type Records = Record<string, unknown>[]

const mins = (m: number | null) => (m === null ? '—' : m < 1 ? '< 1 min' : m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} days`)
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—')

async function readFile(file: File): Promise<{ headers: string[]; records: Records }> {
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true })
    return { headers: records.length ? Object.keys(records[0]) : [], records }
  }
  const Papa = (await import('papaparse')).default
  const text = await file.text()
  const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true })
  return { headers: parsed.meta.fields ?? [], records: parsed.data }
}

export function LeakageAudit() {
  const [fileName, setFileName] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [records, setRecords] = useState<Records>([])
  const [mapping, setMapping] = useState<Partial<Record<FieldKey, string>>>({})
  const [spend, setSpend] = useState<number>(0)
  const [showReport, setShowReport] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  async function load(file: File | undefined) {
    if (!file) return
    setError(null)
    if (file.size > 25 * 1024 * 1024) { setError('That file is larger than 25 MB. Export the last 3 months only.'); return }
    try {
      const { headers: h, records: r } = await readFile(file)
      if (!h.length || !r.length) { setError('No rows found. Export leads as CSV or Excel with a header row.'); return }
      setFileName(file.name); setHeaders(h); setRecords(r); setMapping(guessMapping(h)); setShowReport(false)
    } catch {
      setError('Could not read that file. Try exporting it again as CSV.')
    }
  }

  const result = useMemo(() => {
    if (!showReport || !mapping.createdAt) return null
    return analyse(toAuditRows(records, mapping), { hasFirstContact: Boolean(mapping.firstContactAt) })
  }, [showReport, records, mapping])
  const money = result ? wastedSpend(result, spend) : null

  if (!fileName) {
    return (
      <div>
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); load(e.dataTransfer.files[0]) }}
          className={`block cursor-pointer rounded-3xl border-2 border-dashed p-10 text-center transition-colors ${dragging ? 'border-[var(--brand)] bg-[var(--brand-light)]' : 'border-[var(--border-strong)] bg-white hover:bg-[var(--surface-hover)]'}`}>
          <FileSpreadsheet className="w-10 h-10 mx-auto text-[var(--brand)]" aria-hidden="true" />
          <p className="mt-3 text-[17px] font-semibold">Drop your lead export here</p>
          <p className="mt-1 text-[14px] text-[var(--foreground-muted)]">CSV or Excel from Sell.Do, LeadSquared, TeleCRM or a spreadsheet — last 1–3 months works best.</p>
          <span className="mt-5 inline-block px-5 py-2.5 text-[15px] font-semibold text-white bg-[var(--brand)] rounded-xl">Choose file</span>
          <input type="file" accept=".csv,.xlsx,.xls,text/csv" className="sr-only" onChange={(e) => load(e.target.files?.[0])} />
        </label>
        <p className="mt-4 text-[13px] text-[var(--foreground-muted)] flex items-center justify-center gap-1.5"><Lock className="w-4 h-4" aria-hidden="true" />Your file is analysed in your browser. It is never uploaded or stored.</p>
        {error && <p role="alert" className="mt-4 text-[14px] text-red-700 text-center">{error}</p>}
      </div>
    )
  }

  if (!showReport || !result) {
    return (
      <div className="rounded-3xl border border-[var(--border)] bg-white p-6 sm:p-8">
        <p className="text-[13px] text-[var(--foreground-muted)]">{fileName} · {records.length.toLocaleString('en-IN')} rows</p>
        <h2 className="mt-1 text-[20px] font-bold">Check the columns we found</h2>
        <p className="text-[14px] text-[var(--foreground-muted)]">Only “Lead created” is required. Add “First call / first activity” for response times.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {(Object.keys(FIELD_LABELS) as FieldKey[]).map((k) => (
            <label key={k} className="text-[14px] font-medium flex flex-col gap-1.5">
              {FIELD_LABELS[k]}{k === 'createdAt' && <span className="text-red-600"> *</span>}
              <select value={mapping[k] ?? ''} onChange={(e) => setMapping({ ...mapping, [k]: e.target.value || undefined })}
                className="px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-white text-[14px]">
                <option value="">— not in my file —</option>
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
          ))}
          <label className="text-[14px] font-medium flex flex-col gap-1.5">
            Monthly ad + portal spend (optional, ₹)
            <input type="number" min={0} step={10000} value={spend || ''} onChange={(e) => setSpend(Math.max(0, Number(e.target.value) || 0))}
              placeholder="e.g. 500000" className="px-3 py-2 rounded-xl border border-[var(--border-strong)] text-[14px]" />
          </label>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" disabled={!mapping.createdAt} onClick={() => setShowReport(true)}
            className="px-5 py-2.5 text-[15px] font-semibold text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)] rounded-xl disabled:opacity-50">Show my report</button>
          <button type="button" onClick={() => setFileName(null)} className="px-4 py-2.5 text-[15px] rounded-xl border border-[var(--border-strong)]">Use another file</button>
        </div>
      </div>
    )
  }

  const r = result
  const fmtDate = (t: number | null) => (t === null ? '—' : new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }))
  return (
    <div className="rounded-3xl border border-[var(--border)] bg-white p-6 sm:p-8 print:border-0 print:p-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[13px] text-[var(--foreground-muted)]">Lead-leakage audit · {fmtDate(r.periodStart)} – {fmtDate(r.periodEnd)}</p>
          <h2 className="text-[24px] font-extrabold tracking-tight">{r.analysedLeads.toLocaleString('en-IN')} leads analysed</h2>
          {r.skippedNoDate > 0 && <p className="text-[12px] text-[var(--foreground-subtle)]">{r.skippedNoDate} rows skipped (no readable created date)</p>}
        </div>
        <div className="flex gap-2 print:hidden">
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] rounded-lg border border-[var(--border-strong)]"><Printer className="w-4 h-4" />Print / save PDF</button>
          <button type="button" onClick={() => setShowReport(false)} className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] rounded-lg border border-[var(--border-strong)]"><RotateCcw className="w-4 h-4" />Adjust</button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { l: 'Median time to first contact', v: mins(r.medianMin), bad: r.medianMin !== null && r.medianMin > 5 },
          { l: 'Contacted within 5 minutes', v: pct(r.within5, r.analysedLeads), bad: r.within5 / Math.max(1, r.analysedLeads) < 0.5 },
          { l: 'Never contacted', v: `${r.neverContacted.toLocaleString('en-IN')} · ${pct(r.neverContacted, r.analysedLeads)}`, bad: r.neverContacted > 0 },
          { l: 'First contact after 24 h', v: r.over24h.toLocaleString('en-IN'), bad: r.over24h > 0 },
        ].map((k) => (
          <div key={k.l} className="rounded-2xl border border-[var(--border)] p-4">
            <p className="text-[12px] text-[var(--foreground-muted)]">{k.l}</p>
            <p className={`mt-1 text-[22px] font-bold tabular-nums ${k.bad ? 'text-red-700' : 'text-emerald-700'}`}>{k.v}</p>
          </div>
        ))}
      </div>

      {money && (
        <div className="mt-4 rounded-2xl bg-red-50 border border-red-200 p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-[14px] text-red-900">
            About <strong>{formatInr(money.wasted)} a month</strong> of ad spend goes to leads that were never contacted or were contacted after an hour
            (at {formatInr(money.costPerLead)} per lead). <span className="text-red-800/80">Estimate: it values those leads at what you paid for them.</span>
          </p>
        </div>
      )}
      {!mapping.firstContactAt && (
        <p className="mt-4 text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          Your file has no first-contact time, so response speed cannot be measured — only leads still in a new stage are counted as never contacted.
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {[{ t: 'By source', rows: r.bySource }, { t: 'By salesperson', rows: r.byOwner }].map((g) => (
          <section key={g.t} aria-label={g.t}>
            <h3 className="text-[15px] font-semibold mb-2">{g.t}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead><tr className="text-left text-[var(--foreground-muted)] border-b border-[var(--border)]">
                  <th className="py-2 pr-2 font-medium">{g.t.replace('By ', '').replace(/^./, (c) => c.toUpperCase())}</th>
                  <th className="py-2 px-2 font-medium text-right">Leads</th>
                  <th className="py-2 px-2 font-medium text-right">Median</th>
                  <th className="py-2 px-2 font-medium text-right">≤ 5 min</th>
                  <th className="py-2 pl-2 font-medium text-right">Never</th>
                </tr></thead>
                <tbody>
                  {g.rows.slice(0, 12).map((x) => (
                    <tr key={x.name} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-2 pr-2 font-medium truncate max-w-[180px]">{x.name}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{x.leads}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{mins(x.medianMin)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{pct(x.within5, x.leads)}</td>
                      <td className={`py-2 pl-2 text-right tabular-nums ${x.neverContacted ? 'text-red-700 font-semibold' : ''}`}>{x.neverContacted}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      <div className="mt-8 rounded-2xl bg-[#0b1220] text-white p-6 print:hidden">
        <p className="text-[17px] font-semibold">Want every lead called within 5 minutes?</p>
        <p className="mt-1 text-[14px] text-slate-300">REGrow assigns each lead in seconds, alerts the salesperson and escalates if nobody calls. We can run it alongside your current CRM for a 30-day pilot.</p>
        <Link href="/demo?plan=leads" className="mt-4 inline-block px-5 py-2.5 text-[15px] font-semibold text-[#0b1220] bg-white rounded-xl">Book a demo</Link>
      </div>
    </div>
  )
}
