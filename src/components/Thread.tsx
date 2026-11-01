import { useEffect, useRef, useState } from 'react'
import { MessagesSquare, Send } from 'lucide-react'
import type { Role } from '../lib/types'
import { markThreadRead, sendMessage } from '../lib/actions'
import { useAppState } from '../lib/store'
import { threadFor } from '../lib/selectors'
import { fmtDateTime } from '../lib/format'
import { Avatar, Button, EmptyState, cx } from './ui'

/** The per-document conversation that replaces email. Same component on both sides of the portal. */
export function Thread({ docId, viewer }: { docId: string; viewer: Role }) {
  const state = useAppState()
  const messages = threadFor(state, docId)
  const [draft, setDraft] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const count = messages.length

  useEffect(() => {
    markThreadRead(docId, viewer)
    const box = end.current?.parentElement
    if (box) box.scrollTop = box.scrollHeight
  }, [docId, viewer, count])

  const submit = () => {
    const body = draft.trim()
    if (!body) return
    sendMessage(docId, body)
    setDraft('')
  }

  return (
    <div>
      {count === 0 ? (
        <EmptyState compact icon={MessagesSquare} title="No messages yet" body={viewer === 'client' ? 'Questions about this document go here, so nothing gets lost in email.' : 'Ask the client about this document here. It stays attached to the record.'} />
      ) : (
        <div className="scrollbar-thin max-h-80 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
          {messages.map((m) => {
            const own = m.role === viewer
            return (
              <div key={m.id} className={cx('flex gap-2', own && 'flex-row-reverse')}>
                <Avatar name={m.author} size="sm" />
                <div className={cx('max-w-[82%] min-w-0', own && 'text-right')}>
                  <p className="mb-0.5 text-xs text-ink-3">
                    <span className="font-medium text-ink-2">{m.author}</span> · {fmtDateTime(m.at)}
                  </p>
                  <p className={cx('inline-block rounded-xl px-3 py-2 text-left break-words whitespace-pre-wrap', own ? 'bg-brand-soft text-ink' : 'bg-surface-2 text-ink')}>{m.body}</p>
                </div>
              </div>
            )
          })}
          <div ref={end} />
        </div>
      )}
      <form
        className="flex items-end gap-2 border-t border-line p-3 sm:px-5"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <textarea
          rows={1}
          value={draft}
          aria-label="Write a message"
          placeholder="Write a message"
          className="field-input min-h-9"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <Button type="submit" variant="primary" icon={Send} disabled={!draft.trim()}>
          Send
        </Button>
      </form>
    </div>
  )
}
