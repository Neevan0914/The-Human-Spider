// Collision world made of convex vertical prisms (a convex footprint extruded
// between y0 and y1). Every building tier, spire and roof box is one prism.
// A uniform grid keeps sphere and ray queries local.
import { ensureCCW, edgeNormal } from './geom.js';

export class Colliders {
  constructor(cell = 40) {
    this.list = [];
    this.cell = cell;
    this.grid = new Map();
    this.stamp = 0;
    this._near = [];
  }

  _key(ix, iz) { return (ix + 4096) * 8192 + (iz + 4096); }

  addPrism(poly, y0, y1, tag = null) {
    poly = ensureCCW(poly);
    const planes = [];
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const [nx, nz] = edgeNormal(a, b);
      planes.push(nx, nz, nx * a[0] + nz * a[1]);
      minX = Math.min(minX, a[0]); maxX = Math.max(maxX, a[0]);
      minZ = Math.min(minZ, a[1]); maxZ = Math.max(maxZ, a[1]);
    }
    const c = { poly, planes, y0, y1, minX, maxX, minZ, maxZ, tag, mark: 0 };
    this.list.push(c);
    const s = this.cell;
    for (let ix = Math.floor(minX / s); ix <= Math.floor(maxX / s); ix++) {
      for (let iz = Math.floor(minZ / s); iz <= Math.floor(maxZ / s); iz++) {
        const k = this._key(ix, iz);
        let arr = this.grid.get(k);
        if (!arr) this.grid.set(k, arr = []);
        arr.push(c);
      }
    }
    return c;
  }

  addBox(cx, cz, w, d, y0, y1, tag) {
    return this.addPrism([[cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2], [cx + w / 2, cz + d / 2], [cx - w / 2, cz + d / 2]], y0, y1, tag);
  }

  near(minX, minZ, maxX, maxZ, out = this._near) {
    out.length = 0;
    const stamp = ++this.stamp;
    const s = this.cell;
    const x0 = Math.floor(minX / s), x1 = Math.floor(maxX / s);
    const z0 = Math.floor(minZ / s), z1 = Math.floor(maxZ / s);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const arr = this.grid.get(this._key(ix, iz));
        if (!arr) continue;
        for (const c of arr) {
          if (c.mark === stamp) continue;
          c.mark = stamp;
          if (c.maxX < minX || c.minX > maxX || c.maxZ < minZ || c.minZ > maxZ) continue;
          out.push(c);
        }
      }
    }
    return out;
  }

  // Signed distance approximation (max over face planes). Writes normal to n.
  signed(c, x, y, z, n) {
    let best = y - c.y1;
    n.set(0, 1, 0);
    const bot = c.y0 - y;
    if (bot > best) { best = bot; n.set(0, -1, 0); }
    const pl = c.planes;
    for (let i = 0; i < pl.length; i += 3) {
      const d = pl[i] * x + pl[i + 1] * z - pl[i + 2];
      if (d > best) { best = d; n.set(pl[i], 0, pl[i + 1]); }
    }
    return best;
  }

  // Pushes the sphere at p (Vector3, modified) out of every prism.
  // Calls onContact(normal, collider) for each contact.
  // stepH: low obstacles (curbs, ledges) whose top is within stepH of the
  // sphere's bottom are climbed instead of treated as walls.
  resolveSphere(p, r, onContact, stepH = 0) {
    const list = this.near(p.x - r, p.z - r, p.x + r, p.z + r, []);
    const n = this._n || (this._n = p.clone());
    let hit = false;
    for (let iter = 0; iter < 2; iter++) {
      for (const c of list) {
        if (p.y - r > c.y1 || p.y + r < c.y0) continue;
        const sd = this.signed(c, p.x, p.y, p.z, n);
        if (sd < r) {
          if (stepH > 0 && n.y === 0 && c.y1 - (p.y - r) < stepH) {
            p.y = c.y1 + r;
            n.set(0, 1, 0);
          } else {
            const push = r - sd;
            p.x += n.x * push; p.y += n.y * push; p.z += n.z * push;
          }
          hit = true;
          if (onContact) onContact(n, c);
        }
      }
    }
    return hit;
  }

  // Is the point inside (or within margin of) any prism?
  pointInside(x, y, z, margin = 0) {
    const list = this.near(x - margin, z - margin, x + margin, z + margin, []);
    const n = this._n2 || (this._n2 = { set() { return this; } });
    for (const c of list) {
      if (this.signed(c, x, y, z, n) < margin) return c;
    }
    return null;
  }

  // Ray against prisms (Cyrus-Beck clipping). Returns the closest hit or null.
  raycast(o, dir, maxT, ignoreInside = true) {
    const ex = o.x + dir.x * maxT, ez = o.z + dir.z * maxT;
    const list = this.near(Math.min(o.x, ex), Math.min(o.z, ez), Math.max(o.x, ex), Math.max(o.z, ez), []);
    let bestT = maxT, best = null, bnx = 0, bny = 0, bnz = 0;
    for (const c of list) {
      let tIn = 0, tOut = bestT, nx = 0, ny = 0, nz = 0, entered = false, miss = false;
      // top / bottom planes
      const planesY = [[1, c.y1], [-1, -c.y0]];
      for (const [sy, d] of planesY) {
        const denom = sy * dir.y;
        const dist0 = sy * o.y - d;
        if (Math.abs(denom) < 1e-9) { if (dist0 > 0) { miss = true; break; } continue; }
        const t = -dist0 / denom;
        if (denom < 0) { if (t > tIn) { tIn = t; nx = 0; ny = sy; nz = 0; entered = true; } }
        else if (t < tOut) tOut = t;
        if (tIn > tOut) { miss = true; break; }
      }
      if (miss) continue;
      const pl = c.planes;
      for (let i = 0; i < pl.length; i += 3) {
        const denom = pl[i] * dir.x + pl[i + 1] * dir.z;
        const dist0 = pl[i] * o.x + pl[i + 1] * o.z - pl[i + 2];
        if (Math.abs(denom) < 1e-9) { if (dist0 > 0) { miss = true; break; } continue; }
        const t = -dist0 / denom;
        if (denom < 0) { if (t > tIn) { tIn = t; nx = pl[i]; ny = 0; nz = pl[i + 1]; entered = true; } }
        else if (t < tOut) tOut = t;
        if (tIn > tOut) { miss = true; break; }
      }
      if (miss) continue;
      if (!entered) { if (ignoreInside) continue; tIn = 0; }
      if (tIn < bestT) { bestT = tIn; best = c; bnx = nx; bny = ny; bnz = nz; }
    }
    if (!best) return null;
    return {
      t: bestT,
      point: { x: o.x + dir.x * bestT, y: o.y + dir.y * bestT, z: o.z + dir.z * bestT },
      normal: { x: bnx, y: bny, z: bnz },
      collider: best,
    };
  }
}
