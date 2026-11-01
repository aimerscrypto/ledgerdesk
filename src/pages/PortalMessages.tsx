import { Link } from 'react-router-dom'
import { ChevronRight, MessagesSquare } from 'lucide-react'
import { docFields, threadsFor } from '../lib/selectors'
import { useAppState } from '../lib/store'
import { timeAgo } from '../lib/format'
import { Avatar, Badge, Card, EmptyState, LinkButton, PageHeader, StatusBadge, cx } from '../components/ui'

export default function PortalMessages() {
  const state = useAppState()
  const threads = threadsFor(state, 'client', state.session.clientId)

  return (
    <div>
      <PageHeader title="Messages" description="Every conversation with your accountant, attached to the document it's about." />
      <Card>
        {threads.length ? (
          <ul className="divide-y divide-line">
            {threads.map(({ doc, last, count, unread }) => (
              <li key={doc.id}>
                <Link to={`/portal/doc/${doc.id}`} className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2 sm:px-5">
                  <Avatar name={last.author} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className={cx('min-w-0 truncate text-ink', unread ? 'font-semibold' : 'font-medium')}>{docFields(doc)?.vendor || doc.filename}</p>
                      <StatusBadge status={doc.status} />
                      {unread > 0 && <Badge tone="brand">{unread} new</Badge>}
                    </div>
                    <p className={cx('mt-0.5 line-clamp-2 text-[13px]', unread ? 'text-ink' : 'text-ink-2')}>
                      <span className="font-medium">{last.author}:</span> {last.body}
                    </p>
                    <p className="mt-1 text-xs text-ink-3">
                      {timeAgo(last.at)} · {count} {count === 1 ? 'message' : 'messages'}
                    </p>
                  </div>
                  <ChevronRight size={16} className="mt-1 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={MessagesSquare}
            title="No conversations yet"
            body="When you or your accountant ask a question about a document, it shows up here."
            action={
              <LinkButton to="/portal" variant="primary">
                Go to documents
              </LinkButton>
            }
          />
        )}
      </Card>
    </div>
  )
}
