import type { ModelTypeInfo, ParameterRule } from '../types'
import { parameterRules, parameterSchemas } from './modelCatalogData'
import type { ParameterFieldSchema } from './modelCatalogData'

/** The package's settings with the backend's facts over them: it decides what is
 * offered, its range and its default, and this package adds the explanations.
 * With the Dataset's row count, a setting that cannot exceed the rows is capped. */
export function mergeSchema(
  schema: ParameterFieldSchema[],
  backend: ModelTypeInfo | undefined,
  rowCount?: number,
): ParameterFieldSchema[] {
  const merged = backend?.parameters
    ? Object.entries(backend.parameters).map(([key, field]): ParameterFieldSchema => {
        const known = schema.find((p) => p.key === key)
        const label = field.description ?? key
        const type = field.type === 'select' || field.type === 'boolean' ? field.type : 'number'
        return {
          label,
          shortDesc: label,
          explanation: label,
          recommendation: '',
          ...known,
          key,
          type,
          default: field.default,
          min: field.min,
          max: field.max,
          options: field.options?.map(String),
          atMostRows: field.at_most_rows,
        }
      })
    : schema
  if (rowCount === undefined || !merged.some((p) => p.atMostRows)) return merged
  return merged.map((p) => (p.atMostRows
    ? { ...p, default: Math.min(p.default as number, rowCount), max: Math.min(p.max ?? rowCount, rowCount) }
    : p))
}

/** What a Model type's settings are checked against: its settings, the rules
 * between them, and whether the Dataset has more than two labels. */
export interface SettingsSetup {
  schema: ParameterFieldSchema[]
  rules: ParameterRule[]
  multiclass: boolean
}

/** The settings form and the guide both start here, so they offer and move
 * settings the same way the backend checks them. */
export function settingsSetup(
  modelType: string,
  dataset: { modelInfo?: ModelTypeInfo; rowCount?: number; labels?: readonly string[] | null } = {},
): SettingsSetup {
  return {
    schema: mergeSchema(parameterSchemas[modelType] ?? [], dataset.modelInfo, dataset.rowCount),
    rules: dataset.modelInfo?.rules ?? parameterRules[modelType] ?? [],
    // As the backend counts them: different labels, more than two.
    multiclass: new Set(dataset.labels ?? []).size > 2,
  }
}

function holds(rule: ParameterRule, chosen: Record<string, unknown>, multiclass: boolean): boolean {
  if (rule.when.multiclass) return multiclass
  return Object.entries(rule.when).every(([key, value]) => chosen[key] === value)
}

/** The options still open for a select, and why the others are not. */
export function allowedOptions(
  field: ParameterFieldSchema,
  rules: ParameterRule[],
  chosen: Record<string, unknown>,
  multiclass: boolean,
): { options: string[]; reasons: string[] } {
  const applying = rules.filter((rule) => rule.parameter === field.key && holds(rule, chosen, multiclass))
  return {
    options: (field.options ?? []).filter((option) => applying.every((rule) => rule.options.includes(option))),
    reasons: applying.map((rule) => rule.reason),
  }
}

/** Moves any choice that is no longer open, in place. Returns what moved and why,
 * by setting. */
export function reconcileChoices(
  schema: ParameterFieldSchema[],
  rules: ParameterRule[],
  chosen: Record<string, unknown>,
  multiclass: boolean,
): Record<string, string> {
  const moved: Record<string, string> = {}
  for (const field of schema) {
    if (field.type !== 'select') continue
    const { options, reasons } = allowedOptions(field, rules, chosen, multiclass)
    if (options.includes(chosen[field.key] as string) || !options.length) continue
    const next = options.includes(field.default as string) ? (field.default as string) : options[0]
    chosen[field.key] = next
    moved[field.key] = `${field.label} changed to ${next}. ${reasons.join(' ')}`
  }
  return moved
}
