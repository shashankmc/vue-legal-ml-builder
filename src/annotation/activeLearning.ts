import type { ActiveLearningState } from '../types'
import { count } from './annotationState'

/** What a user reads for each query strategy, under Advanced. */
export const STRATEGY_COPY: Record<string, { label: string; description: string }> = {
  prediction_entropy: { label: 'Hardest cases first', description: 'Items the Model is most unsure about.' },
  least_confidence: { label: 'Weakest guesses first', description: 'Items where the best guess is least certain.' },
  breaking_ties: { label: 'Closest calls first', description: 'Items where the top two labels are nearly level.' },
  embedding_kmeans: { label: 'Widest variety first', description: 'Items spread across different kinds of text.' },
  random: { label: 'Random order', description: 'No ranking. Useful as a comparison.' },
}

export function retrainPrompt(state: ActiveLearningState) {
  if (state.round.status === 'training') return { message: 'Training on your labels…', canRetrain: false, emphasised: false }
  if (state.round.status === 'scoring') return { message: 'Reordering the queue…', canRetrain: false, emphasised: false }

  const { new_labels: newLabels, allowed, suggested, classes_short: short, needs_second_label: secondLabel } = state.retrain
  const { label_cap: cap, labels_total: total, labels_needed: needed, classes_to_train: classes } = state.retrain
  if (!newLabels) return { message: '', canRetrain: false, emphasised: false }
  if (Object.keys(short).length && total < cap) {
    const missing = Object.entries(short).map(([name, n]) => `${n} more ${name}`)
    const when = state.round.number === 0 ? 'Before the first training' : 'Before retraining'
    return { message: `${when}: ${missing.join(', ')}, or ${cap} labels in all (${total} so far).`, canRetrain: false, emphasised: false }
  }
  if (secondLabel) return { message: 'Training needs at least 2 examples each of two labels.', canRetrain: false, emphasised: false }
  if (needed) return { message: `With ${classes} labels, training needs ${count(needed, 'more example')}.`, canRetrain: false, emphasised: false }
  const labels = count(newLabels, 'new label')
  return { message: suggested ? `${labels}, retrain?` : `${labels} so far.`, canRetrain: allowed, emphasised: suggested }
}

function joined(names: string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** What a user should know before training with labels still short: empty when nothing is. */
export function trainingWarning(state: ActiveLearningState): string {
  const { allowed, classes_short: short, classes_left_out: leftOut, classes_unseen: unseen } = state.retrain
  if (!allowed) return ''

  const few = Object.keys(short).filter((name) => !leftOut.includes(name))
  const parts: string[] = []
  if (few.length) {
    const named = few.map((name) => `${name} (${state.label_counts[name]})`)
    parts.push(`Few examples of ${joined(named)}, so the Model may miss ${few.length === 1 ? 'it' : 'them'}.`)
  }
  if (leftOut.length === 1) parts.push(`Only one example of ${leftOut[0]}, so training leaves it out.`)
  if (leftOut.length > 1) parts.push(`Only one example each of ${joined(leftOut)}, so training leaves them out.`)
  if (unseen.length) parts.push(`No examples of ${joined(unseen)} yet, so the Model cannot predict ${unseen.length === 1 ? 'it' : 'them'}.`)
  return parts.join(' ')
}

export function holdoutClassText(state: ActiveLearningState): string {
  const counts = Object.entries(state.holdout.label_counts).sort(([, a], [, b]) => b - a)
  return counts.length ? `Held back so far: ${counts.map(([name, n]) => `${n.toLocaleString('en-GB')} ${name}`).join(', ')}.` : ''
}

export function verificationText(state: ActiveLearningState): string {
  if (state.holdout.verification === 'holdout') return `Checked on ${count(state.holdout.labelled, 'held-back item')}`
  if (state.holdout.verification === 'not_independently_verified') return 'Not independently verified'
  return ''
}
