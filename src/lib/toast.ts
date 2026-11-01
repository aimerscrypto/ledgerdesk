import { useSyncExternalStore } from 'react'

export type ToastKind = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  kind: ToastKind
  title: string
  body?: string
}

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

function push(kind: ToastKind, title: string, body?: string) {
  const id = nextId++
  toasts = [...toasts.slice(-3), { id, kind, title, body }]
  emit()
  setTimeout(() => dismissToast(id), kind === 'error' ? 7000 : 4500)
}

export const toast = {
  success: (title: string, body?: string) => push('success', title, body),
  error: (title: string, body?: string) => push('error', title, body),
  info: (title: string, body?: string) => push('info', title, body),
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => toasts,
  )
}
