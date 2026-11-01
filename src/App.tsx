import { Suspense, lazy, useEffect, type ComponentType } from 'react'
import { Link, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Layout } from './components/Layout'
import { EmptyState, PageSkeleton, buttonClass } from './components/ui'
import { useAppState } from './lib/store'
import type { Role } from './lib/types'
// The review queue is the app's main path and renders from local data, so it ships in the entry bundle.
import ReviewDetail from './pages/ReviewDetail'
import ReviewList from './pages/ReviewList'

const pageLoaders: Array<() => Promise<unknown>> = []

function page(load: () => Promise<{ default: ComponentType }>) {
  pageLoaders.push(load)
  return lazy(load)
}

const Dashboard = page(() => import('./pages/Dashboard'))
const Clients = page(() => import('./pages/Clients'))
const ClientDetail = page(() => import('./pages/ClientDetail'))
const Ledger = page(() => import('./pages/Ledger'))
const Reconciliation = page(() => import('./pages/Reconciliation'))
const Reports = page(() => import('./pages/Reports'))
const ReportPrint = page(() => import('./pages/ReportPrint'))
const Audit = page(() => import('./pages/Audit'))
const Portal = page(() => import('./pages/Portal'))
const PortalDoc = page(() => import('./pages/PortalDoc'))
const PortalMessages = page(() => import('./pages/PortalMessages'))

/** Fetches the other pages once the browser is idle, so moving between them doesn't wait on the network. */
function usePreloadPages() {
  useEffect(() => {
    // A failed preload is harmless: the route retries the import when it's opened.
    const preload = () => pageLoaders.forEach((load) => void load().catch(() => {}))
    if ('requestIdleCallback' in window) {
      const handle = requestIdleCallback(preload)
      return () => cancelIdleCallback(handle)
    }
    const handle = setTimeout(preload, 1000)
    return () => clearTimeout(handle)
  }, [])
}

const homeFor = (role: Role) => (role === 'client' ? '/portal' : '/dashboard')

function Home() {
  const { session } = useAppState()
  return <Navigate to={homeFor(session.role)} replace />
}

/** The demo has no real auth, but each view still keeps to its own side of the portal. */
function RequireRole({ role }: { role: Role }) {
  const { session } = useAppState()
  if (session.role !== role) return <Navigate to={homeFor(session.role)} replace />
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Outlet />
    </Suspense>
  )
}

function NotFound() {
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      body="That address doesn't match anything in LedgerDesk."
      action={
        <Link to="/" className={buttonClass('primary')}>
          Back to home
        </Link>
      }
    />
  )
}

export function App() {
  usePreloadPages()
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route element={<RequireRole role="accountant" />}>
        <Route path="/reports/print" element={<ReportPrint />} />
      </Route>
      <Route element={<Layout />}>
        <Route element={<RequireRole role="accountant" />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/clients/:id" element={<ClientDetail />} />
          <Route path="/review" element={<ReviewList />} />
          <Route path="/review/:docId" element={<ReviewDetail />} />
          <Route path="/ledger" element={<Ledger />} />
          <Route path="/reconciliation" element={<Reconciliation />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/audit" element={<Audit />} />
        </Route>
        <Route element={<RequireRole role="client" />}>
          <Route path="/portal" element={<Portal />} />
          <Route path="/portal/doc/:id" element={<PortalDoc />} />
          <Route path="/messages" element={<PortalMessages />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
