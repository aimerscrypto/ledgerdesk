import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileUp,
  MessagesSquare,
  Pencil,
  ScrollText,
  Sparkles,
  Upload,
  XCircle,
} from 'lucide-react'
import { clientById, closeStatus, docFields, isOpenLine, reviewQueue } from '../lib/selectors'
import { useAppState } from '../lib/store'
import { dueLabel, daysUntil, fmtDate, fmtPeriod, timeAgo } from '../lib/format'
import type { AuditAction } from '../lib/types'
import { Avatar, Badge, Card, CardHeader, ConfidenceChip, EmptyState, LinkButton, Money, ProgressBar, SummaryStrip, type Tone } from '../components/ui'

const ACTIVITY: Record<AuditAction, typeof Upload> = {
  upload: FileUp,
  ai_extraction: Sparkles,
  demo_extraction: Sparkles,
  seed_import: FileUp,
  edit: Pencil,
  approve: CheckCircle2,
  reject: XCircle,
  post: ScrollText,
  export: Download,
  import: Upload,
  reconcile: ArrowLeftRight,
  message: MessagesSquare,
  system: ScrollText,
}

const HEALTH: Record<'ready' | 'on_track' | 'at_risk', { label: string; tone: Tone; bar: 'good' | 'brand' | 'warn' }> = {
  ready: { label: 'Ready', tone: 'good', bar: 'good' },
  on_track: { label: 'On track', tone: 'neutral', bar: 'brand' },
  at_risk: { label: 'At risk', tone: 'warn', bar: 'warn' },
}

export default function Dashboard() {
  const state = useAppState()
  const queue = reviewQueue(state)
  const processing = state.documents.filter((d) => d.status === 'processing').length
  const open = state.bank.filter((t) => t.period === state.closePeriod && isOpenLine(t)).length

  const deadlines = useMemo(
    () =>
      state.clients
        .map((client) => ({ client, status: closeStatus(state, client.id) }))
        .sort((a, b) => a.client.monthEndDue.localeCompare(b.client.monthEndDue)),
    [state],
  )
  const next = deadlines.find((d) => d.status.progress < 1) ?? deadlines[0]
  const atRisk = deadlines.filter((d) => d.status.health === 'at_risk').length
  const clientsWithOpen = new Set(state.bank.filter((t) => t.period === state.closePeriod && isOpenLine(t)).map((t) => t.clientId)).size
  const activity = useMemo(() => [...state.audit].sort((a, b) => b.seq - a.seq).slice(0, 8), [state.audit])

  return (
    <div>
      <section className="mb-10">
        <p className="mb-3 text-[13px] font-medium text-ink-2">{fmtPeriod(state.closePeriod)} close in progress</p>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <h1 className="max-w-4xl font-display text-[44px] leading-[1.04] text-ink sm:text-[64px]">
            {queue.length ? (
              <>
                <span className="num text-brand-ink">{queue.length}</span> {queue.length === 1 ? 'document needs' : 'documents need'} you today
              </>
            ) : (
              'Nothing needs you today'
            )}
          </h1>
          <LinkButton to="/review" variant="primary" icon={ClipboardCheck} className="mb-2">
            Open review queue
          </LinkButton>
        </div>
        <SummaryStrip
          className="mb-0"
          items={[
            { label: 'Active clients', value: state.clients.length, to: '/clients', hint: 'Cayman businesses' },
            { label: 'Being read now', value: processing, to: '/review', hint: 'Nothing posts until approved' },
            { label: 'Unreconciled items', value: open, to: '/reconciliation', hint: open ? `Across ${clientsWithOpen} ${clientsWithOpen === 1 ? 'client' : 'clients'}` : 'All lines resolved' },
            {
              label: 'Next deadline',
              value: next ? fmtDate(next.client.monthEndDue).slice(0, 6) : '—',
              hint: atRisk ? <span className="font-medium text-warn">{atRisk} {atRisk === 1 ? 'client' : 'clients'} at risk</span> : next?.client.name,
            },
          ]}
        />
      </section>

      <div className="grid items-start gap-x-10 gap-y-8 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="space-y-8">
          <Card>
            <CardHeader
              title="Review queue"
              description="Oldest first. AI has read these, and a person still has to approve them."
              action={
                queue.length > 5 ? (
                  <LinkButton to="/review" variant="ghost" size="sm">
                    View all {queue.length} <ArrowRight size={14} aria-hidden />
                  </LinkButton>
                ) : undefined
              }
            />
            {queue.length ? (
              <ul className="divide-y divide-line">
                {queue.slice(0, 5).map((doc) => {
                  const fields = docFields(doc)
                  return (
                    <li key={doc.id}>
                      <Link to={`/review/${doc.id}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2 sm:px-5">
                        <Avatar name={clientById(state, doc.clientId)?.name ?? '?'} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-ink">{fields?.vendor || doc.filename}</p>
                          <p className="truncate text-[13px] text-ink-3">
                            {clientById(state, doc.clientId)?.name} · {timeAgo(doc.uploadedAt)}
                          </p>
                        </div>
                        {doc.extraction && <ConfidenceChip value={doc.extraction.confidence} />}
                        {fields && <Money value={fields.total} currency={fields.currency} className="hidden w-32 shrink-0 text-right font-medium text-ink sm:block" />}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyState compact icon={CheckCircle2} title="You're all caught up" body="New client uploads appear here as soon as they've been read." />
            )}
          </Card>

          <Card plain>
            <CardHeader title="Month-end deadlines" description={`${fmtPeriod(state.closePeriod)} close, soonest first`} />
            <ul>
              {deadlines.map(({ client, status }) => {
                const health = HEALTH[status.health]
                const days = daysUntil(client.monthEndDue)
                return (
                  <li key={client.id}>
                    <Link to={`/clients/${client.id}`} className="block rounded-xl px-4 py-3 transition-colors hover:bg-surface-2 sm:px-5">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <p className="min-w-0 truncate font-medium text-ink">{client.name}</p>
                        <div className="flex items-center gap-2">
                          <Badge tone={health.tone}>{health.label}</Badge>
                          <span className={days < 3 && status.progress < 1 ? 'text-[13px] font-medium text-warn' : 'text-[13px] text-ink-3'}>{dueLabel(client.monthEndDue)}</span>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="flex-1">
                          <ProgressBar value={status.progress} tone={health.bar} label={`${client.name} close progress`} />
                        </div>
                        <span className="num w-20 shrink-0 text-right text-xs text-ink-3">{status.steps.filter((s) => s.done).length} of {status.steps.length} steps</span>
                      </div>
                      <p className="mt-1 text-xs text-ink-3">
                        {status.waiting} waiting · {status.statementImported ? `${status.unreconciled} unreconciled` : 'statement not imported'}
                      </p>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </Card>
        </div>

        <Card plain>
          <CardHeader
            title="Recent activity"
            description="From the audit log"
            action={
              <LinkButton to="/audit" variant="ghost" size="sm">
                Audit log <ArrowRight size={14} aria-hidden />
              </LinkButton>
            }
          />
          <ul>
            {activity.map((event) => {
              const Icon = ACTIVITY[event.action]
              return (
                <li key={event.id} className="flex gap-3 px-4 py-2.5 sm:px-5">
                  <Icon size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-[13px] text-ink">{event.detail}</p>
                    <p className="mt-0.5 truncate text-xs text-ink-3">
                      {event.actor} · {timeAgo(event.at)}
                      {event.clientId ? ` · ${clientById(state, event.clientId)?.name ?? ''}` : ''}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      </div>
    </div>
  )
}
