import { Link } from 'react-router-dom'
import { useMe } from '../hooks/queries'
import { CalendarSmall, PlusSmall, ArrowLeftSmall } from '../components/Icons'

export default function LandingPage() {
  const { data: user } = useMe()

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

          <div className="relative mx-auto w-full max-w-md">
            <div className="relative rounded-2xl border border-border bg-card/60 backdrop-blur-xl p-5 shadow-2xl">
              <div className="flex items-center gap-2.5 border-b border-border pb-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent/10 text-accent">
                  <CalendarSmall />
                </span>
                <div>
                  <p className="text-sm font-semibold text-content">Personal · Aug 21 – Aug 24</p>
                  <p className="text-xs text-content-faint">Title + time visible</p>
                </div>
                <span className="ml-auto chip chip-green">Active</span>
              </div>
              <div className="divide-y divide-border">
                {[
                  ['Team standup', '9:00 – 9:30', 'accent'],
                  ['Dinner with Maya', '19:30 – 21:00', 'amber-500'],
                  ['Flight YVR → YYZ', '14:00 – 17:30', 'emerald-500'],
                ].map(([title, time, color]) => (
                  <div key={title} className="flex items-center gap-3 py-2.5">
                    <span className={`h-2 w-2 rounded-full bg-${color}`} />
                    <span className="text-sm text-content">{title}</span>
                    <span className="ml-auto text-xs text-content-faint">{time}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-lg bg-surface-alt/60 px-3 py-2 text-center">
                <p className="text-xs text-content-faint">calendarshare.app/s/8f3a2c9d</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}