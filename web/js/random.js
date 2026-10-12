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

// Standard normal draws by the Box-Muller transform, using both outputs of each pair.
export function normalGenerator(seed) {
  const uniform = mulberry32(seed);
  let spare = null;
  return () => {
    if (spare !== null) {
      const z = spare;
      spare = null;
      return z;
    }
    const radius = Math.sqrt(-2 * Math.log(1 - uniform())); // 1 - u lies in (0, 1]
    const angle = 2 * Math.PI * uniform();
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
}
