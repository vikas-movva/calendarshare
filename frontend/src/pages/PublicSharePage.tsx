import { useParams } from 'react-router-dom'
import { useState } from 'react'
import { usePublicShare } from '../hooks/queries'
import type { PublicEvent } from '../types/api'
import { CalendarSmall, EyeSmall, ListSmall, CalendarGridSmall, XSmall } from '../components/Icons'
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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function minutesOfDay(iso: string): number {
  const d = new Date(iso)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

function layoutDay(events: PublicEvent[]) {
  const timed = events.filter((e) => !e.is_all_day)
  if (timed.length === 0) return [] as { ev: PublicEvent; top: number; height: number; lane: number; totalLanes: number }[]
  const startMin = Math.min(...timed.map((e) => minutesOfDay(e.start_time)))
  const endMin = Math.max(...timed.map((e) => minutesOfDay(e.end_time)))
  const windowMin = Math.max(endMin - startMin, 30)
  const sorted = [...timed].sort((a, b) => minutesOfDay(a.start_time) - minutesOfDay(b.start_time))
  const laneEnd: number[] = []
  const out: { ev: PublicEvent; top: number; height: number; lane: number; totalLanes: number }[] = []
  for (const ev of sorted) {
    const s = minutesOfDay(ev.start_time)
    const en = minutesOfDay(ev.end_time)
    let lane = laneEnd.findIndex((end) => end <= s)
    if (lane === -1) {
      lane = laneEnd.length
      laneEnd.push(en)
    } else {
      laneEnd[lane] = en
    }
    const top = (s - startMin) / windowMin
    const height = Math.max((en - s) / windowMin, 0.05)
    out.push({ ev, top, height, lane, totalLanes: laneEnd.length })
  }
  return out
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
  const [selected, setSelected] = useState<PublicEvent | null>(null)

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
            <div key="calendar" className="grid grid-cols-7 gap-px overflow-hidden bg-border text-xs">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="bg-surface px-2 py-1.5 text-center text-xs font-medium text-content-faint">
                  {d}
                </div>
              ))}
              {days.map((day) => {
                const key = dayKey(day)
                const dayEvents = data.events.filter((ev) => sameDay(new Date(ev.start_time), day))
                const allDay = dayEvents.filter((ev) => ev.is_all_day)
                const positioned = layoutDay(dayEvents)
                return (
                  <div key={key} className="aspect-square min-h-0 bg-surface p-1.5">
                    <div className="flex h-full flex-col">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-content-muted">{day.getDate()}</span>
                      </div>
                      <div className="mt-1 flex-1 overflow-hidden">
                        {allDay.length > 0 && (
                          <div className="space-y-1">
                            {allDay.slice(0, 2).map((ev, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => setSelected(ev)}
                                className="w-full truncate rounded-md bg-accent/10 px-1 py-0.5 text-[10px] text-accent hover:bg-accent/25"
                                title="All day"
                              >
                                All day{ev.title ? ` · ${ev.title}` : ''}
                              </button>
                            ))}
                            {allDay.length > 2 && (
                              <button
                                type="button"
                                onClick={() => setSelected(allDay[0])}
                                className="px-1 text-[10px] text-content-faint hover:text-content"
                              >
                                +{allDay.length - 2} more
                              </button>
                            )}
                          </div>
                        )}
                        {positioned.length > 0 && (
                          <div className="relative flex-1">
                            {positioned.map((p, i) => {
                              const widthPct = 100 / p.totalLanes
                              const leftPct = p.lane * widthPct
                              return (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => setSelected(p.ev)}
                                  className="absolute overflow-hidden truncate rounded-md bg-accent/10 px-1 py-0.5 text-[10px] leading-tight text-accent hover:bg-accent/25"
                                  style={{
                                    top: `${p.top * 100}%`,
                                    height: `${p.height * 100}%`,
                                    left: `${leftPct}%`,
                                    width: `calc(${widthPct}% - 4px)`,
                                  }}
                                  title={`${formatTime(p.ev.start_time)} – ${formatTime(p.ev.end_time)}${p.ev.title ? ` · ${p.ev.title}` : ''}`}
                                >
                                  {formatTime(p.ev.start_time)}
                                  {p.ev.title ? ` · ${p.ev.title}` : ''}
                                </button>
                              )
                            })}
                          </div>
                        )}
                        {dayEvents.length > positioned.length + allDay.length && (
                          <button
                            type="button"
                            onClick={() => setSelected(dayEvents[0])}
                            className="mt-1 px-1 text-[10px] text-content-faint hover:text-content"
                          >
                            +{dayEvents.length - positioned.length - allDay.length} more
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {selected && (
            <motion.div
              key="backdrop"
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelected(null)}
            >
              <motion.div
                className="card w-full max-w-sm overflow-hidden"
                initial={{ opacity: 0, scale: 0.96, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 16 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <span className="text-xs text-content-faint">
                    {formatEventTime(selected.start_time, selected.is_all_day)} –{' '}
                    {formatEventTime(selected.end_time, selected.is_all_day)}
                  </span>
                  <button
                    onClick={() => setSelected(null)}
                    className="grid h-7 w-7 place-items-center rounded-lg text-content-muted hover:bg-card"
                    aria-label="Close"
                  >
                    <XSmall />
                  </button>
                </div>
                <div className="p-4">
                  <p className="font-semibold text-content">{selected.title || '(busy)'}</p>
                  {selected.location && (
                    <p className="mt-2 text-sm text-content-muted">📍 {selected.location}</p>
                  )}
                  {selected.description && (
                    <p className="mt-2 text-sm text-content-muted">{selected.description}</p>
                  )}
                  {!selected.title && !selected.location && !selected.description && (
                    <p className="mt-2 text-sm text-content-faint">No details shared.</p>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}