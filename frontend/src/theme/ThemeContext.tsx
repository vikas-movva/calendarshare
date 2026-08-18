import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { activeTheme, themeOrder, type ThemeMode, type ThemeName } from './theme'

export interface ThemeContextValue {
  mode: ThemeMode
  accent: ThemeName
  toggleMode: () => void
  setAccent: (t: ThemeName) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_MODE = 'calshare-theme-mode'
const STORAGE_ACCENT = 'calshare-theme-accent'

function getInitialMode(): ThemeMode {
  if (typeof window === 'undefined') return 'dark'
  const stored = localStorage.getItem(STORAGE_MODE) as ThemeMode | null
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function getInitialAccent(): ThemeName {
  if (typeof window === 'undefined') return activeTheme
  const stored = localStorage.getItem(STORAGE_ACCENT) as ThemeName | null
  if (stored && themeOrder.includes(stored)) return stored
  return activeTheme
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(getInitialMode)
  const [accent, setAccentState] = useState<ThemeName>(getInitialAccent)

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', accent)
    root.setAttribute('data-theme-mode', mode)
    localStorage.setItem(STORAGE_ACCENT, accent)
    localStorage.setItem(STORAGE_MODE, mode)
  }, [mode, accent])

  const toggleMode = () => setMode((m) => (m === 'dark' ? 'light' : 'dark'))
  const setAccent = (t: ThemeName) => setAccentState(t)

  const value = useMemo(() => ({ mode, accent, toggleMode, setAccent }), [mode, accent])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}