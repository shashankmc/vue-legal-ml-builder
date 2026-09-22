import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import {
  MlBuilderThemeProvider,
  PRESET_TOKENS,
  THEME_PRESETS,
  applyTheme,
  clearTheme,
  createTheme,
  isThemeId,
  isThemePreset,
  presetMeta,
  themeToStyle,
} from '../src/theme'
import ThemeSwitcher from '../src/components/shared/ThemeSwitcher.vue'

describe('theme', () => {
  it('maps semantic override keys to --vmlb-* custom properties', () => {
    expect(themeToStyle({ accent: '#7a2e2e', 'radius-md': '2px' })).toEqual({
      '--vmlb-accent': '#7a2e2e',
      '--vmlb-radius-md': '2px',
    })
  })

  it('ignores unknown keys', () => {
    expect(themeToStyle({ nope: 'x' } as never)).toEqual({})
  })

  it('createTheme returns the overrides unchanged', () => {
    const t = createTheme({ accent: '#123456' })
    expect(t.accent).toBe('#123456')
  })

  it('resolves a preset id to its full token set', () => {
    const style = themeToStyle('oxblood')
    expect(style['--vmlb-accent']).toBe(PRESET_TOKENS.oxblood.accent)
    expect(style['--vmlb-canvas']).toBe(PRESET_TOKENS.oxblood.canvas)
  })

  it('lets overrides win over preset tokens', () => {
    const style = themeToStyle({ preset: 'oxblood', overrides: { accent: '#000000' } })
    expect(style['--vmlb-accent']).toBe('#000000')
    expect(style['--vmlb-canvas']).toBe(PRESET_TOKENS.oxblood.canvas)
  })

  it('ships a complete, uniquely identified preset registry', () => {
    const ids = THEME_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBeGreaterThanOrEqual(6)
    expect(ids).toContain('ink')
    expect(ids).toContain('contrast')
    for (const meta of THEME_PRESETS) {
      expect(isThemeId(meta.id)).toBe(true)
      expect(presetMeta(meta.id)).toMatchObject({ id: meta.id })
      expect(meta.swatches).toHaveLength(3)
      // every preset must define the core semantic tokens
      const tokens = PRESET_TOKENS[meta.id]
      for (const key of ['canvas', 'surface', 'text', 'accent', 'on-accent', 'border', 'error']) {
        expect(tokens[key as keyof typeof tokens], `${meta.id}.${key}`).toBeTruthy()
      }
    }
  })

  it('identifies preset ids and rejects arbitrary strings', () => {
    expect(isThemeId('midnight')).toBe(true)
    expect(isThemeId('nope')).toBe(false)
    expect(isThemePreset('forest')).toBe(true)
    expect(isThemePreset({ accent: '#000' })).toBe(false)
  })

  it('applyTheme sets the wrapper class, preset attribute, and overrides', () => {
    const el = document.createElement('div')
    applyTheme(el, { preset: 'dark', overrides: { accent: '#abcdef' } })

    expect(el.classList.contains('vmlb-theme')).toBe(true)
    expect(el.dataset.vmlbTheme).toBe('dark')
    expect(el.style.getPropertyValue('--vmlb-accent')).toBe('#abcdef')
    // preset tokens are written inline too, so the theme is self-contained
    expect(el.style.getPropertyValue('--vmlb-canvas')).toBe(PRESET_TOKENS.dark.canvas)

    clearTheme(el)
    expect(el.classList.contains('vmlb-theme')).toBe(false)
    expect(el.dataset.vmlbTheme).toBeUndefined()
    expect(el.style.getPropertyValue('--vmlb-accent')).toBe('')
    expect(el.style.getPropertyValue('--vmlb-canvas')).toBe('')
  })

  it('switching presets does not leave stale token values behind', () => {
    const el = document.createElement('div')
    applyTheme(el, 'dark')
    applyTheme(el, 'ink')
    // ink is the default, so no preset attribute
    expect(el.dataset.vmlbTheme).toBeUndefined()
    expect(el.style.getPropertyValue('--vmlb-canvas')).toBe(PRESET_TOKENS.ink.canvas)
  })

  it('ThemeProvider renders a scoped wrapper for a preset', () => {
    const wrapper = mount(MlBuilderThemeProvider, {
      props: { theme: 'midnight' },
      slots: { default: '<p>content</p>' },
    })
    const root = wrapper.find('.vmlb-theme')
    expect(root.exists()).toBe(true)
    expect(root.attributes('data-vmlb-theme')).toBe('midnight')
    expect(root.text()).toContain('content')
  })

  it('ThemeProvider applies overrides to a target element instead of wrapping', () => {
    const target = document.createElement('div')
    const wrapper = mount(MlBuilderThemeProvider, {
      props: { theme: { accent: '#0a0a0a' }, target },
      slots: { default: '<p>content</p>' },
    })
    expect(target.style.getPropertyValue('--vmlb-accent')).toBe('#0a0a0a')
    expect(wrapper.find('.vmlb-theme').exists()).toBe(false)
  })
})

describe('ThemeSwitcher', () => {
  it('lists every preset and emits the selected id', async () => {
    const wrapper = mount(ThemeSwitcher, { props: { modelValue: 'ink' } })
    const options = wrapper.findAll('option')
    expect(options).toHaveLength(THEME_PRESETS.length)
    expect(options.map((o) => o.attributes('value'))).toContain('oxblood')

    await wrapper.find('select').setValue('oxblood')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['oxblood'])
  })
})

