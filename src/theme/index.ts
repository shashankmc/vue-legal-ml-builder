import { watch, defineComponent, h, type PropType } from 'vue'
import {
  PRESET_TOKENS,
  THEME_IDS,
  isThemeId,
  type ThemeId,
} from './presets'

export {
  PRESET_TOKENS,
  THEME_IDS,
  THEME_PRESETS,
  isThemeId,
  presetMeta,
} from './presets'
export type { ThemeId, ThemeMode, ThemePresetMeta } from './presets'

/**
 * Public theming contract. Keys are stable semantic token names; values are
 * CSS values. Hosts should override these (never the internal raw palette).
 */
export const themeTokens = {
  canvas: '--vmlb-canvas',
  surface: '--vmlb-surface',
  'surface-sunken': '--vmlb-surface-sunken',
  border: '--vmlb-border',
  'border-strong': '--vmlb-border-strong',
  text: '--vmlb-text',
  'text-muted': '--vmlb-text-muted',
  'text-subtle': '--vmlb-text-subtle',
  accent: '--vmlb-accent',
  'accent-strong': '--vmlb-accent-strong',
  'accent-soft': '--vmlb-accent-soft',
  'on-accent': '--vmlb-on-accent',
  success: '--vmlb-success',
  'success-soft': '--vmlb-success-soft',
  warning: '--vmlb-warning',
  'warning-soft': '--vmlb-warning-soft',
  error: '--vmlb-error',
  'error-soft': '--vmlb-error-soft',
  'font-display': '--vmlb-font-display',
  'font-sans': '--vmlb-font-sans',
  'font-mono': '--vmlb-font-mono',
  'radius-sm': '--vmlb-radius-sm',
  'radius-md': '--vmlb-radius-md',
  'radius-lg': '--vmlb-radius-lg',
  'shadow-sm': '--vmlb-shadow-sm',
  'shadow-md': '--vmlb-shadow-md',
  'shadow-lg': '--vmlb-shadow-lg',
  'space-2xs': '--vmlb-space-2xs',
  'space-xs': '--vmlb-space-xs',
  'space-sm': '--vmlb-space-sm',
  'space-md': '--vmlb-space-md',
  'space-lg': '--vmlb-space-lg',
  'space-xl': '--vmlb-space-xl',
  'space-2xl': '--vmlb-space-2xl',
  container: '--vmlb-container',
  density: '--vmlb-density',
} as const

export type ThemeToken = keyof typeof themeTokens

const ALL_VARS = Object.values(themeTokens)

/** A shipped preset id, a token override object, or a preset plus overrides. */
export type ThemePreset = ThemeId
export type ThemeOverrides = Partial<Record<ThemeToken, string>>
export interface ThemeConfig {
  preset?: ThemePreset
  overrides?: ThemeOverrides
}
export type MlBuilderTheme = ThemePreset | ThemeConfig | ThemeOverrides

export function isThemePreset(theme: MlBuilderTheme): theme is ThemePreset {
  return isThemeId(theme)
}

export function normalizeTheme(theme: MlBuilderTheme): ThemeConfig {
  if (isThemeId(theme)) return { preset: theme }
  if (theme && typeof theme === 'object' && ('preset' in theme || 'overrides' in theme)) {
    return theme as ThemeConfig
  }
  return { overrides: theme as ThemeOverrides }
}

/** Identity helper for typed overrides in plain JS/TS config objects. */
export function createTheme(overrides: ThemeOverrides): ThemeOverrides {
  return overrides
}

function overrideEntries(overrides?: ThemeOverrides): Array<[string, string]> {
  if (!overrides) return []
  const out: Array<[string, string]> = []
  for (const [key, value] of Object.entries(overrides)) {
    const cssVar = themeTokens[key as ThemeToken]
    if (cssVar && value != null) out.push([cssVar, String(value)])
  }
  return out
}

/** Resolve a theme into a flat `--vmlb-*` → value map (preset tokens + overrides). */
export function themeToStyle(theme: MlBuilderTheme): Record<string, string> {
  const { preset, overrides } = normalizeTheme(theme)
  const style: Record<string, string> = {}
  if (preset && PRESET_TOKENS[preset]) {
    for (const [key, value] of Object.entries(PRESET_TOKENS[preset])) {
      const cssVar = themeTokens[key as ThemeToken]
      if (cssVar) style[cssVar] = String(value)
    }
  }
  for (const [cssVar, value] of overrideEntries(overrides)) style[cssVar] = value
  return style
}

/**
 * Emit `[data-vmlb-theme="…"]` rules for every preset, once, so a plain
 * wrapper element themes itself with no JS beyond importing the package.
 */
export function ensurePresetStyles(doc: Document | null = typeof document !== 'undefined' ? document : null): void {
  if (!doc) return
  const STYLE_ID = 'vmlb-theme-presets'
  if (doc.getElementById(STYLE_ID)) return
  const rules = THEME_IDS.map((id) => {
    const decls = Object.entries(PRESET_TOKENS[id])
      .map(([key, value]) => `${themeTokens[key as ThemeToken]}:${value}`)
      .join(';')
    return `:root[data-vmlb-theme="${id}"],[data-vmlb-theme="${id}"]{${decls}}`
  }).join('\n')
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = rules
  doc.head.appendChild(style)
}

ensurePresetStyles()

/** Write a theme onto an element: wrapper class, preset attribute, token values. */
export function applyTheme(target: HTMLElement, theme: MlBuilderTheme): void {
  // Reset any tokens this helper may have set previously, so switching from a
  // preset to a bare override set doesn't leave stale values behind.
  for (const cssVar of ALL_VARS) target.style.removeProperty(cssVar)

  const { preset, overrides } = normalizeTheme(theme)
  target.classList.add('vmlb-theme')
  if (preset && preset !== 'ink') target.dataset.vmlbTheme = preset
  else delete target.dataset.vmlbTheme

  for (const [cssVar, value] of Object.entries(themeToStyle({ preset, overrides }))) {
    target.style.setProperty(cssVar, value)
  }
}

/** Remove theming applied by `applyTheme` (leaves host-defined values alone). */
export function clearTheme(target: HTMLElement): void {
  target.classList.remove('vmlb-theme')
  delete target.dataset.vmlbTheme
  for (const cssVar of ALL_VARS) target.style.removeProperty(cssVar)
}

/**
 * Wraps content in a `.vmlb-theme` scope. Omit `target` to render a themed
 * wrapper element; pass `target` to theme an existing element and render only
 * the slot (useful when the host already owns the container).
 */
export const MlBuilderThemeProvider = defineComponent({
  name: 'MlBuilderThemeProvider',
  props: {
    theme: { type: [String, Object] as PropType<MlBuilderTheme>, required: true },
    target: { type: Object as PropType<HTMLElement | null>, default: null },
  },
  setup(props, { slots }) {
    watch(
      () => [props.target, props.theme] as const,
      ([target], _prev, onCleanup) => {
        if (!target) return
        applyTheme(target, props.theme)
        onCleanup(() => clearTheme(target))
      },
      { immediate: true, deep: true },
    )

    return () => {
      const { preset, overrides } = normalizeTheme(props.theme)
      if (props.target) return slots.default?.() ?? null
      return h(
        'div',
        {
          class: 'vmlb-theme',
          'data-vmlb-theme': preset && preset !== 'ink' ? preset : undefined,
          style: themeToStyle({ preset, overrides }),
        },
        slots.default?.(),
      )
    }
  },
})
