import { useMemo, useState } from 'react'
import { FileQuestion, Minus, Plus, ScanLine } from 'lucide-react'
import type { DocRecord, Paper } from '../lib/types'
import { createRng, fmtAmount, fmtDate, hashString } from '../lib/format'
import { getPreview } from '../lib/store'
import { Badge, IconButton, cx } from './ui'

const ITEMS: Record<string, string[]> = {
  'Fuel & vehicles': ['Marine diesel', 'Unleaded 95', '2-stroke oil', 'Fuel additive'],
  'Repairs & maintenance': ['Service call-out', 'Replacement parts', 'Labour', 'Sealant & fittings'],
  'Office & software': ['Printer paper, case', 'Toner cartridge', 'Software subscription', 'Stationery'],
  'Cost of goods sold': ['Wholesale stock order', 'Bulk goods', 'Retail stock', 'Packaging'],
  'Freight & import duty': ['Ocean freight', 'Customs duty', 'Port handling', 'Delivery'],
  'Rent & lease': ['Monthly rent', 'Common area charge'],
  'Payroll & pension': ['Payroll run', 'Employer contributions', 'Processing fee'],
  Insurance: ['Commercial policy premium', 'Marine cover', 'Liability cover'],
  Marketing: ['Print advertising', 'Digital campaign', 'Design fee'],
  'Licences & permits': ['Annual licence fee', 'Disposal service'],
  'Meals & entertainment': ['Lunch', 'Coffee'],
}

const STREETS = ['North Church Street', 'Eastern Avenue', 'Walkers Road', 'Crewe Road', 'Shamrock Road', 'Mary Street']
const DISTRICTS = ['George Town', 'West Bay', 'Savannah', 'Bodden Town']

/** Generates the small print a real document would have. Seeded, so it never changes between views. */
function usePaperDetail(paper: Paper) {
  return useMemo(() => {
    const rng = createRng(hashString(`${paper.vendor}|${paper.number}`))
    const pool = ITEMS[paper.category] ?? ['Goods and services', 'Service charge']
    const count = paper.subtotal < 60 ? 1 : Math.min(pool.length, rng.int(1, 3))
    const shares = Array.from({ length: count }, () => 1 + rng.next())
    const totalShare = shares.reduce((a, b) => a + b, 0)
    const cents = Math.round(paper.subtotal * 100)
    let left = cents
    const lines = shares.map((share, i) => {
      const part = i === count - 1 ? left : Math.round((cents * share) / totalShare)
      left -= part
      return { label: pool[i], amount: part / 100 }
    })
    return {
      lines,
      address: `${rng.int(12, 480)} ${rng.pick(STREETS)}, ${rng.pick(DISTRICTS)}, Grand Cayman`,
      phone: `+1 (345) 555-0${rng.int(100, 199)}`,
      account: `${rng.int(100000, 999999)}-${rng.int(10, 99)}`,
      time: `${String(rng.int(7, 18)).padStart(2, '0')}:${String(rng.int(0, 59)).padStart(2, '0')}`,
      terminal: rng.int(1, 6),
    }
  }, [paper])
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cx('flex justify-between gap-6', strong && 'mt-1 border-t border-stone-400 pt-1.5 text-[15px] font-semibold')}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

function PaperDocument({ paper }: { paper: Paper }) {
  const d = usePaperDetail(paper)
  const money = (n: number) => `${paper.currency} ${fmtAmount(n)}`
  const faint = paper.faint ? { opacity: 0.5, filter: 'blur(0.35px) contrast(0.8)' } : undefined

  if (paper.template === 'receipt') {
    return (
      <div className={cx('mx-auto w-[310px] px-6 py-7 font-mono text-[12.5px] leading-relaxed text-stone-800 shadow-lg', paper.faint ? 'bg-[#f6f1df]' : 'bg-white')}>
        <div style={faint}>
          <p className="text-center text-sm font-bold uppercase">{paper.vendor}</p>
          <p className="text-center text-[11px]">{d.address}</p>
          <p className="mb-3 text-center text-[11px]">{d.phone}</p>
          <div className="mb-2 border-y border-dashed border-stone-400 py-1.5 text-[11.5px]">
            <Row label={fmtDate(paper.date)} value={d.time} />
            <Row label={`Receipt ${paper.number}`} value={`Till ${d.terminal}`} />
          </div>
          {d.lines.map((l) => (
            <Row key={l.label} label={l.label} value={fmtAmount(l.amount)} />
          ))}
          <div className="mt-2 border-t border-dashed border-stone-400 pt-1.5">
            <Row label="Subtotal" value={fmtAmount(paper.subtotal)} />
            {paper.tax > 0 && <Row label="Tax" value={fmtAmount(paper.tax)} />}
            <Row label="TOTAL" value={money(paper.total)} strong />
          </div>
          <p className="mt-4 text-center text-[11px]">Paid by card. Thank you!</p>
        </div>
      </div>
    )
  }

  if (paper.template === 'utility') {
    return (
      <div className="mx-auto w-[480px] max-w-full bg-white p-7 text-[13px] text-stone-800 shadow-lg">
        <div className="mb-5 flex items-start justify-between gap-4 border-b-2 border-stone-700 pb-3">
          <div>
            <p className="text-lg font-bold">{paper.vendor}</p>
            <p className="text-[11px] text-stone-600">{d.address}</p>
          </div>
          <p className="text-right text-[11px] font-semibold tracking-wide uppercase">Monthly bill</p>
        </div>
        <div className="mb-5 grid grid-cols-2 gap-2 text-[12px]">
          <p>
            <span className="block text-stone-500">Bill to</span>
            {paper.billTo}
          </p>
          <p>
            <span className="block text-stone-500">Account</span>
            {d.account}
          </p>
          <p>
            <span className="block text-stone-500">Bill number</span>
            {paper.number}
          </p>
          <p>
            <span className="block text-stone-500">Bill date</span>
            {fmtDate(paper.date)}
          </p>
        </div>
        <div className="rounded border border-stone-300 p-3">
          <Row label="Current charges" value={money(paper.subtotal)} />
          <Row label="Amount due" value={money(paper.total)} strong />
        </div>
        <p className="mt-4 text-[11px] text-stone-500">Paid by direct debit from your account on file.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-[520px] max-w-full bg-white p-7 text-[13px] text-stone-800 shadow-lg">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-bold">{paper.template === 'sales' ? paper.billTo || paper.vendor : paper.vendor}</p>
          <p className="text-[11px] text-stone-600">{d.address}</p>
          <p className="text-[11px] text-stone-600">{d.phone}</p>
        </div>
        <div className="text-right">
          <p className="text-base font-semibold tracking-wide uppercase">{paper.template === 'sales' ? 'Sales summary' : 'Invoice'}</p>
          <p className="text-[12px]">{paper.number}</p>
          <p className="text-[12px]">{fmtDate(paper.date)}</p>
        </div>
      </div>
      <div className="mb-4 text-[12px]">
        <span className="block text-stone-500">{paper.template === 'sales' ? 'Source' : 'Bill to'}</span>
        {paper.template === 'sales' ? paper.vendor : paper.billTo}
      </div>
      <table className="mb-4 w-full text-[12.5px]">
        <thead>
          <tr className="border-b border-stone-400 text-left text-[11px] text-stone-500 uppercase">
            <th className="py-1.5 font-medium">Description</th>
            <th className="py-1.5 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l) => (
            <tr key={l.label} className="border-b border-stone-200">
              <td className="py-1.5">{l.label}</td>
              <td className="py-1.5 text-right tabular-nums">{fmtAmount(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto w-56">
        <Row label="Subtotal" value={fmtAmount(paper.subtotal)} />
        {paper.tax > 0 && <Row label="Sales tax" value={fmtAmount(paper.tax)} />}
        <Row label="Total" value={money(paper.total)} strong />
      </div>
      {paper.template === 'invoice' && <p className="mt-6 text-[11px] text-stone-500">Payment terms: net 15 days. Please quote the invoice number with your payment.</p>}
    </div>
  )
}

export function DocumentPreview({ doc, fill }: { doc: DocRecord; fill?: boolean }) {
  const [zoom, setZoom] = useState(fill ? 1.2 : 1)
  const stored = doc.hasStoredPreview ? getPreview(doc.id) : null
  const isPdf = doc.mime === 'application/pdf'
  const processing = doc.status === 'processing'

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-surface shadow-card">
      <div className="flex items-center gap-2 px-4 py-2">
        <p className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink-2" title={doc.filename}>
          {doc.filename}
        </p>
        {isPdf && <Badge>PDF{stored ? ', page 1' : ''}</Badge>}
        <div className="flex items-center">
          <IconButton label="Zoom out" icon={Minus} className="size-7" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))} />
          <span className="num w-11 text-center text-[13px] text-ink-3">{Math.round(zoom * 100)}%</span>
          <IconButton label="Zoom in" icon={Plus} className="size-7" onClick={() => setZoom((z) => Math.min(2, +(z + 0.2).toFixed(1)))} />
        </div>
      </div>
      <div className={cx('scrollbar-thin relative flex-1 overflow-auto bg-surface-2 p-4 sm:p-8', fill ? 'min-h-[560px] xl:h-[calc(100dvh-150px)]' : 'max-h-[560px] min-h-[320px]')}>
        <div style={{ zoom }}>
          {stored ? (
            <img src={stored} alt={`Uploaded document: ${doc.filename}`} className={cx('mx-auto rounded-sm shadow-lg', fill ? 'w-full max-w-[760px]' : 'max-w-full')} />
          ) : doc.paper ? (
            <PaperDocument paper={doc.paper} />
          ) : (
            <div className="mx-auto flex h-72 max-w-sm flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface px-6 text-center">
              <FileQuestion size={24} className="mb-2 text-ink-3" aria-hidden />
              <p className="font-medium text-ink">No preview available</p>
              <p className="mt-1 text-[13px] text-ink-3">This file could not be displayed here, or its preview was cleared to free browser storage. Check the extracted fields against the original.</p>
            </div>
          )}
        </div>
        {processing && (
          <div className="absolute inset-0 overflow-hidden bg-surface/40">
            <div className="scan-line" />
            <span className="absolute top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-xs font-medium text-ink shadow-pop">
              <ScanLine size={13} aria-hidden /> Reading document
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
