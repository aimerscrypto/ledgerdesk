import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight,
  BarChart3,
  BookOpenText,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Info,
  LayoutDashboard,
  Menu,
  MessagesSquare,
  Moon,
  RotateCcw,
  ScrollText,
  Sun,
  X,
  XCircle,
} from 'lucide-react'
import { currentActor, resetDemo, switchSession } from '../lib/actions'
import { useAppState } from '../lib/store'
import { isOpenLine, reviewQueue, unreadCount } from '../lib/selectors'
import { FIRM } from '../lib/seed'
import { dismissToast, toast, useToasts } from '../lib/toast'
import { Avatar, Button, ClientPicker, IconButton, Modal, Segmented, cx } from './ui'
import type { Role } from '../lib/types'

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <img src="/favicon.svg" alt="" className="size-[26px] rounded-[7px]" />
      <span className="font-display text-[25px] leading-none text-ink">LedgerDesk</span>
    </span>
  )
}

function useNavItems() {
  const state = useAppState()
  if (state.session.role === 'client') {
    return [
      { to: '/portal', label: 'My documents', icon: FileText, end: false, count: 0 },
      { to: '/messages', label: 'Messages', icon: MessagesSquare, end: false, count: unreadCount(state, 'client', state.session.clientId) },
    ]
  }
  return [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: false, count: 0 },
    { to: '/clients', label: 'Clients', icon: Building2, end: false, count: 0 },
    { to: '/review', label: 'Review queue', icon: ClipboardCheck, end: false, count: reviewQueue(state).length },
    { to: '/ledger', label: 'Ledger', icon: BookOpenText, end: false, count: 0 },
    { to: '/reconciliation', label: 'Bank reconciliation', icon: ArrowLeftRight, end: false, count: state.bank.filter((t) => t.period === state.closePeriod && isOpenLine(t)).length },
    { to: '/reports', label: 'Month-end reports', icon: BarChart3, end: false, count: 0 },
    { to: '/audit', label: 'Audit log', icon: ScrollText, end: false, count: 0 },
  ]
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const items = useNavItems()
  const state = useAppState()
  const accountant = state.session.role === 'accountant'
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[72px] items-center px-5">
        <Link to="/" onClick={onNavigate} aria-label="LedgerDesk home">
          <Logo />
        </Link>
      </div>
      <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cx(
                'flex h-10 items-center gap-3 rounded-lg px-3 text-[14.5px] font-medium transition-colors duration-150',
                isActive ? 'bg-surface-3/70 text-ink [&_svg]:text-brand-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
              )
            }
          >
            <item.icon size={17} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.count > 0 && <span className="num text-[13px] font-medium text-ink-3">{item.count}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="flex items-center gap-3 px-5 py-5">
        <Avatar name={FIRM.name} />
        <div className="min-w-0 leading-snug">
          <p className="truncate text-[13px] font-semibold text-ink">{accountant ? FIRM.name : 'Secure client portal'}</p>
          <p className="truncate text-xs text-ink-3">{accountant ? 'George Town, Grand Cayman' : `Provided by ${FIRM.name}`}</p>
        </div>
      </div>
    </div>
  )
}

function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'light')
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem('ledgerdesk:theme', next)
    } catch {
      /* the choice just won't persist */
    }
    setTheme(next)
  }
  return { theme, toggle }
}

function Toaster() {
  const toasts = useToasts()
  const icons = { success: CheckCircle2, error: XCircle, info: Info }
  const colors = { success: 'text-good', error: 'text-bad', info: 'text-info' }
  return (
    <div aria-live="polite" className="no-print pointer-events-none fixed right-4 bottom-4 left-4 z-50 flex flex-col items-end gap-2 sm:left-auto sm:w-96">
      {toasts.map((t) => {
        const Icon = icons[t.kind]
        return (
          <div key={t.id} className="toast-enter pointer-events-auto flex w-full gap-2.5 rounded-xl bg-surface p-3.5 shadow-pop">
            <Icon size={18} className={cx('mt-0.5 shrink-0', colors[t.kind])} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-medium break-words text-ink">{t.title}</p>
              {t.body && <p className="mt-0.5 text-[13px] text-ink-2">{t.body}</p>}
            </div>
            <button type="button" aria-label="Dismiss" onClick={() => dismissToast(t.id)} className="-mt-0.5 -mr-0.5 size-6 shrink-0 rounded text-ink-3 hover:text-ink">
              <X size={14} className="mx-auto" aria-hidden />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export function Layout() {
  const state = useAppState()
  const navigate = useNavigate()
  const location = useLocation()
  const { theme, toggle } = useTheme()
  const [drawer, setDrawer] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const { role, clientId } = state.session
  const actor = currentActor(state)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  const changeRole = (next: Role) => {
    if (next === role) return
    switchSession(next)
    navigate(next === 'client' ? '/portal' : '/dashboard')
  }

  const changeClient = (id: string) => {
    switchSession('client', id)
    navigate('/portal')
  }

  return (
    <div className="min-h-dvh">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-canvas lg:block">
        <SidebarContent />
      </aside>

      {drawer && (
        <div className="no-print fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <div className="drawer-enter absolute inset-y-0 left-0 w-64 max-w-[80vw] bg-canvas shadow-pop">
            <SidebarContent onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="no-print sticky top-0 z-20 border-b border-line/70 bg-canvas/85 backdrop-blur-md">
          <div className="flex min-h-14 flex-wrap items-center gap-x-2 gap-y-2 px-3 py-2 sm:px-8">
            <IconButton label="Open menu" icon={Menu} onClick={() => setDrawer(true)} className="lg:hidden" />
            <span className="hidden text-xs font-medium text-ink-3 sm:inline">Demo view</span>
            <Segmented<Role>
              label="Demo role"
              value={role}
              onChange={changeRole}
              options={[
                { value: 'accountant', label: 'Accountant' },
                { value: 'client', label: 'Client' },
              ]}
            />
            <div className="ml-auto flex items-center gap-1 sm:order-last">
              <IconButton label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} icon={theme === 'dark' ? Sun : Moon} onClick={toggle} />
              <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => setConfirmReset(true)} aria-label="Reset demo data" className="max-sm:size-9 max-sm:px-0">
                <span className="hidden sm:inline">Reset demo data</span>
              </Button>
              <span className="ml-1 hidden items-center gap-2 border-l border-line pl-3 md:inline-flex">
                <Avatar name={actor.name} size="sm" />
                <span className="text-[13px] leading-tight">
                  <span className="block font-medium text-ink">{actor.name}</span>
                  <span className="block text-xs text-ink-3">{role === 'accountant' ? 'Accountant' : 'Client'}</span>
                </span>
              </span>
            </div>
            {role === 'client' && <ClientPicker clients={state.clients} value={clientId} onChange={changeClient} label="Client to view as" className="order-last max-sm:basis-full sm:order-none sm:ml-2" />}
          </div>
        </header>

        <main className="mx-auto max-w-[1320px] px-4 py-7 sm:px-8 sm:py-10">
          <div key={location.pathname} className="page-enter">
            <Outlet />
          </div>
        </main>
      </div>

      <Toaster />

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset demo data?"
        description="Every upload, approval, message and import made in this browser is removed, and the original demo data is restored. Your theme choice is kept."
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                setConfirmReset(false)
                resetDemo()
                navigate('/')
                toast.success('Demo data reset')
              }}
            >
              Reset demo data
            </Button>
          </>
        }
      />
    </div>
  )
}
