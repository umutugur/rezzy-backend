// src/utils/hexGrid.js
const EARTH_RADIUS_M = 6378137;

const DEG2RAD = Math.PI / 180;

// Pointy axial directions (q, r)
// Canonical order: E, NE, NW, W, SW, SE (RedBlob uyumlu)
const AXIAL_DIRS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

export function projectLngLatToLocalMeters([lng, lat], [lng0, lat0]) {
  const φ0 = lat0 * DEG2RAD;

  const x = (lng - lng0) * DEG2RAD * EARTH_RADIUS_M * Math.cos(φ0);
  const y = (lat - lat0) * DEG2RAD * EARTH_RADIUS_M;

  return [x, y];
}

export function pointyPixelToAxialFractional([x, y], sizeMeters) {
  const size = Number(sizeMeters);
  if (!Number.isFinite(size) || size <= 0) return null;

  const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / size;
  const r = ((2 / 3) * y) / size;

  return [q, r];
}

export function axialRound(q, r) {
  // cube
  let x = q;
  let z = r;
  let y = -x - z;

  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);

  if (dx > dy && dx > dz) {
    rx = -ry - rz;
  } else if (dy > dz) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  // axial: q = x, r = z
  return [rx, rz];
}

export function axialToCube(q, r) {
  const x = q;
  const z = r;
  const y = -x - z;
  return [x, y, z];
}

export function cubeDistance([x, y, z]) {
  return Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
}

/**
 * Deterministic spiral enumeration:
 * - index 1 => (0,0)
 * - then ring 1, ring 2...
 *
 * Ring walk definition:
 * start at (q = 0, r = -k) (top for our chosen dirs),
 * then walk 6 sides in AXIAL_DIRS order, k steps each.
 *
 * This is canonical as long as dirs + start are fixed.
 */
export function axialToSpiralIndex(q, r) {
  q = Number(q);
  r = Number(r);
  if (!Number.isFinite(q) || !Number.isFinite(r)) return null;

  if (q === 0 && r === 0) return 1;

  const [x, y, z] = axialToCube(q, r);
  const k = cubeDistance([x, y, z]);

  // number of cells before ring k:
  // 1 + 3k(k-1)
  const before = 1 + 3 * k * (k - 1);

  // walk ring k and find offset
  let cq = 0;
  let cr = -k;

  let offset = 0;
  for (let side = 0; side < 6; side++) {
    const [dq, dr] = AXIAL_DIRS[side];
    for (let step = 0; step < k; step++) {
      // check current cell
      if (cq === q && cr === r) {
        return before + offset + 1; // +1 because before counts up to previous ring
      }

      // move
      cq += dq;
      cr += dr;
      offset++;
    }
  }

  // The last cell check (in case match is exactly at end)
  if (cq === q && cr === r) return before + offset + 1;

  // Should never happen if ring logic matches distance
  return null;
}

export function lngLatToHexId({
  customerLngLat,
  originLngLat,
  cellSizeMeters,
  radiusMeters,
}) {
  const [x, y] = projectLngLatToLocalMeters(customerLngLat, originLngLat);

  const frac = pointyPixelToAxialFractional([x, y], cellSizeMeters);
  if (!frac) return { ok: false, reason: "INVALID_GRID_SIZE" };

  const [fq, fr] = frac;
  const [q, r] = axialRound(fq, fr);

  // radius check via ring distance
  const k = cubeDistance(axialToCube(q, r));
  const kMax = Math.floor(Number(radiusMeters) / Number(cellSizeMeters));

  if (!Number.isFinite(kMax) || kMax < 0) {
    return { ok: false, reason: "INVALID_GRID_RADIUS" };
  }

  if (k > kMax) {
    return { ok: false, reason: "OUT_OF_RADIUS", q, r, ring: k, ringMax: kMax };
  }

  const idx = axialToSpiralIndex(q, r);
  if (!idx) return { ok: false, reason: "INDEX_NOT_COMPUTED", q, r };

  return {
    ok: true,
    q,
    r,
    ring: k,
    ringMax: kMax,
    zoneId: `hex-${idx}`,
  };
}