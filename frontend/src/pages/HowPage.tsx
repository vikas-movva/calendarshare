import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { fadeUp, stagger, slideRight, inViewOnce } from '../theme/anim'
import { CalendarSmall, UsersSmall, ShieldSmall, ClockSmall, ArrowLeftSmall, CheckSmall, PlusSmall } from '../components/Icons'

const STEPS = [
  {
    number: '01',
    icon: <CalendarSmall />,
    title: 'Connect your calendar',
    description:
      'Sign in with Google so we can see your calendars. We only ask to look — we can never edit, delete, or change anything.',
    bullets: ['Only looks at your calendar', 'Can never modify your events', 'Your credentials stay encrypted'],
  },
  {
    number: '02',
    icon: <ClockSmall />,
    title: 'Pick a date range',
    description:
      'Choose a start date and an end date. Only the events that fall inside that window get shared — everything else stays private.',
    bullets: ['Pick any window up to a year', 'All-day events are handled correctly', 'Timezone-aware, no confusion'],
  },
  {
    number: '03',
    icon: <UsersSmall />,
    title: 'How many details are you sharing?',
    description:
      'Three simple options: show only busy/free times, show the event names too, or show everything including location and notes. The choice is always yours.',
    bullets: ['Minimal — just the times', 'Basic — names and when', 'Full — All the details'],
  },
  {
    number: '04',
    icon: <ShieldSmall />,
    title: 'Set an expiration and share',
    description:
      'Choose how long the link should live — an hour, a day, a week, or forever. You get a link and can turn it off anytime from your dashboard.',
    bullets: ['Links are randomly generated, never guessable', 'Links are hashed at rest for safety', 'Revoke a link with one click'],
  },
]

const FAQ = [
  {
    q: 'Do my friends need to sign up for anything?',
    a: 'Not at all. They just click the link and see the calendar you chose — no account, no login, no Google access.',
  },
  {
    q: 'Can they see my whole calendar?',
    a: 'No. They only see events inside the date range you picked, and only the details you chose to share.',
  },
  {
    q: 'Is my information stored forever?',
    a: 'Only while the share is active. You can delete or revoke a share at any time, and expired shares are cleaned up.',
  },
  {
    q: 'What do you need from Google?',
    a: 'Only permission to read your calendar. We never ask to write, edit, or delete anything.',
  },
  {
    q: 'What if I change my mind?',
    a: 'Revoke the link from your dashboard. It stops working right away for anyone who opens it.',
  },
]

export default function HowPage() {
  return (
    <div className="max-w-4xl">
      <div className="mb-8 flex items-center gap-3">
        <Link to="/" className="grid h-9 w-9 place-items-center rounded-lg border border-border text-content-muted hover:bg-card">
          <ArrowLeftSmall />
        </Link>
        <div>
          <span className="eyebrow text-accent">How it works</span>
          <h1 className="text-3xl font-bold tracking-tight text-content mt-1">
            Share your calendar,{' '}
            <span className="text-gradient">simply</span>
          </h1>
        </div>
      </div>

      <motion.p variants={fadeUp} initial="hidden" animate="visible" className="text-content-muted max-w-2xl">
        Four easy steps. You stay in control the whole time — you decide what gets shared,
        for how long, and you can take it back with a single click.
      </motion.p>

      <motion.div variants={stagger} initial="hidden" animate="visible" className="mt-10 space-y-6">
        {STEPS.map((step) => (
          <motion.div key={step.number} variants={slideRight} className="card overflow-hidden">
            <div className="grid gap-5 p-5 sm:grid-cols-[auto_1fr] sm:items-start">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
                  {step.icon}
                </span>
                <span className="text-2xl font-bold text-content-faint">{step.number}</span>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-content">{step.title}</h2>
                <p className="mt-1 text-sm text-content-muted">{step.description}</p>
                <ul className="mt-3 space-y-1.5">
                  {step.bullets.map((b) => (
                    <li key={b} className="flex items-center gap-2 text-sm text-content-soft">
                      <CheckSmall />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={inViewOnce} className="mt-16">
        <motion.h2 variants={fadeUp} className="text-center text-2xl font-bold text-content">
          Common questions
        </motion.h2>
        <motion.p variants={fadeUp} className="mt-2 text-center text-content-muted">
          The straightforward answers.
        </motion.p>
        <div className="mt-8 space-y-3">
          {FAQ.map((item) => (
            <FaqItem key={item.q} item={item} />
          ))}
        </div>
      </motion.div>

      <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={inViewOnce} className="mt-16 card overflow-hidden">
        <div className="grid gap-6 p-8 sm:grid-cols-[1fr_1fr] sm:items-center">
          <div>
            <span className="eyebrow text-accent">Ready to share?</span>
            <h2 className="mt-2 text-2xl font-bold text-content">
              Create your first share in minutes.
            </h2>
            <p className="mt-2 text-content-muted">
              Connect your calendar, pick a date range, and send a safe link.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Link to="/shares/new" className="btn-primary">Create share</Link>
            <Link to="/" className="btn-ghost">Back to home</Link>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

function FaqItem({ item }: { item: { q: string; a: string } }) {
  const [open, setOpen] = useState(false)

  return (
    <motion.div
      variants={fadeUp}
      className="card overflow-hidden"
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-5 py-4 text-left font-medium text-content"
      >
        {item.q}
        <motion.span
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/10 text-accent"
        >
          <PlusSmall />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="px-5 pb-4 text-sm text-content-muted">
              {item.a}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}