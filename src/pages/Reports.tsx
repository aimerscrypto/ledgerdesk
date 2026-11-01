import { useState } from 'react'
import { Download, FileText, Info, PieChart, Printer, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { logExport } from '../lib/actions'
import { downloadText, toCsv, type CsvCell } from '../lib/csv'
import { fmtAmount, fmtMoney, fmtPeriod, toKYD } from '../lib/format'
import { useSelectedClient, useSelectedPeriod } from '../lib/hooks'
import { clientPeriods, docFields, summarise, trend } from '../lib/selectors'
import { useAppState } from '../lib/store'
import { toast } from '../lib/toast'
import { CategoryBars, IncomeExpenseChart } from '../components/charts'
import { Button, Card, CardHeader, ClientPicker, EmptyState, KPI, LinkButton, PageHeader, Segmented, Select } from '../components/ui'

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

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ClientPicker clients={state.clients} value={client.id} onChange={select} />
          <Select aria-label="Period" value={period} onChange={(e) => selectPeriod(e.target.value)} className="sm:w-44">
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
      </div>

      {waiting > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-[13px] text-ink">
          <Info size={15} className="mt-0.5 shrink-0 text-warn" aria-hidden />
          {waiting} {waiting === 1 ? 'document dated this month is' : 'documents dated this month are'} still awaiting review and not included below.
        </p>
      )}

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KPI label="Income" value={fmtMoney(summary.income)} icon={TrendingUp} />
        <KPI label="Expenses" value={fmtMoney(summary.expenses)} icon={TrendingDown} />
        <KPI label="Net" value={fmtMoney(summary.net)} icon={Wallet} tone={summary.net < 0 ? 'bad' : 'good'} hint={summary.income > 0 ? `${Math.round((summary.net / summary.income) * 100)}% of income` : undefined} />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-2">
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
                <li key={row.category} className="flex items-center justify-between gap-4 px-4 py-2.5 sm:px-5">
                  <span className="min-w-0 truncate text-ink">{row.category}</span>
                  <span className="num shrink-0 font-medium text-ink">{fmtMoney(row.amount)}</span>
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
