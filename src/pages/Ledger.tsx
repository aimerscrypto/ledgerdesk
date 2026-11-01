import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpenText, Check, Download, FileText, Landmark, Search } from 'lucide-react'
import { logExport } from '../lib/actions'
import { toCsv, downloadText, type CsvCell } from '../lib/csv'
import { fmtAmount, fmtDate, fmtPeriod, sumMoney, toKYD } from '../lib/format'
import { useSelectedClient, useSelectedPeriod } from '../lib/hooks'
import { clientPeriods } from '../lib/selectors'
import { useAppState } from '../lib/store'
import { toast } from '../lib/toast'
import type { EntryType } from '../lib/types'
import { Badge, Button, Card, CardHeader, ClientPicker, EmptyState, FilterBar, Money, PageHeader, Pager, Segmented, Select, SummaryStrip, usePaged } from '../components/ui'

type TypeFilter = 'all' | EntryType

export default function Ledger() {
  const state = useAppState()
  const { client, select } = useSelectedClient()
  const periods = clientPeriods(state)
  const { period, select: selectPeriod } = useSelectedPeriod([...periods, 'all'], state.closePeriod)
  const [type, setType] = useState<TypeFilter>('all')
  const [query, setQuery] = useState('')

  const matched = useMemo(() => new Set(state.bank.filter((t) => t.status === 'matched' && t.ledgerEntryId).map((t) => t.ledgerEntryId)), [state.bank])

  const needle = query.trim().toLowerCase()
  const rows = state.ledger
    .filter((e) => e.clientId === client.id)
    .filter((e) => period === 'all' || e.date.startsWith(period))
    .filter((e) => type === 'all' || e.type === type)
    .filter((e) => !needle || `${e.vendor} ${e.category} ${e.invoiceNumber ?? ''}`.toLowerCase().includes(needle))
    .sort((a, b) => b.date.localeCompare(a.date))

  const income = sumMoney(rows.filter((e) => e.type === 'income').map((e) => toKYD(e.amount, e.currency)))
  const expenses = sumMoney(rows.filter((e) => e.type === 'expense').map((e) => toKYD(e.amount, e.currency)))
  const paged = usePaged(rows, 15)
  const periodLabel = period === 'all' ? 'All periods' : fmtPeriod(period)

  const exportCsv = () => {
    const table: CsvCell[][] = [
      ['Date', 'Vendor', 'Category', 'Type', 'Amount', 'Currency', 'KYD equivalent', 'Invoice number', 'Source document', 'Reconciled', 'Posted by'],
      ...rows.map((e): CsvCell[] => [
        e.date,
        e.vendor,
        e.category,
        e.type,
        e.amount,
        e.currency,
        toKYD(e.amount, e.currency),
        e.invoiceNumber ?? '',
        e.docId ? state.documents.find((d) => d.id === e.docId)?.filename ?? e.docId : e.bankTxnId ? 'Bank statement line' : '',
        matched.has(e.id) ? 'Yes' : 'No',
        e.postedBy,
      ]),
    ]
    downloadText(`${client.id}-ledger-${period}.csv`, toCsv(table))
    logExport(`Ledger CSV exported for ${client.name}, ${periodLabel} (${rows.length} entries)`, client.id)
    toast.success('Ledger exported', `${rows.length} entries. The export is in the audit log.`)
  }

  return (
    <div>
      <PageHeader
        title="Ledger"
        description="Every entry here was approved by a person, and links back to where it came from."
        actions={
          <Button icon={Download} disabled={!rows.length} onClick={exportCsv}>
            Export CSV
          </Button>
        }
      />

      <FilterBar>
        <ClientPicker clients={state.clients} value={client.id} onChange={select} />
        <Select aria-label="Period" value={period} onChange={(e) => selectPeriod(e.target.value)} className="min-w-0 flex-1 basis-32 sm:w-44 sm:flex-none sm:basis-auto">
          {periods.map((p) => (
            <option key={p} value={p}>
              {fmtPeriod(p)}
            </option>
          ))}
          <option value="all">All periods</option>
        </Select>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search vendor or category" aria-label="Search the ledger" className="field-input min-w-48 flex-1 sm:max-w-72" />
        <Segmented<TypeFilter>
          label="Entry type"
          value={type}
          onChange={setType}
          options={[
            { value: 'all', label: 'All' },
            { value: 'income', label: 'Income' },
            { value: 'expense', label: 'Expenses' },
          ]}
        />
      </FilterBar>

      <SummaryStrip
        items={[
          { label: 'Income', value: <Money value={income} /> },
          { label: 'Expenses', value: <Money value={expenses} /> },
          { label: 'Net', value: <Money value={income - expenses} />, tone: income - expenses < 0 ? 'bad' : undefined },
          { label: 'Entries', value: rows.length, hint: 'USD converted at 1 KYD = 1.20 USD' },
        ]}
      />

      <Card>
        <CardHeader title={client.name} description={periodLabel} />
        {paged.rows.length ? (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="data-table min-w-[940px]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Vendor</th>
                  <th>Category</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">KYD equivalent</th>
                  <th>Source</th>
                  <th>Reconciled</th>
                </tr>
              </thead>
              <tbody>
                {paged.rows.map((entry) => {
                  const sign = entry.type === 'income' ? '+' : '−'
                  return (
                    <tr key={entry.id}>
                      <td className="whitespace-nowrap text-ink-2">{fmtDate(entry.date)}</td>
                      <td className="max-w-64">
                        <span className="block truncate font-medium text-ink">{entry.vendor}</span>
                        {entry.invoiceNumber && <span className="num block truncate text-xs text-ink-3">{entry.invoiceNumber}</span>}
                      </td>
                      <td className="max-w-48 truncate text-ink-2">{entry.category}</td>
                      <td className="whitespace-nowrap text-right font-medium">
                        <Money value={entry.amount} currency={entry.currency} sign={sign} className={entry.type === 'income' ? 'text-good' : 'text-ink'} />
                      </td>
                      <td className="num whitespace-nowrap text-right text-ink-2">{fmtAmount(toKYD(entry.amount, entry.currency))}</td>
                      <td className="whitespace-nowrap">
                        {entry.docId ? (
                          <Link to={`/review/${entry.docId}`} className="inline-flex items-center gap-1.5 font-medium text-brand-ink hover:underline">
                            <FileText size={14} aria-hidden />
                            Document
                          </Link>
                        ) : entry.bankTxnId ? (
                          <Link to={`/reconciliation?client=${entry.clientId}&period=${entry.date.slice(0, 7)}`} className="inline-flex items-center gap-1.5 text-ink-2 hover:underline">
                            <Landmark size={14} aria-hidden />
                            Bank line
                          </Link>
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </td>
                      <td>
                        {matched.has(entry.id) ? (
                          <Badge tone="good" icon={Check}>
                            Matched
                          </Badge>
                        ) : (
                          <span className="text-[13px] text-ink-3">Open</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : needle || type !== 'all' ? (
          <EmptyState compact icon={Search} title="No entries match" body="Try a different search or entry type." />
        ) : (
          <EmptyState icon={BookOpenText} title="Nothing posted for this period" body="Entries appear here when a document is approved or a bank line is posted." />
        )}
        <Pager {...paged} />
      </Card>
    </div>
  )
}
