import assert from 'node:assert/strict'
import { test } from 'node:test'
import { idToRgb } from './color.ts'
import { createLayers, regionAt } from './layers.ts'

test('regionAt walks the parent chain and stops at unassigned', () => {
  const l = createLayers(4, 4, 3)
  l.regions[5] = 7
  l.parents[0].set(7, 2)
  assert.equal(regionAt(l, 5, 0), 7)
  assert.equal(regionAt(l, 5, 1), 2)
  assert.equal(regionAt(l, 5, 2), 0) // no level-2 parent yet
  assert.equal(regionAt(l, 0, 1), 0) // unassigned pixel
})

test('idToRgb is unique and never black for real ids', () => {
  const seen = new Set<number>()
  for (let id = 1; id <= 100_000; id++) {
    const rgb = idToRgb(id)
    assert.notEqual(rgb, 0)
    assert.ok(!seen.has(rgb), `collision at ${id}`)
    seen.add(rgb)
  }
})
