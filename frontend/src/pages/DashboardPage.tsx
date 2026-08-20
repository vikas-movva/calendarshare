import { motion } from 'framer-motion'
import { useMe, useCalendars, useShares } from '../hooks/queries'
import { CalendarSmall, UsersSmall, ClockSmall, PlusSmall, ShareSmall } from '../components/Icons'
import { fadeUp, stagger } from '../theme/anim'

export default function DashboardPage() {
  const { data: user } = useMe()
  const { data: calendars, error: calendarsError, isLoading: calLoading } = useCalendars()
  const { data: shares, isLoading: sharesLoading } = useShares()

  const activeShares = (shares?.shares || []).filter((s) => !s.revoked_at)
  const expiringSoon = (shares?.shares || []).filter(
    (s) =>
      !s.revoked_at &&
      s.expires_at &&
      new Date(s.expires_at).getTime() - Date.now() < 2 * 24 * 3600 * 1000
  ).length

  return (
    <div className="max-w-5xl">
      <motion.div variants={stagger} initial="hidden" animate="visible" className="mb-8">
        <motion.h1 variants={fadeUp} className="text-3xl font-bold tracking-tight text-content">
          Welcome{user?.display_name ? `, ${user.display_name}` : ''}
        </motion.h1>
        <motion.p variants={fadeUp} className="text-content-muted">Manage your calendar shares.</motion.p>
      </motion.div>

      <motion.div variants={stagger} initial="hidden" animate="visible" className="grid gap-4 sm:grid-cols-3">
        <Stat icon={<CalendarSmall />} label="Connected calendars" value={calendars?.calendars.length ?? 0} loading={calLoading} />
        <Stat icon={<UsersSmall />} label="Active shares" value={activeShares.length} loading={sharesLoading} />
        <Stat icon={<ClockSmall />} label="Shares expiring soon" value={expiringSoon} loading={sharesLoading} />
      </motion.div>

      <motion.div variants={stagger} initial="hidden" animate="visible" className="card mt-6 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-content">Your calendars</h2>
            <p className="text-sm text-content-muted">Pick one to share next.</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {calendarsError ? (
            <div className="w-full rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-300">
              <p>Your session is active, but Google Calendar is not connected.</p>
              <a href="/auth/login" className="mt-2 inline-block font-semibold underline underline-offset-2 hover:text-amber-200">
                Reconnect Google Calendar
              </a>
            </div>
          ) : calLoading ? (
            <p className="text-sm text-content-muted">Loading…</p>
          ) : (calendars?.calendars || []).length === 0 ? (
            <p className="text-sm text-content-muted">No calendars connected yet.</p>
          ) : (
            (calendars?.calendars || []).map((c) => (
              <button
                key={c.id}
                onClick={() => (window.location.href = `/shares/new?calendar=${c.id}`)}
                className="px-3 py-1.5 rounded-lg bg-card border border-border text-sm text-content-soft hover:border-accent/60 hover:text-accent transition-colors"
              >
                {c.name}
              </button>
            ))
          )}
        </div>
      </motion.div>

      <motion.div variants={stagger} initial="hidden" animate="visible" className="mt-6 flex flex-wrap items-center gap-3">
        <a href="/shares/new" className="btn-primary">
          <PlusSmall />
          Create share
        </a>
        <a href="/shares" className="btn-ghost md:w-auto w-full">
          <ShareSmall />
          View all shares
        </a>
      </motion.div>
    </div>
  )
}

function Stat({ icon, label, value, loading }: { icon: React.ReactNode; label: string; value: number; loading: boolean }) {
  return (
    <motion.div variants={fadeUp} className="card flex items-center gap-4 p-5">
      <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent/10 text-accent">
        {icon}
      </div>
      <div>
        <p className="text-sm text-content-muted">{label}</p>
        <p className="text-2xl font-bold text-content">{loading ? '—' : value}</p>
      </div>
    </motion.div>
  )
}