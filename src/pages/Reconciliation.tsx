import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowLeftRight, Ban, Check, CheckCircle2, Download, FileText, Landmark, Link2, Link2Off, Plus, RotateCcw, Search, Sparkles, Undo2, Upload, X } from 'lucide-react'
import {
  confirmMatch,
  excludeLine,
  importStatement,
  manualMatch,
  postFromBankLine,
  rejectMatch,
  restoreLine,
  sampleStatementCsv,
  unmatch,
  type ImportResult,
} from '../lib/actions'
import { downloadText, parseStatementCsv } from '../lib/csv'
import { convert, fmtDate, fmtDateTime, fmtMoney, fmtPeriod, periodOf } from '../lib/format'
import { useSelectedClient, useSelectedPeriod } from '../lib/hooks'
import { rankCandidates } from '../lib/matching'
import { clientPeriods, docFields, isOpenLine } from '../lib/selectors'
import { useAppState } from '../lib/store'
import { toast } from '../lib/toast'
import { CATEGORIES } from '../../api/_lib/mock-extraction'
import type { BankTxn, Client, DocRecord, LedgerEntry, MatchStatus } from '../lib/types'
import { Badge, Button, Card, CardHeader, ClientPicker, EmptyState, Field, FilterBar, MatchBadge, Modal, Money, PageHeader, ProgressBar, Segmented, Select, SummaryStrip, cx } from '../components/ui'

type View = 'all' | MatchStatus

function EntrySummary({ entry }: { entry: LedgerEntry }) {
  return (
    <span className="min-w-0">
      <span className="font-medium text-ink">{entry.vendor}</span>
      <span className="text-ink-3">
        {' '}
        · {fmtDate(entry.date)} · <Money value={entry.amount} currency={entry.currency} className="text-ink-2" />
      </span>
    </span>
  )
}

function LineRow({ line, children, actions }: { line: BankTxn; children?: ReactNode; actions?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-surface-2/60 sm:px-5">
      <div className="min-w-0 flex-1 basis-64">
        <p className="break-words font-medium text-ink">{line.description}</p>
        <p className="text-[13px] text-ink-3">{fmtDate(line.date)}</p>
        {children && <div className="mt-1.5 space-y-1 text-[13px] text-ink-2">{children}</div>}
      </div>
      <p className="w-36 shrink-0 text-right font-medium">
        <Money value={line.amount} currency={line.currency} className={line.amount > 0 ? 'text-good' : 'text-ink'} />
      </p>
      {actions && <div className="flex w-full flex-wrap justify-end gap-1.5 sm:w-auto">{actions}</div>}
    </li>
  )
}

function ImportDialog({ open, onClose, client, period, onImported }: { open: boolean; onClose: () => void; client: Client; period: string; onImported: (period: string) => void }) {
  const [result, setResult] = useState<(ImportResult & { skipped: number; filename: string }) | null>(null)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const close = () => {
    setResult(null)
    setError('')
    onClose()
  }

  const run = (text: string, filename: string) => {
    const parsed = parseStatementCsv(text, client.bankCurrency)
    if (parsed.error || !parsed.lines.length) {
      setResult(null)
      setError(parsed.error ?? "That file doesn't have any statement lines we can read.")
      return
    }
    setError('')
    const outcome = importStatement(client.id, parsed.lines, filename)
    setResult({ ...outcome, skipped: parsed.skipped, filename })
    onImported(periodOf(parsed.lines[0].date))
  }

  const readFile = async (file: File | undefined) => {
    if (!file) return
    if (!/\.csv$/i.test(file.name)) {
      setError(`${file.name} isn't a CSV file. Export the statement from online banking as CSV and try again.`)
      return
    }
    run(await file.text(), file.name)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void readFile(e.dataTransfer.files[0])
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={result ? 'Statement imported' : `Import a statement for ${client.name}`}
      description={result ? result.filename : 'Lines are matched to the ledger automatically. Importing the same statement twice is safe: lines already on file are skipped.'}
      footer={<Button variant={result ? 'primary' : 'secondary'} onClick={close}>{result ? 'Done' : 'Cancel'}</Button>}
    >
      {result ? (
        <div>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              ['New lines', result.added],
              ['Matched', result.matched],
              ['Suggested', result.suggested],
              ['Unmatched', result.unmatched],
              ['Already on file', result.alreadyImported],
              ['Rows skipped', result.skipped],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-surface-2 px-3 py-2">
                <dt className="text-xs text-ink-3">{label}</dt>
                <dd className="num text-lg font-semibold text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          {result.added === 0 && <p className="mt-3 text-[13px] text-ink-2">Every line in this file was already on file, so nothing changed.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cx('flex flex-col items-center rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors', dragging ? 'border-brand bg-brand-soft' : 'border-line-strong')}
          >
            <Upload size={20} className="mb-2 text-ink-3" aria-hidden />
            <p className="font-medium text-ink">Drop a CSV file here</p>
            <p className="mb-3 text-[13px] text-ink-3">Needs date, description and amount columns</p>
            <Button size="sm" onClick={() => input.current?.click()}>
              Choose file
            </Button>
            <input
              ref={input}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => {
                void readFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>
          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-ink">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" aria-hidden />
              {error}
            </p>
          )}
          <div className="rounded-lg bg-surface-2 px-3 py-3">
            <p className="font-medium text-ink">No statement to hand?</p>
            <p className="mb-2 text-[13px] text-ink-2">Use a sample built for {client.name}, {fmtPeriod(period)}.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" icon={Sparkles} onClick={() => run(sampleStatementCsv(client.id, period), `${client.id}-statement-${period}.csv`)}>
                Use sample CSV
              </Button>
              <Button size="sm" icon={Download} onClick={() => downloadText(`${client.id}-statement-${period}.csv`, sampleStatementCsv(client.id, period))}>
                Download sample CSV
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

function FindMatchDialog({ line, entries, onClose }: { line: BankTxn | null; entries: LedgerEntry[]; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const close = () => {
    setQuery('')
    onClose()
  }
  const needle = query.trim().toLowerCase()
  const ranked = line ? rankCandidates(line, entries) : []
  const rows = (needle ? ranked.filter((c) => `${c.entry.vendor} ${c.entry.category} ${c.entry.amount}`.toLowerCase().includes(needle)) : ranked.filter((c) => c.score > 0)).slice(0, 8)

  return (
    <Modal open={!!line} onClose={close} wide title="Find a ledger match" description={line ? `${line.description}, ${fmtDate(line.date)}, ${fmtMoney(line.amount, line.currency)}` : undefined} footer={<Button onClick={close}>Cancel</Button>}>
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all open ledger entries" aria-label="Search open ledger entries" className="field-input mb-3" />
      {rows.length ? (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {rows.map(({ entry, score, reasons }) => (
            <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-[13px]">
                  <EntrySummary entry={entry} />
                </p>
                <p className="text-xs text-ink-3">{reasons.join(' · ') || entry.category}</p>
              </div>
              {score > 0 && <span className="num text-[13px] text-ink-2">{score}% fit</span>}
              <Button
                size="sm"
                icon={Link2}
                onClick={() => {
                  if (line) manualMatch(line.id, entry.id)
                  close()
                }}
              >
                Match
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact icon={Search} title="No likely matches" body={needle ? 'Nothing open matches that search.' : 'Search above to match by hand, or post this line as a new entry instead.'} />
      )}
    </Modal>
  )
}

function PostDialog({ line, onClose }: { line: BankTxn | null; onClose: () => void }) {
  const [vendor, setVendor] = useState('')
  const [category, setCategory] = useState('')
  const lastLine = useRef<string | null>(null)
  if (line && lastLine.current !== line.id) {
    lastLine.current = line.id
    setVendor(line.description)
    setCategory(line.amount > 0 ? 'Sales' : '')
  }
  const options: string[] = category && !(CATEGORIES as readonly string[]).includes(category) ? [category, ...CATEGORIES] : [...CATEGORIES]
  const close = () => {
    lastLine.current = null
    onClose()
  }

  return (
    <Modal
      open={!!line}
      onClose={close}
      title="Post this line to the ledger"
      description={line ? `Creates a new ${line.amount > 0 ? 'income' : 'expense'} entry for ${fmtMoney(Math.abs(line.amount), line.currency)} and matches it to this line.` : undefined}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            icon={Plus}
            disabled={!vendor.trim() || !category}
            onClick={() => {
              if (line) postFromBankLine(line.id, vendor.trim(), category)
              close()
            }}
          >
            Post entry
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Vendor" htmlFor="post-vendor">
          <input id="post-vendor" value={vendor} className="field-input" onChange={(e) => setVendor(e.target.value)} />
        </Field>
        <Field label="Category" htmlFor="post-category">
          <Select id="post-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {!category && <option value="">Choose a category</option>}
            {options.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  )
}

function ExcludeDialog({ line, onClose }: { line: BankTxn | null; onClose: () => void }) {
  const [note, setNote] = useState('')
  const close = () => {
    setNote('')
    onClose()
  }
  return (
    <Modal
      open={!!line}
      onClose={close}
      title="Exclude this line?"
      description="It stays on the statement but no longer needs a ledger entry. For example, a transfer between the client's own accounts."
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            icon={Ban}
            disabled={!note.trim()}
            onClick={() => {
              if (line) excludeLine(line.id, note.trim())
              close()
            }}
          >
            Exclude line
          </Button>
        </>
      }
    >
      <Field label="Reason" htmlFor="exclude-note" hint="Recorded in the audit log.">
        <textarea id="exclude-note" rows={2} value={note} className="field-input" onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  )
}

export default function Reconciliation() {
  const state = useAppState()
  const { client, select } = useSelectedClient()
  const periods = clientPeriods(state)
  const { period, select: selectPeriod } = useSelectedPeriod(periods, state.closePeriod)
  const [view, setView] = useState<View>('all')
  const [importing, setImporting] = useState(false)
  const [finding, setFinding] = useState<BankTxn | null>(null)
  const [posting, setPosting] = useState<BankTxn | null>(null)
  const [excluding, setExcluding] = useState<BankTxn | null>(null)

  const lines = state.bank.filter((t) => t.clientId === client.id && t.period === period).sort((a, b) => a.date.localeCompare(b.date))
  const statement = state.statements.find((s) => s.clientId === client.id && s.period === period)
  const ledger = state.ledger.filter((e) => e.clientId === client.id)
  const entryById = new Map(ledger.map((e) => [e.id, e]))

  const byStatus = (status: MatchStatus) => lines.filter((t) => t.status === status)
  const suggested = byStatus('suggested')
  const unmatched = byStatus('unmatched')
  const matched = byStatus('matched')
  const excluded = byStatus('excluded')
  const resolved = lines.filter((t) => !isOpenLine(t)).length

  const claimed = new Set(state.bank.filter((t) => t.status === 'matched' && t.ledgerEntryId).map((t) => t.ledgerEntryId))
  const onStatement = new Set(lines.map((t) => t.ledgerEntryId).filter(Boolean))
  const openEntries = ledger.filter((e) => !claimed.has(e.id))
  const notOnStatement = ledger.filter((e) => e.date.startsWith(period) && !onStatement.has(e.id) && !claimed.has(e.id))

  /** A line with no ledger entry may just be waiting on a document nobody has approved yet. */
  const pendingDocFor = (line: BankTxn): DocRecord | undefined =>
    state.documents.find((d) => {
      if (d.clientId !== client.id || d.status !== 'needs_review') return false
      const fields = docFields(d)
      return !!fields && Math.abs(convert(fields.total, fields.currency, line.currency) - Math.abs(line.amount)) < 0.01
    })

  const show = (status: MatchStatus) => view === 'all' || view === status

  const header = (
    <>
      <PageHeader
        title="Bank reconciliation"
        description="Statement lines are matched to the ledger by amount, date and vendor. You confirm anything less than certain."
        actions={
          <Button variant="primary" icon={Upload} onClick={() => setImporting(true)}>
            Import statement
          </Button>
        }
      />
      <FilterBar>
        <ClientPicker clients={state.clients} value={client.id} onChange={select} />
        <Select aria-label="Period" value={period} onChange={(e) => selectPeriod(e.target.value)} className="min-w-0 flex-1 basis-32 sm:w-44 sm:flex-none sm:basis-auto">
          {periods.map((p) => (
            <option key={p} value={p}>
              {fmtPeriod(p)}
            </option>
          ))}
        </Select>
      </FilterBar>
    </>
  )

  const dialogs = (
    <>
      <ImportDialog
        open={importing}
        onClose={() => setImporting(false)}
        client={client}
        period={period}
        onImported={(p) => {
          if (periods.includes(p)) selectPeriod(p)
        }}
      />
      <FindMatchDialog line={finding} entries={openEntries} onClose={() => setFinding(null)} />
      <PostDialog line={posting} onClose={() => setPosting(null)} />
      <ExcludeDialog line={excluding} onClose={() => setExcluding(null)} />
    </>
  )

  if (!lines.length) {
    return (
      <div>
        {header}
        <Card>
          <EmptyState
            icon={Landmark}
            title={`No ${fmtPeriod(period)} statement yet`}
            body={`Import ${client.name}'s ${client.bankName} statement to match it against the ledger.`}
            action={
              <Button variant="primary" icon={Upload} onClick={() => setImporting(true)}>
                Import statement
              </Button>
            }
          />
        </Card>
        {dialogs}
      </div>
    )
  }

  return (
    <div>
      {header}

      <div className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line pb-6">
        <div className="min-w-0 flex-1 basis-56">
          <p className="truncate font-medium text-ink">{statement?.filename ?? `${client.bankName} statement`}</p>
          <p className="text-[13px] text-ink-3">
            {client.bankName} ({client.bankCurrency}) · {lines.length} lines
            {statement ? ` · imported ${fmtDateTime(statement.importedAt)} by ${statement.importedBy}` : ''}
          </p>
        </div>
        <div className="w-full sm:w-64">
          <div className="mb-1.5 flex justify-between text-[13px]">
            <span className="font-medium text-ink-2">Reconciled</span>
            <span className="num text-ink-2">
              {resolved} of {lines.length}
            </span>
          </div>
          <ProgressBar value={resolved / lines.length} tone={resolved === lines.length ? 'good' : 'brand'} label="Reconciliation progress" />
        </div>
      </div>

      <SummaryStrip
        items={[
          { label: 'Matched', value: matched.length },
          { label: 'Suggested', value: suggested.length, tone: suggested.length ? 'warn' : undefined, hint: 'Need your confirmation' },
          { label: 'Unmatched', value: unmatched.length, tone: unmatched.length ? 'bad' : undefined, hint: 'Need attention' },
          { label: 'Excluded', value: excluded.length, hint: 'No ledger entry needed' },
        ]}
      />

      <div className="mb-5">
        <Segmented<View>
          label="Show lines"
          value={view}
          onChange={setView}
          options={[
            { value: 'all', label: 'All', count: lines.length },
            { value: 'suggested', label: 'Suggested', count: suggested.length },
            { value: 'unmatched', label: 'Unmatched', count: unmatched.length },
            { value: 'matched', label: 'Matched', count: matched.length },
            { value: 'excluded', label: 'Excluded', count: excluded.length },
          ]}
        />
      </div>

      {resolved === lines.length && view === 'all' && (
        <p className="mb-5 flex items-center gap-2 rounded-lg bg-brand-soft px-3.5 py-2.5 text-[13.5px] text-ink">
          <CheckCircle2 size={15} className="shrink-0 text-good" aria-hidden />
          Every line on this statement is resolved.
          <Link className="font-medium text-brand-ink hover:underline" to={`/reports?client=${client.id}&period=${period}`}>
            Go to the month-end report
          </Link>
        </p>
      )}

      <div className="space-y-6">
        {show('suggested') && suggested.length > 0 && (
          <Card>
            <CardHeader title="Suggested matches" description="A likely fit, but not certain enough to match on its own" />
            <ul className="divide-y divide-line">
              {suggested.map((line) => {
                const entry = line.ledgerEntryId ? entryById.get(line.ledgerEntryId) : undefined
                return (
                  <LineRow
                    key={line.id}
                    line={line}
                    actions={
                      <>
                        <Button size="sm" variant="primary" icon={Check} onClick={() => confirmMatch(line.id)}>
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          icon={X}
                          onClick={() => {
                            rejectMatch(line.id)
                            toast.info('Suggestion dismissed', 'The line is now unmatched.')
                          }}
                        >
                          Not a match
                        </Button>
                      </>
                    }
                  >
                    {entry && (
                      <p className="flex flex-wrap items-center gap-1.5">
                        <Link2 size={13} className="shrink-0 text-ink-3" aria-hidden />
                        <EntrySummary entry={entry} />
                      </p>
                    )}
                    {line.score !== undefined && (
                      <p className="text-xs text-ink-3">
                        <span className="num">{line.score}% fit</span>
                        {line.reasons?.length ? ` · ${line.reasons.join(' · ')}` : ''}
                      </p>
                    )}
                  </LineRow>
                )
              })}
            </ul>
          </Card>
        )}

        {show('unmatched') && unmatched.length > 0 && (
          <Card>
            <CardHeader title="Unmatched" description="Nothing in the ledger fits these lines yet" />
            <ul className="divide-y divide-line">
              {unmatched.map((line) => {
                const pending = pendingDocFor(line)
                return (
                  <LineRow
                    key={line.id}
                    line={line}
                    actions={
                      <>
                        <Button size="sm" icon={Search} onClick={() => setFinding(line)}>
                          Find match
                        </Button>
                        <Button size="sm" icon={Plus} onClick={() => setPosting(line)}>
                          Post
                        </Button>
                        <Button size="sm" variant="ghost" icon={Ban} onClick={() => setExcluding(line)}>
                          Exclude
                        </Button>
                      </>
                    }
                  >
                    {pending && (
                      <p className="flex flex-wrap items-center gap-1.5">
                        <FileText size={13} className="shrink-0 text-ink-3" aria-hidden />
                        <span>
                          Same amount as {docFields(pending)?.vendor}, still awaiting review.{' '}
                          <Link to={`/review/${pending.id}`} className="font-medium text-brand-ink hover:underline">
                            Review it
                          </Link>
                        </span>
                      </p>
                    )}
                  </LineRow>
                )
              })}
            </ul>
          </Card>
        )}

        {show('matched') && matched.length > 0 && (
          <Card>
            <CardHeader title="Matched" description="Tied to a ledger entry" />
            <ul className="divide-y divide-line">
              {matched.map((line) => {
                const entry = line.ledgerEntryId ? entryById.get(line.ledgerEntryId) : undefined
                return (
                  <LineRow
                    key={line.id}
                    line={line}
                    actions={
                      <Button size="sm" variant="ghost" icon={Link2Off} onClick={() => unmatch(line.id)}>
                        Unmatch
                      </Button>
                    }
                  >
                    {entry && (
                      <p className="flex flex-wrap items-center gap-1.5">
                        <MatchBadge status="matched" />
                        <EntrySummary entry={entry} />
                      </p>
                    )}
                    {line.resolvedBy && <p className="text-xs text-ink-3">Confirmed by {line.resolvedBy}</p>}
                  </LineRow>
                )
              })}
            </ul>
          </Card>
        )}

        {show('excluded') && excluded.length > 0 && (
          <Card>
            <CardHeader title="Excluded" description="Left out on purpose" />
            <ul className="divide-y divide-line">
              {excluded.map((line) => (
                <LineRow
                  key={line.id}
                  line={line}
                  actions={
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={RotateCcw}
                      onClick={() => {
                        restoreLine(line.id)
                        toast.info('Line restored', 'It is back with the unmatched lines.')
                      }}
                    >
                      Restore
                    </Button>
                  }
                >
                  {line.note && <p>{line.note}</p>}
                </LineRow>
              ))}
            </ul>
          </Card>
        )}

        {view === 'all' && notOnStatement.length > 0 && (
          <Card>
            <CardHeader title="In the ledger, not on this statement" description="Often just timing: these may clear next month" action={<Badge icon={ArrowLeftRight}>{notOnStatement.length}</Badge>} />
            <ul className="divide-y divide-line">
              {notOnStatement.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 sm:px-5">
                  <p className="min-w-0 text-[13px]">
                    <EntrySummary entry={entry} />
                  </p>
                  {entry.docId && (
                    <Link to={`/review/${entry.docId}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-ink hover:underline">
                      <Undo2 size={13} aria-hidden />
                      Source document
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
      {dialogs}
    </div>
  )
}
