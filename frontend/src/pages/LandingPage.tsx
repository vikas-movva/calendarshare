import { Link } from 'react-router-dom'
import { useMe } from '../hooks/queries'
import { CalendarSmall } from '../components/Icons'
import { motion, useReducedMotion } from 'framer-motion'

export default function LandingPage() {
  const { data: user } = useMe()
  const reduced = useReducedMotion()

  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-grid opacity-60" aria-hidden="true" />
      <div className="section-aurora" aria-hidden="true" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="text-center lg:text-left">
            <span className="eyebrow inline-block text-accent mb-4">Share your schedule, safely</span>
            <h1 className="display mt-4 text-content">
              Share your calendar,{' '}
              <span className="text-gradient">on your terms</span>
            </h1>
            <p className="mt-5 text-lg text-content-muted max-w-xl mx-auto lg:mx-0 leading-relaxed">
              Pick a calendar, choose a timeframe, decide exactly what people can see,
              and generate a secure link — without giving anyone access to your account.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-3">
              {user ? (
                <Link to="/dashboard" className="px-6 py-3 rounded-xl bg-accent text-on-accent font-semibold text-sm hover:bg-accent-hover transition-colors">
                  Go to dashboard
                </Link>
              ) : (
                <button onClick={() => (window.location.href = '/auth/login')} className="px-6 py-3 rounded-xl bg-accent text-on-accent font-semibold text-sm hover:bg-accent-hover transition-colors">
                  Sign in with Google
                </button>
              )}
              <a href="/how" className="px-6 py-3 rounded-xl bg-transparent border-2 border-accent/50 text-accent font-semibold text-sm hover:bg-accent/10 transition-colors">
                How it works
              </a>
            </div>

            <div className="mt-8 flex flex-wrap justify-center lg:justify-start gap-2.5">
              {['Google Calendar', 'Read-only access', 'Encrypted tokens', 'Auto-expiring'].map((tech) => (
                <span key={tech} className="px-4 py-2 rounded-lg bg-card border border-border text-content-soft text-sm font-medium">
                  {tech}
                </span>
              ))}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative mx-auto w-full max-w-md"
          >
            <div className="relative rounded-2xl border border-border bg-card/60 backdrop-blur-xl p-5 shadow-2xl">
              <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-accent/15 to-transparent blur-md -z-10 opacity-60" aria-hidden="true" />
              <div
                className="flex items-center gap-2.5 border-b border-border pb-3"
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent/10 text-accent">
                  <CalendarSmall />
                </span>
                <div>
                  <p className="text-sm font-semibold text-content">Personal · Aug 21 – Aug 24</p>
                  <p className="text-xs text-content-faint">Title + time visible</p>
                </div>
                <motion.span
                  animate={reduced ? undefined : { opacity: [0.4, 1, 0.4] }}
                  transition={reduced ? undefined : { duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  className="ml-auto chip chip-green"
                >
                  Active
                </motion.span>
              </div>
              <div className="divide-y divide-border">
                {[
                  ['Team standup', '9:00 – 9:30', 'accent'],
                  ['Dinner with Maya', '19:30 – 21:00', 'amber-500'],
                  ['Flight YVR → YYZ', '14:00 – 17:30', 'emerald-500'],
                ].map(([title, time, color], i) => (
                  <motion.div
                    key={title}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.45, delay: 0.5 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                    className="flex items-center gap-3 py-2.5"
                  >
                    <motion.span
                      className={`h-2 w-2 rounded-full bg-${color}`}
                      animate={reduced ? undefined : { scale: [1, 1.4, 1] }}
                      transition={reduced ? undefined : { duration: 2, repeat: Infinity, ease: 'easeInOut', delay: i === 0 ? 0 : i * 0.25 }}
                    />
                    <span className="text-sm text-content">{title}</span>
                    <span className="ml-auto text-xs text-content-faint">{time}</span>
                  </motion.div>
                ))}
              </div>
              <div className="mt-3 rounded-lg bg-surface-alt/60 px-3 py-2 text-center">
                <p className="text-xs text-content-faint">calendershare.onrender.com/s/a1b2c3d4e5f6</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}