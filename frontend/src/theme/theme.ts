export type ThemeName = 'cyan' | 'violet' | 'emerald' | 'amber' | 'rose'
export type ThemeMode = 'dark' | 'light'

export interface ThemeTokens {
  primary: string
  'primary-hover': string
  dark: string
  darker: string
  'primary-light': string
  'primary-light-hover': string
}

export const themes: Record<ThemeName, ThemeTokens> = {
  cyan: { primary: '#00d4ff', 'primary-hover': '#00b8e0', dark: '#0a0f1a', darker: '#050810', 'primary-light': '#0369a1', 'primary-light-hover': '#025482' },
  violet: { primary: '#a78bfa', 'primary-hover': '#8b5cf6', dark: '#0f0a1a', darker: '#0a0510', 'primary-light': '#6d28d9', 'primary-light-hover': '#5b21b6' },
  emerald: { primary: '#34d399', 'primary-hover': '#10b981', dark: '#0a1a14', darker: '#05100b', 'primary-light': '#047857', 'primary-light-hover': '#065f46' },
  amber: { primary: '#fbbf24', 'primary-hover': '#f59e0b', dark: '#1a140a', darker: '#100c05', 'primary-light': '#b45309', 'primary-light-hover': '#92400e' },
  rose: { primary: '#fb7185', 'primary-hover': '#f43f5e', dark: '#1a0a0e', darker: '#100507', 'primary-light': '#be123c', 'primary-light-hover': '#9f1239' },
}

export const activeTheme: ThemeName = 'violet'
export const themeLabels: Record<ThemeName, string> = {
  cyan: 'Cyan', violet: 'Violet', emerald: 'Emerald', amber: 'Amber', rose: 'Rose',
}
export const themeOrder: ThemeName[] = ['cyan', 'violet', 'emerald', 'amber', 'rose']