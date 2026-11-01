import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, ScrollText, Search, ShieldCheck } from 'lucide-react'
import { logExport } from '../lib/actions'
import { downloadText, toCsv, type CsvCell } from '../lib/csv'
import { fmtDateTime } from '../lib/format'
import { clientById } from '../lib/selectors'
import { useAppState } from '../lib/store'
import { toast } from '../lib/toast'
import type { AuditAction } from '../lib/types'
import { Avatar, Badge, Button, Card, EmptyState, FilterBar, PageHeader, Pager, Select, usePaged, type Tone } from '../components/ui'

const ACTIONS: Record<AuditAction, { label: string; tone: Tone }> = {
  upload: { label: 'Upload', tone: 'neutral' },
  ai_extraction: { label: 'DeepSeek V4.1 Flash', tone: 'brand' },
  demo_extraction: { label: 'Demo extraction', tone: 'warn' },
  seed_import: { label: 'Imported', tone: 'neutral' },
  edit: { label: 'Edit', tone: 'info' },
  approve: { label: 'Approval', tone: 'good' },
  reject: { label: 'Rejection', tone: 'bad' },
  post: { label: 'Ledger post', tone: 'good' },
  export: { label: 'Export', tone: 'info' },
  import: { label: 'Import', tone: 'info' },
  reconcile: { label: 'Reconciliation', tone: 'neutral' },
  message: { label: 'Message', tone: 'neutral' },
  system: { label: 'System', tone: 'neutral' },
}

export default function Audit() {
  const state = useAppState()
  const [action, setAction] = useState<'all' | AuditAction>('all')
  const [clientId, setClientId] = useState('all')
  const [query, setQuery] = useState('')

  const needle = query.trim().toLowerCase()
  const events = state.audit
    .filter((e) => action === 'all' || e.action === action)
    .filter((e) => clientId === 'all' || e.clientId === clientId)
    .filter((e) => !needle || `${e.detail} ${e.actor}`.toLowerCase().includes(needle))
    .sort((a, b) => b.seq - a.seq)
  const paged = usePaged(events, 20)

  const exportCsv = () => {
    const rows: CsvCell[][] = [
      ['Sequence', 'Time', 'User', 'Role', 'Action', 'Client', 'Document', 'Detail'],
      ...events.map((e): CsvCell[] => [e.seq, new Date(e.at).toISOString(), e.actor, e.actorRole, ACTIONS[e.action].label, e.clientId ? clientById(state, e.clientId)?.name ?? '' : '', e.docId ?? '', e.detail]),
    ]
    downloadText('ledgerdesk-audit-log.csv', toCsv(rows))
    logExport(`Audit log CSV exported (${events.length} events)`)
    toast.success('Audit log exported', 'The export is recorded in the log too.')
  }

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Every upload, AI extraction, edit, approval and export, with the time and the person responsible."
        actions={
          <Button icon={Download} disabled={!events.length} onClick={exportCsv}>
            Export CSV
          </Button>
        }
      />

      <FilterBar>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search details or users" aria-label="Search the audit log" className="field-input min-w-48 flex-1 sm:max-w-72" />
        <Select aria-label="Filter by action" value={action} onChange={(e) => setAction(e.target.value as 'all' | AuditAction)} className="sm:w-48">
          <option value="all">All actions</option>
          {(Object.keys(ACTIONS) as AuditAction[]).map((key) => (
            <option key={key} value={key}>
              {ACTIONS[key].label}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by client" value={clientId} onChange={(e) => setClientId(e.target.value)} className="sm:w-64">
          <option value="all">All clients</option>
          {state.clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </FilterBar>

      <Card>
        <div className="flex items-center gap-2 px-4 pt-4 pb-2 text-[13.5px] text-ink-2 sm:px-5">
          <ShieldCheck size={15} className="shrink-0 text-ink-3" aria-hidden />
          <span>
            The log is append-only: entries can't be edited or removed, and only a demo reset clears it. <span className="num">{state.audit.length}</span> events recorded.
          </span>
        </div>
        {paged.rows.length ? (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="data-table min-w-[900px]">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Client</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {paged.rows.map((event) => {
                  const meta = ACTIONS[event.action]
                  return (
                    <tr key={event.id}>
                      <td className="whitespace-nowrap text-ink-2">{fmtDateTime(event.at)}</td>
                      <td className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          <Avatar name={event.actor} size="sm" />
                          <span className="text-ink">{event.actor}</span>
                        </span>
                      </td>
                      <td>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </td>
                      <td className="max-w-44 truncate text-ink-2">{event.clientId ? clientById(state, event.clientId)?.name : '—'}</td>
                      <td className="min-w-72 text-ink">
                        {event.detail}
                        {event.docId && (
                          <>
                            {' '}
                            <Link to={`/review/${event.docId}`} className="whitespace-nowrap font-medium text-brand-ink hover:underline">
                              View document
                            </Link>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : state.audit.length ? (
          <EmptyState compact icon={Search} title="No events match" body="Try a different search or filter." />
        ) : (
          <EmptyState icon={ScrollText} title="No events yet" />
        )}
        <Pager {...paged} />
      </Card>
    </div>
  )
}
