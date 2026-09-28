// Full-resolution typed arrays. Never put these in React state.

export interface Layers {
  width: number
  height: number
  mask: Uint8Array // 0 sea / 1 land
  heightmap: Uint16Array // ponytail: always 16-bit in memory; profile.heightBits only matters at export
  regions: Uint32Array // base region id per pixel, 0 = unassigned
  parents: Map<number, number>[] // parents[n]: id at level n → id at level n+1
}

export function createLayers(width: number, height: number, levels: number): Layers {
  const n = width * height
  return {
    width,
    height,
    mask: new Uint8Array(n),
    heightmap: new Uint16Array(n),
    regions: new Uint32Array(n),
    parents: Array.from({ length: Math.max(0, levels - 1) }, () => new Map()),
  }
}

/** Region id at `level` covering `pixel`; 0 if unassigned anywhere on the way up. */
export function regionAt(l: Layers, pixel: number, level: number): number {
  let id = l.regions[pixel]
  for (let n = 0; n < level && id; n++) id = l.parents[n].get(id) ?? 0
  return id
}
