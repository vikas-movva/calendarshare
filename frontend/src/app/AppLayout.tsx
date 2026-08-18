import { Link, Outlet, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useMe } from '../hooks/queries'
import { useTheme } from '../theme/ThemeContext'
import ThemeControls from '../components/ThemeControls'
import { CalendarSmall } from '../components/Icons'

function PageTransition() {
  const location = useLocation()

  const direction = location.state?.direction || 1
  const variants = {
    initial: { opacity: 0, x: 48 },
    animate: { opacity: 1, x: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
  }

  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={location.pathname}
        variants={variants}
        initial="initial"
        animate="animate"
        className="min-h-[calc(100vh-120px)]"
      >
        <Outlet />
      </motion.div>
    </AnimatePresence>
  )
}

export default function AppLayout() {
  const { mode } = useTheme()
  const { data: user } = useMe()
  const loc = useLocation()
  const isDashboard = loc.pathname === '/dashboard'

  return (
    <div className="min-h-screen bg-surface text-content">
      <header className="sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-surface/80 border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-amber-400 text-on-accent shadow-sm">
              <CalendarSmall />
            </span>
            <span className="text-lg font-bold tracking-tight">CalendarShare</span>
          </Link>
          <nav className="flex items-center gap-1">
            {user ? (
              <>
                <Link
                  to="/dashboard"
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    isDashboard ? 'bg-accent/10 text-accent' : 'text-content-muted hover:bg-card'
                  }`}
                >
                  Dashboard
                </Link>
                <Link
                  to="/shares"
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-content-muted hover:bg-card"
                >
                  Shares
                </Link>
                <div className="ml-2 flex items-center gap-2">
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="h-8 w-8 rounded-full ring-2 ring-surface" />
                  ) : (
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-accent/10 text-accent text-xs font-bold">
                      {(user.display_name || user.email || '?').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <button
                    onClick={() => (window.location.href = '/auth/logout')}
                    className="hidden text-sm font-medium text-content-muted hover:text-content sm:inline"
                  >
                    Sign out
                  </button>
                </div>
              </>
            ) : (
              <button onClick={() => (window.location.href = '/auth/login')} className="px-4 py-2 rounded-xl bg-accent text-on-accent font-semibold text-sm hover:bg-accent-hover transition-colors">
                Sign in
              </button>
            )}
            <div className="ml-2 hidden sm:flex">
              <ThemeControls />
            </div>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <PageTransition />
      </main>
      <footer className="mx-auto max-w-7xl px-4 pb-10 pt-2 text-center text-xs text-content-faint sm:px-6">
        Your shared link shows only the events you selected — never your full calendar.
      </footer>
    </div>
  )
}