import { useParams } from 'react-router-dom'
import { useState } from 'react'
import { usePublicShare } from '../hooks/queries'
import { CalendarSmall, EyeSmall, ListSmall, CalendarGridSmall } from '../components/Icons'
import { motion, AnimatePresence } from 'framer-motion'
import { stagger, slideRight } from '../theme/anim'

type View = 'list' | 'calendar'

function formatEventTime(iso: string, isAllDay?: boolean): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  if (isAllDay) return date
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return `${date} · ${time}`
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function buildCalendarDays(start: Date, end: Date) {
  const days: Date[] = []
  const cursor = startOfDay(start)
  const last = startOfDay(end)
  while (cursor <= last) {
    days.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

function ViewToggle({ view, setView }: { view: View; setView: (v: View) => void }) {
  return (
    <div className="flex rounded-lg border border-border bg-surface-alt/60 p-0.5">
      <button
        type="button"
        onClick={() => setView('list')}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          view === 'list' ? 'bg-card text-content shadow-sm' : 'text-content-muted hover:text-content'
        }`}
        aria-pressed={view === 'list'}
      >
        <ListSmall />
        List
      </button>
      <button
        type="button"
        onClick={() => setView('calendar')}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          view === 'calendar' ? 'bg-card text-content shadow-sm' : 'text-content-muted hover:text-content'
        }`}
        aria-pressed={view === 'calendar'}
      >
        <CalendarGridSmall />
        Calendar
      </button>
    </div>
  )
}

export default function PublicSharePage() {
  const { token = '' } = useParams()
  const { data, isLoading, error } = usePublicShare(token)
  const [view, setView] = useState<View>('list')

  if (isLoading) {
    return <div className="card p-8 text-center text-content-muted">Loading…</div>
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-card text-content-faint">
          <EyeSmall />
        </div>
        <h1 className="text-xl font-bold text-content">Share not available</h1>
        <p className="mt-2 text-content-muted">
          This link may have expired or been revoked.
        </p>
      </div>
    )
  }

  const days = buildCalendarDays(new Date(data.range.start), new Date(data.range.end))

  return (
    <div className="mx-auto max-w-2xl">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="card overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-border bg-accent/5 px-5 py-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/10 text-accent">
            <CalendarSmall />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-content">
              {data.owner.display_name || "Calendar"}'s schedule
            </h2>
            <p className="text-xs text-content-faint">
              {new Date(data.range.start).toLocaleDateString([], { month: 'long', day: 'numeric' })} –{' '}
              {new Date(data.range.end).toLocaleDateString([], { month: 'long', day: 'numeric' })}{' '}
              · {data.timezone}
            </p>
          </div>
          <div className="shrink-0">
            <ViewToggle view={view} setView={setView} />
          </div>
        </div>

        <AnimatePresence mode="wait">
          {view === 'list' ? (
            <motion.div
              key="list"
              variants={stagger}
              initial="hidden"
              animate="visible"
              className="divide-y divide-border"
            >
              {data.events.map((ev, i) => (
                <motion.div key={i} variants={slideRight} className="flex gap-3 px-5 py-3.5">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-content">{ev.title || '(busy)'}</p>
                      <span className="shrink-0 text-xs text-content-faint">
                        {formatEventTime(ev.start_time, ev.is_all_day)} – {formatEventTime(ev.end_time, ev.is_all_day)}
                      </span>
                    </div>
                    {ev.location && (
                      <p className="mt-1 text-sm text-content-muted">📍 {ev.location}</p>
                    )}
                    {ev.description && (
                      <p className="mt-1 text-sm text-content-muted">{ev.description}</p>
                    )}
                  </div>
                </motion.div>
              ))}
              {data.events.length === 0 && (
                <p className="px-5 py-8 text-center text-content-muted">No events in this timeframe.</p>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="calendar"
              variants={stagger}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-7 gap-px overflow-hidden bg-border text-xs"
            >
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="bg-surface px-2 py-1.5 text-center text-xs font-medium text-content-faint">
                  {d}
                </div>
              ))}
              {days.map((day) => {
                const key = dayKey(day)
                const dayEvents = data.events.filter((ev) => sameDay(new Date(ev.start_time), day))
                return (
                  <motion.div
                    key={key}
                    variants={slideRight}
                    className="min-h-[96px] bg-surface p-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-content-muted">{day.getDate()}</span>
                    </div>
                    <div className="mt-1 space-y-1">
                      {dayEvents.slice(0, 3).map((ev, i) => (
                        <div
                          key={i}
                          className="truncate rounded-md bg-accent/10 px-1.5 py-0.5 text-[11px] text-accent"
                          title={formatEventTime(ev.start_time, ev.is_all_day)}
                        >
                          {ev.is_all_day ? 'All day' : new Date(ev.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          {ev.title ? ` · ${ev.title}` : ''}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="px-1.5 text-[11px] text-content-faint">+{dayEvents.length - 3} more</div>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}