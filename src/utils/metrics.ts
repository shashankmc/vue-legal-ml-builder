/** Model metrics are loosely typed (accuracy/precision/recall/f1_score are
 * numbers, but confusion_matrix/classification_report/etc. vary by model
 * family) — this narrows a single numeric field for display. */
export function numericMetric(metrics: Record<string, unknown> | null | undefined, key: string): number | undefined {
  const value = metrics?.[key]
  return typeof value === 'number' ? value : undefined
}
