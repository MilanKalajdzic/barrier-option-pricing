// Seeded random numbers, so the same inputs always give the same simulated prices.

// mulberry32: a small, fast 32-bit PRNG. Returns uniforms in [0, 1).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Standard normal draws by Marsaglia's polar method (Box-Muller without the cos/sin calls),
// using both outputs of each accepted pair.
export function normalGenerator(seed) {
  const uniform = mulberry32(seed);
  let spare = 0;
  let hasSpare = false;
  return () => {
    if (hasSpare) {
      hasSpare = false;
      return spare;
    }
    let u;
    let v;
    let s;
    do {
      u = 2 * uniform() - 1;
      v = 2 * uniform() - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const m = Math.sqrt((-2 * Math.log(s)) / s);
    spare = v * m;
    hasSpare = true;
    return u * m;
  };
}
