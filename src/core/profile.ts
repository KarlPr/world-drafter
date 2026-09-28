// Per-game plugin contract. Declarations only: no UI, no core imports beyond types.
// Grows only when a real profile needs a field (design doc §3.3, §11).

export interface RegionLevel {
  name: string // "province", "state", …  index 0 = base region
  plural: string
}

export interface Profile {
  id: string
  name: string
  engineFamily: 'clausewitz' | 'jomini'
  map: {
    defaultSize: [width: number, height: number]
    sizeMultiple: number // dimensions must be divisible by this
    seaLevel: number // heightmap value at which land begins, in export bit depth
    heightBits: 8 | 16
  }
  hierarchy: RegionLevel[]
  registries: { id: string; name: string }[]
  attributes: { id: string; level: number; registry: string; multi: boolean }[]
}
