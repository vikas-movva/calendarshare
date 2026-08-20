import { useMe, useShares, useRevokeShare } from '../hooks/queries'
import { CopySmall, TrashSmall, EyeSmall, CheckSmall, PollSmall } from '../components/Icons'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp, stagger, slideRight, EASE_SNAPPY } from '../theme/anim'
import { useState, useEffect, useCallback, useRef } from 'react'

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

function CopyButton({
  s,
  status,
  onCopied,
  onError,
}: {
  s: { token?: string | null }
  status: 'active' | 'expired' | 'revoked'
  onCopied: () => void
  onError: () => void
}) {
  const [feedback, setFeedback] = useState<'idle' | 'success' | 'error'>('idle')
  const feedbackTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current)
    }
  }, [])

  function showFeedback(next: 'success' | 'error') {
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current)
    setFeedback(next)
    feedbackTimer.current = window.setTimeout(() => {
      setFeedback('idle')
      feedbackTimer.current = null
    }, 1800)
  }

  const disabled = status !== 'active'
  const unavailable = !s.token || disabled
  const tooltip = unavailable
    ? status === 'revoked'
      ? 'Link revoked'
      : status === 'expired'
      ? 'Link expired'
      : 'Link unavailable'
    : 'Copy link'

  async function handleCopy() {
    if (!s.token || disabled) {
      showFeedback('error')
      onError()
      return
    }
    try {
      await navigator.clipboard.writeText(window.location.origin + '/s/' + s.token)
      showFeedback('success')
      onCopied()
    } catch {
      showFeedback('error')
      onError()
    }
  }

  const copied = feedback === 'success'
  const failed = feedback === 'error'

  return (
    <div className="flex items-center gap-1.5">
      <motion.button
        onClick={handleCopy}
        title={tooltip}
  aria-label={tooltip}
        whileHover={{ scale: disabled ? 1 : 1.06 }}
        whileTap={{ scale: disabled ? 1 : 0.82 }}
        transition={{ type: 'spring', stiffness: 700, damping: 40, mass: 0.55 }}
        className={`relative grid h-8 w-8 place-items-center overflow-hidden rounded-lg border border-border text-content-muted hover:bg-card ${
          unavailable ? 'cursor-not-allowed opacity-50 hover:bg-transparent' : ''
        } ${failed ? 'border-red-500/40 text-red-400' : ''}`}
      >
        <AnimatePresence initial={false} mode="wait">
          {copied ? (
            <motion.span
              key="check"
              className="absolute inset-0 grid place-items-center rounded-lg bg-green-500/15 text-green-400"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ duration: 0.14, ease: EASE_SNAPPY }}
            >
              <CheckSmall />
            </motion.span>
          ) : failed ? (
            <motion.span
              key="warn"
              className="absolute inset-0 grid place-items-center text-red-400"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ duration: 0.14, ease: EASE_SNAPPY }}
              title="Copy unavailable"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </motion.span>
          ) : (
            <motion.span
              key="copy"
              className="absolute inset-0 grid place-items-center"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ duration: 0.14, ease: EASE_SNAPPY }}
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
            transition={{ duration: 0.14, ease: EASE_SNAPPY }}
            className="text-xs font-medium text-green-400"
          >
            Copied!
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
  // Revoked shares are dead: their links no longer work, so they are hidden
  // from this screen entirely rather than shown as disabled rows.
  const shares = sortShares((data?.shares || []).filter((s) => !s.revoked_at))

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
      <motion.div variants={stagger} initial="hidden" animate="visible" className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <motion.h1 variants={fadeUp} className="text-2xl font-bold tracking-tight text-content">Your shares</motion.h1>
          <motion.p variants={fadeUp} className="text-content-muted">Manage and revoke links you have created.</motion.p>
        </div>
        <a href="/shares/new" className="btn-primary auto">New share</a>
      </motion.div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.18, ease: EASE_SNAPPY }}
            className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4 pb-6"
          >
            <div
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm shadow-lg shadow-black/40 ${
                toast.kind === 'err'
                  ? 'border border-red-500/40 bg-red-500/15 text-red-300'
                  : 'border border-green-500/40 bg-green-500/15 text-green-300'
              }`}
            >
              {toast.kind === 'ok' ? <CheckSmall /> : null}
              {toast.text}
            </div>
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
                  <Link to={`/s/${s.token}`} className="group" title="Open share">
                    <p className="text-sm font-semibold text-content group-hover:text-accent">
                      {new Date(s.start_time).toLocaleDateString([], { month: 'short', day: 'numeric' })} –{' '}
                      {new Date(s.end_time).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-xs text-content-faint">
                      {visibilityLabel(s.visibility)} · {s.timezone}
                    </p>
                  </Link>
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
                    <Link
                      to={`/polls/${s.id}`}
                      title="Manage polls"
                      className="grid h-8 w-8 place-items-center rounded-lg border border-border text-content-muted hover:bg-accent/10 hover:text-accent"
                    >
                      <PollSmall />
                    </Link>
                    <CopyButton s={s} status={status} onCopied={() => showToast('Link copied!')} onError={() => showToast(status === 'revoked' ? 'Link has been revoked' : status === 'expired' ? 'Link has expired' : 'Could not copy link', 'err')} />
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

const STATUS_ORDER: Record<'active' | 'expired' | 'revoked', number> = {
  active: 0,
  expired: 1,
  revoked: 2,
}

function sortShares<T extends { start_time: string; revoked_at: string | null; expires_at: string | null }>(list: T[]) {
  return [...list].sort((a, b) => {
    const sa = a.revoked_at ? 'revoked' : isExpired(a) ? 'expired' : 'active'
    const sb = b.revoked_at ? 'revoked' : isExpired(b) ? 'expired' : 'active'
    const pa = STATUS_ORDER[sa]
    const pb = STATUS_ORDER[sb]
    if (pa !== pb) return pa - pb
    return new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  })
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