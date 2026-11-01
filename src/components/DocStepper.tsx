import { Check, X } from 'lucide-react'
import type { DocStatus } from '../lib/types'
import { cx } from './ui'

const STEPS = ['Processing', 'Needs review', 'Approved']

/** The journey a document takes, shown the same way on the client's list and its detail page. */
export function DocStepper({ status, className }: { status: DocStatus; className?: string }) {
  const rejected = status === 'rejected'
  const current = status === 'processing' ? 0 : status === 'needs_review' ? 1 : 2
  const labels = rejected ? ['Processing', 'Needs review', 'Rejected'] : STEPS
  const label = `Document status: ${labels[current]}`

  return (
    <ol aria-label={label} className={cx('flex items-center', className)}>
      {labels.map((step, i) => {
        const done = i < current || status === 'approved'
        const active = i === current && status !== 'approved'
        const failed = rejected && i === 2
        return (
          <li key={step} className={cx('flex items-center', i < labels.length - 1 && 'flex-1')} aria-current={i === current ? 'step' : undefined}>
            <span className="flex items-center gap-1.5">
              <span
                className={cx(
                  'inline-flex size-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                  failed ? 'bg-bad text-white' : done ? 'bg-good text-white' : active ? 'bg-brand text-on-brand' : 'bg-surface-3 text-ink-3',
                )}
              >
                {failed ? <X size={11} aria-hidden /> : done ? <Check size={11} aria-hidden /> : i + 1}
              </span>
              <span className={cx('text-xs whitespace-nowrap', failed ? 'font-medium text-bad' : done || active ? 'font-medium text-ink' : 'text-ink-3')}>{step}</span>
            </span>
            {i < labels.length - 1 && <span className={cx('mx-2 h-px min-w-3 flex-1', i < current || status === 'approved' ? 'bg-good' : 'bg-line-strong')} aria-hidden />}
          </li>
        )
      })}
    </ol>
  )
}
