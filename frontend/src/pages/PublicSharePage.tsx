import { useParams } from 'react-router-dom'
import { usePublicShare } from '../hooks/queries'
import { CalendarSmall, EyeSmall } from '../components/Icons'
import { motion } from 'framer-motion'
import { stagger, slideRight } from '../theme/anim'

export default function PublicSharePage() {
  const { token = '' } = useParams()
  const { data, isLoading, error } = usePublicShare(token)

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

  return (
    <div className="mx-auto max-w-2xl">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="card overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-border bg-accent/5 px-5 py-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/10 text-accent">
            <CalendarSmall />
          </span>
          <div>
            <h2 className="font-semibold text-content">
              {data.owner.display_name || "Calendar"}'s schedule
            </h2>
            <p className="text-xs text-content-faint">
              {new Date(data.range.start).toLocaleDateString([], { month: 'long', day: 'numeric' })} –{' '}
              {new Date(data.range.end).toLocaleDateString([], { month: 'long', day: 'numeric' })}{' '}
              · {data.timezone}
            </p>
          </div>
        </div>

        <motion.div variants={stagger} initial="hidden" animate="visible" className="divide-y divide-border">
          {data.events.map((ev, i) => (
            <motion.div key={i} variants={slideRight} className="flex gap-3 px-5 py-3.5">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-content">{ev.title || '(busy)'}</p>
                  <span className="shrink-0 text-xs text-content-faint">
                    {new Date(ev.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} –{' '}
                    {new Date(ev.end_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
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
      </motion.div>
    </div>
  )
}