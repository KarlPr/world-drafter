import { createLayers, type Layers } from './layers.ts'
import type { Profile } from './profile.ts'

export interface Project {
  profile: Profile
  layers: Layers
}

export function newProject(profile: Profile, [width, height] = profile.map.defaultSize): Project {
  const m = profile.map.sizeMultiple
  if (width % m || height % m) throw new Error(`${profile.name} map size must be a multiple of ${m}`)
  return { profile, layers: createLayers(width, height, profile.hierarchy.length) }
}
