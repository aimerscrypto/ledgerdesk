import { useEffect, useId, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Check, ChevronLeft, ChevronRight, Copy, FileQuestion, Info, Loader2, ShieldCheck, Sparkles, X } from 'lucide-react'
import { CATEGORIES, extractionLabel, type ExtractionResult } from '../../api/_lib/mock-extraction'
import type { Currency, DocFields, DocRecord, EntryType, ExtractedField } from '../lib/types'
import { approveDocument, rejectDocument } from '../lib/actions'
import { LOW_CONFIDENCE, clientById, docFields, findDuplicate, reviewQueue } from '../lib/selectors'
import { useAppState } from '../lib/store'
import { fmtAmount, fmtDate, fmtDateTime, fmtMoney, isoDate, round2, toKYD } from '../lib/format'
import { DocumentPreview } from '../components/DocumentPreview'
import { Thread } from '../components/Thread'
import { Badge, Button, Card, CardHeader, ConfidenceChip, EmptyState, Field, IconButton, LinkButton, Modal, Segmented, Select, StatusBadge, cx, type Tone } from '../components/ui'

const EXTRACTION_TONE: Record<ExtractionResult['source'], Tone> = { fireworks: 'brand', mock: 'warn', seed: 'neutral' }

/** Money is edited as text, so "12." doesn't jump around while someone is typing. */
interface FormState {
  vendor: string
  date: string
  invoiceNumber: string
  subtotal: string
  tax: string
  total: string
  currency: Currency
  category: string
}

const toForm = (f: DocFields): FormState => ({
  vendor: f.vendor,
  date: f.date,
  invoiceNumber: f.invoiceNumber,
  subtotal: f.subtotal.toFixed(2),
  tax: f.tax.toFixed(2),
  total: f.total.toFixed(2),
  currency: f.currency,
  category: f.category,
})

const toNumber = (text: string) => {
  const n = Number(text.replace(/,/g, '').trim())
  return Number.isFinite(n) ? round2(n) : 0
}

const toFields = (form: FormState): DocFields => ({
  vendor: form.vendor.trim(),
  date: form.date,
  invoiceNumber: form.invoiceNumber.trim(),
  subtotal: toNumber(form.subtotal),
  tax: toNumber(form.tax),
  total: toNumber(form.total),
  currency: form.currency,
  category: form.category,
})

const EMPTY_FIELDS: DocFields = { vendor: '', date: '', invoiceNumber: '', subtotal: 0, tax: 0, total: 0, currency: 'KYD', category: '' }

function Notice({ tone, icon: Icon, children, action }: { tone: 'warn' | 'info'; icon: typeof Info; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={cx('flex flex-wrap items-start gap-x-2 gap-y-1.5 rounded-lg px-3.5 py-2.5 text-[13.5px]', tone === 'warn' ? 'bg-warn-soft text-ink' : 'bg-surface-2 text-ink-2')}>
      <Icon size={15} className={cx('mt-0.5 shrink-0', tone === 'warn' ? 'text-warn' : 'text-ink-3')} aria-hidden />
      <span className="min-w-0 flex-1 basis-48">{children}</span>
      {action}
    </div>
  )
}

function ReviewForm({ doc, onDone }: { doc: DocRecord; onDone: () => void }) {
  const state = useAppState()
  const extraction = doc.extraction
  const base = docFields(doc) ?? EMPTY_FIELDS
  const [form, setForm] = useState<FormState>(() => toForm(base))
  const [entryType, setEntryType] = useState<EntryType>(doc.entryType ?? 'expense')
  const [touched, setTouched] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const baseId = useId()

  const readOnly = doc.status !== 'needs_review'
  const fields = toFields(form)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))

  const edited = (key: keyof DocFields) => {
    if (!extraction) return false
    return fields[key] !== extraction[key]
  }
  const flagged = (key: ExtractedField) => (extraction?.fieldConfidence[key] ?? 1) < LOW_CONFIDENCE && !edited(key)

  const errors = {
    vendor: fields.vendor ? undefined : 'Enter the vendor',
    date: fields.date ? undefined : 'Enter the document date',
    total: fields.total > 0 ? undefined : 'The total must be more than zero',
    category: fields.category ? undefined : 'Choose a category',
  }
  const valid = !Object.values(errors).some(Boolean)

  const today = isoDate(new Date())
  const sumMismatch = round2(fields.subtotal + fields.tax) !== fields.total
  const futureDate = fields.date > today
  const duplicate = readOnly ? undefined : findDuplicate(state, doc, fields)
  const flaggedLeft = (['vendor', 'date', 'invoiceNumber', 'subtotal', 'tax', 'total', 'currency', 'category'] as ExtractedField[]).filter((k) => flagged(k)).length

  const categories: string[] = (CATEGORIES as readonly string[]).includes(form.category) || !form.category ? [...CATEGORIES] : [form.category, ...CATEGORIES]

  /** Wraps a field with its confidence note, "edited" trail and low-confidence highlight. */
  const fieldProps = (key: ExtractedField, label: string, error?: string) => {
    const id = `${baseId}-${key}`
    const wasEdited = !readOnly && edited(key)
    const originalValue = extraction ? (typeof extraction[key] === 'number' ? fmtAmount(extraction[key] as number) : String(extraction[key] || 'blank')) : ''
    return {
      id,
      field: {
        label,
        htmlFor: id,
        error: touched ? error : undefined,
        hint: wasEdited ? `AI read: ${originalValue}` : undefined,
        aside: readOnly || !extraction ? undefined : wasEdited ? <Badge tone="info">Edited</Badge> : flagged(key) ? <span className="num text-[13px] font-medium whitespace-nowrap text-warn">{Math.round(extraction.fieldConfidence[key] * 100)}% confidence</span> : undefined,
      },
      className: cx(!readOnly && flagged(key) && 'border-warn-line! bg-warn-soft!'),
      'aria-invalid': touched && error ? true : undefined,
      disabled: readOnly,
    }
  }

  const vendor = fieldProps('vendor', 'Vendor', errors.vendor)
  const date = fieldProps('date', 'Date', errors.date)
  const invoice = fieldProps('invoiceNumber', 'Invoice number')
  const subtotal = fieldProps('subtotal', 'Subtotal')
  const tax = fieldProps('tax', 'Tax')
  const total = fieldProps('total', 'Total', errors.total)
  const currency = fieldProps('currency', 'Currency')
  const category = fieldProps('category', 'Category', errors.category)

  const approve = () => {
    setTouched(true)
    if (!valid) return
    approveDocument(doc.id, fields, entryType)
    onDone()
  }

  const reject = () => {
    if (!reason.trim()) return
    rejectDocument(doc.id, reason.trim())
    setRejecting(false)
    onDone()
  }

  const money = (key: 'subtotal' | 'tax' | 'total', props: typeof total) => (
    <Field {...props.field}>
      <input id={props.id} value={form[key]} inputMode="decimal" autoComplete="off" disabled={props.disabled} aria-invalid={props['aria-invalid']} className={cx('field-input num text-right', props.className)} onChange={(e) => set(key, e.target.value.replace(/[^0-9.,-]/g, ''))} />
    </Field>
  )

  return (
    <Card>
      <CardHeader
        title={readOnly ? (doc.status === 'approved' ? 'Posted to the ledger' : 'Rejected') : 'Extracted fields'}
        description={
          extraction ? (
            <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <Badge tone={EXTRACTION_TONE[extraction.source]} icon={extraction.source === 'seed' ? undefined : Sparkles}>
                {extractionLabel(extraction)}
              </Badge>
              {extraction.source === 'mock' && 'Sample values, not read from this document by AI'}
            </span>
          ) : undefined
        }
        action={extraction ? <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-3">Overall <ConfidenceChip value={extraction.confidence} /></span> : undefined}
      />
      <div className="space-y-5 px-4 pt-2 pb-5 sm:px-5">
        {doc.status === 'approved' && (
          <Notice tone="info" icon={ShieldCheck}>
            Approved by {doc.reviewedBy}
            {doc.reviewedAt ? ` on ${fmtDateTime(doc.reviewedAt)}` : ''}.{' '}
            {doc.ledgerEntryId && (
              <Link className="font-medium text-brand-ink hover:underline" to={`/ledger?client=${doc.clientId}&period=${fields.date.slice(0, 7)}`}>
                View in ledger
              </Link>
            )}
          </Notice>
        )}
        {doc.status === 'rejected' && (
          <Notice tone="warn" icon={X}>
            Rejected by {doc.reviewedBy}: {doc.rejectionReason} Nothing was posted.
          </Notice>
        )}
        {!readOnly && extraction?.source === 'mock' && extraction.fallbackReason === 'api_error' && (
          <Notice tone="info" icon={Info}>
            The AI service didn't respond, so these are sample values. Check them against the document.
          </Notice>
        )}

        <Field {...vendor.field}>
          <input id={vendor.id} value={form.vendor} disabled={vendor.disabled} aria-invalid={vendor['aria-invalid']} autoComplete="off" className={cx('field-input', vendor.className)} onChange={(e) => set('vendor', e.target.value)} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field {...date.field}>
            <input id={date.id} type="date" value={form.date} disabled={date.disabled} aria-invalid={date['aria-invalid']} className={cx('field-input', date.className)} onChange={(e) => set('date', e.target.value)} />
          </Field>
          <Field {...invoice.field}>
            <input id={invoice.id} value={form.invoiceNumber} disabled={invoice.disabled} autoComplete="off" className={cx('field-input', invoice.className)} onChange={(e) => set('invoiceNumber', e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {money('subtotal', subtotal)}
          {money('tax', tax)}
          <div className="col-span-2 sm:col-span-1">{money('total', total)}</div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field {...currency.field}>
            <Select id={currency.id} value={form.currency} disabled={currency.disabled} className={currency.className} onChange={(e) => set('currency', e.target.value as Currency)}>
              <option value="KYD">KYD</option>
              <option value="USD">USD</option>
            </Select>
          </Field>
          <Field {...category.field}>
            <Select id={category.id} value={form.category} disabled={category.disabled} aria-invalid={category['aria-invalid']} className={category.className} onChange={(e) => set('category', e.target.value)}>
              {!form.category && <option value="">Choose a category</option>}
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {readOnly ? (
            <span className="text-[13px] text-ink-2">Posted as {doc.entryType === 'income' ? 'income' : 'an expense'}</span>
          ) : (
            <Segmented<EntryType>
              label="Entry type"
              value={entryType}
              onChange={setEntryType}
              options={[
                { value: 'expense', label: 'Expense' },
                { value: 'income', label: 'Income' },
              ]}
            />
          )}
          {form.currency === 'USD' && fields.total > 0 && (
            <span className="num text-[13px] text-ink-2">
              {fmtMoney(fields.total, 'USD')} = {fmtMoney(toKYD(fields.total, 'USD'))} at the peg
            </span>
          )}
        </div>

        {!readOnly && (sumMismatch || futureDate || duplicate) && (
          <div className="space-y-2">
            {sumMismatch && (
              <Notice
                tone="warn"
                icon={AlertTriangle}
                action={
                  <Button size="sm" onClick={() => set('total', round2(fields.subtotal + fields.tax).toFixed(2))}>
                    Set total to {fmtAmount(round2(fields.subtotal + fields.tax))}
                  </Button>
                }
              >
                Subtotal plus tax is {fmtAmount(round2(fields.subtotal + fields.tax))}, but the total says {fmtAmount(fields.total)}.
              </Notice>
            )}
            {futureDate && (
              <Notice tone="warn" icon={AlertTriangle}>
                This date is in the future.
              </Notice>
            )}
            {duplicate && (
              <Notice tone="warn" icon={Copy}>
                This may be a duplicate. {duplicate.vendor} was already posted for {duplicate.currency} {fmtAmount(duplicate.amount)} on {fmtDate(duplicate.date)}.
              </Notice>
            )}
          </div>
        )}

        {readOnly ? null : (
          <div className="pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" size="lg" icon={Check} onClick={approve} className="min-w-60 flex-1">
                Approve and post to ledger
              </Button>
              <Button variant="danger" size="lg" icon={X} onClick={() => setRejecting(true)} className="flex-1 sm:flex-none">
                Reject
              </Button>
            </div>
            <p className="mt-3 text-[13px] text-ink-2">
              Nothing posts until you approve.
              {flaggedLeft > 0 ? ` ${flaggedLeft} highlighted ${flaggedLeft === 1 ? 'field has' : 'fields have'} not been changed, so please check ${flaggedLeft === 1 ? 'it' : 'them'} against the document.` : ''}
              {touched && !valid ? ' Fix the fields marked above to continue.' : ''}
            </p>
          </div>
        )}
      </div>

      <Modal
        open={rejecting}
        onClose={() => setRejecting(false)}
        title="Reject this document?"
        description="Nothing is posted. The reason goes to the client in the document's message thread."
        footer={
          <>
            <Button onClick={() => setRejecting(false)}>Cancel</Button>
            <Button variant="danger" icon={X} disabled={!reason.trim()} onClick={reject}>
              Reject document
            </Button>
          </>
        }
      >
        <Field label="Reason" htmlFor={`${baseId}-reason`} hint={`For example: "This is a duplicate of the receipt you sent on Tuesday."`}>
          <textarea id={`${baseId}-reason`} rows={3} value={reason} className="field-input" autoFocus onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>
    </Card>
  )
}

export default function ReviewDetail() {
  const { docId } = useParams()
  const navigate = useNavigate()
  const state = useAppState()
  const doc = state.documents.find((d) => d.id === docId)
  const queue = reviewQueue(state)
  const index = queue.findIndex((d) => d.id === docId)
  // Remembered so auto-advance still knows where it was once this document has left the queue.
  const [position, setPosition] = useState(Math.max(0, index))

  useEffect(() => {
    if (index >= 0) setPosition(index)
  }, [index])

  if (!doc) {
    return (
      <EmptyState
        icon={FileQuestion}
        title="Document not found"
        body="It may have been removed by a demo reset."
        action={
          <LinkButton to="/review" variant="primary" icon={ArrowLeft}>
            Back to the queue
          </LinkButton>
        }
      />
    )
  }

  const client = clientById(state, doc.clientId)
  const prev = index > 0 ? queue[index - 1] : undefined
  const next = index >= 0 && index < queue.length - 1 ? queue[index + 1] : undefined

  const advance = () => {
    const remaining = reviewQueue({ ...state, documents: state.documents.filter((d) => d.id !== doc.id) })
    const target = remaining[Math.min(position, remaining.length - 1)]
    navigate(target ? `/review/${target.id}` : '/review')
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <LinkButton to="/review" variant="ghost" size="sm" icon={ArrowLeft} className="-ml-2.5">
          Review queue
        </LinkButton>
        {index >= 0 && (
          <div className="flex items-center gap-1">
            <span className="num mr-1 text-[13px] text-ink-3">
              {index + 1} of {queue.length}
            </span>
            <IconButton label="Previous document" icon={ChevronLeft} disabled={!prev} className="disabled:pointer-events-none disabled:opacity-40" onClick={() => prev && navigate(`/review/${prev.id}`)} />
            <IconButton label="Next document" icon={ChevronRight} disabled={!next} className="disabled:pointer-events-none disabled:opacity-40" onClick={() => next && navigate(`/review/${next.id}`)} />
          </div>
        )}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h1 className="min-w-0 truncate font-display text-[34px] leading-[1.15] text-ink sm:text-[40px]">{docFields(doc)?.vendor || doc.filename}</h1>
        <StatusBadge status={doc.status} />
        <p className="w-full text-[13.5px] text-ink-3">
          <Link to={`/clients/${doc.clientId}`} className="font-medium text-ink-2 hover:underline">
            {client?.name}
          </Link>{' '}
          · uploaded {fmtDateTime(doc.uploadedAt)} by {doc.uploadedBy}
        </p>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="xl:sticky xl:top-[72px]">
          <DocumentPreview doc={doc} fill />
        </div>
        <div className="space-y-6">
          {doc.status === 'processing' ? (
            <Card>
              <EmptyState compact icon={Loader2} title="Still reading this document" body="The fields appear here as soon as the AI has finished. Nothing has been posted." />
            </Card>
          ) : (
            <ReviewForm key={doc.id} doc={doc} onDone={advance} />
          )}
          <Card>
            <CardHeader title="Messages with the client" description="Stays attached to this document" />
            <Thread docId={doc.id} viewer="accountant" />
          </Card>
        </div>
      </div>
    </div>
  )
}
