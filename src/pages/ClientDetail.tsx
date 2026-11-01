import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowLeftRight, BarChart3, BookOpenText, Building2, Check, Circle, FileText, Landmark, Mail, MapPin, Phone, TrendingDown, TrendingUp, User, Wallet } from 'lucide-react'
import { closeStatus, docFields, summarise } from '../lib/selectors'
import { useAppState } from '../lib/store'
import { dueLabel, fmtAmount, fmtDate, fmtMoney, fmtPeriod, timeAgo } from '../lib/format'
import { Avatar, Badge, Card, CardHeader, EmptyState, KPI, LinkButton, PageHeader, ProgressBar, StatusBadge, cx } from '../components/ui'

export default function ClientDetail() {
  const { id } = useParams()
  const state = useAppState()
  const client = state.clients.find((c) => c.id === id)

  if (!client) {
    return (
      <EmptyState
        icon={Building2}
        title="Client not found"
        action={
          <LinkButton to="/clients" variant="primary" icon={ArrowLeft}>
            Back to clients
          </LinkButton>
        }
      />
    )
  }

  const period = state.closePeriod
  const status = closeStatus(state, client.id)
  const summary = summarise(state.ledger, client.id, period)
  const docs = state.documents.filter((d) => d.clientId === client.id).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)).slice(0, 6)
  const query = `?client=${client.id}&period=${period}`

  const contact = [
    { icon: User, label: 'Contact', value: client.contact },
    { icon: Mail, label: 'Email', value: client.email },
    { icon: Phone, label: 'Phone', value: client.phone },
    { icon: MapPin, label: 'Address', value: client.address },
    { icon: Landmark, label: 'Bank', value: `${client.bankName} (${client.bankCurrency})` },
  ]

  return (
    <div>
      <LinkButton to="/clients" variant="ghost" size="sm" icon={ArrowLeft} className="mb-2 -ml-2.5">
        Clients
      </LinkButton>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar name={client.name} />
            <span className="min-w-0">{client.name}</span>
          </span>
        }
        description={`${client.industry}. Client since ${client.since}.`}
        actions={
          <>
            <LinkButton to={`/ledger${query}`} icon={BookOpenText}>
              Ledger
            </LinkButton>
            <LinkButton to={`/reconciliation${query}`} icon={ArrowLeftRight}>
              Reconcile
            </LinkButton>
            <LinkButton to={`/reports${query}`} icon={BarChart3}>
              Report
            </LinkButton>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KPI label={`Income, ${fmtPeriod(period)}`} value={fmtMoney(summary.income)} icon={TrendingUp} />
        <KPI label={`Expenses, ${fmtPeriod(period)}`} value={fmtMoney(summary.expenses)} icon={TrendingDown} />
        <KPI label="Net" value={fmtMoney(summary.net)} icon={Wallet} tone={summary.net < 0 ? 'bad' : 'good'} />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Recent documents" description={`${state.documents.filter((d) => d.clientId === client.id).length} on file`} />
          {docs.length ? (
            <ul className="divide-y divide-line">
              {docs.map((doc) => {
                const fields = docFields(doc)
                return (
                  <li key={doc.id}>
                    <Link to={`/review/${doc.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 sm:px-5">
                      <span className="hidden size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-3 sm:inline-flex">
                        <FileText size={15} aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-ink">{fields?.vendor || doc.filename}</p>
                        <p className="truncate text-[13px] text-ink-3">
                          {fields?.date ? fmtDate(fields.date) : doc.filename} · uploaded {timeAgo(doc.uploadedAt)}
                        </p>
                      </div>
                      <StatusBadge status={doc.status} />
                      {fields && <span className="num hidden w-28 shrink-0 text-right font-medium text-ink sm:block">{`${fields.currency} ${fmtAmount(fields.total)}`}</span>}
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState compact icon={FileText} title="No documents yet" body="Anything this client uploads appears here." />
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Month-end close"
              description={`${fmtPeriod(period)}, ${dueLabel(client.monthEndDue).toLowerCase()}`}
              action={status.health === 'at_risk' ? <Badge tone="warn">At risk</Badge> : status.health === 'ready' ? <Badge tone="good">Ready</Badge> : <Badge>On track</Badge>}
            />
            <div className="p-4 sm:px-5">
              <ProgressBar value={status.progress} tone={status.health === 'ready' ? 'good' : status.health === 'at_risk' ? 'warn' : 'brand'} label="Close progress" />
              <ul className="mt-4 space-y-2.5">
                {status.steps.map((step) => (
                  <li key={step.label} className="flex items-center gap-2.5">
                    <span className={cx('inline-flex size-5 shrink-0 items-center justify-center rounded-full', step.done ? 'bg-good text-white' : 'bg-surface-3 text-ink-3')}>
                      {step.done ? <Check size={12} aria-hidden /> : <Circle size={7} aria-hidden />}
                    </span>
                    <span className={cx('min-w-0 flex-1', step.done ? 'text-ink-2' : 'font-medium text-ink')}>{step.label}</span>
                    <span className="text-[13px] text-ink-3">{step.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card>
            <CardHeader title="Contact details" />
            <dl className="space-y-3 p-4 sm:px-5">
              {contact.map((row) => (
                <div key={row.label} className="flex gap-2.5">
                  <row.icon size={15} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
                  <div className="min-w-0">
                    <dt className="text-xs text-ink-3">{row.label}</dt>
                    <dd className="break-words text-ink">{row.value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>
    </div>
  )
}
