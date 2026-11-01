import type { AppState, BankTxn, Client, DocFields, DocRecord, LedgerEntry, Message, Role } from './types'
import { addMonths, periodOf, sumMoney, toKYD } from './format'

export const LOW_CONFIDENCE = 0.8

export const docFields = (doc: DocRecord): DocFields | undefined => doc.final ?? doc.extraction

export const clientById = (state: AppState, id: string): Client | undefined => state.clients.find((c) => c.id === id)

export const reviewQueue = (state: AppState): DocRecord[] =>
  state.documents.filter((d) => d.status === 'needs_review').sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt))

export const isOpenLine = (t: BankTxn) => t.status === 'suggested' || t.status === 'unmatched'

export function clientPeriods(state: AppState): string[] {
  return Array.from({ length: 6 }, (_, i) => addMonths(state.closePeriod, -i))
}

export interface CloseStatus {
  waiting: number
  unreconciled: number
  statementImported: boolean
  reportExported: boolean
  progress: number
  health: 'ready' | 'on_track' | 'at_risk'
  steps: Array<{ label: string; done: boolean; detail: string }>
}

/** Month-end readiness for a client, derived from live data so it moves as work gets done. */
export function closeStatus(state: AppState, clientId: string): CloseStatus {
  const period = state.closePeriod
  const waiting = state.documents.filter((d) => d.clientId === clientId && (d.status === 'needs_review' || d.status === 'processing')).length
  const lines = state.bank.filter((t) => t.clientId === clientId && t.period === period)
  const unreconciled = lines.filter(isOpenLine).length
  const statementImported = state.statements.some((s) => s.clientId === clientId && s.period === period)
  const reportExported = state.audit.some(
    (e) => e.clientId === clientId && e.action === 'export' && e.detail.startsWith('Month-end report') && e.detail.includes(period),
  )

  const steps = [
    { label: 'Documents reviewed', done: waiting === 0, detail: waiting ? `${waiting} waiting` : 'All clear' },
    { label: 'Bank statement imported', done: statementImported, detail: statementImported ? 'Imported' : 'Not yet imported' },
    {
      label: 'Bank reconciled',
      done: statementImported && unreconciled === 0,
      detail: !statementImported ? 'Needs statement' : unreconciled ? `${unreconciled} open` : 'Balanced',
    },
    { label: 'Report issued', done: reportExported, detail: reportExported ? 'Exported' : 'Not yet exported' },
  ]
  const progress = steps.filter((s) => s.done).length / steps.length
  const client = clientById(state, clientId)
  const dueSoon = client ? new Date(client.monthEndDue).getTime() - Date.now() < 4 * 86_400_000 : false
  const health = progress === 1 ? 'ready' : dueSoon && progress < 0.75 ? 'at_risk' : 'on_track'
  return { waiting, unreconciled, statementImported, reportExported, progress, health, steps }
}

export interface PeriodSummary {
  income: number
  expenses: number
  net: number
  byCategory: Array<{ category: string; amount: number; count: number }>
  incomeByCategory: Array<{ category: string; amount: number; count: number }>
  entries: LedgerEntry[]
}

function groupByCategory(entries: LedgerEntry[]) {
  const groups = new Map<string, { amounts: number[]; count: number }>()
  for (const entry of entries) {
    const group = groups.get(entry.category) ?? { amounts: [], count: 0 }
    group.amounts.push(toKYD(entry.amount, entry.currency))
    group.count += 1
    groups.set(entry.category, group)
  }
  return [...groups.entries()]
    .map(([category, g]) => ({ category, amount: sumMoney(g.amounts), count: g.count }))
    .sort((a, b) => b.amount - a.amount)
}

/** All reporting totals are in KYD. USD items convert at the 1.20 peg. */
export function summarise(ledger: LedgerEntry[], clientId: string, period: string): PeriodSummary {
  const entries = ledger
    .filter((e) => e.clientId === clientId && periodOf(e.date) === period)
    .sort((a, b) => a.date.localeCompare(b.date))
  const incomeEntries = entries.filter((e) => e.type === 'income')
  const expenseEntries = entries.filter((e) => e.type === 'expense')
  const income = sumMoney(incomeEntries.map((e) => toKYD(e.amount, e.currency)))
  const expenses = sumMoney(expenseEntries.map((e) => toKYD(e.amount, e.currency)))
  return {
    income,
    expenses,
    net: sumMoney([income, -expenses]),
    byCategory: groupByCategory(expenseEntries),
    incomeByCategory: groupByCategory(incomeEntries),
    entries,
  }
}

export function trend(ledger: LedgerEntry[], clientId: string, endPeriod: string, months = 6) {
  return Array.from({ length: months }, (_, i) => {
    const period = addMonths(endPeriod, i - months + 1)
    const { income, expenses } = summarise(ledger, clientId, period)
    return { period, income, expenses }
  })
}

export function threadFor(state: AppState, docId: string): Message[] {
  return state.messages.filter((m) => m.docId === docId).sort((a, b) => a.at.localeCompare(b.at))
}

export function unreadCount(state: AppState, role: Role, clientId?: string): number {
  const docs = new Map(state.documents.map((d) => [d.id, d]))
  return state.messages.filter((m) => {
    if (m.role === role) return false
    const doc = docs.get(m.docId)
    if (!doc || (clientId && doc.clientId !== clientId)) return false
    const read = doc.readAt?.[role]
    return !read || read < m.at
  }).length
}

export function threadsFor(state: AppState, role: Role, clientId?: string) {
  const byDoc = new Map<string, Message[]>()
  for (const message of state.messages) {
    const list = byDoc.get(message.docId) ?? []
    list.push(message)
    byDoc.set(message.docId, list)
  }
  const threads: Array<{ doc: DocRecord; last: Message; count: number; unread: number }> = []
  for (const doc of state.documents) {
    if (clientId && doc.clientId !== clientId) continue
    const list = byDoc.get(doc.id)
    if (!list) continue
    const sorted = [...list].sort((a, b) => a.at.localeCompare(b.at))
    const read = doc.readAt?.[role]
    threads.push({
      doc,
      last: sorted[sorted.length - 1],
      count: sorted.length,
      unread: sorted.filter((m) => m.role !== role && (!read || read < m.at)).length,
    })
  }
  return threads.sort((a, b) => b.last.at.localeCompare(a.last.at))
}

/** Same client, same total, and a matching vendor or invoice number: probably the same document twice. */
export function findDuplicate(state: AppState, doc: DocRecord, fields: DocFields): LedgerEntry | undefined {
  return state.ledger.find(
    (e) =>
      e.clientId === doc.clientId &&
      e.docId !== doc.id &&
      Math.abs(e.amount - fields.total) < 0.01 &&
      e.currency === fields.currency &&
      ((fields.invoiceNumber && e.invoiceNumber === fields.invoiceNumber) || e.vendor.toLowerCase() === fields.vendor.toLowerCase()) &&
      Math.abs(new Date(e.date).getTime() - new Date(fields.date).getTime()) < 21 * 86_400_000,
  )
}
