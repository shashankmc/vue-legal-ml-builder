/**
 * Curated theme presets — the single source of truth for every shipped theme.
 *
 * Each preset is a complete set of semantic token values. `tokens.css` only
 * defines the default (ink) + the raw palette; all other presets are emitted
 * into a `<style>` tag from here at runtime (see `ensurePresetStyles`), so
 * adding a theme is a pure-data change in this file.
 */

export type ThemeMode = 'light' | 'dark'

export interface ThemePresetMeta {
  id: ThemeId
  label: string
  description: string
  mode: ThemeMode
  /** Representative swatches: canvas, accent, text. */
  swatches: [string, string, string]
}

const LIGHT_SHADOWS = {
  'shadow-sm': '0 1px 2px rgba(20, 22, 26, 0.06)',
  'shadow-md': '0 1px 2px rgba(20, 22, 26, 0.06), 0 4px 12px rgba(20, 22, 26, 0.08)',
  'shadow-lg': '0 2px 6px rgba(20, 22, 26, 0.07), 0 12px 32px rgba(20, 22, 26, 0.12)',
}

const WARM_SHADOWS = {
  'shadow-sm': '0 1px 2px rgba(60, 48, 30, 0.06)',
  'shadow-md': '0 1px 2px rgba(60, 48, 30, 0.06), 0 4px 12px rgba(60, 48, 30, 0.08)',
  'shadow-lg': '0 2px 6px rgba(60, 48, 30, 0.07), 0 12px 32px rgba(60, 48, 30, 0.12)',
}

const DARK_SHADOWS = {
  'shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.4)',
  'shadow-md': '0 1px 2px rgba(0, 0, 0, 0.4), 0 4px 12px rgba(0, 0, 0, 0.45)',
  'shadow-lg': '0 2px 6px rgba(0, 0, 0, 0.45), 0 12px 32px rgba(0, 0, 0, 0.55)',
}

/** Semantic token values (keyed by ThemeToken) per preset. */
export const PRESET_TOKENS = {
  ink: {
    canvas: '#f2eee3',
    surface: '#fffdf9',
    'surface-sunken': '#f7f4ec',
    border: '#e2dccd',
    'border-strong': '#cdc5b2',
    text: '#1b1916',
    'text-muted': '#6d6455',
    'text-subtle': '#948a78',
    accent: '#0f5f5a',
    'accent-strong': '#0b4a46',
    'accent-soft': '#e2eeec',
    'on-accent': '#f8faf8',
    success: '#2f6b46',
    'success-soft': '#e7efe6',
    warning: '#8a5a1a',
    'warning-soft': '#f4ecdd',
    error: '#9b2c2c',
    'error-soft': '#f6e7e5',
    ...WARM_SHADOWS,
  },
  paper: {
    canvas: '#f4f5f6',
    surface: '#ffffff',
    'surface-sunken': '#eceef0',
    border: '#dfe2e6',
    'border-strong': '#c3c8cf',
    text: '#14171a',
    'text-muted': '#5b636c',
    'text-subtle': '#8a929b',
    accent: '#2f3a45',
    'accent-strong': '#1d252c',
    'accent-soft': '#e7eaee',
    'on-accent': '#ffffff',
    success: '#2f6b46',
    'success-soft': '#e6efe7',
    warning: '#8a5a1a',
    'warning-soft': '#f4ecdd',
    error: '#9b2c2c',
    'error-soft': '#f6e7e5',
    ...LIGHT_SHADOWS,
  },
  sepia: {
    canvas: '#efe6d4',
    surface: '#fbf5e7',
    'surface-sunken': '#f3ecdb',
    border: '#e0d3ba',
    'border-strong': '#c9b691',
    text: '#2b2314',
    'text-muted': '#6f6247',
    'text-subtle': '#9a8b6c',
    accent: '#9a5b23',
    'accent-strong': '#7a4517',
    'accent-soft': '#f0e3cf',
    'on-accent': '#fdf8ee',
    success: '#4a6b3a',
    'success-soft': '#e8efe0',
    warning: '#b0700f',
    'warning-soft': '#f6e8ce',
    error: '#9b2c2c',
    'error-soft': '#f6e0da',
    ...WARM_SHADOWS,
  },
  oxblood: {
    canvas: '#f3f1ee',
    surface: '#fffefb',
    'surface-sunken': '#f0ede9',
    border: '#e1dcd6',
    'border-strong': '#c9c1b8',
    text: '#1c1a19',
    'text-muted': '#6b6258',
    'text-subtle': '#978d82',
    accent: '#7a2230',
    'accent-strong': '#5f1a25',
    'accent-soft': '#f3e4e6',
    'on-accent': '#fdf7f7',
    success: '#2f6b46',
    'success-soft': '#e6efe7',
    warning: '#8a5a1a',
    'warning-soft': '#f4ecdd',
    error: '#9b2c2c',
    'error-soft': '#f6e7e5',
    ...LIGHT_SHADOWS,
  },
  forest: {
    canvas: '#eef1ea',
    surface: '#fbfcf8',
    'surface-sunken': '#f1f4ec',
    border: '#dde2d5',
    'border-strong': '#c3ccb7',
    text: '#1a1f17',
    'text-muted': '#5f6a55',
    'text-subtle': '#8c9780',
    accent: '#2f6b3f',
    'accent-strong': '#225230',
    'accent-soft': '#e2edde',
    'on-accent': '#f7fbf5',
    success: '#2f6b46',
    'success-soft': '#e2edde',
    warning: '#8a5a1a',
    'warning-soft': '#f4ecdd',
    error: '#9b2c2c',
    'error-soft': '#f6e7e5',
    ...LIGHT_SHADOWS,
  },
  midnight: {
    canvas: '#0e141b',
    surface: '#16202b',
    'surface-sunken': '#0b1016',
    border: '#26333f',
    'border-strong': '#3a4b59',
    text: '#e8eef4',
    'text-muted': '#9fb0bf',
    'text-subtle': '#74869a',
    accent: '#4fb6c9',
    'accent-strong': '#6fcfe0',
    'accent-soft': '#14323a',
    'on-accent': '#06181d',
    success: '#6fbf8f',
    'success-soft': '#12302a',
    warning: '#d9a55a',
    'warning-soft': '#33280f',
    error: '#e08585',
    'error-soft': '#3a1f1f',
    ...DARK_SHADOWS,
  },
  dark: {
    canvas: '#171613',
    surface: '#201e1a',
    'surface-sunken': '#121110',
    border: '#343028',
    'border-strong': '#4a4438',
    text: '#f4f0e6',
    'text-muted': '#b0a692',
    'text-subtle': '#8a8172',
    accent: '#4fb0a7',
    'accent-strong': '#6fc9c0',
    'accent-soft': '#17302e',
    'on-accent': '#0c1a19',
    success: '#6fbf8f',
    'success-soft': '#1a2b21',
    warning: '#d9a55a',
    'warning-soft': '#2e2517',
    error: '#e08585',
    'error-soft': '#2e1c1c',
    ...DARK_SHADOWS,
  },
  contrast: {
    canvas: '#ffffff',
    surface: '#ffffff',
    'surface-sunken': '#f2f2f2',
    border: '#000000',
    'border-strong': '#000000',
    text: '#000000',
    'text-muted': '#333333',
    'text-subtle': '#4a4a4a',
    accent: '#0050c8',
    'accent-strong': '#003a91',
    'accent-soft': '#e6effc',
    'on-accent': '#ffffff',
    success: '#0a6b2f',
    'success-soft': '#e2f3e7',
    warning: '#7a4a00',
    'warning-soft': '#f6ead2',
    error: '#b00020',
    'error-soft': '#fbe2e5',
    ...LIGHT_SHADOWS,
  },
} as const

export type ThemeId = keyof typeof PRESET_TOKENS

export const THEME_PRESETS: ThemePresetMeta[] = [
  { id: 'ink', label: 'Ink', description: 'Warm paper and a deep-teal accent', mode: 'light', swatches: ['#f2eee3', '#0f5f5a', '#1b1916'] },
  { id: 'paper', label: 'Paper', description: 'Neutral white with a graphite accent', mode: 'light', swatches: ['#f4f5f6', '#2f3a45', '#14171a'] },
  { id: 'sepia', label: 'Sepia', description: 'Aged parchment with burnt sienna', mode: 'light', swatches: ['#efe6d4', '#9a5b23', '#2b2314'] },
  { id: 'oxblood', label: 'Oxblood', description: 'Cool ivory with traditional burgundy', mode: 'light', swatches: ['#f3f1ee', '#7a2230', '#1c1a19'] },
  { id: 'forest', label: 'Forest', description: 'Soft paper with a deep-green accent', mode: 'light', swatches: ['#eef1ea', '#2f6b3f', '#1a1f17'] },
  { id: 'midnight', label: 'Midnight', description: 'Deep navy with a steel-cyan accent', mode: 'dark', swatches: ['#0e141b', '#4fb6c9', '#e8eef4'] },
  { id: 'dark', label: 'Charcoal', description: 'Warm charcoal with a teal accent', mode: 'dark', swatches: ['#171613', '#4fb0a7', '#f4f0e6'] },
  { id: 'contrast', label: 'High contrast', description: 'Maximum-contrast accessibility theme', mode: 'light', swatches: ['#ffffff', '#0050c8', '#000000'] },
]

export const THEME_IDS = Object.keys(PRESET_TOKENS) as ThemeId[]

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && value in PRESET_TOKENS
}

export function presetMeta(id: ThemeId): ThemePresetMeta | undefined {
  return THEME_PRESETS.find((p) => p.id === id)
}
