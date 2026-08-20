/**
 * Logo — the CalendarShare wordmark rendered as inline SVG.
 *
 * The SVG's fills use `currentColor`, so the logo takes its colour from the
 * element's `color` — which we set to the app accent. This keeps the logo
 * themable (cyan / violet / emerald / amber / rose, light or dark) without
 * shipping a separate asset per theme.
 */
import logoSrc from '../assets/calendarshare-logo-no-text.svg?raw'

const svgContent = logoSrc
  .replace(/^<\?xml[^>]*\?>/, '')
  // Drop the intrinsic 1024px dimensions so the SVG scales to its container.
  .replace(/\s+width="[^"]*"/, '')
  .replace(/\s+height="[^"]*"/, '')
  .replace(
    /<svg\b([^>]*)>/,
    '<svg $1 width="100%" height="100%" style="display:block" preserveAspectRatio="xMidYMid meet">',
  )
  .trim()

export function Logo({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <span
      className={className}
      style={{ color: 'rgb(var(--color-accent-rgb, 0 212 255))' }}
      dangerouslySetInnerHTML={{ __html: svgContent }}
      aria-hidden="true"
    />
  )
}