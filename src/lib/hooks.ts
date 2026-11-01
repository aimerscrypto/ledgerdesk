import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { switchSession } from './actions'
import { useAppState } from './store'

/**
 * The client an accountant page is looking at. Lives in the URL so views can be linked,
 * and in the session so moving between Ledger, Reconciliation and Reports keeps the client.
 */
export function useSelectedClient() {
  const state = useAppState()
  const [params, setParams] = useSearchParams()
  const client =
    state.clients.find((c) => c.id === params.get('client')) ??
    state.clients.find((c) => c.id === state.session.clientId) ??
    state.clients[0]

  const select = useCallback(
    (id: string) => {
      switchSession('accountant', id)
      setParams(
        (current) => {
          current.set('client', id)
          return current
        },
        { replace: true },
      )
    },
    [setParams],
  )
  return { client, select }
}

export function useSelectedPeriod(allowed: string[], fallback: string) {
  const [params, setParams] = useSearchParams()
  const requested = params.get('period')
  const period = requested && allowed.includes(requested) ? requested : fallback
  const select = useCallback(
    (next: string) => {
      setParams(
        (current) => {
          current.set('period', next)
          return current
        },
        { replace: true },
      )
    },
    [setParams],
  )
  return { period, select }
}
