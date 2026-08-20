import { useParams, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useListPolls, useCreatePoll, useVoteSlot, useUnvoteSlot, useMe } from '../hooks/queries'
import { PollSmall, ArrowLeftSmall, CheckSmall, UsersSmall, ClockSmall, PlusSmall } from '../components/Icons'
import { motion, AnimatePresence } from 'framer-motion'
import { stagger, slideRight } from '../theme/anim'

const VOTER_KEY = 'calshare.voter'

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function PollsPage() {
  const { shareId = '' } = useParams()
  const { data, isLoading, error } = useListPolls(shareId)
  const { data: me } = useMe()
  const createPoll = useCreatePoll()
  const voteSlot = useVoteSlot()
  const unvoteSlot = useUnvoteSlot()

  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [voter, setVoter] = useState<{ email: string; displayName: string } | null>(null)
  const [showVoter, setShowVoter] = useState(false)
  const [voterEmail, setVoterEmail] = useState('')
  const [voterName, setVoterName] = useState('')
  const [expandedSlot, setExpandedSlot] = useState<string | null>(null)

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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(VOTER_KEY)
      if (raw) setVoter(JSON.parse(raw))
    } catch {
      // ignore
    }
  }, [])

  function saveVoter(email: string, displayName: string) {
    const v = { email, displayName }
    setVoter(v)
    try {
      localStorage.setItem(VOTER_KEY, JSON.stringify(v))
    } catch {
      // ignore
    }
  }

  async function handleCreatePoll(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setCreating(true)
    setCreateError(null)
    try {
      await createPoll.mutateAsync({ shareId, title: title.trim() })
      setTitle('')
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create poll.')
    } finally {
      setCreating(false)
    }
  }

  async function handleVote(slotId: string) {
    if (!voter) {
      setShowVoter(true)
      return
    }
    try {
      await voteSlot.mutateAsync({ slotId, email: voter.email, displayName: voter.displayName || null })
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not vote.')
    }
  }

  async function handleUnvote(slotId: string) {
    if (!voter) return
    try {
      await unvoteSlot.mutateAsync({ slotId, email: voter.email })
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not remove vote.')
    }
  }

  function handleConfirmVoter() {
    if (!voterEmail.trim()) return
    saveVoter(voterEmail.trim(), voterName.trim())
    setShowVoter(false)
  }

  if (isLoading) {
    return <div className="card p-8 text-center text-content-muted">Loading…</div>
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-card text-content-faint">
          <PollSmall />
        </div>
        <h1 className="text-xl font-bold text-content">Polls not available</h1>
        <p className="mt-2 text-content-muted">
          This share may not exist or have any polls yet.
        </p>
        <Link to="/shares" className="btn-primary mt-4 inline-flex">
          <ArrowLeftSmall /> Back to shares
        </Link>
      </div>
    )
  }

  const polls = data.polls || []

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-center gap-3">
        <Link to="/shares" className="grid h-9 w-9 place-items-center rounded-lg border border-border text-content-muted hover:bg-card">
          <ArrowLeftSmall />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-content">Polls</h1>
          <p className="text-content-muted">Vote on proposed times for this share.</p>
        </div>
      </div>

      <motion.form
        onSubmit={handleCreatePoll}
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="card mb-6 overflow-hidden p-5"
      >
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/10 text-accent">
            <PlusSmall />
          </span>
          <div>
            <p className="text-sm font-semibold text-content">Add a poll</p>
            <p className="text-xs text-content-faint">Propose free times for people to vote on.</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Lunch this week? (optional)"
            className="block flex-1 rounded-lg border border-border bg-field px-3 py-2 text-sm text-content focus:border-accent focus:ring-3 focus:ring-accent/20 focus:outline-none"
          />
          <button type="submit" disabled={creating || !title.trim()} className="btn-primary auto px-4">
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
        {createError && (
          <p className="mt-2 text-sm text-red-400">{createError}</p>
        )}
      </motion.form>

      {polls.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-accent/10 text-accent">
            <PollSmall />
          </div>
          <p className="font-medium text-content">No polls yet</p>
          <p className="mt-1 text-sm text-content-muted">
            Create the first poll above to start gathering votes.
          </p>
        </div>
      ) : (
        // Scrollable so long date ranges extend down the page instead of
        // pushing past the viewport.
        <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-1">
          <AnimatePresence>
            {polls.map((poll) => {
              const maxVotes = Math.max(...poll.slots.map((s) => s.votes.length), 0)
              const totalVotes = poll.slots.reduce((n, s) => n + s.votes.length, 0)
              const sortedSlots = [...poll.slots].sort(
                (a, b) => b.votes.length - a.votes.length || new Date(a.start).getTime() - new Date(b.start).getTime(),
              )
              return (
                <motion.div
                  key={poll.id}
                  variants={slideRight}
                  layout
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
                    {sortedSlots.map((slot) => {
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
                                {fmtDate(slot.start)} · {fmtTime(slot.start)} – {fmtTime(slot.end)}
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
      )}

      <AnimatePresence>
        {showVoter && (
          <motion.div
            key="voter-backdrop"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowVoter(false)}
          >
            <motion.div
              className="card w-full max-w-sm overflow-hidden p-5"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
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
                <button onClick={() => setShowVoter(false)} className="btn-ghost flex-1">
                  Cancel
                </button>
                <button onClick={handleConfirmVoter} disabled={!voterEmail.trim()} className="btn-primary flex-1">
                  Continue
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}