import { idToRgb } from './color.ts'
import { regionAt, type Layers } from './layers.ts'
import type { Profile } from './profile.ts'

export interface MapMode {
  id: string
  name: string
  color(layers: Layers, pixel: number): number // 0xRRGGBB
}

export function mapModes(profile: Profile): MapMode[] {
  return [
    { id: 'mask', name: 'Land / sea', color: (l, i) => (l.mask[i] ? 0x6b8e4e : 0x1e3a5f) },
    { id: 'relief', name: 'Relief', color: (l, i) => (l.heightmap[i] >> 8) * 0x010101 },
    ...profile.hierarchy.map((lvl, n) => ({
      id: `level${n}`,
      name: lvl.plural[0].toUpperCase() + lvl.plural.slice(1),
      color: (l: Layers, i: number) => idToRgb(regionAt(l, i, n)),
    })),
  ]
}
