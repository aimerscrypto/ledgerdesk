import type { Currency } from './types'
import { isoDate, round2 } from './format'

export type CsvCell = string | number | null | undefined

/**
 * Text cells starting with a formula character get a leading apostrophe, so a vendor
 * name read off a document or a bank line can't execute when the export opens in Excel.
 */
function csvCell(value: CsvCell): string {
  if (value == null) return ''
  if (typeof value === 'number') return String(value)
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCsv(rows: CsvCell[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}

export function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const input = text.replace(/^﻿/, '')
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        quoted = false
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      if (row.some((c) => c.trim())) rows.push(row)
      row = []
    } else {
      cell += ch
    }
  }
  row.push(cell)
  if (row.some((c) => c.trim())) rows.push(row)
  return rows
}

export interface StatementLine {
  date: string
  description: string
  amount: number
  currency: Currency
}

export interface ParsedStatement {
  lines: StatementLine[]
  skipped: number
  error?: string
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function parseAmount(raw: string): number | null {
  const value = raw.trim()
  if (!value) return null
  const negative = /^\(.*\)$/.test(value) || /^-/.test(value) || /-$/.test(value)
  const n = Number(value.replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(n)) return null
  return round2(negative ? -n : n)
}

function parseStatementDate(raw: string, dayFirst: boolean): string | null {
  const value = raw.trim()
  let match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (match) return isoDate(new Date(+match[1], +match[2] - 1, +match[3]))
  match = value.match(/^(\d{1,2})[-\s/]([A-Za-z]{3})[A-Za-z]*[-\s/,]+(\d{2,4})$/)
  if (match) {
    const month = MONTHS.indexOf(match[2].toLowerCase())
    if (month < 0) return null
    const year = +match[3] < 100 ? 2000 + +match[3] : +match[3]
    return isoDate(new Date(year, month, +match[1]))
  }
  match = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (match) {
    const [a, b] = [+match[1], +match[2]]
    const year = +match[3] < 100 ? 2000 + +match[3] : +match[3]
    return isoDate(dayFirst ? new Date(year, b - 1, a) : new Date(year, a - 1, b))
  }
  return null
}

/** Accepts the common bank shapes: one signed Amount column, or separate Debit and Credit. */
export function parseStatementCsv(text: string, fallbackCurrency: Currency): ParsedStatement {
  const rows = parseCsv(text)
  if (rows.length < 2) return { lines: [], skipped: 0, error: 'That file has no transaction rows.' }

  const headerIndex = rows.findIndex((r) => r.some((c) => /date/i.test(c)) && r.some((c) => /amount|debit|credit|withdraw|deposit/i.test(c)))
  if (headerIndex < 0) {
    return { lines: [], skipped: 0, error: 'Could not find the header row. Expected Date, Description and Amount (or Debit and Credit) columns.' }
  }
  const header = rows[headerIndex].map((h) => h.trim().toLowerCase())
  const col = (pattern: RegExp) => header.findIndex((h) => pattern.test(h))
  const dateCol = col(/date/)
  const descCol = col(/desc|narrat|detail|memo|payee|particular/)
  const amountCol = col(/^amount|amount$/)
  const debitCol = col(/debit|withdraw|money out/)
  const creditCol = col(/credit|deposit|money in/)
  const currencyCol = col(/curr|ccy/)
  const body = rows.slice(headerIndex + 1)

  // 03/04/2026 is ambiguous, so a single row with a first number over 12 decides the whole file.
  const dayFirst = body.some((r) => {
    const m = (r[dateCol] ?? '').trim().match(/^(\d{1,2})[/.-]\d{1,2}[/.-]\d{2,4}$/)
    return m ? +m[1] > 12 : false
  })

  const lines: StatementLine[] = []
  let skipped = 0
  for (const row of body) {
    const date = parseStatementDate(row[dateCol] ?? '', dayFirst)
    let amount: number | null = null
    if (amountCol >= 0) {
      amount = parseAmount(row[amountCol] ?? '')
    } else {
      const debit = debitCol >= 0 ? parseAmount(row[debitCol] ?? '') : null
      const credit = creditCol >= 0 ? parseAmount(row[creditCol] ?? '') : null
      if (debit) amount = -Math.abs(debit)
      else if (credit) amount = Math.abs(credit)
    }
    if (!date || amount == null || amount === 0) {
      skipped += 1
      continue
    }
    const rawCurrency = currencyCol >= 0 ? (row[currencyCol] ?? '').trim().toUpperCase() : ''
    lines.push({
      date,
      amount,
      description: (descCol >= 0 ? row[descCol] : '')?.trim().slice(0, 140) || 'No description',
      currency: rawCurrency === 'USD' || rawCurrency === 'KYD' ? rawCurrency : fallbackCurrency,
    })
  }
  if (!lines.length) return { lines, skipped, error: 'No valid transactions found. Check the date and amount columns.' }
  return { lines, skipped }
}
