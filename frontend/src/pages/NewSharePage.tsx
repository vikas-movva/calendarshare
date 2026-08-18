import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMe, useCalendars, useCreateShare, useCreatePoll } from '../hooks/queries'
import { CalendarSmall, CopySmall, ArrowLeftSmall, PollSmall } from '../components/Icons'
import { motion } from 'framer-motion'
import { fadeUp, stagger } from '../theme/anim'

const VISIBILITY_OPTIONS = [
  { value: 'busy', label: 'Busy / Free', description: 'Only start and end times' },
  { value: 'title_time', label: 'Title + Time', description: 'Event title plus start and end' },
  { value: 'details', label: 'Details', description: 'Title, time, location, and description' },
] as const

const EXPIRATION_OPTIONS = [
  { value: '1h', label: '1 hour', ms: 60 * 60 * 1000 },
  { value: '1d', label: '1 day', ms: 24 * 60 * 60 * 1000 },
  { value: '7d', label: '7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { value: 'never', label: 'Never', ms: null },
] as const

// Parse "YYYY-MM-DD" directly into a UTC Date. Avoid new Date(dateStr)
// plus local-time getters: date-only strings parse as UTC midnight, but
// .getDate()/.getMonth() run in local time and shift the day backward for
// timezones behind UTC (e.g. US).
function startOfDayUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0))
}

function endOfDayUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59))
}

export default function NewSharePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { data: user, isLoading: meLoading } = useMe()
  const { data: calendars } = useCalendars()
  const createShare = useCreateShare()
  const createPoll = useCreatePoll()

  const calendarsList = useMemo(() => calendars?.calendars || [], [calendars])
  const [calendarId, setCalendarId] = useState<string>('')

  // Pre-select the calendar passed from the dashboard (?calendar=<id>).
  useEffect(() => {
    const fromQuery = searchParams.get('calendar')
    if (fromQuery && calendarsList.some((c) => c.id === fromQuery)) {
      setCalendarId(fromQuery)
    }
  }, [searchParams, calendarsList])

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [visibility, setVisibility] = useState<'busy' | 'title_time' | 'details'>('title_time')
  const [expiration, setExpiration] = useState('7d')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ url: string; id: string } | null>(null)
  const [pollTitle, setPollTitle] = useState('')
  const [creatingPoll, setCreatingPoll] = useState(false)
  const [pollError, setPollError] = useState<string | null>(null)
  const [pollSuccess, setPollSuccess] = useState(false)

  if (!meLoading && !user) {
    window.location.href = '/auth/login'
    return null
  }

  const selectedCalendar = calendarsList.find((c) => c.id === calendarId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!calendarId) { setError('Please select a calendar.'); return }
    if (!startDate || !endDate) { setError('Please choose a date range.'); return }

    const start = startOfDayUTC(startDate)
    const end = endOfDayUTC(endDate)
    if (start >= end) { setError('End date must be after start date.'); return }

    const exp = EXPIRATION_OPTIONS.find((o) => o.value === expiration)
    const expires_at = exp && exp.ms ? new Date(Date.now() + exp.ms).toISOString() : null

    try {
      const res = await createShare.mutateAsync({
        calendar_id: calendarId,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        visibility,
        expires_at,
        timezone: selectedCalendar?.timezone || undefined,
      })
      setResult({ url: res.url, id: res.id })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create share.')
    }
  }

  const handleCreatePoll = async () => {
    if (!result) return
    setPollError(null)
    setCreatingPoll(true)
    try {
      await createPoll.mutateAsync({ shareId: result.id, title: pollTitle.trim() || null })
      setPollSuccess(true)
      setPollTitle('')
    } catch (err) {
      setPollError(err instanceof Error ? err.message : 'Could not create poll.')
    } finally {
      setCreatingPoll(false)
    }
  }

  if (result) {
    return (
      <div className="mx-auto max-w-xl">
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border bg-accent/5 px-5 py-4">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent/10 text-accent">
              <CalendarSmall />
            </span>
            <div>
              <h2 className="font-semibold text-content">Your share is ready</h2>
              <p className="text-xs text-content-faint">Recipients can open it without signing in.</p>
            </div>
          </div>
          <div className="p-5">
            <p className="mb-1 section-title">Share link</p>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-alt/60 p-3">
              <span className="min-w-0 flex-1 break-all text-sm font-medium text-content">{result.url}</span>
              <button
                onClick={() => navigator.clipboard.writeText(result.url)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-on-accent hover:bg-accent-hover"
                title="Copy link"
              >
                <CopySmall />
              </button>
            </div>

            <div className="mt-5 rounded-lg border border-border bg-surface-alt/40 p-4">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/10 text-accent">
                  <PollSmall />
                </span>
                <div>
                  <p className="text-sm font-semibold text-content">Add a poll</p>
                  <p className="text-xs text-content-faint">Friends vote on the free times we compute.</p>
                </div>
              </div>
              {pollSuccess ? (
                <p className="mt-3 text-sm text-green-400">Poll created!</p>
              ) : (
                <>
                  <input
                    value={pollTitle}
                    onChange={(e) => setPollTitle(e.target.value)}
                    placeholder="e.g. Lunch this week? (optional)"
                    className="mt-3 block w-full rounded-lg border border-border bg-field px-3 py-2 text-sm text-content focus:border-accent focus:ring-3 focus:ring-accent/20 focus:outline-none"
                  />
                  {pollError && (
                    <p className="mt-2 text-sm text-red-400">{pollError}</p>
                  )}
                  <button
                    onClick={handleCreatePoll}
                    disabled={creatingPoll}
                    className="btn-primary mt-3 w-full"
                  >
                    {creatingPoll ? 'Creating…' : 'Create poll'}
                  </button>
                </>
              )}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <a href={result.url} target="_blank" rel="noreferrer" className="btn-primary">Open share</a>
              <button onClick={() => navigate('/shares')} className="btn-ghost">
                <ArrowLeftSmall />
                Back to shares
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-5 flex items-center gap-3">
        <Link to="/shares" className="grid h-9 w-9 place-items-center rounded-lg border border-border text-content-muted hover:bg-card">
          <ArrowLeftSmall />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-content">Create share</h1>
          <p className="text-content-muted">Choose what to share and who can see it.</p>
        </div>
      </div>

      <motion.form
        onSubmit={handleSubmit}
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="card p-5 sm:p-6"
      >
        <div className="space-y-6">
          <motion.div variants={fadeUp}>
            <label className="section-title">Step 1 · Calendar</label>
            <select
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
              className="mt-2 block w-full rounded-lg border border-border bg-field px-3 py-2.5 text-sm text-content focus:border-accent focus:ring-3 focus:ring-accent/20 focus:outline-none"
            >
              <option value="">Select a calendar…</option>
              {calendarsList.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-content-faint">
              Logged-in users can add their own calendars to the same date range later — the free times are recomputed from the merged busy schedule.
            </p>
          </motion.div>

          <motion.div variants={fadeUp}>
            <label className="section-title">Step 2 · Date range</label>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-content-faint">From</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-border bg-field px-3 py-2.5 text-sm text-content focus:border-accent focus:ring-3 focus:ring-accent/20 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-content-faint">To</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-border bg-field px-3 py-2.5 text-sm text-content focus:border-accent focus:ring-3 focus:ring-accent/20 focus:outline-none"
                />
              </div>
            </div>
          </motion.div>

          <motion.div variants={fadeUp}>
            <label className="section-title">Step 3 · What should people see?</label>
            <div className="mt-2 space-y-2">
              {VISIBILITY_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                    visibility === opt.value
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:bg-card'
                  }`}
                >
                  <input
                    type="radio"
                    name="visibility"
                    value={opt.value}
                    checked={visibility === opt.value}
                    onChange={() => setVisibility(opt.value)}
                    className="mt-0.5 h-4 w-4 accent-accent"
                  />
                  <span>
                    <span className="block text-sm font-medium text-content">{opt.label}</span>
                    <span className="block text-xs text-content-muted">{opt.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </motion.div>

          <motion.div variants={fadeUp}>
            <label className="section-title">Step 4 · Link expires</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {EXPIRATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setExpiration(opt.value)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    expiration === opt.value
                      ? 'bg-accent text-on-accent'
                      : 'border border-border text-content-muted hover:bg-card'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </motion.div>

          {error && (
            <motion.div variants={fadeUp} className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </motion.div>
          )}

          <motion.button
            type="submit"
            disabled={createShare.isPending}
            variants={fadeUp}
            className="btn-primary w-full"
          >
            {createShare.isPending ? 'Creating…' : 'Create share'}
          </motion.button>
        </div>
      </motion.form>
    </div>
  )
}