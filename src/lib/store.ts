import { useSyncExternalStore } from 'react'
import type { AppState } from './types'
import { buildState, STATE_VERSION } from './seed'
import { isoDate, periodOf } from './format'

const STATE_KEY = 'ledgerdesk:state:v1'
const PREVIEW_PREFIX = 'ledgerdesk:preview:'

const currentClosePeriod = () => {
  const now = new Date()
  return periodOf(isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)))
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(STATE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as AppState
      // Seed data is relative to today, so it is rebuilt when a new month rolls over.
      if (parsed.version === STATE_VERSION && parsed.closePeriod === currentClosePeriod()) return parsed
    }
  } catch {
    // Unreadable or blocked storage: fall through to fresh demo data.
  }
  return buildState()
}

let state = load()
let persistTimer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

function persist() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state))
  } catch {
    // Quota hit: free preview images and retry once. The demo keeps working in memory either way.
    evictPreviews()
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state))
    } catch {
      /* still in memory */
    }
  }
}

function schedulePersist() {
  clearTimeout(persistTimer)
  persistTimer = setTimeout(persist, 120)
}

persist()

export const getState = () => state

export function setState(updater: (current: AppState) => AppState) {
  state = updater(state)
  schedulePersist()
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState)
}

export function resetState() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREVIEW_PREFIX) || key === STATE_KEY) localStorage.removeItem(key)
    }
  } catch {
    /* storage blocked */
  }
  state = buildState()
  persist()
  listeners.forEach((listener) => listener())
}

// Uploaded previews are stored apart from app state so saving a status change never rewrites images.
const memoryPreviews = new Map<string, string>()

function evictPreviews() {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(PREVIEW_PREFIX))
    for (const key of keys.slice(0, Math.ceil(keys.length / 2))) localStorage.removeItem(key)
  } catch {
    /* storage blocked */
  }
}

export function savePreview(docId: string, dataUrl: string) {
  memoryPreviews.set(docId, dataUrl)
  const key = PREVIEW_PREFIX + docId
  try {
    localStorage.setItem(key, dataUrl)
  } catch {
    evictPreviews()
    try {
      localStorage.setItem(key, dataUrl)
    } catch {
      /* kept in memory for this session */
    }
  }
}

export function getPreview(docId: string): string | null {
  const cached = memoryPreviews.get(docId)
  if (cached) return cached
  try {
    return localStorage.getItem(PREVIEW_PREFIX + docId)
  } catch {
    return null
  }
}
