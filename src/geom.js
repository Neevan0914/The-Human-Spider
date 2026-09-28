// Geometry helpers: a flat-shaded triangle builder and convex polygon utilities
// used by the city generator, the landmarks and the collision world.
import * as THREE from 'three';

export class Builder {
  constructor() {
    this.p = [];
    this.n = [];
    this.uv = [];
  }

  // Adds a triangle and flips its winding if needed so it faces along n.
  tri(a, b, c, n, ua = [0, 0], ub = [0, 0], uc = [0, 0]) {
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
    const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
    const cx = e1y * e2z - e1z * e2y;
    const cy = e1z * e2x - e1x * e2z;
    const cz = e1x * e2y - e1y * e2x;
    if (cx * n[0] + cy * n[1] + cz * n[2] < 0) {
      let t = b; b = c; c = t;
      t = ub; ub = uc; uc = t;
    }
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) this.n.push(n[0], n[1], n[2]);
    this.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
  }

  // a, b, c, d go around the quad in order.
  quad(a, b, c, d, n, ua, ub, uc, ud) {
    this.tri(a, b, c, n, ua, ub, uc);
    this.tri(a, c, d, n, ua, uc, ud);
  }

  // Axis-aligned box with simple world-scaled UVs.
  box(cx, cy, cz, w, h, d, uvScale = 1) {
    const x0 = cx - w / 2, x1 = cx + w / 2;
    const y0 = cy - h / 2, y1 = cy + h / 2;
    const z0 = cz - d / 2, z1 = cz + d / 2;
    const s = uvScale;
    this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0], [0, 0], [d * s, 0], [d * s, h * s], [0, h * s]);
    this.quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [-1, 0, 0], [0, 0], [d * s, 0], [d * s, h * s], [0, h * s]);
    this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], [0, 0], [w * s, 0], [w * s, d * s], [0, d * s]);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], [0, -1, 0], [0, 0], [w * s, 0], [w * s, d * s], [0, d * s]);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [0, 0], [w * s, 0], [w * s, h * s], [0, h * s]);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [0, 0], [w * s, 0], [w * s, h * s], [0, h * s]);
  }

  get empty() { return this.p.length === 0; }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// ---------- 2D convex polygons in the x/z plane: [[x, z], ...] ----------

export function polyArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

// Positive signed area; outward edge normal is then (dz, -dx).
export function ensureCCW(poly) {
  return polyArea(poly) < 0 ? poly.slice().reverse() : poly.slice();
}

export function edgeNormal(a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l = Math.hypot(dx, dz) || 1;
  return [dz / l, -dx / l];
}

export function centroid(poly) {
  let x = 0, z = 0;
  for (const p of poly) { x += p[0]; z += p[1]; }
  return [x / poly.length, z / poly.length];
}

export function rectPoly(cx, cz, w, d) {
  return [[cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2], [cx + w / 2, cz + d / 2], [cx - w / 2, cz + d / 2]];
}

// Keep the part of the polygon where nx*x + nz*z <= d (Sutherland-Hodgman).
export function clipPolygon(poly, nx, nz, d) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = nx * a[0] + nz * a[1] - d;
    const db = nx * b[0] + nz * b[1] - d;
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out.length >= 3 ? out : null;
}

// Shrinks a convex CCW polygon by distance d. Returns null if it collapses.
// Drops near-duplicate and collinear vertices left behind by clipping.
export function cleanPolygon(poly, eps = 0.4) {
  let out = poly.slice();
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length], p = out[i], b = out[(i + 1) % out.length];
      const cross = (p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0]);
      const lab = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      if (Math.hypot(p[0] - a[0], p[1] - a[1]) < eps || Math.abs(cross) / lab < eps * 0.25) {
        out.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return out;
}

export function insetPolygon(poly, d) {
  poly = ensureCCW(cleanPolygon(poly));
  // Offset every edge line inward; edges that vanish are dropped and their
  // neighbours extended (correct for convex polygons).
  let lines = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const [nx, nz] = edgeNormal(a, b);
    lines.push([nx, nz, nx * a[0] + nz * a[1] - d]);
  }
  while (lines.length >= 3) {
    const n = lines.length;
    const out = [];
    let bad = false;
    for (let i = 0; i < n; i++) {
      const l1 = lines[(i - 1 + n) % n], l2 = lines[i];
      const det = l1[0] * l2[1] - l1[1] * l2[0];
      if (Math.abs(det) < 1e-9) { bad = true; break; }
      out.push([(l1[2] * l2[1] - l1[1] * l2[2]) / det, (l1[0] * l2[2] - l1[2] * l2[0]) / det]);
    }
    if (bad) return null;
    // Edge i runs from out[i] to out[i+1] and must keep its direction (-nz, nx).
    let drop = -1;
    for (let i = 0; i < n; i++) {
      const a = out[i], b = out[(i + 1) % n], l = lines[i];
      if ((b[0] - a[0]) * -l[1] + (b[1] - a[1]) * l[0] < -1e-6) { drop = i; break; }
    }
    if (drop < 0) return polyArea(out) < 4 ? null : out;
    lines.splice(drop, 1);
  }
  return null;
}

export function minWidth(poly) {
  // Smallest extent of the polygon across any of its edge normals.
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [nx, nz] = edgeNormal(poly[i], poly[(i + 1) % poly.length]);
    let lo = Infinity, hi = -Infinity;
    for (const p of poly) {
      const v = nx * p[0] + nz * p[1];
      lo = Math.min(lo, v); hi = Math.max(hi, v);
    }
    best = Math.min(best, hi - lo);
  }
  return best;
}

// Replaces vertex i with an arc of the given radius (for rounded corners).
export function roundCorner(poly, i, radius, steps = 6) {
  const n = poly.length;
  const p = poly[i], a = poly[(i - 1 + n) % n], b = poly[(i + 1) % n];
  const ua = norm2([a[0] - p[0], a[1] - p[1]]);
  const ub = norm2([b[0] - p[0], b[1] - p[1]]);
  const half = Math.acos(Math.max(-1, Math.min(1, ua[0] * ub[0] + ua[1] * ub[1]))) / 2;
  const t = radius / Math.tan(half);
  const pa = [p[0] + ua[0] * t, p[1] + ua[1] * t];
  const pb = [p[0] + ub[0] * t, p[1] + ub[1] * t];
  const bis = norm2([ua[0] + ub[0], ua[1] + ub[1]]);
  const cd = radius / Math.sin(half);
  const c = [p[0] + bis[0] * cd, p[1] + bis[1] * cd];
  let a0 = Math.atan2(pa[1] - c[1], pa[0] - c[0]);
  let a1 = Math.atan2(pb[1] - c[1], pb[0] - c[0]);
  let da = a1 - a0;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  const arc = [];
  for (let s = 0; s <= steps; s++) {
    const ang = a0 + da * (s / steps);
    arc.push([c[0] + Math.cos(ang) * radius, c[1] + Math.sin(ang) * radius]);
  }
  return [...poly.slice(0, i), ...arc, ...poly.slice(i + 1)];
}

function norm2(v) {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
}

// ---------- Extrusion ----------

// Vertical walls around a polygon. uv(s, len, y, edgeIndex) -> [u, v].
export function extrudeWalls(b, poly, y0, y1, uv) {
  poly = ensureCCW(poly);
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], c = poly[(i + 1) % n];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (len < 1e-3) continue;
    const [nx, nz] = edgeNormal(a, c);
    const nn = [nx, 0, nz];
    b.quad(
      [a[0], y0, a[1]], [c[0], y0, c[1]], [c[0], y1, c[1]], [a[0], y1, a[1]], nn,
      uv(0, len, y0, i), uv(len, len, y0, i), uv(len, len, y1, i), uv(0, len, y1, i)
    );
  }
}

// Flat horizontal cap (fan triangulation of a convex polygon).
export function capPolygon(b, poly, y, up = true, uvScale = 1 / 8) {
  const n = up ? [0, 1, 0] : [0, -1, 0];
  const p0 = poly[0];
  for (let i = 1; i < poly.length - 1; i++) {
    const p1 = poly[i], p2 = poly[i + 1];
    b.tri(
      [p0[0], y, p0[1]], [p1[0], y, p1[1]], [p2[0], y, p2[1]], n,
      [p0[0] * uvScale, p0[1] * uvScale], [p1[0] * uvScale, p1[1] * uvScale], [p2[0] * uvScale, p2[1] * uvScale]
    );
  }
}

// Solid slab (walls + top), e.g. cornices, parapets, sidewalks.
export function slab(b, poly, y0, y1, uvScale = 1 / 4, top = true) {
  extrudeWalls(b, poly, y0, y1, (s, len, y) => [s * uvScale, y * uvScale]);
  if (top) capPolygon(b, poly, y1, true, uvScale);
}

// One Builder per material; turned into meshes at the end.
export class MatBuilders {
  constructor() { this.map = new Map(); }
  get(mat) {
    let b = this.map.get(mat);
    if (!b) this.map.set(mat, b = new Builder());
    return b;
  }
  toMeshes(parent, cast = true, receive = true) {
    for (const [mat, b] of this.map) {
      if (b.empty) continue;
      const m = new THREE.Mesh(b.build(), mat);
      m.castShadow = cast;
      m.receiveShadow = receive;
      parent.add(m);
    }
    this.map.clear();
  }
}

export function regularPoly(cx, cz, r, n, rot = Math.PI / n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return ensureCCW(out);
}

// Parapet: a low wall ring with an outer face, inner face and a top.
export function parapet(b, poly, y0, y1, thick = 0.4, outset = 0.15) {
  const outer = insetPolygon(poly, -outset);
  const inner = insetPolygon(poly, thick - outset);
  if (!outer || !inner || outer.length !== inner.length) return;
  const uv = (s, len, y) => [s / 4, y / 4];
  extrudeWalls(b, outer, y0, y1, uv);
  // inner walls face inward
  const n = inner.length;
  for (let i = 0; i < n; i++) {
    const a = inner[i], c = inner[(i + 1) % n];
    const [nx, nz] = edgeNormal(a, c);
    b.quad([a[0], y0, a[1]], [c[0], y0, c[1]], [c[0], y1, c[1]], [a[0], y1, a[1]], [-nx, 0, -nz], [0, 0], [1, 0], [1, 1], [0, 1]);
    const o0 = outer[i], o1 = outer[(i + 1) % n];
    b.quad([a[0], y1, a[1]], [c[0], y1, c[1]], [o1[0], y1, o1[1]], [o0[0], y1, o0[1]], [0, 1, 0], [0, 0], [1, 0], [1, 1], [0, 1]);
  }
}
