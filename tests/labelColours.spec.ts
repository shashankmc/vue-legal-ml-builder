import { describe, expect, it } from 'vitest'
import { labelColour, kitLabelset } from '../src/annotation/labelColours'

describe('labelColour', () => {
  it('gives a label the same colour every time, whatever else is in the list', () => {
    expect(labelColour('Void')).toBe(labelColour('Void'))
    const alone = kitLabelset(['Void']).labels[0].color
    const among = kitLabelset(['Valid', 'Pending', 'Void']).labels[2].color
    expect(among).toBe(alone)
  })

  it('is a hex colour', () => {
    for (const name of ['Void', 'PERSON', 'Überweisung', '']) expect(labelColour(name)).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('tells common label pairs apart', () => {
    expect(labelColour('Void')).not.toBe(labelColour('Valid'))
    expect(labelColour('PERSON')).not.toBe(labelColour('ORG'))
  })
})

describe('kitLabelset', () => {
  it('keeps the order and drops repeats', () => {
    expect(kitLabelset(['B', 'A', 'B']).labels.map((l) => l.name)).toEqual(['B', 'A'])
  })
})
