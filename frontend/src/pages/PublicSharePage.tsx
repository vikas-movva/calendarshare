import { useParams } from 'react-router-dom'
import { useState, useEffect, useMemo } from 'react'
import { Calendar, dayStart } from '../components/react-modular-calendar'
import type { CalendarEvent as MCCalendarEvent } from '../components/react-modular-calendar'
import { usePublicShare, usePublicFreeSlots, useVoteSlot, useUnvoteSlot, useMe, useCalendars, useAddContributor } from '../hooks/queries'
import type { PublicEvent, PollSlot } from '../types/api'
import { CalendarSmall, EyeSmall, ListSmall, CalendarGridSmall, SunSmall, PollSmall, ClockSmall, UsersSmall, XSmall, CheckSmall, PlusSmall } from '../components/Icons'
import { motion, AnimatePresence } from 'framer-motion'
import { slideRight, popIn, EASE_SNAPPY, snapSpring } from '../theme/anim'
import { DateTime } from 'luxon'

type View = 'list' | 'calendar' | 'free'

const VOTER_KEY = 'calshare.voter'

function formatEventTime(iso: string, isAllDay?: boolean): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  if (isAllDay) return date
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return `${date} · ${time}`
}

function formatTime(iso: Date | string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatRange(start: string, end: string): string {
  return `${formatTime(start)} – ${formatTime(end)}`
}

/**
 * Convert a modular-calendar event back into the page's PublicEvent shape so
 * the existing event-detail modal can keep rendering unchanged.
 */
function toPublicEvent(ev: MCCalendarEvent): PublicEvent {
  return {
    title: ev.title || null,
    start_time: ev.start.toISOString(),
    end_time: ev.end.toISOString(),
    location: ev.location ?? null,
    description: ev.description ?? null,
    is_all_day: ev.isAllDay,
    owner_user_id: null,
    owner_display_name: null,
  }
}

function tzParts(d: Date, tz: string): { y: number; m: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d)
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  return { y: get("year"), m: get("month") - 1, day: get("day") }
}

function dayKeyInTz(iso: string, tz: string): string {
  const { y, m, day } = tzParts(new Date(iso), tz)
  const mm = `${m + 1}`.padStart(2, "0")
  const dd = `${day}`.padStart(2, "0")
  return `${y}-${mm}-${dd}`
}

function allDayBoundary(iso: string, timezone: string): Date {
  const date = DateTime.fromISO(iso, { zone: 'utc' }).toISODate()
  return date
    ? DateTime.fromISO(date, { zone: timezone }).startOf('day').toJSDate()
    : new Date(iso)
}

function dayLabel(iso: string, tz: string): string {
  return new Date(iso).toLocaleDateString([], { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' })
}

function groupSlotsByDay(slots: { start: string; end: string }[], tz: string) {
  const grouped = new Map<string, { start: string; end: string }[]>()
  for (const slot of slots) {
    const key = dayKeyInTz(slot.start, tz)
    const arr = grouped.get(key) ?? []
    arr.push(slot)
    grouped.set(key, arr)
  }
  return [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

// Group events by their calendar day in the share's timezone. Events are
// already ordered by start time from the backend, so each day's entries stay
// vertically sorted without an extra pass.
function groupEventsByDay(events: PublicEvent[], tz: string) {
  const grouped = new Map<string, PublicEvent[]>()
  for (const ev of events) {
    const key = dayKeyInTz(ev.start_time, tz)
    const arr = grouped.get(key) ?? []
    arr.push(ev)
    grouped.set(key, arr)
  }
  return [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

function ViewToggle({ view, setView }: { view: View; setView: (v: View) => void }) {
  return (
    <div className="relative flex rounded-lg border border-border bg-surface-alt/60 p-0.5">
      {([
        { key: 'list', label: 'List', icon: <ListSmall /> },
        { key: 'calendar', label: 'Calendar', icon: <CalendarGridSmall /> },
        { key: 'free', label: 'Free', icon: <SunSmall /> },
      ] as const).map((opt) => {
        const active = view === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => setView(opt.key)}
            className={`relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              active ? 'text-content' : 'text-content-muted hover:text-content'
            }`}
            aria-pressed={active}
          >
            {active && (
              <motion.span
                layoutId="view-pill"
                className="absolute inset-0 rounded-md bg-card shadow-sm"
                transition={{ type: 'spring', stiffness: 800, damping: 46, mass: 0.5 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              {opt.icon}
              {opt.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default function PublicSharePage() {
  const { token = '' } = useParams()
  const { data, isLoading, error } = usePublicShare(token)
  const { data: freeData, isLoading: freeLoading, error: freeError } = usePublicFreeSlots(token)
  const { data: me } = useMe()
  const voteSlot = useVoteSlot()
  const unvoteSlot = useUnvoteSlot()

  const [view, setView] = useState<View>('list')
  const [selected, setSelected] = useState<PublicEvent | null>(null)

  const [voter, setVoter] = useState<{ email: string; displayName: string } | null>(null)
  const [showVoter, setShowVoter] = useState(false)
  const [pendingSlot, setPendingSlot] = useState<string | null>(null)
  const [voterEmail, setVoterEmail] = useState('')
  const [voterName, setVoterName] = useState('')
  const [expandedSlot, setExpandedSlot] = useState<string | null>(null)

  const [showAddCalendar, setShowAddCalendar] = useState(false)
  const [selectedCalendarId, setSelectedCalendarId] = useState('')
  const [addCalendarError, setAddCalendarError] = useState<string | null>(null)
  const addContributor = useAddContributor()

  const { data: calendarsData } = useCalendars()
  const calendars = calendarsData?.calendars ?? []
  // A logged-in user can add one of their calendars to the share; the backend
  // rejects calendars the user doesn't own.
  const canAddCalendar = !!me && calendars.length > 0

  useEffect(() => {
    // A logged-in user is auto-identified from /api/me, so the sign-in
    // modal never appears for them and their email/name are pre-filled.
    if (me?.email) {
      const v = { email: me.email, displayName: me.display_name || '' }
      setVoter(v)
      try {
        localStorage.setItem(VOTER_KEY, JSON.stringify(v))
      } catch {
        // ignore
      }
      return
    }
    try {
      const raw = localStorage.getItem(VOTER_KEY)
      if (raw) setVoter(JSON.parse(raw))
    } catch {
      // ignore
    }
  }, [me?.email, me?.display_name])

  function saveVoter(email: string, displayName: string) {
    const v = { email, displayName }
    setVoter(v)
    try {
      localStorage.setItem(VOTER_KEY, JSON.stringify(v))
    } catch {
      // ignore
    }
  }

  async function handleVote(slotId: string) {
    if (!voter) {
      setPendingSlot(slotId)
      // Pre-fill the modal from any previously-stored voter so a returning
      // anonymous visitor doesn't have to retype.
      try {
        const raw = localStorage.getItem(VOTER_KEY)
        if (raw) {
          const stored = JSON.parse(raw) as { email: string; displayName: string }
          setVoterEmail(stored.email || '')
          setVoterName(stored.displayName || '')
        }
      } catch {
        // ignore
      }
      setShowVoter(true)
      return
    }
    try {
      await voteSlot.mutateAsync({ slotId, email: voter.email, displayName: voter.displayName || null })
    } catch (err) {
      // Surface errors via the mutation state if needed.
      console.error(err)
    }
  }

  async function handleUnvote(slotId: string) {
    if (!voter) return
    try {
      await unvoteSlot.mutateAsync({ slotId, email: voter.email })
    } catch (err) {
      console.error(err)
    }
  }

  function handleConfirmVoter() {
    if (!voterEmail.trim()) return
    const v = { email: voterEmail.trim(), displayName: voterName.trim() }
    saveVoter(v.email, v.displayName)
    setShowVoter(false)
    const slot = pendingSlot
    setPendingSlot(null)
    if (slot) {
      void voteSlot.mutateAsync({
        slotId: slot,
        email: v.email,
        displayName: v.displayName || null,
      })
    }
  }

  async function handleAddCalendar() {
    if (!selectedCalendarId) {
      setAddCalendarError('Please select a calendar.')
      return
    }
    setAddCalendarError(null)
    try {
      await addContributor.mutateAsync({ token, calendarId: selectedCalendarId })
      setSelectedCalendarId('')
      setShowAddCalendar(false)
    } catch (err) {
      setAddCalendarError(err instanceof Error ? err.message : 'Could not add calendar.')
    }
  }

  const calendarEvents = useMemo<MCCalendarEvent[]>(
    () =>
      (data?.events ?? []).map((ev) => ({
        id: `${ev.owner_user_id ?? 'share'}-${ev.start_time}`,
        calendarId: ev.owner_user_id ?? 'share',
        title: ev.title ?? '',
        start: ev.is_all_day ? allDayBoundary(ev.start_time, data?.timezone ?? 'UTC') : new Date(ev.start_time),
        end: ev.is_all_day ? allDayBoundary(ev.end_time, data?.timezone ?? 'UTC') : new Date(ev.end_time),
        isAllDay: ev.is_all_day,
        color: undefined,
        location: ev.location ?? undefined,
        description: ev.description ?? undefined,
      })),
    [data?.events],
  )

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

  const rangeStart = dayStart(new Date(data.range.start), data.timezone)
  const rangeEnd = dayStart(new Date(data.range.end), data.timezone)
  const freeSlots = freeData?.slots ?? []
  const polls = data.polls ?? []

  return (
    // Extra bottom padding keeps page content clear of the sticky footer
    // when long poll lists push past the viewport.
    <div className="mx-auto">
      <AnimatePresence>
        {selected && (
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: EASE_SNAPPY }}
            onClick={() => setSelected(null)}
          >
            <motion.div
              variants={popIn}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="card w-full max-w-sm overflow-hidden"
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
                {selected.owner_display_name && (
                  <span className="mt-1 text-xs text-content-faint">
                    {selected.owner_display_name}
                  </span>
                )}
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

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: EASE_SNAPPY }} className="card mb-6 p-5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-3 border-b border-border bg-accent/5 px-5 py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
            <CalendarSmall />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold text-content">
              {data.owner.display_name || "Calendar"}'s schedule
            </h2>
            <p className="truncate text-xs text-content-faint">
              {new Date(data.range.start).toLocaleDateString([], { month: 'long', day: 'numeric' })} –{' '}
              {new Date(data.range.end).toLocaleDateString([], { month: 'long', day: 'numeric' })}{' '}
              · {data.timezone}
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center justify-start gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
            {canAddCalendar && (
              <button
                onClick={() => setShowAddCalendar(true)}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-content-muted hover:bg-card hover:text-content"
                title="Add your calendar to this share"
              >
                <PlusSmall /> Add your calendar
              </button>
            )}
            <ViewToggle view={view} setView={setView} />
          </div>
        </div>

        <AnimatePresence mode="wait">
          {view === 'list' ? (
            <motion.div
              key="list"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: EASE_SNAPPY }}
              className="max-h-[60vh] overflow-y-auto divide-y divide-border"
            >
              {groupEventsByDay(data.events, data.timezone).map(([day, dayEvents]) => (
                <div key={day} className="px-5 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-content-faint">
                    {dayLabel(dayEvents[0].start_time, data.timezone)}
                  </p>
                  <ul className="mt-2 space-y-2.5">
                    {dayEvents.map((ev, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                            <p className="truncate font-medium text-content">{ev.title || '(busy)'}</p>
                            <span className="shrink-0 text-xs text-content-faint">
                              {formatEventTime(ev.start_time, ev.is_all_day)} – {formatEventTime(ev.end_time, ev.is_all_day)}
                            </span>
                          </div>
                          {ev.owner_display_name && (
                            <span className="mt-0.5 text-xs text-content-faint flex items-center gap-1">
                              <UsersSmall /> {ev.owner_display_name}
                            </span>
                          )}
                          {ev.location && (
                            <p className="truncate text-sm text-content-muted">📍 {ev.location}</p>
                          )}
                          {ev.description && (
                            <p className="truncate text-sm text-content-muted">{ev.description}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {data.events.length === 0 && (
                <p className="px-5 py-8 text-center text-content-muted">No events in this timeframe.</p>
              )}
            </motion.div>
) : view === 'calendar' ? (
            <motion.div
              key="calendar"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: EASE_SNAPPY }}
            >
            <Calendar
              events={calendarEvents}
              startDate={rangeStart}
              endDate={rangeEnd}
              timezone={data.timezone}
              slotMinutes={60}
              onEventClick={(ev) => setSelected(toPublicEvent(ev))}
              renderEvent={({ event, layout }) => {
                if (layout.kind === 'all-day') {
                  return (
                    <span className="chip chip-accent">
                      All day{event.title ? ` · ${event.title}` : ''}
                    </span>
                  )
                }
                return (
                  <span className="flex items-center gap-1 truncate">
                    <span className="text-content-faint">
                      {formatTime(event.start).slice(0, -2)}
                    </span>
                    {event.title && <span className="truncate">{event.title}</span>}
                  </span>
                )
              }}
            />
            </motion.div>
          ) : (
            <motion.div
              key="free"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: EASE_SNAPPY }}
              className="max-h-[60vh] overflow-y-auto divide-y divide-border"
            >
              {freeLoading && (
                <p className="px-5 py-8 text-center text-content-muted">Loading free times…</p>
              )}
              {freeError && (
                <p className="px-5 py-8 text-center text-content-muted">Could not load free times.</p>
              )}
              {!freeLoading && !freeError && freeSlots.length === 0 && (
                <p className="px-5 py-8 text-center text-content-muted">No free time in this timeframe.</p>
              )}
              {!freeLoading && !freeError && groupSlotsByDay(freeSlots, data.timezone).map(([key, slots]) => (
                <div key={key} className="px-5 py-3">
                  <p className="mb-1.5 text-xs font-medium text-content-faint">{dayLabel(slots[0].start, data.timezone)}</p>
                  <div className="flex flex-wrap gap-2">
                    {slots.map((slot, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-green-500/10 px-2.5 py-1.5 text-xs font-medium text-green-400"
                      >
                        <SunSmall />
                        {formatRange(slot.start, slot.end)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

{polls.length > 0 && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-2 px-1">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/10 text-accent">
              <PollSmall />
            </span>
            <h2 className="font-semibold text-content">Polls</h2>
          </div>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            <AnimatePresence>
              {polls.map((poll) => {
                const maxVotes = Math.max(...poll.slots.map((s: PollSlot) => s.votes.length), 0)
                const totalVotes = poll.slots.reduce((n, s: PollSlot) => n + s.votes.length, 0)
                const sortedSlots = [...poll.slots].sort(
                  (a, b) => b.votes.length - a.votes.length || new Date(a.start).getTime() - new Date(b.start).getTime(),
                )
                return (
                  <motion.div
                    key={poll.id}
                    variants={slideRight}
                    initial="hidden"
                    animate="visible"
                    className="card overflow-hidden"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-border bg-accent/5 px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/10 text-accent">
                          <PollSmall />
                        </span>
                        <div>
                          <p className="font-semibold text-content">{poll.title || 'Untitled poll'}</p>
                          <p className="text-xs text-content-faint">
                            {poll.slots.length} slot{poll.slots.length === 1 ? '' : 's'} · {totalVotes} vote{totalVotes === 1 ? '' : 's'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="divide-y divide-border overflow-y-auto max-h-[50vh]">
                      {sortedSlots.map((slot: PollSlot) => {
                        const voted = voter ? slot.votes.some((v) => v.email === voter.email) : false
                        const isWinner = slot.votes.length === maxVotes && maxVotes > 0
                        const expanded = expandedSlot === slot.id
                        return (
                          <div key={slot.id} className="flex flex-col">
                            <div
                              className="flex cursor-pointer items-center gap-3 px-5 py-3"
                              onClick={() => setExpandedSlot((prev) => (prev === slot.id ? null : slot.id))}
                            >
                              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-card text-accent">
                                <ClockSmall />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-content">
                                  {dayLabel(slot.start, data.timezone)} · {formatRange(slot.start, slot.end)}
                                </p>
                                <p className="text-xs text-content-faint">
                                  {slot.votes.length} vote{slot.votes.length === 1 ? '' : 's'}
                                  {isWinner && maxVotes > 0 && totalVotes > 0 ? ' · leading' : ''}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                {voter ? (
                                  voted ? (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleUnvote(slot.id) }}
                                      disabled={unvoteSlot.isPending}
                                      className="flex items-center gap-1.5 rounded-lg bg-green-500/15 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/25 disabled:opacity-50"
                                    >
                                      <CheckSmall /> Voted
                                    </button>
                                  ) : (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleVote(slot.id) }}
                                      disabled={voteSlot.isPending}
                                      className="btn-primary auto px-3 py-1.5 text-xs"
                                    >
                                      Vote
                                    </button>
                                  )
                                ) : (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setShowVoter(true) }}
                                    className="btn-primary auto px-3 py-1.5 text-xs"
                                  >
                                    Vote
                                  </button>
                                )}
                              </div>
                            </div>
                            {expanded && (
                              <div className="border-t border-border bg-surface-alt/40 px-8 py-2.5">
                                {slot.votes.length === 0 ? (
                                  <p className="text-xs text-content-faint">No votes yet.</p>
                                ) : (
                                  <div className="flex flex-wrap gap-1.5">
                                    {slot.votes.map((v) => (
                                      <span
                                        key={v.id}
                                        className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-xs text-content"
                                      >
                                        <span className="grid h-4 w-4 place-items-center rounded-full bg-accent/20 text-[10px] font-bold text-accent">
                                          {(v.display_name || v.email).slice(0, 1).toUpperCase()}
                                        </span>
                                        {v.display_name || v.email}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showVoter && (
          <motion.div
            key="voter-backdrop"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: EASE_SNAPPY }}
            onClick={() => setShowVoter(false)}
          >
            <motion.div
              variants={popIn}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="card w-full max-w-sm overflow-hidden p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent/10 text-accent">
                  <UsersSmall />
                </span>
                <div>
                  <p className="font-semibold text-content">Sign in to vote</p>
                  <p className="text-xs text-content-faint">Enter your email to identify your votes.</p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-xs text-content-faint">Email</label>
                  <input
                    type="email"
                    value={voterEmail}
                    onChange={(e) => setVoterEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="mt-1 block w-full rounded-lg border border-border bg-field px-3 py-2 text-sm text-content focus:border-accent focus:ring-3 focus:ring-accent/20 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-content-faint">Display name (optional)</label>
                  <input
                    value={voterName}
                    onChange={(e) => setVoterName(e.target.value)}
                    placeholder="Your name"
                    className="mt-1 block w-full rounded-lg border border-border bg-field px-3 py-2 text-sm text-content focus:border-accent focus:ring-3 focus:ring-accent/20 focus:outline-none"
                  />
                </div>
              </div>
              <div className="mt-5 flex gap-2">
                <button onClick={() => { setShowVoter(false); setPendingSlot(null) }} className="btn-ghost flex-1">
                  Cancel
                </button>
                <button onClick={handleConfirmVoter} disabled={!voterEmail.trim()} className="btn-primary flex-1">
                  Continue
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showAddCalendar && (
          <motion.div
            key="addcalendar-backdrop"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: EASE_SNAPPY }}
            onClick={() => { setShowAddCalendar(false); setAddCalendarError(null) }}
          >
            <motion.div
              variants={popIn}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="card w-full max-w-sm overflow-hidden p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent/10 text-accent">
                  <CalendarGridSmall />
                </span>
                <div>
                  <p className="font-semibold text-content">Add your calendar</p>
                  <p className="text-xs text-content-faint">Your events merge into this share's busy times.</p>
                </div>
              </div>
              <div className="mt-4">
                <label className="text-xs text-content-faint">Your calendar</label>
                <select
                  value={selectedCalendarId}
                  onChange={(e) => setSelectedCalendarId(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-border bg-field px-3 py-2 text-sm text-content focus:border-accent focus:ring-3 focus:ring-accent/20 focus:outline-none"
                >
                  <option value="">Select a calendar…</option>
                  {calendars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {calendars.length === 0 && (
                  <p className="mt-2 text-xs text-content-faint">
                    No calendars found. Connect your Google account to add one.
                  </p>
                )}
                {addCalendarError && (
                  <p className="mt-2 text-sm text-red-400">{addCalendarError}</p>
                )}
              </div>
              <div className="mt-5 flex gap-2">
                <button onClick={() => { setShowAddCalendar(false); setAddCalendarError(null) }} className="btn-ghost flex-1">
                  Cancel
                </button>
                <button onClick={handleAddCalendar} disabled={!selectedCalendarId || addContributor.isPending} className="btn-primary flex-1">
                  {addContributor.isPending ? 'Adding…' : 'Add'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
