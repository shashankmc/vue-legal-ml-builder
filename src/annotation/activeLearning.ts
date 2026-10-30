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
  if (!newLabels) return { message: '', canRetrain: false, emphasised: false }
  if (Object.keys(short).length) {
    const missing = Object.entries(short).map(([name, n]) => `${n} more ${name}`)
    return { message: `Before the first training: ${missing.join(', ')}.`, canRetrain: false, emphasised: false }
  }
  if (secondLabel) return { message: 'Training needs examples of at least two labels.', canRetrain: false, emphasised: false }
  const labels = count(newLabels, 'new label')
  return { message: suggested ? `${labels}, retrain?` : `${labels} so far.`, canRetrain: allowed, emphasised: suggested }
}

export function verificationText(state: ActiveLearningState): string {
  if (state.holdout.verification === 'holdout') return `Checked on ${count(state.holdout.labelled, 'held-back item')}`
  if (state.holdout.verification === 'not_independently_verified') return 'Not independently verified'
  return ''
}
