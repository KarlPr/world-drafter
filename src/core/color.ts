/** Deterministic id → 0xRRGGBB. Odd multiplier mod 2^24 is a bijection, so ids < 2^24 never collide and id 0 is black. */
export function idToRgb(id: number): number {
  return Math.imul(id, 0x9e3779b1) & 0xffffff
}
