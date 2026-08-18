import { useShares, useRevokeShare } from '../hooks/queries'
import { CopySmall, TrashSmall, EyeSmall } from '../components/Icons'
import { motion } from 'framer-motion'
import { fadeUp, stagger, slideRight } from '../theme/anim'

export default function SharesPage() {
  const { data, isLoading } = useShares()
  const revoke = useRevokeShare()
  const shares = data?.shares || []

  async function handleCopy(s: { id: string }) {
    try {
      await navigator.clipboard.writeText(window.location.origin + '/s/' + s.id)
    } catch {
      // ignore
    }
  }

  async function handleRevoke(s: { id: string }) {
    if (!confirm('Revoke this share? The link will stop working immediately.')) return
    try {
      await revoke.mutateAsync(s.id)
    } catch {
      // error handled by query cache
    }
  }

  return (
    <div className="max-w-3xl">
      <motion.div variants={stagger} initial="hidden" animate="visible" className="mb-6 flex items-center justify-between">
        <div>
          <motion.h1 variants={fadeUp} className="text-2xl font-bold tracking-tight text-content">Your shares</motion.h1>
          <motion.p variants={fadeUp} className="text-content-muted">Manage and revoke links you have created.</motion.p>
        </div>
        <a href="/shares/new" className="btn-primary">New share</a>
      </motion.div>

      {isLoading ? (
        <div className="card p-8 text-center text-content-muted">Loading…</div>
      ) : shares.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-accent/10 text-accent">
            <EyeSmall />
          </div>
          <p className="font-medium text-content">No shares yet</p>
          <p className="mt-1 text-sm text-content-muted">
            Create your first share to send a slice of your calendar.
          </p>
          <a href="/shares/new" className="btn-primary mt-4 inline-flex">Create share</a>
        </div>
      ) : (
        <motion.ul variants={stagger} initial="hidden" animate="visible" className="space-y-3">
          {shares.map((s) => {
            const status = s.revoked_at ? 'revoked' : isExpired(s) ? 'expired' : 'active'
            return (
              <motion.li key={s.id} variants={slideRight} className="card overflow-hidden">
                <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent/10 text-accent">
                    <CalendarMini />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-content">
                      {new Date(s.start_time).toLocaleDateString([], { month: 'short', day: 'numeric' })} –{' '}
                      {new Date(s.end_time).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-xs text-content-faint">
                      {visibilityLabel(s.visibility)} · {s.timezone}
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <span className={`chip chip-${status === 'active' ? 'green' : status === 'expired' ? 'amber' : 'red'}`}>
                      {status}
                    </span>
                    {s.expires_at && status === 'active' && (
                      <span className="hidden text-xs text-content-faint sm:inline">
                        expires {new Date(s.expires_at).toLocaleDateString()}
                      </span>
                    )}
                    <button
                      onClick={() => handleCopy(s)}
                      title="Copy link"
                      className="grid h-8 w-8 place-items-center rounded-lg border border-border text-content-muted hover:bg-card"
                    >
                      <CopySmall />
                    </button>
                    <button
                      onClick={() => handleRevoke(s)}
                      disabled={revoke.isPending}
                      title="Revoke"
                      className="grid h-8 w-8 place-items-center rounded-lg border border-border text-content-muted hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                    >
                      <TrashSmall />
                    </button>
                  </div>
                </div>
              </motion.li>
            )
          })}
        </motion.ul>
      )}
    </div>
  )
}

function CalendarMini() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function visibilityLabel(v: 'busy' | 'title_time' | 'details') {
  if (v === 'busy') return 'Busy / Free'
  if (v === 'title_time') return 'Title + Time'
  return 'Details'
}

function isExpired(s: { expires_at: string | null }) {
  if (!s.expires_at) return false
  return new Date(s.expires_at).getTime() <= Date.now()
}