import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeftRight, ClipboardCheck, Landmark, Search } from 'lucide-react'
import { closeStatus } from '../lib/selectors'
import { useAppState } from '../lib/store'
import { dueLabel, fmtPeriod } from '../lib/format'
import { Avatar, Badge, Card, EmptyState, PageHeader, ProgressBar } from '../components/ui'

export default function Clients() {
  const state = useAppState()
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const clients = state.clients.filter((c) => `${c.name} ${c.industry} ${c.contact}`.toLowerCase().includes(needle))

  return (
    <div>
      <PageHeader
        title="Clients"
        description={`${state.clients.length} businesses across Grand Cayman, with progress for the ${fmtPeriod(state.closePeriod)} close.`}
        actions={<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search clients" aria-label="Search clients" className="field-input sm:w-64" />}
      />
      {clients.length ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {clients.map((client) => {
            const status = closeStatus(state, client.id)
            const done = status.steps.filter((s) => s.done).length
            return (
              <Link key={client.id} to={`/clients/${client.id}`} className="block rounded-xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-line-strong sm:p-5">
                <div className="flex items-start gap-3">
                  <Avatar name={client.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{client.name}</p>
                    <p className="truncate text-[13px] text-ink-3">{client.industry}</p>
                  </div>
                  {status.health === 'at_risk' ? <Badge tone="warn">At risk</Badge> : status.health === 'ready' ? <Badge tone="good">Ready</Badge> : null}
                </div>
                <div className="mt-4 flex items-center justify-between text-[13px]">
                  <span className="text-ink-2">Month-end close</span>
                  <span className="text-ink-3">{dueLabel(client.monthEndDue)}</span>
                </div>
                <div className="mt-1.5">
                  <ProgressBar value={status.progress} tone={status.health === 'ready' ? 'good' : status.health === 'at_risk' ? 'warn' : 'brand'} label={`${client.name} close progress, ${done} of ${status.steps.length} steps`} />
                </div>
                <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-ink-2">
                  <div className="inline-flex items-center gap-1.5">
                    <ClipboardCheck size={14} className="text-ink-3" aria-hidden />
                    <dt className="sr-only">Documents waiting</dt>
                    <dd>
                      <span className="num font-medium text-ink">{status.waiting}</span> waiting
                    </dd>
                  </div>
                  <div className="inline-flex items-center gap-1.5">
                    <ArrowLeftRight size={14} className="text-ink-3" aria-hidden />
                    <dt className="sr-only">Unreconciled bank lines</dt>
                    <dd>{status.statementImported ? <><span className="num font-medium text-ink">{status.unreconciled}</span> unreconciled</> : 'No statement yet'}</dd>
                  </div>
                  <div className="inline-flex items-center gap-1.5">
                    <Landmark size={14} className="text-ink-3" aria-hidden />
                    <dt className="sr-only">Bank account</dt>
                    <dd>
                      {client.bankName} ({client.bankCurrency})
                    </dd>
                  </div>
                </dl>
              </Link>
            )
          })}
        </div>
      ) : (
        <Card>
          <EmptyState icon={Search} title="No clients match" body={`Nothing found for "${query.trim()}".`} />
        </Card>
      )}
    </div>
  )
}
