import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeftRight,
  ArrowRight,
  Building2,
  CalendarClock,
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
import { dueLabel, daysUntil, fmtAmount, fmtDate, fmtPeriod, timeAgo } from '../lib/format'
import type { AuditAction } from '../lib/types'
import { Avatar, Badge, Card, CardHeader, ConfidenceChip, EmptyState, KPI, LinkButton, PageHeader, ProgressBar, type Tone } from '../components/ui'

const ACTIVITY: Record<AuditAction, typeof Upload> = {
  upload: FileUp,
  ai_extraction: Sparkles,
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
      <PageHeader
        title="Dashboard"
        description={`${fmtPeriod(state.closePeriod)} close is in progress. Here's what needs you today.`}
        actions={
          <LinkButton to="/review" variant="primary" icon={ClipboardCheck}>
            Open review queue
          </LinkButton>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KPI label="Active clients" value={state.clients.length} icon={Building2} to="/clients" hint="Cayman businesses" />
        <KPI label="Waiting for review" value={queue.length} icon={ClipboardCheck} tone={queue.length ? 'warn' : 'good'} to="/review" hint={processing ? `${processing} more being read` : 'Nothing posts until approved'} />
        <KPI label="Unreconciled items" value={open} icon={ArrowLeftRight} tone={open ? 'warn' : 'good'} to="/reconciliation" hint={open ? `Across ${clientsWithOpen} ${clientsWithOpen === 1 ? 'client' : 'clients'}` : 'All lines resolved'} />
        <KPI
          label="Next deadline"
          value={next ? fmtDate(next.client.monthEndDue).slice(0, 6) : '—'}
          icon={CalendarClock}
          tone={atRisk ? 'bad' : undefined}
          hint={atRisk ? `${atRisk} ${atRisk === 1 ? 'client' : 'clients'} at risk` : next ? next.client.name : undefined}
        />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="space-y-5">
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
                      <Link to={`/review/${doc.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 sm:px-5">
                        <Avatar name={clientById(state, doc.clientId)?.name ?? '?'} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-ink">{fields?.vendor || doc.filename}</p>
                          <p className="truncate text-[13px] text-ink-3">
                            {clientById(state, doc.clientId)?.name} · {timeAgo(doc.uploadedAt)}
                          </p>
                        </div>
                        {doc.extraction && <ConfidenceChip value={doc.extraction.confidence} />}
                        {fields && <span className="num hidden w-28 shrink-0 text-right font-medium text-ink sm:block">{`${fields.currency} ${fmtAmount(fields.total)}`}</span>}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyState compact icon={CheckCircle2} title="You're all caught up" body="New client uploads appear here as soon as they've been read." />
            )}
          </Card>

          <Card>
            <CardHeader title="Month-end deadlines" description={`${fmtPeriod(state.closePeriod)} close, soonest first`} />
            <ul className="divide-y divide-line">
              {deadlines.map(({ client, status }) => {
                const health = HEALTH[status.health]
                const days = daysUntil(client.monthEndDue)
                return (
                  <li key={client.id}>
                    <Link to={`/clients/${client.id}`} className="block px-4 py-3 transition-colors hover:bg-surface-2 sm:px-5">
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

        <Card>
          <CardHeader
            title="Recent activity"
            description="From the audit log"
            action={
              <LinkButton to="/audit" variant="ghost" size="sm">
                Audit log <ArrowRight size={14} aria-hidden />
              </LinkButton>
            }
          />
          <ul className="divide-y divide-line">
            {activity.map((event) => {
              const Icon = ACTIVITY[event.action]
              return (
                <li key={event.id} className="flex gap-3 px-4 py-3 sm:px-5">
                  <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-2">
                    <Icon size={14} aria-hidden />
                  </span>
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
