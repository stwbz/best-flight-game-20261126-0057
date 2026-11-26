// Seeded randomness. One seed reproduces one world, so a bug replays and a
// screenshot restages exactly. No Math.random anywhere in the game.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A small deterministic 2D value-noise field built from one seeded stream.
// Integer lattice hashed per coordinate, so the same (x, z) always gives the
// same value regardless of call order.
export function makeNoise2D(seed) {
  const perm = new Uint8Array(512);
  const rng = mulberry32(seed);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) base[i] = i;
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const t = base[i];
    base[i] = base[j];
    base[j] = t;
  }
  for (let i = 0; i < 512; i += 1) perm[i] = base[i & 255];

  function lattice(ix, iz) {
    return perm[(perm[ix & 255] + iz) & 255] / 255;
  }
  function smooth(t) {
    return t * t * (3 - 2 * t);
  }
  function noise(x, z) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const a = lattice(ix, iz);
    const b = lattice(ix + 1, iz);
    const c = lattice(ix, iz + 1);
    const d = lattice(ix + 1, iz + 1);
    const u = smooth(fx);
    const v = smooth(fz);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
  }
  // Fractal Brownian motion: 4 octaves, amplitude halves each time.
  function fbm(x, z, octaves) {
    let sum = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o += 1) {
      sum += amp * noise(x * freq, z * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / norm;
  }
  return { noise, fbm };
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Shortest signed angle from `from` to `to`, in (-PI, PI].
export function angleDiff(to, from) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

// Smooth bump: 1 at centre, 0 outside radius, smooth shoulders.
export function bump(dist, radius) {
  if (dist >= radius) return 0;
  const t = 1 - (dist * dist) / (radius * radius);
  return t * t * (3 - 2 * t);
}
