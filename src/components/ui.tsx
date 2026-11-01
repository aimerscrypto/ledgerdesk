import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ComponentType, type ReactNode, type SelectHTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, CircleDashed, Clock3, Loader2, X, XCircle } from 'lucide-react'
import type { Client, Currency, DocStatus, MatchStatus } from '../lib/types'
import { fmtAmount, initials } from '../lib/format'

type IconType = ComponentType<{ className?: string; size?: number; 'aria-hidden'?: boolean }>

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-on-brand hover:bg-brand-hover border-transparent shadow-card',
  secondary: 'bg-surface text-ink border-line-strong hover:bg-surface-2',
  ghost: 'bg-transparent text-ink-2 border-transparent hover:bg-surface-2 hover:text-ink',
  danger: 'bg-surface text-bad border-line-strong hover:bg-bad-soft',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-[38px] px-4 text-sm',
  lg: 'h-12 px-6 text-base',
}

export function buttonClass(variant: Variant = 'secondary', size: Size = 'md') {
  return cx(
    'inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium whitespace-nowrap transition-all duration-150 select-none active:scale-[0.985] disabled:opacity-50 disabled:pointer-events-none',
    SIZES[size],
    VARIANTS[variant],
  )
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: IconType
  loading?: boolean
}

export function Button({ variant, size, icon: Icon, loading, children, className, type = 'button', disabled, ...rest }: ButtonProps) {
  return (
    <button type={type} className={cx(buttonClass(variant, size), className)} disabled={disabled || loading} {...rest}>
      {loading ? <Loader2 size={15} className="animate-spin" aria-hidden /> : Icon ? <Icon size={15} aria-hidden /> : null}
      {children}
    </button>
  )
}

export function LinkButton({ to, variant, size, icon: Icon, children, className }: { to: string; variant?: Variant; size?: Size; icon?: IconType; children: ReactNode; className?: string }) {
  return (
    <Link to={to} className={cx(buttonClass(variant, size), className)}>
      {Icon && <Icon size={15} aria-hidden />}
      {children}
    </Link>
  )
}

export function IconButton({ label, icon: Icon, className, ...rest }: { label: string; icon: IconType } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label={label} title={label} className={cx('inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink', className)} {...rest}>
      <Icon size={17} aria-hidden />
    </button>
  )
}

/** `plain` drops the white panel so a section sits directly on the page, separated by whitespace. */
export function Card({ children, className, plain }: { children: ReactNode; className?: string; plain?: boolean }) {
  return <section className={cx(plain ? '-mx-4 sm:-mx-5' : 'rounded-2xl bg-surface shadow-card', className)}>{children}</section>
}

export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-4 pb-3 sm:px-5">
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-[-0.005em] text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
      </div>
      {action}
    </header>
  )
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="font-display text-[34px] leading-[1.1] text-ink sm:text-[40px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Tabular amount with the currency code smaller and muted, so columns of figures line up. */
export function Money({ value, currency = 'KYD', sign, hideCode, className }: { value: number; currency?: Currency; sign?: '+' | '−'; hideCode?: boolean; className?: string }) {
  return (
    <span className={cx('num whitespace-nowrap', className)}>
      {!hideCode && <span className="mr-1 font-sans text-[0.74em] font-normal tracking-wide text-ink-3">{currency}</span>}
      {sign ?? (value < 0 ? '−' : '')}
      {fmtAmount(Math.abs(value))}
    </span>
  )
}

export interface Stat {
  label: string
  value: ReactNode
  hint?: ReactNode
  to?: string
  tone?: 'warn' | 'bad'
}

/** The inline numbers under a page title: no boxes, just figures and labels on one line. */
export function SummaryStrip({ items, className }: { items: Stat[]; className?: string }) {
  return (
    <div className={cx('mb-8 flex flex-wrap gap-x-12 gap-y-5', className)}>
      {items.map((item) => {
        const body = (
          <>
            <span className={cx('num font-display text-[30px] leading-none', item.tone === 'bad' ? 'text-bad' : item.tone === 'warn' ? 'text-warn' : 'text-ink')}>{item.value}</span>
            <span className={cx('mt-2 text-[13.5px] font-medium text-ink-2', item.to && 'underline-offset-3 group-hover:underline')}>{item.label}</span>
            {item.hint && <span className="mt-0.5 text-[13px] text-ink-3">{item.hint}</span>}
          </>
        )
        return item.to ? (
          <Link key={item.label} to={item.to} className="group flex min-w-0 flex-col transition-opacity hover:opacity-80">
            {body}
          </Link>
        ) : (
          <div key={item.label} className="flex min-w-0 flex-col">
            {body}
          </div>
        )
      })}
    </div>
  )
}

/** One compact row of filters: selectors stay side by side, even on a phone. */
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mb-7 flex flex-wrap items-center gap-2', className)}>{children}</div>
}

export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info' | 'brand'

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-ink-2',
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-info-soft text-info',
  brand: 'bg-brand-soft text-brand-ink',
}

export function Badge({ tone = 'neutral', icon: Icon, children, className }: { tone?: Tone; icon?: IconType; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', TONES[tone], className)}>
      {Icon && <Icon size={13} aria-hidden />}
      {children}
    </span>
  )
}

const STATUS: Record<DocStatus, { label: string; tone: Tone; icon: IconType }> = {
  processing: { label: 'Processing', tone: 'info', icon: Clock3 },
  needs_review: { label: 'Needs review', tone: 'warn', icon: AlertTriangle },
  approved: { label: 'Approved', tone: 'good', icon: CheckCircle2 },
  rejected: { label: 'Rejected', tone: 'bad', icon: XCircle },
}

export function StatusBadge({ status }: { status: DocStatus }) {
  const s = STATUS[status]
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {s.label}
    </Badge>
  )
}

const MATCH: Record<MatchStatus, { label: string; tone: Tone; icon: IconType }> = {
  matched: { label: 'Matched', tone: 'good', icon: CheckCircle2 },
  suggested: { label: 'Suggested', tone: 'info', icon: CircleDashed },
  unmatched: { label: 'Unmatched', tone: 'warn', icon: AlertTriangle },
  excluded: { label: 'Excluded', tone: 'neutral', icon: XCircle },
}

export function MatchBadge({ status }: { status: MatchStatus }) {
  const s = MATCH[status]
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {s.label}
    </Badge>
  )
}

export function ConfidenceChip({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  return (
    <Badge tone={value < 0.8 ? 'warn' : 'neutral'} className="num">
      {pct}%
    </Badge>
  )
}

export function Field({ label, hint, error, children, htmlFor, aside }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; htmlFor?: string; aside?: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex min-h-6 items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-2">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error ? <p className="mt-1 text-xs text-bad">{error}</p> : hint ? <p className="mt-1 text-xs text-ink-3">{hint}</p> : null}
    </div>
  )
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx('field-input', className)} {...rest}>
      {children}
    </select>
  )
}

export function ClientPicker({ clients, value, onChange, className, label = 'Client' }: { clients: Client[]; value: string; onChange: (id: string) => void; className?: string; label?: string }) {
  return (
    <Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cx('min-w-0 flex-1 basis-40 sm:w-72 sm:flex-none sm:basis-auto', className)}>
      {clients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </Select>
  )
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const box = size === 'sm' ? 'size-7 text-[12px]' : size === 'lg' ? 'size-12 text-base' : 'size-9 text-[13px]'
  return <span className={cx('inline-flex shrink-0 items-center justify-center rounded-full bg-surface-3 font-semibold text-ink-2', box)}>{initials(name)}</span>
}

export function ProgressBar({ value, tone = 'brand', label }: { value: number; tone?: 'brand' | 'good' | 'warn' | 'bad'; label?: string }) {
  const fill = { brand: 'bg-brand', good: 'bg-good', warn: 'bg-warn', bad: 'bg-bad' }[tone]
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
      <div className={cx('h-full rounded-full transition-[width] duration-300', fill)} style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  )
}

export function EmptyState({ icon: Icon, title, body, action, compact }: { icon: IconType; title: string; body?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cx('flex flex-col items-center px-6 text-center', compact ? 'py-10' : 'py-20')}>
      <span className="mb-4 inline-flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand-ink">
        <Icon size={20} aria-hidden />
      </span>
      <p className="font-display text-[26px] leading-tight text-ink">{title}</p>
      {body && <p className="mt-1.5 max-w-md text-[13px] text-ink-2">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: ReactNode; count?: number }>; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-surface-3/60 p-0.5 scrollbar-thin">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium whitespace-nowrap transition-all duration-150',
            o.value === value ? 'bg-surface text-ink shadow-card' : 'text-ink-2 hover:text-ink',
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="num text-xs text-ink-3">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Modal({ open, onClose, title, description, children, footer, wide }: { open: boolean; onClose: () => void; title: string; description?: ReactNode; children?: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className={cx('m-auto w-[calc(100vw-32px)] rounded-2xl bg-surface p-0 text-ink shadow-pop', wide ? 'max-w-2xl' : 'max-w-md')}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <header className="flex items-start justify-between gap-3 px-6 pt-5 pb-3">
            <div className="min-w-0">
              <h2 className="font-display text-[26px] leading-tight">{title}</h2>
              {description && <p className="mt-1 text-[13px] text-ink-2">{description}</p>}
            </div>
            <IconButton label="Close" icon={X} onClick={onClose} className="-mt-1 -mr-2" />
          </header>
          {children && <div className="scrollbar-thin overflow-y-auto px-6 py-3">{children}</div>}
          {footer && <footer className="flex flex-wrap justify-end gap-2 px-6 pt-3 pb-5">{footer}</footer>}
        </div>
      )}
    </dialog>
  )
}

export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="skeleton mb-3 h-10 w-72 max-w-full" />
      <div className="skeleton mb-8 h-4 w-96 max-w-full" />
      <div className="skeleton h-96 rounded-2xl" />
    </div>
  )
}

/** Client-side paging for long tables. Clamps itself when a filter shrinks the list. */
export function usePaged<T>(items: T[], perPage: number) {
  const [page, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(items.length / perPage))
  const current = Math.min(page, pages)
  return { page: current, pages, setPage, rows: items.slice((current - 1) * perPage, current * perPage), total: items.length, perPage }
}

export function Pager({ page, pages, setPage, total, perPage }: { page: number; pages: number; setPage: (p: number) => void; total: number; perPage: number }) {
  if (total <= perPage) return null
  const first = (page - 1) * perPage + 1
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-[13px] text-ink-2 sm:px-5">
      <span className="num">
        {first}–{Math.min(total, page * perPage)} of {total}
      </span>
      <div className="flex gap-1.5">
        <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Previous
        </Button>
        <Button size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  )
}
