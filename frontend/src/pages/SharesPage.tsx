import { useMe, useShares, useRevokeShare } from '../hooks/queries'
import { CopySmall, TrashSmall, EyeSmall, CheckSmall } from '../components/Icons'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp, stagger, slideRight } from '../theme/anim'
import { useState, useEffect, useCallback } from 'react'

const ONE_HOUR = 60 * 60 * 1000

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Expired'
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function lifespanMs(s: { created_at: string; expires_at: string | null }): number | null {
  if (!s.expires_at) return null
  return new Date(s.expires_at).getTime() - new Date(s.created_at).getTime()
}

function CopyButton({ s, onCopied, onError }: { s: { token?: string | null }; onCopied: () => void; onError: () => void }) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)

  async function handleCopy() {
    if (!s.token) {
      setFailed(true)
      onError()
      window.setTimeout(() => setFailed(false), 1800)
      return
    }
    try {
      await navigator.clipboard.writeText(window.location.origin + '/s/' + s.token)
      setCopied(true)
      onCopied()
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setFailed(true)
      onError()
      window.setTimeout(() => setFailed(false), 1800)
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <motion.button
        onClick={handleCopy}
        title={s.token ? 'Copy link' : 'Link unavailable'}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.8 }}
        transition={{ duration: 0.15 }}
        className={`relative grid h-8 w-8 place-items-center rounded-lg border border-border text-content-muted hover:bg-card ${
          failed ? 'border-red-500/40 text-red-400' : ''
        }`}
      >
        <AnimatePresence initial={false}>
          {copied ? (
            <motion.span
              key="check"
              className="grid h-8 w-8 place-items-center rounded-lg bg-green-500/15 text-green-400"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <CheckSmall />
            </motion.span>
          ) : failed ? (
            <motion.span
              key="warn"
              className="grid h-8 w-8 place-items-center text-red-400"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ duration: 0.2 }}
              title="Copy unavailable"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </motion.span>
          ) : (
            <motion.span
              key="copy"
              className="grid h-8 w-8 place-items-center"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <CopySmall />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
      <AnimatePresence>
        {copied && (
          <motion.span
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.2 }}
            className="text-xs font-medium text-green-400"
          >
            Copied!
          </motion.span>
        )}
        {failed && (
          <motion.span
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.2 }}
            className="text-xs font-medium text-red-400"
          >
            {s.token ? 'Copy failed' : 'Link unavailable'}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(() => new Date(expiresAt).getTime() - Date.now())

  useEffect(() => {
    const id = window.setInterval(() => {
      setRemaining(new Date(expiresAt).getTime() - Date.now())
    }, 1000)
    return () => window.clearInterval(id)
  }, [expiresAt])

  return (
    <span className={`text-xs font-medium ${remaining <= 5000 ? 'text-red-400' : 'text-amber-400'}`}>
      {formatCountdown(remaining)} left
    </span>
  )
}

export default function SharesPage() {
  const { data: user, isLoading: meLoading } = useMe()
  const { data, isLoading } = useShares()
  const revoke = useRevokeShare()
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null)
  const shares = data?.shares || []

  const showToast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ text: msg, kind })
    window.setTimeout(() => setToast(null), 1800)
  }, [])

  if (!meLoading && !user) {
    window.location.href = '/auth/login'
    return null
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

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className={`mb-4 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm ${
              toast.kind === 'err'
                ? 'border border-red-500/30 bg-red-500/10 text-red-400'
                : 'border border-green-500/30 bg-green-500/10 text-green-400'
            }`}
          >
            {toast.kind === 'ok' ? <CheckSmall /> : null}
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>

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
            const lifespan = lifespanMs(s)
            const shortLived = status === 'active' && lifespan !== null && lifespan < ONE_HOUR
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
                      shortLived ? (
                        <Countdown expiresAt={s.expires_at} />
                      ) : (
                        <span className="hidden text-xs text-content-faint sm:inline">
                          expires {new Date(s.expires_at).toLocaleDateString()}
                        </span>
                      )
                    )}
                    <CopyButton s={s} onCopied={() => showToast('Link copied!')} onError={() => showToast('Link unavailable — redeploy the backend', 'err')} />
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