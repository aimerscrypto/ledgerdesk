import type {
  AppState,
  AuditAction,
  AuditEvent,
  BankTxn,
  DocFields,
  DocRecord,
  EntryType,
  LedgerEntry,
  Role,
  Statement,
} from './types'
import { getPreview, getState, resetState, savePreview, setState } from './store'
import { ACCOUNTANT, AI_ACTOR, buildStatementLines, extractionFromPaper, statementFingerprint } from './seed'
import { createRng, fmtAmount, periodOf, uid } from './format'
import { autoMatch } from './matching'
import { prepareUpload } from './images'
import { extractDocument } from './extract'
import { extractionLabel, mockExtraction } from '../../api/_lib/mock-extraction'
import { toCsv, type StatementLine } from './csv'
import { clientById } from './selectors'
import { toast } from './toast'

export const currentActor = (state: AppState = getState()): { name: string; role: Role } => {
  if (state.session.role === 'accountant') return { name: ACCOUNTANT, role: 'accountant' }
  return { name: clientById(state, state.session.clientId)?.contact ?? 'Client', role: 'client' }
}

function auditEvent(
  state: AppState,
  action: AuditAction,
  detail: string,
  who: { name: string; role: AuditEvent['actorRole'] },
  ids: { clientId?: string; docId?: string } = {},
): AuditEvent {
  const seq = (state.audit[state.audit.length - 1]?.seq ?? 0) + 1
  return { id: uid('aud'), seq, at: new Date().toISOString(), actor: who.name, actorRole: who.role, action, detail, ...ids }
}

/** The audit trail is append-only: nothing in the app can edit or delete an event. */
function withAudit(state: AppState, ...events: Array<Parameters<typeof auditEvent> extends [AppState, ...infer R] ? R : never>): AppState {
  let next = state
  for (const event of events) next = { ...next, audit: [...next.audit, auditEvent(next, ...event)] }
  return next
}

function patchDoc(state: AppState, docId: string, patch: Partial<DocRecord>): AppState {
  return { ...state, documents: state.documents.map((d) => (d.id === docId ? { ...d, ...patch } : d)) }
}

const SYSTEM_ACTOR = { name: AI_ACTOR, role: 'system' as const }

export function switchSession(role: Role, clientId?: string) {
  setState((s) => ({ ...s, session: { role, clientId: clientId ?? s.session.clientId } }))
}

export function resetDemo() {
  resetState()
  setState((s) => withAudit(s, ['system', 'Demo data reset to the original seed', { name: ACCOUNTANT, role: 'accountant' }]))
  startProcessing()
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function finishExtraction(docId: string, extraction: DocRecord['extraction']) {
  if (!extraction) return
  const state = getState()
  const doc = state.documents.find((d) => d.id === docId)
  // The document may have been wiped by a reset while the model was working.
  if (!doc || doc.status !== 'processing') return
  setState((s) =>
    withAudit(patchDoc(s, docId, { status: 'needs_review', extraction }), [
      'ai_extraction',
      `Extracted ${extraction.vendor || 'unknown vendor'}, ${extraction.currency} ${fmtAmount(extraction.total)} (${Math.round(extraction.confidence * 100)}% confidence) via ${extractionLabel(extraction)}`,
      SYSTEM_ACTOR,
      { clientId: doc.clientId, docId },
    ]),
  )
  toast.info(`${doc.filename} has been read`, 'It is now waiting for the accountant to review it.')
}

/** Client upload: Processing → AI extraction → Needs review. Nothing touches the ledger here. */
export async function uploadDocument(file: File, clientId: string): Promise<string> {
  const docId = uid('doc')
  const actor = currentActor()
  const { apiImage, preview } = await prepareUpload(file)
  if (preview) savePreview(docId, preview)

  const doc: DocRecord = {
    id: docId,
    clientId,
    filename: file.name,
    mime: file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : 'image/jpeg'),
    sizeKb: Math.max(1, Math.round(file.size / 1024)),
    uploadedAt: new Date().toISOString(),
    uploadedBy: actor.name,
    status: 'processing',
    hasStoredPreview: Boolean(preview),
    entryType: 'expense',
  }
  setState((s) =>
    withAudit({ ...s, documents: [doc, ...s.documents] }, ['upload', `Uploaded ${file.name}`, actor, { clientId, docId }]),
  )

  // A short minimum keeps the processing state visible even when the fallback is instant.
  const [extraction] = await Promise.all([extractDocument(apiImage, file.name), pause(1800)])
  finishExtraction(docId, extraction)
  return docId
}

/** Finishes documents left mid-processing: the seeded one, or an upload interrupted by a reload. */
export function startProcessing() {
  for (const doc of getState().documents) {
    if (doc.status !== 'processing') continue
    void (async () => {
      await pause(6000)
      if (doc.paper) {
        finishExtraction(doc.id, extractionFromPaper(doc.paper, doc.id))
      } else {
        const stored = getPreview(doc.id)
        finishExtraction(doc.id, stored ? await extractDocument(stored, doc.filename) : mockExtraction(doc.filename, 'unreachable'))
      }
    })()
  }
}

const FIELD_LABELS: Record<keyof DocFields, string> = {
  vendor: 'vendor',
  date: 'date',
  invoiceNumber: 'invoice number',
  subtotal: 'subtotal',
  tax: 'tax',
  total: 'total',
  currency: 'currency',
  category: 'category',
}

function rematchClient(state: AppState, clientId: string): { state: AppState; newlyMatched: number } {
  const lines = state.bank.filter((t) => t.clientId === clientId)
  const entries = state.ledger.filter((e) => e.clientId === clientId)
  const periods = [...new Set(lines.map((l) => l.period))]
  const before = new Set(lines.filter((l) => l.status === 'matched').map((l) => l.id))
  const updated = new Map<string, BankTxn>()
  for (const period of periods) {
    const periodLines = lines.filter((l) => l.period === period)
    const free = entries.filter((e) => Math.abs(new Date(e.date).getTime() - new Date(`${period}-15`).getTime()) < 50 * 86_400_000)
    // Entries already claimed by a line in another period stay out of this run.
    const claimedElsewhere = new Set(lines.filter((l) => l.period !== period && l.ledgerEntryId).map((l) => l.ledgerEntryId))
    for (const line of autoMatch(periodLines, free.filter((e) => !claimedElsewhere.has(e.id)))) updated.set(line.id, line)
  }
  const bank = state.bank.map((t) => updated.get(t.id) ?? t)
  return {
    state: syncEntryLinks({ ...state, bank }, clientId),
    newlyMatched: [...updated.values()].filter((l) => l.status === 'matched' && !before.has(l.id)).length,
  }
}

function syncEntryLinks(state: AppState, clientId: string): AppState {
  const links = new Map(
    state.bank.filter((t) => t.clientId === clientId && t.status === 'matched' && t.ledgerEntryId).map((t) => [t.ledgerEntryId!, t.id]),
  )
  return {
    ...state,
    ledger: state.ledger.map((e) => (e.clientId === clientId ? { ...e, bankTxnId: links.get(e.id) } : e)),
  }
}

/** The only path onto the ledger from a document: a person pressing Approve. */
export function approveDocument(docId: string, fields: DocFields, entryType: EntryType) {
  const actor = currentActor()
  const state = getState()
  const doc = state.documents.find((d) => d.id === docId)
  if (!doc || doc.status !== 'needs_review' || actor.role !== 'accountant') return

  const entry: LedgerEntry = {
    id: uid('led'),
    clientId: doc.clientId,
    date: fields.date,
    vendor: fields.vendor,
    category: fields.category,
    type: entryType,
    amount: fields.total,
    currency: fields.currency,
    docId,
    invoiceNumber: fields.invoiceNumber,
    postedBy: actor.name,
    postedAt: new Date().toISOString(),
  }

  const ids = { clientId: doc.clientId, docId }
  const edits = (Object.keys(FIELD_LABELS) as Array<keyof DocFields>).filter((key) => doc.extraction && doc.extraction[key] !== fields[key])

  let matchedCount = 0
  setState((s) => {
    let next = patchDoc(s, docId, {
      status: 'approved',
      final: fields,
      entryType,
      reviewedAt: new Date().toISOString(),
      reviewedBy: actor.name,
      ledgerEntryId: entry.id,
    })
    next = { ...next, ledger: [...next.ledger, entry] }
    for (const key of edits) {
      next = withAudit(next, ['edit', `Changed ${FIELD_LABELS[key]} from "${doc.extraction?.[key] || 'blank'}" to "${fields[key] || 'blank'}"`, actor, ids])
    }
    next = withAudit(next, ['approve', `Approved ${fields.vendor}, ${fields.currency} ${fmtAmount(fields.total)}`, actor, ids], [
      'post',
      `Posted to ledger: ${fields.category}, ${fields.currency} ${fmtAmount(fields.total)}, dated ${fields.date}`,
      actor,
      ids,
    ])
    const rematch = rematchClient(next, doc.clientId)
    matchedCount = rematch.newlyMatched
    return rematch.state
  })
  toast.success('Approved and posted to ledger', matchedCount ? 'It also matched a line on the bank statement.' : `${fields.vendor}, ${fields.currency} ${fmtAmount(fields.total)}`)
}

export function rejectDocument(docId: string, reason: string) {
  const actor = currentActor()
  const doc = getState().documents.find((d) => d.id === docId)
  if (!doc || actor.role !== 'accountant') return
  const at = new Date().toISOString()
  setState((s) =>
    withAudit(
      {
        ...patchDoc(s, docId, { status: 'rejected', rejectionReason: reason, reviewedAt: at, reviewedBy: actor.name }),
        messages: [...s.messages, { id: uid('msg'), docId, author: actor.name, role: 'accountant', body: `I've rejected this one: ${reason}`, at }],
      },
      ['reject', `Rejected ${doc.filename}: ${reason}`, actor, { clientId: doc.clientId, docId }],
    ),
  )
  toast.info('Document rejected', 'Nothing was posted. The client has been notified in the thread.')
}

export function sendMessage(docId: string, body: string) {
  const actor = currentActor()
  const doc = getState().documents.find((d) => d.id === docId)
  if (!doc) return
  const at = new Date().toISOString()
  setState((s) =>
    withAudit(
      {
        ...patchDoc(s, docId, { readAt: { ...doc.readAt, [actor.role]: at } }),
        messages: [...s.messages, { id: uid('msg'), docId, author: actor.name, role: actor.role, body, at }],
      },
      ['message', `Sent a message on ${doc.filename}`, actor, { clientId: doc.clientId, docId }],
    ),
  )
}

export function markThreadRead(docId: string, role: Role) {
  const state = getState()
  const doc = state.documents.find((d) => d.id === docId)
  if (!doc) return
  const latest = state.messages.filter((m) => m.docId === docId && m.role !== role).reduce((max, m) => (m.at > max ? m.at : max), '')
  if (!latest || (doc.readAt?.[role] ?? '') >= latest) return
  setState((s) => patchDoc(s, docId, { readAt: { ...doc.readAt, [role]: new Date().toISOString() } }))
}

/** Audit-logged wrapper for every export in the app. */
export function logExport(detail: string, clientId?: string) {
  const actor = currentActor()
  setState((s) => withAudit(s, ['export', detail, actor, { clientId }]))
}

export interface ImportResult {
  added: number
  alreadyImported: number
  matched: number
  suggested: number
  unmatched: number
}

/**
 * Lines already resolved by a person are preserved by fingerprint, so importing the same
 * file twice is safe. Everything else is re-run through auto-matching.
 */
export function importStatement(clientId: string, lines: StatementLine[], filename: string): ImportResult {
  const actor = currentActor()
  const state = getState()
  const existing = new Map(state.bank.filter((t) => t.clientId === clientId).map((t) => [t.fingerprint, t]))
  const seenInFile = new Set<string>()
  const fresh: BankTxn[] = []
  let alreadyImported = 0
  for (const line of lines) {
    const fingerprint = statementFingerprint(line.date, line.amount, line.description)
    if (existing.has(fingerprint) || seenInFile.has(fingerprint)) {
      alreadyImported += 1
      continue
    }
    seenInFile.add(fingerprint)
    fresh.push({ id: uid('txn'), clientId, period: periodOf(line.date), date: line.date, description: line.description, amount: line.amount, currency: line.currency, fingerprint, status: 'unmatched' })
  }

  const periods = [...new Set(lines.map((l) => periodOf(l.date)))]
  const statements: Statement[] = periods
    .filter((p) => !state.statements.some((s) => s.clientId === clientId && s.period === p))
    .map((period) => ({
      id: uid('stm'),
      clientId,
      period,
      filename,
      importedAt: new Date().toISOString(),
      importedBy: actor.name,
      lineCount: lines.filter((l) => periodOf(l.date) === period).length,
    }))

  const result: ImportResult = { added: fresh.length, alreadyImported, matched: 0, suggested: 0, unmatched: 0 }
  setState((s) => {
    const { state: next } = rematchClient({ ...s, bank: [...s.bank, ...fresh], statements: [...s.statements, ...statements] }, clientId)
    const inFile = next.bank.filter((t) => t.clientId === clientId && periods.includes(t.period))
    result.matched = inFile.filter((t) => t.status === 'matched').length
    result.suggested = inFile.filter((t) => t.status === 'suggested').length
    result.unmatched = inFile.filter((t) => t.status === 'unmatched').length
    return withAudit(next, [
      'import',
      `Imported ${filename} (${lines.length} lines, ${alreadyImported} already on file): ${result.matched} matched, ${result.suggested} suggested, ${result.unmatched} unmatched`,
      actor,
      { clientId },
    ])
  })
  return result
}

function updateLine(txnId: string, patch: (t: BankTxn) => BankTxn, detail: (t: BankTxn) => string) {
  const actor = currentActor()
  const line = getState().bank.find((t) => t.id === txnId)
  if (!line) return
  setState((s) =>
    withAudit(syncEntryLinks({ ...s, bank: s.bank.map((t) => (t.id === txnId ? patch(t) : t)) }, line.clientId), [
      'reconcile',
      detail(line),
      actor,
      { clientId: line.clientId },
    ]),
  )
}

const lineLabel = (t: BankTxn) => `"${t.description}" (${t.currency} ${fmtAmount(t.amount)})`

export function confirmMatch(txnId: string) {
  const actor = currentActor()
  updateLine(txnId, (t) => ({ ...t, status: 'matched', resolvedBy: actor.name }), (t) => `Confirmed suggested match for ${lineLabel(t)}`)
  toast.success('Match confirmed')
}

export function rejectMatch(txnId: string) {
  const actor = currentActor()
  updateLine(
    txnId,
    (t) => ({ ...t, status: 'unmatched', ledgerEntryId: undefined, score: undefined, reasons: undefined, resolvedBy: actor.name }),
    (t) => `Rejected suggested match for ${lineLabel(t)}`,
  )
}

export function unmatch(txnId: string) {
  const actor = currentActor()
  updateLine(
    txnId,
    (t) => ({ ...t, status: 'unmatched', ledgerEntryId: undefined, score: undefined, reasons: undefined, resolvedBy: actor.name }),
    (t) => `Removed match for ${lineLabel(t)}`,
  )
  toast.info('Match removed', 'The line is back in the attention list.')
}

export function manualMatch(txnId: string, entryId: string) {
  const actor = currentActor()
  updateLine(
    txnId,
    (t) => ({ ...t, status: 'matched', ledgerEntryId: entryId, score: undefined, reasons: ['Matched by hand'], resolvedBy: actor.name }),
    (t) => `Manually matched ${lineLabel(t)} to a ledger entry`,
  )
  toast.success('Matched to ledger entry')
}

export function excludeLine(txnId: string, note: string) {
  const actor = currentActor()
  updateLine(
    txnId,
    (t) => ({ ...t, status: 'excluded', ledgerEntryId: undefined, resolvedBy: actor.name, note }),
    (t) => `Excluded ${lineLabel(t)}: ${note}`,
  )
  toast.info('Line excluded', note)
}

export function restoreLine(txnId: string) {
  updateLine(
    txnId,
    (t) => ({ ...t, status: 'unmatched', resolvedBy: undefined, note: undefined }),
    (t) => `Restored excluded line ${lineLabel(t)}`,
  )
}

/** For items with no source document, such as bank fees. Still a person's decision, and still logged. */
export function postFromBankLine(txnId: string, vendor: string, category: string) {
  const actor = currentActor()
  const line = getState().bank.find((t) => t.id === txnId)
  if (!line) return
  const entry: LedgerEntry = {
    id: uid('led'),
    clientId: line.clientId,
    date: line.date,
    vendor,
    category,
    type: line.amount > 0 ? 'income' : 'expense',
    amount: Math.abs(line.amount),
    currency: line.currency,
    bankTxnId: txnId,
    postedBy: actor.name,
    postedAt: new Date().toISOString(),
  }
  setState((s) =>
    withAudit(
      {
        ...s,
        ledger: [...s.ledger, entry],
        bank: s.bank.map((t) =>
          t.id === txnId ? { ...t, status: 'matched' as const, ledgerEntryId: entry.id, reasons: ['Posted from bank line'], resolvedBy: actor.name } : t,
        ),
      },
      ['post', `Posted ${lineLabel(line)} to ${category} from the bank statement, no source document`, actor, { clientId: line.clientId }],
    ),
  )
  toast.success('Posted to ledger', `${vendor}, ${category}`)
}

const STATEMENT_HEADER = ['Date', 'Description', 'Amount', 'Currency']

/**
 * Builds a realistic statement CSV from this client's books, for the sample button.
 * If a statement is already on file it re-exports those lines plus two new ones, so
 * importing it shows duplicate protection instead of doubling every transaction.
 */
export function sampleStatementCsv(clientId: string, period: string): string {
  const state = getState()
  const client = clientById(state, clientId)
  const onFile = state.bank.filter((t) => t.clientId === clientId && t.period === period)
  if (onFile.length) {
    const currency = onFile[0].currency
    const late = onFile[onFile.length - 1].date
    const rows = [
      ...onFile.map((t) => [t.date, t.description, t.amount, t.currency]),
      [late, 'WIRE RECALL FEE', -35, currency],
      [late, 'POS 8841 FORT STREET STATIONERS', -42.6, currency],
    ]
    return toCsv([STATEMENT_HEADER, ...rows])
  }
  const entries = state.ledger.filter((e) => e.clientId === clientId && periodOf(e.date) === period)
  const pending = state.documents.filter((d) => d.clientId === clientId && d.status === 'needs_review' && d.paper && periodOf(d.paper.date) === period)
  const inputs = [
    ...entries.map((e) => ({ id: e.id, date: e.date, amount: e.amount, currency: e.currency, type: e.type, vendor: e.vendor })),
    ...pending.map((d) => ({ id: d.id, date: d.paper!.date, amount: d.paper!.total, currency: d.paper!.currency, type: 'expense' as const, vendor: d.paper!.vendor })),
  ]
  const rng = createRng(`sample:${clientId}:${period}`)
  const lines = buildStatementLines(inputs, period, client?.bankCurrency ?? 'KYD', rng)
  return toCsv([STATEMENT_HEADER, ...lines.map((l) => [l.date, l.description, l.amount, l.currency])])
}
