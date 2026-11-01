import { useState } from 'react'
import { Download, FileText, Info, PieChart, Printer } from 'lucide-react'
import { logExport } from '../lib/actions'
import { downloadText, toCsv, type CsvCell } from '../lib/csv'
import { fmtAmount, fmtPeriod, toKYD } from '../lib/format'
import { useSelectedClient, useSelectedPeriod } from '../lib/hooks'
import { clientPeriods, docFields, summarise, trend } from '../lib/selectors'
import { useAppState } from '../lib/store'
import { toast } from '../lib/toast'
import { CategoryBars, IncomeExpenseChart } from '../components/charts'
import { Button, Card, CardHeader, ClientPicker, EmptyState, FilterBar, LinkButton, Money, PageHeader, Segmented, Select, SummaryStrip } from '../components/ui'

type Mode = 'chart' | 'table'

export default function Reports() {
  const state = useAppState()
  const { client, select } = useSelectedClient()
  const periods = clientPeriods(state)
  const { period, select: selectPeriod } = useSelectedPeriod(periods, state.closePeriod)
  const [mode, setMode] = useState<Mode>('chart')

  const summary = summarise(state.ledger, client.id, period)
  // Always the latest six months, so clicking a bar selects it without the chart shifting underneath.
  const history = trend(state.ledger, client.id, periods[0], 6)
  const waiting = state.documents.filter((d) => d.clientId === client.id && (d.status === 'needs_review' || d.status === 'processing') && docFields(d)?.date.startsWith(period)).length

  const exportCsv = () => {
    const rows: CsvCell[][] = [
      ['Month-end report', client.name],
      ['Period', fmtPeriod(period)],
      ['Currency', 'KYD (USD converted at 1 KYD = 1.20 USD)'],
      [],
      ['Summary', 'Amount (KYD)'],
      ['Income', summary.income],
      ['Expenses', summary.expenses],
      ['Net', summary.net],
      [],
      ['Income by category', 'Amount (KYD)', 'Entries'],
      ...summary.incomeByCategory.map((c): CsvCell[] => [c.category, c.amount, c.count]),
      [],
      ['Expenses by category', 'Amount (KYD)', 'Entries'],
      ...summary.byCategory.map((c): CsvCell[] => [c.category, c.amount, c.count]),
      [],
      ['Date', 'Vendor', 'Category', 'Type', 'Amount', 'Currency', 'KYD equivalent'],
      ...summary.entries.map((e): CsvCell[] => [e.date, e.vendor, e.category, e.type, e.amount, e.currency, toKYD(e.amount, e.currency)]),
    ]
    downloadText(`${client.id}-month-end-${period}.csv`, toCsv(rows))
    logExport(`Month-end report CSV exported for ${client.name}, ${period}`, client.id)
    toast.success('Report exported', 'The export is in the audit log.')
  }

  return (
    <div>
      <PageHeader
        title="Month-end report"
        description="Income and expenses from approved ledger entries, in KYD."
        actions={
          <>
            <Button icon={Download} onClick={exportCsv} disabled={!summary.entries.length}>
              Export CSV
            </Button>
            <LinkButton to={`/reports/print?client=${client.id}&period=${period}`} variant="primary" icon={Printer}>
              Printable PDF
            </LinkButton>
          </>
        }
      />

      <FilterBar className="justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:flex-none">
          <ClientPicker clients={state.clients} value={client.id} onChange={select} />
          <Select aria-label="Period" value={period} onChange={(e) => selectPeriod(e.target.value)} className="min-w-0 flex-1 basis-32 sm:w-44 sm:flex-none sm:basis-auto">
            {periods.map((p) => (
              <option key={p} value={p}>
                {fmtPeriod(p)}
              </option>
            ))}
          </Select>
        </div>
        <Segmented<Mode>
          label="Show as"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'chart', label: 'Charts' },
            { value: 'table', label: 'Tables' },
          ]}
        />
      </FilterBar>

      {waiting > 0 && (
        <p className="mb-6 flex items-start gap-2 rounded-lg bg-warn-soft px-3.5 py-2.5 text-[13.5px] text-ink">
          <Info size={15} className="mt-0.5 shrink-0 text-warn" aria-hidden />
          {waiting} {waiting === 1 ? 'document dated this month is' : 'documents dated this month are'} still awaiting review and not included below.
        </p>
      )}

      <SummaryStrip
        items={[
          { label: 'Income', value: <Money value={summary.income} /> },
          { label: 'Expenses', value: <Money value={summary.expenses} /> },
          { label: 'Net', value: <Money value={summary.net} />, tone: summary.net < 0 ? 'bad' : undefined, hint: summary.income > 0 ? `${Math.round((summary.net / summary.income) * 100)}% of income` : undefined },
        ]}
      />

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Income vs expenses" description="Last six months, in KYD. Select a month to view it." />
          {mode === 'chart' ? (
            <div className="p-4 sm:px-5">
              <IncomeExpenseChart data={history} selected={period} onSelect={selectPeriod} />
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="text-right">Income</th>
                    <th className="text-right">Expenses</th>
                    <th className="text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((point) => (
                    <tr key={point.period} className={point.period === period ? 'bg-surface-2' : undefined}>
                      <td className="whitespace-nowrap font-medium text-ink">{fmtPeriod(point.period)}</td>
                      <td className="num text-right text-ink-2">{fmtAmount(point.income)}</td>
                      <td className="num text-right text-ink-2">{fmtAmount(point.expenses)}</td>
                      <td className="num text-right font-medium text-ink">{fmtAmount(point.income - point.expenses)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Expenses by category" description={fmtPeriod(period)} />
          {summary.byCategory.length === 0 ? (
            <EmptyState compact icon={PieChart} title="No expenses this month" body="Approve documents to see them here." />
          ) : mode === 'chart' ? (
            <div className="p-4 sm:px-5">
              <CategoryBars data={summary.byCategory} total={summary.expenses} />
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="text-right">Entries</th>
                    <th className="text-right">Amount</th>
                    <th className="text-right">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byCategory.map((row) => (
                    <tr key={row.category}>
                      <td className="font-medium text-ink">{row.category}</td>
                      <td className="num text-right text-ink-2">{row.count}</td>
                      <td className="num text-right text-ink-2">{fmtAmount(row.amount)}</td>
                      <td className="num text-right text-ink-2">{summary.expenses > 0 ? `${Math.round((row.amount / summary.expenses) * 100)}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Income by category" description={fmtPeriod(period)} />
          {summary.incomeByCategory.length ? (
            <ul className="divide-y divide-line">
              {summary.incomeByCategory.map((row) => (
                <li key={row.category} className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
                  <span className="min-w-0 truncate text-ink">{row.category}</span>
                  <Money value={row.amount} className="shrink-0 font-medium text-ink" />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={FileText} title="No income posted this month" />
          )}
        </Card>
      </div>
    </div>
  )
}
