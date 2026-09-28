import type { Profile } from '../../core/profile.ts'

// Milestone 0 stub: declarations only. Writers, readers, and validation rules come with milestones 1–5.
export const hoi4: Profile = {
  id: 'hoi4',
  name: 'Hearts of Iron IV',
  engineFamily: 'clausewitz',
  map: { defaultSize: [5632, 2048], sizeMultiple: 256, seaLevel: 95, heightBits: 8 },
  hierarchy: [
    { name: 'province', plural: 'provinces' },
    { name: 'state', plural: 'states' },
    { name: 'strategic region', plural: 'strategic regions' },
  ],
  registries: [{ id: 'country', name: 'Country' }],
  attributes: [
    { id: 'owner', level: 1, registry: 'country', multi: false },
    { id: 'controller', level: 1, registry: 'country', multi: false },
    { id: 'cores', level: 1, registry: 'country', multi: true },
    { id: 'claims', level: 1, registry: 'country', multi: true },
  ],
}
