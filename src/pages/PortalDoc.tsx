import { useParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, CheckCircle2, FileQuestion, Info, Loader2 } from 'lucide-react'
import { docFields } from '../lib/selectors'
import { useAppState } from '../lib/store'
import { fmtAmount, fmtDate, fmtDateTime } from '../lib/format'
import { DocStepper } from '../components/DocStepper'
import { DocumentPreview } from '../components/DocumentPreview'
import { Thread } from '../components/Thread'
import { Card, CardHeader, EmptyState, LinkButton, PageHeader, StatusBadge } from '../components/ui'

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-[13px] text-ink-3">{label}</dt>
      <dd className="num min-w-0 text-right font-medium break-words text-ink">{value || '—'}</dd>
    </div>
  )
}

export default function PortalDoc() {
  const { id } = useParams()
  const state = useAppState()
  const doc = state.documents.find((d) => d.id === id && d.clientId === state.session.clientId)

  if (!doc) {
    return (
      <EmptyState
        icon={FileQuestion}
        title="Document not found"
        body="It may belong to another client, or the demo data may have been reset."
        action={
          <LinkButton to="/portal" variant="primary" icon={ArrowLeft}>
            Back to documents
          </LinkButton>
        }
      />
    )
  }

  const fields = docFields(doc)

  return (
    <div>
      <LinkButton to="/portal" variant="ghost" size="sm" icon={ArrowLeft} className="mb-2 -ml-2.5">
        Documents
      </LinkButton>
      <PageHeader title={fields?.vendor || doc.filename} description={`Uploaded ${fmtDateTime(doc.uploadedAt)} by ${doc.uploadedBy}`} actions={<StatusBadge status={doc.status} />} />

      <Card className="mb-5 p-4 sm:px-5">
        <DocStepper status={doc.status} />
        <p className="mt-3 flex items-start gap-2 text-[13px] text-ink-2">
          {doc.status === 'processing' && (
            <>
              <Loader2 size={15} className="mt-0.5 shrink-0 animate-spin text-info" aria-hidden /> We're reading this document now. It usually takes a few seconds.
            </>
          )}
          {doc.status === 'needs_review' && (
            <>
              <Info size={15} className="mt-0.5 shrink-0 text-warn" aria-hidden /> Your accountant is checking it. Nothing reaches your books until they approve it.
            </>
          )}
          {doc.status === 'approved' && (
            <>
              <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-good" aria-hidden /> Approved by {doc.reviewedBy}
              {doc.reviewedAt ? ` on ${fmtDateTime(doc.reviewedAt)}` : ''}, and posted to your books.
            </>
          )}
          {doc.status === 'rejected' && (
            <>
              <AlertCircle size={15} className="mt-0.5 shrink-0 text-bad" aria-hidden />
              <span>
                Rejected by {doc.reviewedBy}. {doc.rejectionReason} Nothing was posted to your books.
              </span>
            </>
          )}
        </p>
      </Card>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <DocumentPreview doc={doc} />
        <div className="space-y-5">
          <Card>
            <CardHeader title={doc.status === 'approved' ? 'What was posted' : 'What we read'} description={doc.status === 'approved' ? 'As confirmed by your accountant' : 'AI reading. Your accountant will confirm it.'} />
            {fields ? (
              <dl className="divide-y divide-line px-4 py-1 sm:px-5">
                <ReadRow label="Vendor" value={fields.vendor} />
                <ReadRow label="Date" value={fmtDate(fields.date)} />
                <ReadRow label="Invoice number" value={fields.invoiceNumber} />
                <ReadRow label="Subtotal" value={`${fields.currency} ${fmtAmount(fields.subtotal)}`} />
                <ReadRow label="Tax" value={`${fields.currency} ${fmtAmount(fields.tax)}`} />
                <ReadRow label="Total" value={`${fields.currency} ${fmtAmount(fields.total)}`} />
                <ReadRow label="Category" value={fields.category} />
              </dl>
            ) : (
              <div className="space-y-2.5 p-4 sm:px-5" aria-busy="true" aria-label="Reading document">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="skeleton h-5" />
                ))}
              </div>
            )}
          </Card>
          <Card>
            <CardHeader title="Messages" description="Questions about this document, in one place" />
            <Thread docId={doc.id} viewer="client" />
          </Card>
        </div>
      </div>
    </div>
  )
}
