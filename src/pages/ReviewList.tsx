import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, MessagesSquare, ShieldCheck } from 'lucide-react'
import { LOW_CONFIDENCE, clientById, docFields, reviewQueue, threadsFor } from '../lib/selectors'
import { useAppState } from '../lib/store'
import { timeAgo } from '../lib/format'
import { Badge, Card, CardHeader, ConfidenceChip, EmptyState, Money, PageHeader, Pager, Select, SummaryStrip, usePaged } from '../components/ui'

export default function ReviewList() {
  const state = useAppState()
  const navigate = useNavigate()
  const [clientId, setClientId] = useState('all')
  const queue = reviewQueue(state)
  const visible = clientId === 'all' ? queue : queue.filter((d) => d.clientId === clientId)
  const processing = state.documents.filter((d) => d.status === 'processing')
  const threads = new Map(threadsFor(state, 'accountant').map((t) => [t.doc.id, t]))
  const lowConfidence = queue.filter((d) => (d.extraction?.confidence ?? 1) < LOW_CONFIDENCE).length
  const paged = usePaged(visible, 10)

  return (
    <div>
      <PageHeader
        title="Review queue"
        description="AI reads every document first. Nothing reaches a client's ledger until you approve it."
        actions={
          <Select aria-label="Filter by client" value={clientId} onChange={(e) => setClientId(e.target.value)} className="sm:w-64">
            <option value="all">All clients</option>
            {state.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        }
      />

      <SummaryStrip
        items={[
          { label: 'Waiting for you', value: queue.length, tone: queue.length ? 'warn' : undefined, hint: `Across ${new Set(queue.map((d) => d.clientId)).size} clients` },
          { label: 'Low-confidence reads', value: lowConfidence, tone: lowConfidence ? 'warn' : undefined, hint: 'Need a closer look' },
          { label: 'Being read now', value: processing.length, hint: processing.length ? 'Will join the queue shortly' : 'Nothing in progress' },
        ]}
      />

      <Card>
        <CardHeader title="Documents to review" description="Oldest first" />
        {paged.rows.length ? (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="data-table min-w-[820px]">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Vendor</th>
                  <th className="text-right">Total</th>
                  <th>AI confidence</th>
                  <th>Uploaded</th>
                  <th>Messages</th>
                </tr>
              </thead>
              <tbody>
                {paged.rows.map((doc) => {
                  const fields = docFields(doc)
                  const thread = threads.get(doc.id)
                  const low = (doc.extraction?.confidence ?? 1) < LOW_CONFIDENCE
                  return (
                    <tr key={doc.id} className="row-link" onClick={() => navigate(`/review/${doc.id}`)}>
                      <td className="max-w-52 truncate text-ink-2">{clientById(state, doc.clientId)?.name}</td>
                      <td className="max-w-64">
                        <Link to={`/review/${doc.id}`} className="block truncate font-medium text-ink hover:underline" onClick={(e) => e.stopPropagation()}>
                          {fields?.vendor || 'Unknown vendor'}
                        </Link>
                        <span className="block truncate text-xs text-ink-3">{doc.filename}</span>
                      </td>
                      <td className="text-right font-medium text-ink">{fields ? <Money value={fields.total} currency={fields.currency} /> : '—'}</td>
                      <td>
                        <span className="inline-flex items-center gap-1.5">
                          {doc.extraction && <ConfidenceChip value={doc.extraction.confidence} />}
                          {low && (
                            <Badge tone="warn" icon={AlertTriangle}>
                              Check closely
                            </Badge>
                          )}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-ink-2">{timeAgo(doc.uploadedAt)}</td>
                      <td>
                        {thread ? (
                          <span className="inline-flex items-center gap-1.5 text-ink-2">
                            <MessagesSquare size={14} aria-hidden />
                            <span className="num">{thread.count}</span>
                            {thread.unread > 0 && <Badge tone="brand">{thread.unread} new</Badge>}
                          </span>
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : queue.length ? (
          <EmptyState compact icon={CheckCircle2} title="Nothing waiting for this client" body="Other clients still have documents in the queue." />
        ) : (
          <EmptyState icon={ShieldCheck} title="The queue is clear" body="Every document has been reviewed. New uploads appear here once they've been read." />
        )}
        <Pager {...paged} />
      </Card>
    </div>
  )
}
