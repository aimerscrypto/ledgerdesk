import type { BankTxn, LedgerEntry } from './types'
import { convert, daysBetween } from './format'

export const AUTO_MATCH_SCORE = 85
export const SUGGEST_SCORE = 50

const NOISE = new Set([
  'ltd', 'inc', 'llc', 'co', 'the', 'and', 'of', 'pos', 'ach', 'debit', 'credit', 'card', 'purchase', 'wire', 'out', 'in',
  'chq', 'cheque', 'payment', 'transfer', 'ref', 'dd', 'eft', 'settlement', 'gt',
])

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !NOISE.has(t) && !/^\d+$/.test(t))
}

/** Share of the vendor's name found in the bank description. Banks truncate, so prefixes count. */
export function vendorSimilarity(description: string, vendor: string): number {
  const bank = tokens(description)
  const wanted = tokens(vendor)
  if (!wanted.length) return 0
  const hits = wanted.filter((w) => bank.some((b) => b === w || (b.length >= 4 && w.startsWith(b)) || (w.length >= 4 && b.startsWith(w))))
  return hits.length / wanted.length
}

export interface PairScore {
  score: number
  reasons: string[]
}

/** Scores a bank line against a ledger entry: amount up to 55, date up to 25, vendor up to 20. */
export function scorePair(line: Pick<BankTxn, 'amount' | 'currency' | 'date' | 'description'>, entry: LedgerEntry): PairScore {
  const signMatches = entry.type === 'income' ? line.amount > 0 : line.amount < 0
  if (!signMatches) return { score: 0, reasons: [] }

  const expected = convert(entry.amount, entry.currency, line.currency)
  const actual = Math.abs(line.amount)
  const diff = Math.abs(actual - expected)
  const reasons: string[] = []
  let score: number

  if (diff <= 0.01) {
    score = 55
    reasons.push(entry.currency === line.currency ? 'Exact amount' : `Exact amount at peg (${entry.currency} → ${line.currency})`)
  } else if (expected > 0 && diff / expected <= 0.015) {
    score = 28
    reasons.push(`Amount within ${((diff / expected) * 100).toFixed(1)}%`)
  } else {
    return { score: 0, reasons: [] }
  }

  const days = Math.abs(daysBetween(entry.date, line.date))
  if (days > 14) return { score: 0, reasons: [] }
  if (days <= 1) {
    score += 25
    reasons.push(days === 0 ? 'Same date' : 'Date within 1 day')
  } else if (days <= 3) {
    score += 18
    reasons.push(`Date within ${days} days`)
  } else if (days <= 7) {
    score += 8
    reasons.push(`Date ${days} days apart`)
  }

  const similarity = vendorSimilarity(line.description, entry.vendor)
  if (similarity > 0) {
    score += Math.round(similarity * 20)
    reasons.push(similarity >= 0.5 ? 'Vendor name matches' : 'Vendor name partly matches')
  }
  return { score, reasons }
}

/**
 * Greedy best-first assignment over all candidate pairs, so a strong match is never
 * taken by a weaker line first. Only unresolved lines and free entries are touched:
 * anything a person has confirmed or excluded stays exactly as they left it.
 */
export function autoMatch(lines: BankTxn[], entries: LedgerEntry[]): BankTxn[] {
  const open = lines.filter((l) => !l.resolvedBy && l.status !== 'excluded')
  const openIds = new Set(open.map((l) => l.id))
  const taken = new Set(lines.filter((l) => !openIds.has(l.id) && l.ledgerEntryId).map((l) => l.ledgerEntryId))
  const free = entries.filter((e) => !taken.has(e.id))

  const pairs: Array<{ lineId: string; entryId: string } & PairScore> = []
  for (const line of open) {
    for (const entry of free) {
      const result = scorePair(line, entry)
      if (result.score >= SUGGEST_SCORE) pairs.push({ lineId: line.id, entryId: entry.id, ...result })
    }
  }
  pairs.sort((a, b) => b.score - a.score)

  const assigned = new Map<string, (typeof pairs)[number]>()
  const usedEntries = new Set<string>()
  for (const pair of pairs) {
    if (assigned.has(pair.lineId) || usedEntries.has(pair.entryId)) continue
    assigned.set(pair.lineId, pair)
    usedEntries.add(pair.entryId)
  }

  return lines.map((line) => {
    if (!openIds.has(line.id)) return line
    const pair = assigned.get(line.id)
    if (!pair) return { ...line, status: 'unmatched' as const, ledgerEntryId: undefined, score: undefined, reasons: undefined }
    return {
      ...line,
      status: pair.score >= AUTO_MATCH_SCORE ? ('matched' as const) : ('suggested' as const),
      ledgerEntryId: pair.entryId,
      score: pair.score,
      reasons: pair.reasons,
    }
  })
}

/** Ledger entries ranked for the manual "find a match" picker. */
export function rankCandidates(line: BankTxn, entries: LedgerEntry[]): Array<{ entry: LedgerEntry } & PairScore> {
  return entries
    .map((entry) => ({ entry, ...scorePair(line, entry) }))
    .sort((a, b) => b.score - a.score || Math.abs(daysBetween(a.entry.date, line.date)) - Math.abs(daysBetween(b.entry.date, line.date)))
}
