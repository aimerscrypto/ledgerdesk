import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { logExport } from '../lib/actions'
import { fmtAmount, fmtDateTime, fmtMoney, fmtPeriod } from '../lib/format'
import { useSelectedClient, useSelectedPeriod } from '../lib/hooks'
import { clientPeriods, docFields, summarise, trend } from '../lib/selectors'
import { FIRM } from '../lib/seed'
import { useAppState } from '../lib/store'
import { CategoryBars, IncomeExpenseChart } from '../components/charts'
import { Logo } from '../components/Layout'
import { Button } from '../components/ui'

function CategoryTable({ title, rows, total }: { title: string; rows: Array<{ category: string; amount: number; count: number }>; total: number }) {
  return (
    <section className="print-avoid-break">
      <h2 className="mb-2 font-semibold text-ink">{title}</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Category</th>
            <th className="text-right">Entries</th>
            <th className="text-right">Amount (KYD)</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={row.category}>
                <td className="text-ink">{row.category}</td>
                <td className="num text-right text-ink-2">{row.count}</td>
                <td className="num text-right text-ink">{fmtAmount(row.amount)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={3} className="text-ink-3">
                None this month
              </td>
            </tr>
          )}
          <tr>
            <td className="font-semibold text-ink">Total</td>
            <td />
            <td className="num text-right font-semibold text-ink">{fmtAmount(total)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}

export default function ReportPrint() {
  const state = useAppState()
  const navigate = useNavigate()
  const { client } = useSelectedClient()
  const periods = clientPeriods(state)
  const { period } = useSelectedPeriod(periods, state.closePeriod)

  const summary = summarise(state.ledger, client.id, period)
  const history = trend(state.ledger, client.id, periods[0], 6)
  const waiting = state.documents.filter((d) => d.clientId === client.id && (d.status === 'needs_review' || d.status === 'processing') && docFields(d)?.date.startsWith(period)).length
  const exportedAt = fmtDateTime(new Date().toISOString())

  const print = () => {
    logExport(`Month-end report PDF exported for ${client.name}, ${period}`, client.id)
    window.print()
  }

  return (
    <div className="min-h-dvh bg-canvas px-4 py-5 sm:py-8">
      <div className="no-print mx-auto mb-4 flex max-w-[800px] flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate(`/reports?client=${client.id}&period=${period}`)}>
          Back to reports
        </Button>
        <Button variant="primary" icon={Printer} onClick={print}>
          Print or save as PDF
        </Button>
      </div>

      <article className="print-sheet mx-auto max-w-[800px] rounded-2xl bg-surface p-5 shadow-card sm:p-9">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div>
            <p className="font-semibold text-ink">{FIRM.name}</p>
            <p className="text-[13px] text-ink-3">{FIRM.address}</p>
            <p className="text-[13px] text-ink-3">{FIRM.phone}</p>
          </div>
          <Logo />
        </header>

        <div className="mt-5">
          <p className="text-[13px] text-ink-3">Month-end report</p>
          <h1 className="font-display text-[36px] leading-tight text-ink">{client.name}</h1>
          <p className="text-ink-2">{fmtPeriod(period)}</p>
        </div>

        <dl className="print-avoid-break mt-5 grid grid-cols-3 gap-3">
          {[
            ['Income', summary.income],
            ['Expenses', summary.expenses],
            ['Net', summary.net],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-[13px] text-ink-3">{label}</dt>
              <dd className="num mt-1 font-display text-[20px] text-ink sm:text-[26px]">{fmtMoney(value as number)}</dd>
            </div>
          ))}
        </dl>

        {waiting > 0 && (
          <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
            Excludes {waiting} {waiting === 1 ? 'document' : 'documents'} dated this month and still awaiting review.
          </p>
        )}

        <section className="print-avoid-break mt-6">
          <h2 className="mb-2 font-semibold text-ink">Income vs expenses, last six months</h2>
          <IncomeExpenseChart data={history} selected={period} height={210} />
        </section>

        {summary.byCategory.length > 0 && (
          <section className="print-avoid-break mt-6">
            <h2 className="mb-2 font-semibold text-ink">Expenses by category</h2>
            <CategoryBars data={summary.byCategory} total={summary.expenses} />
          </section>
        )}

        <div className="mt-6 space-y-6">
          <CategoryTable title="Income" rows={summary.incomeByCategory} total={summary.income} />
          <CategoryTable title="Expenses" rows={summary.byCategory} total={summary.expenses} />
        </div>

        <footer className="mt-7 border-t border-line pt-3 text-xs text-ink-3">
          All amounts in KYD. USD entries converted at the peg of 1 KYD = 1.20 USD. Prepared from approved ledger entries on {exportedAt}.
        </footer>
      </article>
    </div>
  )
}
