import { Link, Outlet, useLocation } from 'react-router-dom'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { useMe } from '../hooks/queries'
import ThemeControls from '../components/ThemeControls'
import { Logo } from '../components/Logo'
import { LogOutSmall, LogInSmall, ShareSmall, GithubSmall, TwitterSmall, LinkedInSmall, CalendarGridSmall} from '../components/Icons'
import { useState } from 'react'
import { EASE_SNAPPY } from '../theme/anim'

function PageTransition() {
  const location = useLocation()

  const variants: Variants = {
    enter: { opacity: 0, y: 8 },
    center: { opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE_SNAPPY } },
    exit: { opacity: 0, y: -6, transition: { duration: 0.12, ease: 'easeIn' } },
  }

  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.div
        key={location.pathname}
        variants={variants}
        initial="enter"
        animate="center"
        className="min-h-[calc(100vh-120px)]"
      >
        <Outlet />
      </motion.div>
    </AnimatePresence>
  )
}

function ProfileMenu() {
  const [open, setOpen] = useState(false)
  const { data: user } = useMe()
  const initials = (user?.display_name || user?.email || '?').slice(0, 1).toUpperCase()

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex items-center gap-2 rounded-xl ring-2 ring-surface"
        aria-label="Profile menu"
      >
        {user?.avatar_url ? (
          <img src={user.avatar_url} alt="" className="h-8 w-8 rounded-full" />
        ) : (
          <div className="grid h-8 w-8 place-items-center rounded-full bg-accent/10 text-accent text-xs font-bold">
            {initials}
          </div>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-52 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card shadow-lg"
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-semibold text-content">
              {user?.display_name || user?.email}
            </p>
            {user?.display_name && (
              <p className="truncate text-xs text-content-faint">{user.email}</p>
            )}
          </div>
          <Link
            to="/shares"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm text-content-muted transition-colors hover:bg-card hover:text-content"
          >
            <ShareSmall />
            Shares
          </Link>
          <button
            onClick={() => (window.location.href = '/auth/logout')}
            className="flex w-full items-center gap-2 rounded-lg px-4 py-2.5 text-sm text-red-400 transition-colors hover:bg-card hover:text-red-300"
          >
            <LogOutSmall color="#f87171" />
            Log out
          </button>
        </div>
      )}
    </div>
  )
}

export default function AppLayout() {
  const { data: user } = useMe()
  const loc = useLocation()
  const isDashboard = loc.pathname === '/dashboard'

  return (
    <div className="min-h-screen bg-surface text-content">
      <header className="sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-surface/80 border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
<Link to="/" className="flex min-w-0 items-center gap-2">
            <Logo className="h-9 w-9 shrink-0" />
            <span className="hidden text-lg font-bold tracking-tight sm:inline">CalendarShare</span>
          </Link>
          <nav className="flex min-w-0 items-center gap-1">
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
                <ProfileMenu />
              </>
            ) : (
              <button
                onClick={() => (window.location.href = '/auth/login')}
                className="flex items-center gap-2 rounded-xl bg-accent px-3 py-2 text-on-accent font-semibold text-sm hover:bg-accent-hover transition-colors sm:px-4"
              >
                <LogInSmall />
                <span className="hidden sm:inline">Sign in</span>
              </button>
            )}
            <div className="ml-2 flex sm:ml-3">
              <ThemeControls variant="mobile" />
            </div>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <PageTransition />
      </main>
      <footer className="mx-auto max-w-7xl px-4 pb-10 pt-2 text-center text-xs text-content-faint sm:px-6">
        <p>Your shared link shows only the events you selected — never your full calendar.</p>
        <p className="mt-1.5">
          <span className="text-content-soft">React · Tailwind</span>
          {' · '}
          <span className="text-content-soft">Axum · Tokio</span>
          {' · '}
          <span className="text-content-soft">PostgreSQL</span>
        </p>
        <p className="mt-1.5">
          Built with ♥ by{' '}
          <a href="https://vikas-movva.github.io/portfolio" target="_blank" rel="noopener" className="text-content-soft hover:text-accent transition-colors">
            Vikas Movva
          </a>
        </p>

        <p className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
          <a
            href="https://github.com/vikas-movva/calendarshare"
            target="_blank"
            rel="noopener"
            aria-label="GitHub repository"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-content-soft transition-colors hover:bg-card hover:text-accent"
          >
            <CalendarGridSmall />
          </a>
          <a
            href="https://github.com/vikas-movva"
            target="_blank"
            rel="noopener"
            aria-label="GitHub profile"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-content-soft transition-colors hover:bg-card hover:text-accent"
          >
            <GithubSmall />
          </a>
          <a
            href="https://twitter.com/vikasmovva"
            target="_blank"
            rel="noopener"
            aria-label="Twitter"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-content-soft transition-colors hover:bg-card hover:text-accent"
          >
            <TwitterSmall />
          </a>
          <a
            href="https://linkedin.com/in/vikas-movva"
            target="_blank"
            rel="noopener"
            aria-label="LinkedIn"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-content-soft transition-colors hover:bg-card hover:text-accent"
          >
            <LinkedInSmall />
          </a>
        </p>

        <p className="mt-1.5 flex items-center justify-center gap-1.5">
          © {new Date().getFullYear()} Vikas Movva
        </p>
      </footer>
    </div>
  )
}