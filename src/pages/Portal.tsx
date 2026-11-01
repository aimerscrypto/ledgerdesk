import { useMemo, useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ChevronRight, Clock3, FileText, FileUp, Image as ImageIcon, Loader2, MessagesSquare, Search, Sparkles, UploadCloud } from 'lucide-react'
import { uploadDocument } from '../lib/actions'
import { MAX_UPLOAD_MB, isAcceptedFile } from '../lib/images'
import { clientById, docFields, threadsFor } from '../lib/selectors'
import { useAppState } from '../lib/store'
import { toast } from '../lib/toast'
import { fmtAmount, timeAgo } from '../lib/format'
import type { DocRecord, DocStatus } from '../lib/types'
import { DocStepper } from '../components/DocStepper'
import { Badge, Button, Card, CardHeader, EmptyState, KPI, PageHeader, Pager, Segmented, StatusBadge, cx, usePaged } from '../components/ui'

const SAMPLES = [
  { file: 'harbour-fuel-receipt.png', label: 'Fuel receipt', detail: 'Harbour Fuel & Marine' },
  { file: 'island-power-invoice.png', label: 'Power bill', detail: 'Island Power & Light' },
  { file: 'atlantic-dive-invoice.png', label: 'USD invoice', detail: 'Atlantic Dive Wholesale' },
  { file: 'seaview-faded-receipt.png', label: 'Faded receipt', detail: 'Low confidence read' },
]

type Filter = 'all' | DocStatus

function DocRow({ doc, unread, messages }: { doc: DocRecord; unread: number; messages: number }) {
  const fields = docFields(doc)
  const isPdf = doc.mime === 'application/pdf'
  const Icon = isPdf ? FileText : ImageIcon
  return (
    <li>
      <Link to={`/portal/doc/${doc.id}`} className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2 sm:px-5">
        <span className="hidden size-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-3 sm:inline-flex">
          <Icon size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="min-w-0 truncate font-medium text-ink">{fields?.vendor || doc.filename}</p>
            <StatusBadge status={doc.status} />
            {unread > 0 && (
              <Badge tone="brand" icon={MessagesSquare}>
                {unread} new
              </Badge>
            )}
          </div>
          <p className="mt-0.5 truncate text-[13px] text-ink-3">
            {doc.filename} · uploaded {timeAgo(doc.uploadedAt)}
            {messages > 0 && unread === 0 ? ` · ${messages} ${messages === 1 ? 'message' : 'messages'}` : ''}
          </p>
          {doc.status === 'rejected' && doc.rejectionReason && <p className="mt-1 line-clamp-2 text-[13px] text-bad">{doc.rejectionReason}</p>}
          <DocStepper status={doc.status} className="mt-2.5 max-w-md" />
        </div>
        <div className="hidden shrink-0 text-right sm:block">
          {fields ? <p className="num font-medium text-ink">{`${fields.currency} ${fmtAmount(fields.total)}`}</p> : <p className="text-[13px] text-ink-3">Reading…</p>}
        </div>
        <ChevronRight size={16} className="shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </li>
  )
}

export default function Portal() {
  const state = useAppState()
  const client = clientById(state, state.session.clientId)
  const [dragging, setDragging] = useState(false)
  const [preparing, setPreparing] = useState(0)
  const [loadingSample, setLoadingSample] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  const docs = useMemo(
    () => state.documents.filter((d) => d.clientId === client?.id).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
    [state.documents, client?.id],
  )
  const threads = useMemo(() => new Map(threadsFor(state, 'client', client?.id).map((t) => [t.doc.id, t])), [state, client?.id])

  const count = (status: DocStatus) => docs.filter((d) => d.status === status).length
  const needle = query.trim().toLowerCase()
  const visible = docs.filter((d) => {
    if (filter !== 'all' && d.status !== filter) return false
    if (!needle) return true
    return `${d.filename} ${docFields(d)?.vendor ?? ''} ${docFields(d)?.invoiceNumber ?? ''}`.toLowerCase().includes(needle)
  })
  const paged = usePaged(visible, 8)

  if (!client) return null

  const send = async (files: File[]) => {
    const good: File[] = []
    for (const file of files) {
      if (!isAcceptedFile(file)) toast.error(`${file.name} wasn't uploaded`, 'Please use an image (PNG, JPG, WebP) or a PDF.')
      else if (file.size > MAX_UPLOAD_MB * 1024 * 1024) toast.error(`${file.name} is too large`, `The limit is ${MAX_UPLOAD_MB} MB per file.`)
      else good.push(file)
    }
    if (!good.length) return
    setPreparing((n) => n + good.length)
    if (good.length > 1) toast.info(`Uploading ${good.length} documents`)
    await Promise.all(
      good.map(async (file) => {
        try {
          await uploadDocument(file, client.id)
        } catch {
          toast.error(`${file.name} couldn't be uploaded`, 'Your browser storage may be full. Reset the demo data and try again.')
        } finally {
          setPreparing((n) => n - 1)
        }
      }),
    )
  }

  const trySample = async (name: string) => {
    setLoadingSample(name)
    try {
      const response = await fetch(`/samples/${name}`)
      if (!response.ok) throw new Error('missing')
      const blob = await response.blob()
      setLoadingSample(null)
      await send([new File([blob], name, { type: blob.type || 'image/png' })])
    } catch {
      setLoadingSample(null)
      toast.error('Sample not available', 'The sample image could not be loaded.')
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    void send([...e.dataTransfer.files])
  }

  return (
    <div>
      <PageHeader title={client.name} description="Send your receipts and invoices here. You'll see each one move through review, and any questions stay attached to the document." />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPI label="Processing" value={count('processing')} icon={Clock3} hint="Being read now" />
        <KPI label="With your accountant" value={count('needs_review')} icon={Search} tone={count('needs_review') ? 'warn' : undefined} hint="Waiting for review" />
        <KPI label="Approved" value={count('approved')} icon={CheckCircle2} tone="good" hint="Posted to your books" />
        <KPI label="Unread messages" value={[...threads.values()].reduce((n, t) => n + t.unread, 0)} icon={MessagesSquare} to="/messages" hint="Open your messages" />
      </div>

      <Card className="mb-5">
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload documents"
          onClick={() => input.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              input.current?.click()
            }
          }}
          onDragEnter={(e) => {
            e.preventDefault()
            dragDepth.current += 1
            setDragging(true)
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => {
            dragDepth.current -= 1
            if (dragDepth.current <= 0) setDragging(false)
          }}
          onDrop={onDrop}
          className={cx(
            'm-3 flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed px-6 py-9 text-center transition-colors outline-none focus-visible:border-brand sm:m-4',
            dragging ? 'border-brand bg-brand-soft' : 'border-line-strong hover:bg-surface-2',
          )}
        >
          <span className={cx('mb-3 inline-flex size-12 items-center justify-center rounded-xl', dragging ? 'bg-brand text-on-brand' : 'bg-brand-soft text-brand-ink')}>
            {preparing > 0 ? <Loader2 size={22} className="animate-spin" aria-hidden /> : <UploadCloud size={22} aria-hidden />}
          </span>
          <p className="font-semibold text-ink">{dragging ? 'Drop to upload' : preparing > 0 ? `Uploading ${preparing} ${preparing === 1 ? 'document' : 'documents'}…` : 'Drag receipts and invoices here'}</p>
          <p className="mt-1 text-[13px] text-ink-3">Images or PDFs, up to {MAX_UPLOAD_MB} MB each. AI reads them first, then your accountant checks every one.</p>
          <span className="mt-4">
            <Button
              variant="primary"
              icon={FileUp}
              onClick={(e) => {
                e.stopPropagation()
                input.current?.click()
              }}
            >
              Choose files
            </Button>
          </span>
          <input
            ref={input}
            type="file"
            multiple
            accept="image/*,application/pdf,.pdf"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              void send([...(e.target.files ?? [])])
              e.target.value = ''
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-4 py-3 sm:px-5">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
            <Sparkles size={14} className="text-brand-ink" aria-hidden /> Try a sample
          </span>
          {SAMPLES.map((sample) => (
            <Button key={sample.file} size="sm" loading={loadingSample === sample.file} title={sample.detail} onClick={() => void trySample(sample.file)}>
              {sample.label}
            </Button>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Your documents"
          description={`${docs.length} on file`}
          action={
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search documents" aria-label="Search documents" className="field-input sm:w-52" />
              <Segmented
                label="Filter by status"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'All', count: docs.length },
                  { value: 'processing', label: 'Processing', count: count('processing') },
                  { value: 'needs_review', label: 'In review', count: count('needs_review') },
                  { value: 'approved', label: 'Approved', count: count('approved') },
                  { value: 'rejected', label: 'Rejected', count: count('rejected') },
                ]}
              />
            </div>
          }
        />
        {paged.rows.length ? (
          <ul className="divide-y divide-line">
            {paged.rows.map((doc) => (
              <DocRow key={doc.id} doc={doc} unread={threads.get(doc.id)?.unread ?? 0} messages={threads.get(doc.id)?.count ?? 0} />
            ))}
          </ul>
        ) : docs.length ? (
          <EmptyState compact icon={Search} title="Nothing matches" body="Try a different status or search term." />
        ) : (
          <EmptyState compact icon={FileUp} title="No documents yet" body="Upload your first receipt above, or try one of the samples." />
        )}
        <Pager {...paged} />
      </Card>
    </div>
  )
}
