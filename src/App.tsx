import { Suspense, lazy } from 'react'
import { Link, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Layout } from './components/Layout'
import { EmptyState, PageSkeleton, buttonClass } from './components/ui'
import { useAppState } from './lib/store'
import type { Role } from './lib/types'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Clients = lazy(() => import('./pages/Clients'))
const ClientDetail = lazy(() => import('./pages/ClientDetail'))
const ReviewList = lazy(() => import('./pages/ReviewList'))
const ReviewDetail = lazy(() => import('./pages/ReviewDetail'))
const Ledger = lazy(() => import('./pages/Ledger'))
const Reconciliation = lazy(() => import('./pages/Reconciliation'))
const Reports = lazy(() => import('./pages/Reports'))
const ReportPrint = lazy(() => import('./pages/ReportPrint'))
const Audit = lazy(() => import('./pages/Audit'))
const Portal = lazy(() => import('./pages/Portal'))
const PortalDoc = lazy(() => import('./pages/PortalDoc'))
const PortalMessages = lazy(() => import('./pages/PortalMessages'))

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
