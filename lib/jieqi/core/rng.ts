// Deterministic RNG utilities. The shuffle that deals a Jieqi game must be
// reproducible from a seed so that rooms, replays and tests can recreate the
// exact same hidden layout, and so the server can prove (via the commitment
// hash in setup.ts) that the layout was fixed before the first move.

/** mulberry32 PRNG — same generator family the PacClone zobrist table uses. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit string hash — turns a textual seed into a uint32. */
export function seedFromString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Build an RNG from a numeric or textual seed. */
export function rngFromSeed(seed: number | string): () => number {
  return mulberry32(typeof seed === "number" ? seed >>> 0 : seedFromString(seed));
}

/** In-place Fisher–Yates shuffle driven by the supplied RNG. Returns the array. */
export function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}
