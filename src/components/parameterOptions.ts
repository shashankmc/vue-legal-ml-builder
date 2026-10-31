import type { ModelTypeInfo, ParameterRule } from '../types'
import type { ParameterFieldSchema } from './modelCatalogData'

/** The package's settings with the backend's facts over them: it decides what is
 * offered, its range and its default, and this package adds the explanations. */
export function mergeSchema(
  schema: ParameterFieldSchema[],
  backend: ModelTypeInfo | undefined,
  rowCount?: number,
): ParameterFieldSchema[] {
  if (!backend?.parameters) return schema
  return Object.entries(backend.parameters).map(([key, field]) => {
    const known = schema.find((p) => p.key === key)
    const label = field.description ?? key
    const type = field.type === 'select' || field.type === 'boolean' ? field.type : 'number'
    const capped = field.at_most_rows && rowCount !== undefined
    return {
      label,
      shortDesc: label,
      explanation: label,
      recommendation: '',
      ...known,
      key,
      type,
      default: capped ? Math.min(field.default as number, rowCount) : field.default,
      min: field.min,
      max: capped ? Math.min(field.max as number, rowCount) : field.max,
      options: field.options?.map(String),
    }
  })
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
