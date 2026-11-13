import type { Labelset } from 'legal-annotation-kit'

// Twelve colours that read apart from each other and carry white text, so a
// label keeps one colour across sessions and Datasets without the server
// storing any.
const PALETTE = [
  '#2563eb', '#16a34a', '#d97706', '#9333ea', '#db2777', '#0891b2',
  '#dc2626', '#4f46e5', '#65a30d', '#c2410c', '#0d9488', '#7c3aed',
]

/** A label's colour, from its name alone (FNV-1a hash into the palette). */
export function labelColour(name: string): string {
  let hash = 0x811c9dc5
  for (const char of name) {
    hash ^= char.codePointAt(0)!
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return PALETTE[hash % PALETTE.length]
}

/** The kit's Labelset for label names, in order, each once. */
export function kitLabelset(names: string[], name = 'Labels'): Labelset {
  return { name, desc: '', labels: [...new Set(names)].map((label) => ({ name: label, color: labelColour(label) })) }
}
