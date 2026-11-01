import type { Currency } from './types'

/** The Cayman Islands dollar is pegged: 1 KYD = 1.20 USD. */
export const USD_PER_KYD = 1.2

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function convert(amount: number, from: Currency, to: Currency): number {
  if (from === to) return round2(amount)
  return round2(from === 'USD' ? amount / USD_PER_KYD : amount * USD_PER_KYD)
}

export const toKYD = (amount: number, currency: Currency) => convert(amount, currency, 'KYD')

/** Sums in cents so long columns of decimals don't drift. */
export function sumMoney(values: number[]): number {
  return values.reduce((total, v) => total + Math.round(v * 100), 0) / 100
}

const amountFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const wholeFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export const fmtAmount = (n: number) => amountFormat.format(n)
export const fmtMoney = (n: number, currency: Currency = 'KYD') =>
  `${n < 0 ? '−' : ''}${currency} ${amountFormat.format(Math.abs(n))}`
export const fmtWhole = (n: number, currency: Currency = 'KYD') =>
  `${n < 0 ? '−' : ''}${currency} ${wholeFormat.format(Math.abs(n))}`

export function compactMoney(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1000) return `${(n / 1000).toFixed(abs >= 10_000 ? 0 : 1)}k`
  return wholeFormat.format(n)
}

// Dates are plain YYYY-MM-DD strings, parsed as local time to avoid off-by-one-day bugs.
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function fmtDate(s: string): string {
  if (!s) return '—'
  return parseDate(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtDateTime(ts: string): string {
  const d = new Date(ts)
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString(
    'en-GB',
    { hour: '2-digit', minute: '2-digit' },
  )}`
}

export function timeAgo(ts: string, now = Date.now()): string {
  const mins = Math.round((now - new Date(ts).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return fmtDate(ts.slice(0, 10))
}

export const daysBetween = (a: string, b: string) =>
  Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000)

export const daysUntil = (date: string) => daysBetween(isoDate(new Date()), date)

export function dueLabel(date: string): string {
  const days = daysUntil(date)
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `Due in ${days} days`
}

export const periodOf = (date: string) => date.slice(0, 7)

export function addMonths(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function fmtPeriod(period: string, short = false): string {
  const [y, m] = period.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', short ? { month: 'short' } : { month: 'long', year: 'numeric' })
}

export function lastDayOf(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return isoDate(new Date(y, m, 0))
}

export function initials(name: string): string {
  return name
    .replace(/\b(Ltd|Inc|LLC)\b\.?/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

export const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

export function hashString(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Small seeded PRNG, so demo data and generated documents are stable between renders. */
export function createRng(seed: number | string) {
  let a = typeof seed === 'string' ? hashString(seed) : seed
  const next = () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
    chance: (p: number) => next() < p,
  }
}
export type Rng = ReturnType<typeof createRng>
