import type { Transition, Variants } from 'framer-motion'

/**
 * Central animation tokens for CalShare.
 *
 * Design goal: *fluid and snappy*. Animations stay short (120–260ms), move a
 * small distance from rest, and use a punchy ease-out curve so things feel
 * responsive rather than floaty or sluggish. Interactive elements prefer
 * springs (physics-based) so they start and stop instantly with a pleasing
 * overshoot-free settle.
 */

/**
 * Preferred ease-out curve: quick start, gentle settle, no float.
 * Faster exit tail than before so reveals settle decisively instead of
 * easing slowly into place.
 */
export const EASE_SNAPPY: [number, number, number, number] = [0.16, 0.6, 0.22, 1]

/** Short, snappy transition used across reveal presets. */
export const snapTransition = (duration = 0.22): Transition => ({
  duration,
  ease: EASE_SNAPPY,
})

/** Bouncy but brief spring for interactive elements (buttons, toggles). */
export const snapSpring = (stiffness = 700, damping = 40): Transition => ({
  type: 'spring',
  stiffness,
  damping,
  mass: 0.55,
})

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.24, ease: EASE_SNAPPY },
  },
}

export const stagger: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04, delayChildren: 0.02 },
  },
}

export const slideRight: Variants = {
  hidden: { opacity: 0, x: -14 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.24, ease: EASE_SNAPPY },
  },
}

export const slideLeft: Variants = {
  hidden: { opacity: 0, x: 14 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.24, ease: EASE_SNAPPY },
  },
}

/** Modal / popover panel reveal: tiny rise + settle on a fast ease. */
export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.18, ease: EASE_SNAPPY },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: 6,
    transition: { duration: 0.12, ease: 'easeIn' },
  },
}

export const fadeIn = (duration = 0.2): Variants => ({
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration, ease: EASE_SNAPPY },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.12, ease: 'easeIn' },
  },
})

/** Margin baked tighter so on-scroll reveals trigger a touch earlier. */
export const inViewOnce = { once: true, margin: '-30px' } as const