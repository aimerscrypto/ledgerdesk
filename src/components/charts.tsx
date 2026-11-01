import { useLayoutEffect, useRef, useState } from 'react'
import { compactMoney, fmtMoney, fmtPeriod } from '../lib/format'
import { cx } from './ui'

function useWidth(initial = 640) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(initial)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return { ref, width }
}

function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1]
  const raw = max / count
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw
  const top = Math.ceil(max / step)
  return Array.from({ length: top + 1 }, (_, i) => i * step)
}

/** A bar with 4px rounded data-end, square against the baseline. */
function barPath(x: number, y: number, w: number, base: number): string {
  const r = Math.min(4, w / 2, base - y)
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`
}

export interface TrendPoint {
  period: string
  income: number
  expenses: number
}

function LegendSwatch({ color }: { color: string }) {
  return <span className="inline-block size-2.5 rounded-[3px]" style={{ background: color }} aria-hidden />
}

/** Six months of income against expenses. One shared KYD axis, and the selected month stands out. */
export function IncomeExpenseChart({ data, selected, onSelect, height = 250 }: { data: TrendPoint[]; selected?: string; onSelect?: (period: string) => void; height?: number }) {
  const { ref, width } = useWidth()
  const [hover, setHover] = useState<number | null>(null)

  const margin = { top: 12, right: 4, bottom: 26, left: 48 }
  const plotW = Math.max(40, width - margin.left - margin.right)
  const plotH = height - margin.top - margin.bottom
  const base = margin.top + plotH
  const ticks = niceTicks(Math.max(...data.flatMap((d) => [d.income, d.expenses]), 1))
  const top = ticks[ticks.length - 1]
  const y = (v: number) => base - (v / top) * plotH
  const band = plotW / data.length
  const barW = Math.min(22, Math.max(6, band * 0.28))
  const focus = data.find((d) => d.period === selected)
  const active = hover !== null ? data[hover] : null

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <LegendSwatch color="var(--chart-income)" /> Income
          {focus && <span className="num font-medium text-ink">{fmtMoney(focus.income)}</span>}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <LegendSwatch color="var(--chart-expense)" /> Expenses
          {focus && <span className="num font-medium text-ink">{fmtMoney(focus.expenses)}</span>}
        </span>
        {focus && <span className="text-[13px] text-ink-3">{fmtPeriod(focus.period)}</span>}
      </div>
      <div ref={ref} className="relative">
        <svg width={width} height={height} role="img" aria-label={`Income and expenses by month in KYD, ${fmtPeriod(data[0].period)} to ${fmtPeriod(data[data.length - 1].period)}`} className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={margin.left} x2={width - margin.right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" />
              <text x={margin.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={12} fill="var(--ink-3)" className="num">
                {compactMoney(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const center = margin.left + band * i + band / 2
            const dim = selected && d.period !== selected && hover !== i
            return (
              <g key={d.period}>
                {hover === i && <rect x={center - band / 2 + 2} y={margin.top} width={band - 4} height={plotH} fill="var(--surface-2)" rx={6} />}
                <g opacity={dim ? 0.42 : 1}>
                  <path d={barPath(center - barW - 1, y(d.income), barW, base)} fill="var(--chart-income)" />
                  <path d={barPath(center + 1, y(d.expenses), barW, base)} fill="var(--chart-expense)" />
                </g>
                <text x={center} y={height - 8} textAnchor="middle" fontSize={12} fontWeight={d.period === selected ? 600 : 400} fill={d.period === selected ? 'var(--ink)' : 'var(--ink-3)'}>
                  {fmtPeriod(d.period, true)}
                </text>
                <rect
                  x={margin.left + band * i}
                  y={margin.top}
                  width={band}
                  height={height - margin.top}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`${fmtPeriod(d.period)}: income ${fmtMoney(d.income)}, expenses ${fmtMoney(d.expenses)}`}
                  style={{ cursor: onSelect ? 'pointer' : 'default', outline: 'none' }}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  onClick={() => onSelect?.(d.period)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSelect?.(d.period)
                  }}
                />
              </g>
            )
          })}
          <line x1={margin.left} x2={width - margin.right} y1={base} y2={base} stroke="var(--line-strong)" />
        </svg>
        {active && hover !== null && (
          <div
            className="pointer-events-none absolute z-10 w-48 rounded-xl bg-surface p-3 text-[13px] shadow-pop"
            style={{ top: 8, left: Math.min(Math.max(0, margin.left + band * hover + band / 2 - 96), Math.max(0, width - 192)) }}
          >
            <p className="mb-1 font-semibold text-ink">{fmtPeriod(active.period)}</p>
            <TooltipRow color="var(--chart-income)" label="Income" value={active.income} />
            <TooltipRow color="var(--chart-expense)" label="Expenses" value={active.expenses} />
            <div className="mt-1 flex justify-between border-t border-line pt-1 text-ink-2">
              <span>Net</span>
              <span className="num font-medium text-ink">{fmtMoney(active.income - active.expenses)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 text-ink-2">
      <span className="inline-flex items-center gap-1.5">
        <LegendSwatch color={color} />
        {label}
      </span>
      <span className="num font-medium text-ink">{fmtMoney(value)}</span>
    </div>
  )
}

/** Ranked horizontal bars. Anything past the top eight folds into "Other" rather than shrinking off-screen. */
export function CategoryBars({ data, total, limit = 8 }: { data: Array<{ category: string; amount: number; count: number }>; total: number; limit?: number }) {
  const rows = data.length > limit
    ? [
        ...data.slice(0, limit - 1),
        data.slice(limit - 1).reduce((acc, d) => ({ category: `Other (${data.length - limit + 1} categories)`, amount: acc.amount + d.amount, count: acc.count + d.count }), { category: '', amount: 0, count: 0 }),
      ]
    : data
  const max = Math.max(...rows.map((r) => r.amount), 1)
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const share = total > 0 ? Math.round((r.amount / total) * 100) : 0
        return (
          <li key={r.category} tabIndex={0} className="group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-md py-0.5 outline-none sm:grid-cols-[170px_minmax(0,1fr)_96px]">
            <span className="truncate text-[13px] text-ink-2" title={r.category}>
              {r.category}
            </span>
            <span className="col-span-2 row-start-2 h-3.5 min-w-0 sm:col-span-1 sm:row-start-auto">
              <span className="block h-full rounded-r bg-[var(--chart-expense)] transition-opacity group-hover:opacity-85" style={{ width: `${Math.max(1, (r.amount / max) * 100)}%` }} />
            </span>
            <span className="num text-right text-[13px] font-medium text-ink">{fmtMoney(r.amount)}</span>
            <span className={cx('pointer-events-none absolute -top-7 left-1/2 z-10 hidden -translate-x-1/2 rounded-md bg-surface px-2 py-1 text-[13px] whitespace-nowrap text-ink-2 shadow-pop group-hover:block group-focus:block')}>
              {share}% of expenses, {r.count} {r.count === 1 ? 'entry' : 'entries'}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
