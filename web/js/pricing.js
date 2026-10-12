// Closed-form prices and Greeks under Black-Scholes / GBM with no dividends.
// A scalar port of src/barrier_pricing/analytical.py and greeks.py; web/tests/pricing.test.js
// checks it against values written by the Python package.

// Broadie-Glasserman-Kou (1997) continuity-correction constant: -zeta(1/2) / sqrt(2*pi).
export const BGK_BETA = 0.5826;

// Standard normal CDF: Hart (1968) double-precision algorithm, as given by West (2005).
export function normCdf(x) {
  const a = Math.abs(x);
  let c = 0;
  if (a <= 37) {
    const e = Math.exp((-a * a) / 2);
    if (a < 7.07106781186547) {
      let n = 3.52624965998911e-2 * a + 0.700383064443688;
      n = n * a + 6.37396220353165;
      n = n * a + 33.912866078383;
      n = n * a + 112.079291497871;
      n = n * a + 221.213596169931;
      n = n * a + 220.206867912376;
      let d = 8.83883476483184e-2 * a + 1.75566716318264;
      d = d * a + 16.064177579207;
      d = d * a + 86.7807322029461;
      d = d * a + 296.564248779674;
      d = d * a + 637.333633378831;
      d = d * a + 793.826512519948;
      d = d * a + 440.413735824752;
      c = (e * n) / d;
    } else {
      let b = a + 0.65;
      b = a + 4 / b;
      b = a + 3 / b;
      b = a + 2 / b;
      b = a + 1 / b;
      c = e / b / 2.506628274631;
    }
  }
  return x > 0 ? 1 - c : c;
}

// Black-Scholes price of a European call.
export function bsCall(S, K, r, sigma, T) {
  if (T <= 0) return Math.max(S - K, 0);
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  return S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
}

// Black-Scholes delta of a European call, N(d1).
export function bsCallDelta(S, K, r, sigma, T) {
  if (T <= 0) return S > K ? 1 : 0;
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * Math.sqrt(T));
  return normCdf(d1);
}

// Up-and-out call with a continuously monitored barrier H (Haug 2007).
// Worthless once the spot reaches H, and always worthless if K >= H.
export function uocCall(S, K, H, r, sigma, T) {
  if (T <= 0) return S < H ? Math.max(S - K, 0) : 0;
  if (K >= H || S >= H) return 0;

  const mu = (r - 0.5 * sigma ** 2) / sigma ** 2;
  const vol = sigma * Math.sqrt(T);
  const discK = K * Math.exp(-r * T);

  const x1 = Math.log(S / K) / vol + (1 + mu) * vol;
  const x2 = Math.log(S / H) / vol + (1 + mu) * vol;
  const y1 = Math.log((H * H) / (S * K)) / vol + (1 + mu) * vol;
  const y2 = Math.log(H / S) / vol + (1 + mu) * vol;
  const up = (H / S) ** (2 * (mu + 1));
  const down = (H / S) ** (2 * mu);

  const A = S * normCdf(x1) - discK * normCdf(x1 - vol);
  const B = S * normCdf(x2) - discK * normCdf(x2 - vol);
  const C = S * up * normCdf(-y1) - discK * down * normCdf(-y1 + vol);
  const D = S * up * normCdf(-y2) - discK * down * normCdf(-y2 + vol);

  // Clip: A - B + C - D cancels to ~1e-15 (either sign) as S approaches H.
  return Math.max(A - B + C - D, 0);
}

// BGK continuity correction for an up barrier monitored every dt.
// "continuous": barrier to simulate with to approximate the continuous price (shifts down).
// "discrete": barrier to put into the closed form to price the discrete contract (shifts up).
export function bgkBarrier(H, sigma, dt, target) {
  const shift = Math.exp(BGK_BETA * sigma * Math.sqrt(dt));
  if (target === "continuous") return H / shift;
  if (target === "discrete") return H * shift;
  throw new Error(`target must be "continuous" or "discrete", got ${JSON.stringify(target)}`);
}

// dV/dS of the up-and-out call by central differences.
export function uocDelta(S, K, H, r, sigma, T, eps = 1e-2) {
  return (uocCall(S + eps, K, H, r, sigma, T) - uocCall(S - eps, K, H, r, sigma, T)) / (2 * eps);
}

// d2V/dS2 of the up-and-out call by central differences.
export function uocGamma(S, K, H, r, sigma, T, eps = 1e-2) {
  const up = uocCall(S + eps, K, H, r, sigma, T);
  const mid = uocCall(S, K, H, r, sigma, T);
  const down = uocCall(S - eps, K, H, r, sigma, T);
  return (up - 2 * mid + down) / eps ** 2;
}
