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

describe('kitLabelset colours', () => {
  it('gives every label in a set its own colour, even when their names hash alike', () => {
    // Civil and Criminal hash to the same palette slot (found in BAIGLE #149 QA).
    expect(labelColour('Civil')).toBe(labelColour('Criminal'))

    const colours = kitLabelset(['Civil', 'Criminal']).labels.map((l) => l.color)

    expect(new Set(colours).size).toBe(2)
    expect(colours[0]).toBe(labelColour('Civil'))
  })

  it('keeps distinct colours for up to the whole palette', () => {
    const names = Array.from({ length: 12 }, (_, i) => `Label ${i}`)
    expect(new Set(kitLabelset(names).labels.map((l) => l.color)).size).toBe(12)
  })
})
