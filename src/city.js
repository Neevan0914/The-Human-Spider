// Procedural midtown Manhattan: a street grid with Broadway cutting across it,
// generic buildings on subdivided lots, three landmarks, a park, traffic,
// street furniture and the rivers around the island.
import * as THREE from 'three';
import {
  Builder, MatBuilders, rectPoly, clipPolygon, insetPolygon, extrudeWalls, capPolygon,
  slab, polyArea, minWidth, centroid, ensureCCW, edgeNormal, parapet,
} from './geom.js';
import { mulberry32 } from './textures.js';
import { buildEmpireState, buildChrysler, buildFlatiron, facadeUV, storefrontUV } from './landmarks.js';

export const GRID = {
  AVE_SP: 130, AVE_W: 24, ST_SP: 60, ST_W: 14, SIDEWALK: 3.5,
  KMIN: -5, KMAX: 5, NMIN: 17, NMAX: 46,
};
export const aveX = k => k * GRID.AVE_SP;
export const streetZ = n => -(n - 28) * GRID.ST_SP;

export const ISLAND = {
  minX: aveX(GRID.KMIN) - 45, maxX: aveX(GRID.KMAX) + 45,
  minZ: streetZ(GRID.NMAX) - 45, maxZ: streetZ(GRID.NMIN) + 45,
};

// Broadway: a diagonal avenue crossing 5th Ave just north of 23rd St.
const BA = THREE.MathUtils.degToRad(30);
export const BROADWAY = {
  nx: Math.cos(BA), nz: -Math.sin(BA), hw: 10,
  zc: 264.5,
  dir: [Math.sin(BA), Math.cos(BA)],
};
BROADWAY.c = BROADWAY.nz * BROADWAY.zc;
export const broadwayS = (x, z) => BROADWAY.nx * x + BROADWAY.nz * z - BROADWAY.c;

const AVE_NAMES = {
  '-5': '10 Av', '-4': '9 Av', '-3': '8 Av', '-2': '7 Av', '-1': '6 Av', '0': '5 Av',
  '1': 'Madison Av', '2': 'Park Av', '3': 'Lexington Av', '4': '3 Av', '5': '2 Av',
};

// Street-sign style location for the HUD, e.g. "W 34 St & 5 Av".
export function locate(x, z) {
  const n = Math.round(28 - z / GRID.ST_SP);
  const k = Math.max(GRID.KMIN, Math.min(GRID.KMAX, Math.round(x / GRID.AVE_SP)));
  const side = x < 0 ? 'W' : 'E';
  const nn = Math.max(GRID.NMIN, Math.min(GRID.NMAX, n));
  const ave = Math.abs(broadwayS(x, z)) < 40 ? 'Broadway' : AVE_NAMES[k];
  return `${side} ${nn} St & ${ave}`;
}

const TSQ = { x: aveX(-2), z: BROADWAY.zc + aveX(-2) / Math.tan(BA) };

function heightFor(x, z, r) {
  const dMid = Math.hypot(x - 150, z + 560);
  const mid = Math.exp(-((dMid / 520) ** 2));
  const dFlat = Math.hypot(x - 20, z - 300);
  const low = Math.exp(-((dFlat / 200) ** 2));
  let h = 16 + Math.pow(r(), 1.7) * (38 + 120 * mid);
  if (r() < 0.05 + 0.1 * mid) h = 110 + r() * 80 * (0.5 + mid);
  h *= 1 - 0.5 * low;
  // Keep the neighbours of the landmarks lower so the icons read clearly.
  for (const [lx, lz, lim] of [[-65, -330, 120], [427, -870, 110], [30, 330, 45]]) {
    const d = Math.hypot(x - lx, z - lz);
    if (d < 170) h = Math.min(h, lim + (d / 170) * 60);
  }
  return Math.max(12, Math.min(200, h));
}

function pickStyle(h, r, nearTSQ) {
  const tall = ['glass', 'darkGlass', 'greenGlass', 'limestone', 'deco', 'concrete'];
  const mid = ['limestone', 'deco', 'brick', 'concrete', 'glass', 'tanBrick', 'brownBrick', 'darkGlass'];
  const low = ['brick', 'brownBrick', 'tanBrick', 'limestone', 'brick', 'concrete'];
  const list = h > 110 ? tall : h > 45 ? mid : low;
  if (nearTSQ && r() < 0.4) return 'glass';
  return list[Math.floor(r() * list.length)];
}

export function buildCity(scene, M, col, onProgress) {
  const r = mulberry32(20240901);
  const root = new THREE.Group();
  root.name = 'city';
  scene.add(root);

  // Sectors keep the merged meshes frustum-cullable.
  const SECT = 360;
  const sectors = new Map();
  const sector = (x, z) => {
    const k = Math.floor(x / SECT) + ',' + Math.floor(z / SECT);
    let s = sectors.get(k);
    if (!s) sectors.set(k, s = new MatBuilders());
    return s;
  };
  const ground = new MatBuilders();

  const instances = {
    waterTowers: [], trees: [], lamps: [], lights: [], acUnits: [],
  };

  const landmarks = [];
  const esb = buildEmpireState(M, col);
  root.add(esb.group);
  landmarks.push(esb);
  const chrysler = buildChrysler(M, col);
  root.add(chrysler.group);
  landmarks.push(chrysler);

  const parkPolys = [];

  // ---- Blocks ------------------------------------------------------------
  for (let k = GRID.KMIN; k < GRID.KMAX; k++) {
    for (let n = GRID.NMIN; n < GRID.NMAX; n++) {
      const x0 = aveX(k) + GRID.AVE_W / 2, x1 = aveX(k + 1) - GRID.AVE_W / 2;
      const zS = streetZ(n) - GRID.ST_W / 2, zN = streetZ(n + 1) + GRID.ST_W / 2;
      const block = [[x0, zN], [x1, zN], [x1, zS], [x0, zS]];

      // Cut Broadway out of the block.
      let pieces = [block];
      const ss = block.map(p => broadwayS(p[0], p[1]));
      if (Math.min(...ss) < BROADWAY.hw && Math.max(...ss) > -BROADWAY.hw) {
        pieces = [
          clipPolygon(block, BROADWAY.nx, BROADWAY.nz, BROADWAY.c - BROADWAY.hw),
          clipPolygon(block, -BROADWAY.nx, -BROADWAY.nz, -(BROADWAY.c + BROADWAY.hw)),
        ].filter(p => p && polyArea(ensureCCW(p)) > 60);
      }

      for (const piece of pieces) {
        const cxz = centroid(piece);
        const sb = sector(cxz[0], cxz[1]);
        // Sidewalk slab with curb
        slab(sb.get(M.sidewalk), piece, 0, 0.18, 1 / 6);
        col.addPrism(piece, -5, 0.18);

        const lotArea = insetPolygon(piece, GRID.SIDEWALK);
        if (!lotArea) continue;

        const isESB = k === -1 && n === 33;
        const isChrysler = k === 3 && n === 42;
        const isFlatiron = k === 0 && n === 22 && broadwayS(cxz[0], cxz[1]) < 0;
        const isPark = k === 0 && (n === 23 || n === 24);

        if (isESB) continue;
        if (isFlatiron) {
          const fl = buildFlatiron(M, col, lotArea);
          root.add(fl.group);
          landmarks.push(fl);
          continue;
        }
        if (isPark) {
          parkPolys.push(lotArea);
          continue;
        }
        let area = lotArea;
        if (isChrysler) {
          // Chrysler takes the Lexington Ave end; fill the rest with generic lots.
          area = clipPolygon(lotArea, -1, 0, -(427 + 20 + 1.5));
          if (!area) continue;
        }
        subdivide(area, r).forEach(lot => genericBuilding(lot, k, n));
      }
    }
    onProgress && onProgress((k - GRID.KMIN + 1) / (GRID.KMAX - GRID.KMIN) * 0.6);
  }

  // ---- Generic building ---------------------------------------------------
  function genericBuilding(poly, k, n) {
    const c = centroid(poly);
    const nearTSQ = Math.hypot(c[0] - TSQ.x, c[1] - TSQ.z) < 120;
    let h = heightFor(c[0], c[1], r);
    const area = polyArea(ensureCCW(poly));
    if (area < 250) h = Math.min(h, 45);
    const style = pickStyle(h, r, nearTSQ);
    const fac = M.facades[style];
    const sb = sector(c[0], c[1]);
    const uOff = Math.floor(r() * 8), vOff = Math.floor(r() * 8);
    const glassy = style.includes('lass');
    const shops = !glassy || r() < 0.5;

    // Tiers: masonry towers step back, glass towers mostly rise straight.
    const tiers = [];
    let cur = poly, y = 0;
    const cuts = h > 60 && (!glassy ? r() < 0.75 : r() < 0.25)
      ? (h > 120 ? [0.45, 0.72, 0.9] : [0.6, 0.85]) : [];
    for (const f of cuts) {
      const yc = Math.round(h * f / 3.5) * 3.5;
      tiers.push([cur, y, yc]);
      const next = insetPolygon(cur, 2.5 + r() * 3.5);
      if (!next || minWidth(next) < 8) { cur = null; break; }
      cur = next; y = yc;
    }
    if (cur) tiers.push([cur, y, h]);
    else h = tiers[tiers.length - 1][2];

    const trim = glassy ? M.darkTrim : M.trim;
    tiers.forEach(([p, y0, y1], i) => {
      const uv = facadeUV(fac, uOff, vOff, 5);
      if (i === 0 && shops) {
        extrudeWalls(sb.get(M.storefront), p, 0, 5, storefrontUV(r()));
        extrudeWalls(sb.get(fac), p, 5, y1, uv);
      } else {
        extrudeWalls(sb.get(fac), p, y0, y1, uv);
      }
      if (!glassy) {
        const band = insetPolygon(p, -0.4);
        if (band) slab(sb.get(trim), band, y1 - 0.9, y1 + 0.2, 1 / 4, false);
        if (i === 0 && shops) {
          const b2 = insetPolygon(p, -0.25);
          if (b2) slab(sb.get(trim), b2, 5, 5.6, 1 / 4, false);
        }
      }
      capPolygon(sb.get(M.roof), p, y1, true, 1 / 8);
      parapet(sb.get(trim), p, y1, y1 + (glassy ? 1.2 : 0.9));
      col.addPrism(p, i === 0 ? -30 : y0 - 0.1, y1);
    });

    // Times Square screens on street-facing walls
    if (nearTSQ) {
      const p = ensureCCW(tiers[0][0]);
      const bb = sb.get(M.billboard);
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 10 || r() < 0.2) continue;
        const [nx, nz] = edgeNormal(a, b);
        const w = Math.min(len - 2, 10 + r() * 10);
        const hh = 6 + r() * 12;
        const y0 = 7 + r() * Math.max(0, Math.min(tiers[0][2] - 7 - hh, 18));
        const mx = (a[0] + b[0]) / 2 + nx * 0.25, mz = (a[1] + b[1]) / 2 + nz * 0.25;
        const tx = (b[0] - a[0]) / len, tz = (b[1] - a[1]) / len;
        const cell = Math.floor(r() * 8), cu = (cell % 4) / 4, cv = Math.floor(cell / 4) / 2;
        const A = [mx - tx * w / 2, y0, mz - tz * w / 2], B = [mx + tx * w / 2, y0, mz + tz * w / 2];
        bb.quad(A, B, [B[0], y0 + hh, B[2]], [A[0], y0 + hh, A[2]], [nx, 0, nz],
          [cu, cv], [cu + 0.25, cv], [cu + 0.25, cv + 0.5], [cu, cv + 0.5]);
      }
    }

    // Rooftop clutter
    const [top, , yTop] = tiers[tiers.length - 1];
    const inner = insetPolygon(top, 3);
    if (!inner) return;
    const ic = centroid(inner);
    const mw = minWidth(inner);
    if (!glassy && h < 110 && r() < 0.42 && mw > 7) {
      const wx = ic[0] + (r() - 0.5) * mw * 0.4, wz = ic[1] + (r() - 0.5) * mw * 0.4;
      instances.waterTowers.push([wx, yTop, wz, 0.85 + r() * 0.35, r() * 6.28]);
      col.addBox(wx, wz, 4.5, 4.5, yTop, yTop + 9.5);
    }
    if (mw > 10 && r() < 0.6) {
      const pw = Math.min(mw * 0.45, 14), pd = Math.min(mw * 0.35, 10), ph = 3 + r() * 3;
      const px = ic[0] + (r() - 0.5) * 3, pz = ic[1] + (r() - 0.5) * 3;
      const b = sb.get(glassy ? M.darkTrim : M.trim);
      b.box(px, yTop + ph / 2, pz, pw, ph, pd, 1 / 4);
      col.addBox(px, pz, pw, pd, yTop, yTop + ph);
    }
    const nAC = Math.floor(r() * 4);
    for (let i = 0; i < nAC; i++) {
      const ax = ic[0] + (r() - 0.5) * mw * 0.7, az = ic[1] + (r() - 0.5) * mw * 0.7;
      sector(ax, az).get(M.metal).box(ax, yTop + 0.7, az, 1.6 + r(), 1.4, 1.2 + r() * 1.5, 1 / 2);
    }
    if (h > 150 && r() < 0.5) {
      const ah = 12 + r() * 20;
      sb.get(M.metal).box(ic[0], yTop + ah / 2, ic[1], 0.5, ah, 0.5, 1);
      col.addBox(ic[0], ic[1], 0.6, 0.6, yTop, yTop + ah);
    }
  }

  // ---- Madison Square Park --------------------------------------------------
  for (const p of parkPolys) {
    const g = ground.get(M.grass);
    capPolygon(g, p, 0.2, true, 1 / 10);
    const c = centroid(p);
    const pw = ground.get(M.path);
    const mw = minWidth(p);
    // diagonal footpaths
    const P = (x, z) => [x, 0.22, z];
    for (const [dx, dz] of [[1, 0.45], [1, -0.45]]) {
      const l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l, L = 60, w = 1.6;
      pw.quad(P(c[0] - ux * L - uz * w, c[1] - uz * L + ux * w), P(c[0] + ux * L - uz * w, c[1] + uz * L + ux * w),
        P(c[0] + ux * L + uz * w, c[1] + uz * L - ux * w), P(c[0] - ux * L + uz * w, c[1] - uz * L - ux * w), [0, 1, 0]);
    }
    // central fountain basin
    const fb = ground.get(M.trim);
    const basin = [];
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; basin.push([c[0] + Math.cos(a) * 5, c[1] + Math.sin(a) * 5]); }
    slab(fb, basin, 0.2, 0.8, 1 / 2);
    const [x0, x1] = [Math.min(...p.map(q => q[0])), Math.max(...p.map(q => q[0]))];
    const [z0, z1] = [Math.min(...p.map(q => q[1])), Math.max(...p.map(q => q[1]))];
    for (let i = 0; i < 70; i++) {
      const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
      if (Math.hypot(x - c[0], z - c[1]) < 8) continue;
      const inside = ensureCCW(p).every((a, j, arr) => {
        const b = arr[(j + 1) % arr.length];
        const [nx, nz] = edgeNormal(a, b);
        return nx * (x - a[0]) + nz * (z - a[1]) < -2;
      });
      if (inside) instances.trees.push([x, 0.2, z, 0.8 + r() * 0.6]);
    }
    void mw;
  }
  landmarks.push({ name: 'Madison Square Park', center: new THREE.Vector3(65, 0, 240), top: 0 });

  // ---- Roads: markings, lamps, lights ---------------------------------------
  const mk = ground.get(M.marking);
  const Y = 0.02;
  const dashZ = (x, za, zb) => {
    for (let z = za; z < zb - 3; z += 9) mk.quad([x - 0.1, Y, z], [x + 0.1, Y, z], [x + 0.1, Y, z + 3], [x - 0.1, Y, z + 3], [0, 1, 0]);
  };
  const dashX = (z, xa, xb) => {
    for (let x = xa; x < xb - 3; x += 9) mk.quad([x, Y, z - 0.1], [x + 3, Y, z - 0.1], [x + 3, Y, z + 0.1], [x, Y, z + 0.1], [0, 1, 0]);
  };
  const zebraX = (x, z0, width, alongZ) => {
    // stripes spanning a road of the given width, centered at x (for avenues)
    for (let o = -width / 2 + 0.6; o < width / 2 - 0.6; o += 1.4) {
      if (alongZ) mk.quad([x + o, Y, z0], [x + o + 0.7, Y, z0], [x + o + 0.7, Y, z0 + 3], [x + o, Y, z0 + 3], [0, 1, 0]);
      else mk.quad([z0, Y, x + o], [z0 + 3, Y, x + o], [z0 + 3, Y, x + o + 0.7], [z0, Y, x + o + 0.7], [0, 1, 0]);
    }
  };

  for (let k = GRID.KMIN; k <= GRID.KMAX; k++) {
    const x = aveX(k);
    for (let n = GRID.NMIN; n < GRID.NMAX; n++) {
      const za = streetZ(n + 1) + GRID.ST_W / 2, zb = streetZ(n) - GRID.ST_W / 2;
      for (const o of [-5, 0, 5]) dashZ(x + o, za + 4, zb - 4);
      zebraX(x, za, GRID.AVE_W - 2, true);
      zebraX(x, zb - 3, GRID.AVE_W - 2, true);
      // lamps along both sidewalks
      for (let z = za + 8; z < zb - 4; z += 26) {
        for (const s of [-1, 1]) instances.lamps.push([x + s * (GRID.AVE_W / 2 + 0.6), z, s > 0 ? Math.PI : 0]);
      }
    }
  }
  for (let n = GRID.NMIN; n <= GRID.NMAX; n++) {
    const z = streetZ(n);
    for (let k = GRID.KMIN; k < GRID.KMAX; k++) {
      const xa = aveX(k) + GRID.AVE_W / 2, xb = aveX(k + 1) - GRID.AVE_W / 2;
      dashX(z, xa + 4, xb - 4);
      zebraX(z, xa, GRID.ST_W - 2, false);
      zebraX(z, xb - 3, GRID.ST_W - 2, false);
      for (let x = xa + 12; x < xb - 6; x += 32) {
        for (const s of [-1, 1]) instances.lamps.push([x, z + s * (GRID.ST_W / 2 + 0.6), s > 0 ? -Math.PI / 2 : Math.PI / 2, true]);
      }
    }
    // traffic signals at each intersection corner
    for (let k = GRID.KMIN; k <= GRID.KMAX; k++) {
      instances.lights.push([aveX(k) + GRID.AVE_W / 2 + 0.8, z - GRID.ST_W / 2 - 0.8]);
      instances.lights.push([aveX(k) - GRID.AVE_W / 2 - 0.8, z + GRID.ST_W / 2 + 0.8]);
    }
  }
  // Broadway center dashes
  {
    const [dx, dz] = BROADWAY.dir;
    for (let t = -1500; t < 1500; t += 9) {
      const px = BROADWAY.nx * BROADWAY.c + dx * t, pz = BROADWAY.nz * BROADWAY.c + dz * t;
      if (px < ISLAND.minX + 30 || px > ISLAND.maxX - 30 || pz < ISLAND.minZ + 30 || pz > ISLAND.maxZ - 30) continue;
      for (const o of [-4, 4]) {
        const ox = px + BROADWAY.nx * o, oz = pz + BROADWAY.nz * o;
        mk.quad([ox - BROADWAY.nx * 0.1, Y, oz - BROADWAY.nz * 0.1], [ox + BROADWAY.nx * 0.1, Y, oz + BROADWAY.nz * 0.1],
          [ox + BROADWAY.nx * 0.1 + dx * 3, Y, oz + BROADWAY.nz * 0.1 + dz * 3], [ox - BROADWAY.nx * 0.1 + dx * 3, Y, oz - BROADWAY.nz * 0.1 + dz * 3], [0, 1, 0]);
      }
    }
  }
  onProgress && onProgress(0.75);

  // ---- Island, quay and rivers ---------------------------------------------
  const IW = ISLAND.maxX - ISLAND.minX, ID = ISLAND.maxZ - ISLAND.minZ;
  const icx = (ISLAND.minX + ISLAND.maxX) / 2, icz = (ISLAND.minZ + ISLAND.maxZ) / 2;
  const asphalt = new THREE.PlaneGeometry(IW, ID);
  asphalt.rotateX(-Math.PI / 2);
  const uv = asphalt.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * IW / 14, uv.getY(i) * ID / 14);
  const road = new THREE.Mesh(asphalt, M.asphalt);
  road.position.set(icx, 0, icz);
  road.receiveShadow = true;
  root.add(road);
  // waterfront promenade ring
  const prom = ground.get(M.sidewalk);
  const edgeW = 30;
  for (const [x0, z0, x1, z1] of [
    [ISLAND.minX, ISLAND.minZ, ISLAND.maxX, ISLAND.minZ + edgeW - 12],
    [ISLAND.minX, ISLAND.maxZ - edgeW + 12, ISLAND.maxX, ISLAND.maxZ],
    [ISLAND.minX, ISLAND.minZ, ISLAND.minX + edgeW - 12, ISLAND.maxZ],
    [ISLAND.maxX - edgeW + 12, ISLAND.minZ, ISLAND.maxX, ISLAND.maxZ],
  ]) {
    slab(prom, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], 0, 0.18, 1 / 6);
  }
  const quay = ground.get(M.quay);
  extrudeWalls(quay, rectPoly(icx, icz, IW, ID), -6, 0.2, (s, l, y) => [s / 6, y / 6]);
  // riverside trees
  for (let x = ISLAND.minX + 10; x < ISLAND.maxX; x += 16) {
    instances.trees.push([x, 0.18, ISLAND.minZ + 8, 0.8 + r() * 0.4]);
    instances.trees.push([x, 0.18, ISLAND.maxZ - 8, 0.8 + r() * 0.4]);
  }
  for (let z = ISLAND.minZ + 10; z < ISLAND.maxZ; z += 16) {
    instances.trees.push([ISLAND.minX + 8, 0.18, z, 0.8 + r() * 0.4]);
    instances.trees.push([ISLAND.maxX - 8, 0.18, z, 0.8 + r() * 0.4]);
  }

  const water = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), M.water);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -2.2;
  water.receiveShadow = true;
  root.add(water);

  // Far shores: New Jersey to the west, Brooklyn/Queens to the east.
  const far = [];
  for (let i = 0; i < 900; i++) {
    const side = i % 4;
    let x, z;
    const along = (r() - 0.5) * 5000;
    const off = 520 + r() * 1400;
    if (side === 0) { x = ISLAND.minX - off; z = icz + along; }
    else if (side === 1) { x = ISLAND.maxX + off; z = icz + along; }
    else if (side === 2) { z = ISLAND.minZ - off - 200; x = along; }
    else { z = ISLAND.maxZ + off + 200; x = along; }
    const tall = r() < 0.08;
    far.push([x, z, 20 + r() * 40, tall ? 60 + r() * 140 : 8 + r() * 45, 20 + r() * 40]);
  }
  {
    const g = new THREE.BoxGeometry(1, 1, 1);
    g.translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(g, M.farCity, far.length);
    const m4 = new THREE.Matrix4();
    far.forEach(([x, z, w, h, d], i) => {
      m4.makeScale(w, h, d).setPosition(x, -2, z);
      im.setMatrixAt(i, m4);
      const v = 0.6 + r() * 0.4;
      im.setColorAt(i, new THREE.Color(v, v, v * 1.02));
    });
    root.add(im);
    const shore = new THREE.MeshStandardMaterial({ color: 0x55584f, roughness: 1 });
    for (const [x, z, w, d] of [
      [ISLAND.minX - 1300, icz, 1600, 7000], [ISLAND.maxX + 1300, icz, 1600, 7000],
      [0, ISLAND.minZ - 1300, 7000, 1600], [0, ISLAND.maxZ + 1300, 7000, 1600],
    ]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 2, d), shore);
      m.position.set(x, -2.1, z);
      root.add(m);
    }
  }
  onProgress && onProgress(0.85);

  // ---- Meshes -----------------------------------------------------------------
  for (const s of sectors.values()) s.toMeshes(root, true, true);
  ground.toMeshes(root, false, true);

  const dyn = buildInstances(root, M, instances, r);
  const traffic = buildTraffic(root, r);
  onProgress && onProgress(1);

  let lightTimer = 0;
  return {
    landmarks,
    spawn: esb.spawn.clone(),
    esb,
    update(dt, t) {
      traffic.update(dt, t);
      lightTimer += dt;
      // Aircraft beacon blinks once per second
      esb.beacon.visible = (t % 1.2) < 0.25;
      dyn.update(traffic.phase);
      M.water.normalMap.offset.set(t * 0.004, t * 0.0025);
    },
    setNight(f) { traffic.setNight(f); },
  };
}

// Split a lot area into building lots.
function subdivide(area, r) {
  const xs = area.map(p => p[0]), zs = area.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const rects = [];
  const depth = z1 - z0;
  const rows = depth > 26 && r() < 0.85 ? 2 : 1;
  const zSplit = z0 + depth / 2 + (r() - 0.5) * 6;
  const whole = r() < 0.1;
  for (let row = 0; row < rows; row++) {
    const za = rows === 1 ? z0 : row === 0 ? z0 : zSplit;
    const zb = rows === 1 ? z1 : row === 0 ? zSplit : z1;
    let x = x0;
    while (x < x1 - 1) {
      let w = whole ? (x1 - x0) / (1 + Math.floor(r() * 2)) : 13 + r() * 24;
      if (x1 - (x + w) < 11) w = x1 - x;
      rects.push([[x, za], [x + w, za], [x + w, zb], [x, zb]]);
      x += w;
    }
  }
  const out = [];
  const A = ensureCCW(area);
  for (let rect of rects) {
    let p = rect;
    for (let i = 0; i < A.length && p; i++) {
      const a = A[i], b = A[(i + 1) % A.length];
      const [nx, nz] = edgeNormal(a, b);
      p = clipPolygon(p, nx, nz, nx * a[0] + nz * a[1]);
    }
    if (p && polyArea(ensureCCW(p)) > 90 && minWidth(p) > 7) out.push(p);
  }
  return out;
}

// ---- Instanced street furniture ------------------------------------------------
function buildInstances(root, M, inst, r) {
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  // Water towers: wooden tank, conical roof, steel legs
  {
    const tank = new THREE.CylinderGeometry(2.1, 2.2, 4.2, 16, 1);
    tank.translate(0, 5.6, 0);
    const roof = new THREE.ConeGeometry(2.35, 1.6, 16);
    roof.translate(0, 8.5, 0);
    const legs = [];
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + Math.PI / 4;
      const l = new THREE.CylinderGeometry(0.12, 0.14, 3.6, 5);
      l.translate(Math.cos(a) * 1.5, 1.8, Math.sin(a) * 1.5);
      legs.push(l);
    }
    const n = inst.waterTowers.length;
    const tm = new THREE.InstancedMesh(tank, M.wood, n);
    const rm = new THREE.InstancedMesh(roof, M.darkTrim, n);
    const lm = legs.map(g => new THREE.InstancedMesh(g, M.lampPole, n));
    inst.waterTowers.forEach(([x, y, z, sc, rot], i) => {
      q.setFromAxisAngle(up, rot); s.setScalar(sc); p.set(x, y, z);
      m4.compose(p, q, s);
      tm.setMatrixAt(i, m4); rm.setMatrixAt(i, m4);
      lm.forEach(l => l.setMatrixAt(i, m4));
    });
    for (const m of [tm, rm, ...lm]) { m.castShadow = true; m.receiveShadow = true; root.add(m); }
  }

  // Trees
  {
    const trunk = new THREE.CylinderGeometry(0.18, 0.28, 3.2, 6);
    trunk.translate(0, 1.6, 0);
    const crown = new THREE.IcosahedronGeometry(2.6, 1);
    const pos = crown.attributes.position;
    const rr = mulberry32(5);
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i);
      v.multiplyScalar(0.85 + rr() * 0.3);
      pos.setXYZ(i, v.x, v.y * 0.85 + 5.2, v.z);
    }
    crown.computeVertexNormals();
    const leaf = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
    const bark = new THREE.MeshStandardMaterial({ color: 0x4b3a2c, roughness: 1 });
    const n = inst.trees.length;
    const tm = new THREE.InstancedMesh(trunk, bark, n);
    const cm = new THREE.InstancedMesh(crown, leaf, n);
    const col = new THREE.Color();
    inst.trees.forEach(([x, y, z, sc], i) => {
      q.setFromAxisAngle(up, r() * 6.28); s.setScalar(sc); p.set(x, y, z);
      m4.compose(p, q, s);
      tm.setMatrixAt(i, m4); cm.setMatrixAt(i, m4);
      col.setHSL(0.22 + r() * 0.08, 0.45 + r() * 0.2, 0.22 + r() * 0.1);
      cm.setColorAt(i, col);
    });
    for (const m of [tm, cm]) { m.castShadow = true; m.receiveShadow = true; root.add(m); }
  }

  // Street lamps (pole + arm + head)
  {
    const pole = new THREE.CylinderGeometry(0.09, 0.14, 8, 6);
    pole.translate(0, 4, 0);
    const arm = new THREE.BoxGeometry(0.1, 0.1, 2.2);
    arm.translate(0, 7.9, 1.1);
    const head = new THREE.BoxGeometry(0.5, 0.18, 0.9);
    head.translate(0, 7.8, 2.1);
    const n = inst.lamps.length;
    const pm = new THREE.InstancedMesh(pole, M.lampPole, n);
    const am = new THREE.InstancedMesh(arm, M.lampPole, n);
    const hm = new THREE.InstancedMesh(head, M.lampHead, n);
    inst.lamps.forEach(([x, z, rot], i) => {
      q.setFromAxisAngle(up, rot + Math.PI / 2); s.setScalar(1); p.set(x, 0.18, z);
      m4.compose(p, q, s);
      pm.setMatrixAt(i, m4); am.setMatrixAt(i, m4); hm.setMatrixAt(i, m4);
    });
    pm.castShadow = true;
    for (const m of [pm, am, hm]) root.add(m);
  }

  // Traffic signals: avenue-facing and street-facing heads switch with the phase.
  const aveOn = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x22ff66, emissiveIntensity: 3 });
  const stOn = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff2a1a, emissiveIntensity: 3 });
  {
    const pole = new THREE.CylinderGeometry(0.1, 0.12, 5.2, 6);
    pole.translate(0, 2.6, 0);
    const box = new THREE.BoxGeometry(0.45, 1.2, 0.45);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1c2a1f, roughness: 0.6 });
    const n = inst.lights.length;
    const pm = new THREE.InstancedMesh(pole, M.lampPole, n);
    const b1 = new THREE.InstancedMesh(box, bodyMat, n);
    const lensGeo = new THREE.SphereGeometry(0.16, 8, 6);
    const l1 = new THREE.InstancedMesh(lensGeo, aveOn, n);
    const l2 = new THREE.InstancedMesh(lensGeo, stOn, n);
    inst.lights.forEach(([x, z], i) => {
      m4.makeTranslation(x, 0.18, z); pm.setMatrixAt(i, m4);
      m4.makeTranslation(x, 5.0, z); b1.setMatrixAt(i, m4);
      m4.makeTranslation(x, 5.0, z + (z > 0 ? 0.25 : -0.25) * 0 + 0.25); l1.setMatrixAt(i, m4);
      m4.makeTranslation(x + 0.25, 5.0, z); l2.setMatrixAt(i, m4);
    });
    for (const m of [pm, b1, l1, l2]) root.add(m);
  }
  return {
    update(phase) {
      const aveGreen = phase === 0;
      aveOn.emissive.setHex(aveGreen ? 0x22ff66 : 0xff2a1a);
      stOn.emissive.setHex(aveGreen ? 0xff2a1a : 0x22ff66);
    },
  };
}

// ---- Traffic ---------------------------------------------------------------------
function buildTraffic(root, r) {
  // Car body with baked vertex colors: paint (white, tinted per instance),
  // glass, tires and lights.
  const parts = [];
  const add = (w, h, d, x, y, z, c) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    const cols = [];
    for (let i = 0; i < g.attributes.position.count; i++) cols.push(...c);
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    parts.push(g);
  };
  add(1.85, 0.75, 4.5, 0, 0.62, 0, [1, 1, 1]);
  add(1.65, 0.62, 2.3, 0, 1.3, -0.25, [0.12, 0.15, 0.18]);
  add(1.7, 0.08, 2.2, 0, 1.64, -0.25, [1, 1, 1]);
  for (const sx of [-1, 1]) for (const sz of [-1.45, 1.45]) add(0.3, 0.64, 0.64, sx * 0.85, 0.32, sz, [0.04, 0.04, 0.04]);
  const car = mergeColored(parts);
  const lightsG = [];
  const addL = (x, z, c) => {
    const g = new THREE.BoxGeometry(0.4, 0.16, 0.06);
    g.translate(x, 0.78, z);
    const cols = [];
    for (let i = 0; i < g.attributes.position.count; i++) cols.push(...c);
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    lightsG.push(g);
  };
  addL(-0.6, 2.26, [1, 0.95, 0.8]); addL(0.6, 2.26, [1, 0.95, 0.8]);
  addL(-0.6, -2.26, [1, 0.08, 0.05]); addL(0.6, -2.26, [1, 0.08, 0.05]);
  const lightGeo = mergeColored(lightsG);

  const carMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.5 });
  const lightMat = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.3, color: 0x000000 });
  // Emissive should follow vertex colors; tint via onBeforeCompile.
  lightMat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= vColor;');
  };

  const lanes = [];
  for (let k = GRID.KMIN; k <= GRID.KMAX; k++) {
    const dir = k % 2 === 0 ? 1 : -1;
    for (const o of [-7.5, -2.5, 2.5, 7.5]) lanes.push({ axis: 'z', fixed: aveX(k) + o, dir, min: ISLAND.minZ + 30, max: ISLAND.maxZ - 30, stops: streetStops(dir), group: 0 });
  }
  for (let n = GRID.NMIN; n <= GRID.NMAX; n++) {
    const dir = n % 2 === 0 ? 1 : -1;
    for (const o of [-2.5, 2.5]) lanes.push({ axis: 'x', fixed: streetZ(n) + o, dir, min: ISLAND.minX + 30, max: ISLAND.maxX - 30, stops: aveStops(dir), group: 1 });
  }
  function streetStops(dir) {
    const out = [];
    for (let n = GRID.NMIN; n <= GRID.NMAX; n++) out.push(streetZ(n) - dir * (GRID.ST_W / 2 + 2.5));
    return out;
  }
  function aveStops(dir) {
    const out = [];
    for (let k = GRID.KMIN; k <= GRID.KMAX; k++) out.push(aveX(k) - dir * (GRID.AVE_W / 2 + 2.5));
    return out;
  }

  const cars = [];
  const palette = [0xf2c21b, 0xf2c21b, 0xf2c21b, 0x111111, 0xe8e8e8, 0x8a8f96, 0x1f3a66, 0x7a1414, 0x2b2b2b, 0xcfd3d6];
  for (const lane of lanes) {
    const L = lane.max - lane.min;
    const spacing = lane.axis === 'z' ? 55 : 95;
    let pos = lane.min + r() * spacing;
    lane.cars = [];
    while (pos < lane.max) {
      const c = { lane, s: pos, v: 8 + r() * 6, vmax: 10 + r() * 7, color: palette[Math.floor(r() * palette.length)] };
      lane.cars.push(c);
      cars.push(c);
      pos += spacing * (0.4 + r() * 1.2);
    }
    // order cars from front to back in travel direction
    lane.cars.sort((a, b) => (b.s - a.s) * lane.dir);
    void L;
  }

  const im = new THREE.InstancedMesh(car, carMat, cars.length);
  const lm = new THREE.InstancedMesh(lightGeo, lightMat, cars.length);
  im.castShadow = true; im.receiveShadow = true;
  const col = new THREE.Color();
  cars.forEach((c, i) => { c.i = i; im.setColorAt(i, col.setHex(c.color)); });
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  lm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.frustumCulled = false; lm.frustumCulled = false;
  root.add(im, lm);

  let phase = 0, phaseT = 0;
  const cycle = [22, 14];
  const e = im.instanceMatrix.array, le = lm.instanceMatrix.array;

  return {
    get phase() { return phase; },
    setNight(f) { lightMat.emissiveIntensity = 0.4 + f * 3; },
    update(dt, t) {
      phaseT += dt;
      if (phaseT > cycle[phase]) { phaseT = 0; phase = 1 - phase; }
      // Amber: stop approaching cars a little before the switch.
      const redFor = g => (g === 0 ? phase !== 0 : phase !== 1) || (phaseT > cycle[phase] - 3);
      for (const lane of lanes) {
        const red = redFor(lane.group);
        const cs = lane.cars;
        const L = lane.max - lane.min;
        for (let j = 0; j < cs.length; j++) {
          const c = cs[j];
          const ahead = j > 0 ? cs[j - 1] : cs[cs.length - 1];
          let gap = (ahead.s - c.s) * lane.dir;
          if (j === 0) gap += L;
          if (cs.length === 1) gap = 1e9;
          let target = c.vmax;
          // car following
          if (gap < 30) target = Math.min(target, Math.max(0, (gap - 7) * 0.9));
          // signals
          if (red) {
            for (const st of lane.stops) {
              const d = (st - c.s) * lane.dir;
              if (d > 0 && d < 40) {
                if (d > 1) target = Math.min(target, Math.max(0, (d - 1) * 0.6));
                break;
              }
            }
          }
          c.v += Math.max(-9, Math.min(3, (target - c.v) * 2)) * dt;
          if (c.v < 0) c.v = 0;
          c.s += c.v * lane.dir * dt;
        }
        // wrap the lead car to the back
        const lead = cs[0];
        if (lead && (lane.dir > 0 ? lead.s > lane.max : lead.s < lane.min)) {
          lead.s -= L * lane.dir;
          cs.push(cs.shift());
        }
        for (const c of cs) {
          const o = c.i * 16;
          let x, z, fx, fz;
          if (lane.axis === 'z') { x = lane.fixed; z = c.s; fx = 0; fz = lane.dir; }
          else { x = c.s; z = lane.fixed; fx = lane.dir; fz = 0; }
          // rotation: local +z -> (fx, fz)
          e[o] = fz; e[o + 1] = 0; e[o + 2] = -fx; e[o + 3] = 0;
          e[o + 4] = 0; e[o + 5] = 1; e[o + 6] = 0; e[o + 7] = 0;
          e[o + 8] = fx; e[o + 9] = 0; e[o + 10] = fz; e[o + 11] = 0;
          e[o + 12] = x; e[o + 13] = 0; e[o + 14] = z; e[o + 15] = 1;
          for (let q = 0; q < 16; q++) le[o + q] = e[o + q];
        }
      }
      im.instanceMatrix.needsUpdate = true;
      lm.instanceMatrix.needsUpdate = true;
      void t;
    },
  };
}

function mergeColored(geos) {
  const pos = [], nor = [], colr = [], idx = [];
  let off = 0;
  for (const g of geos) {
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    colr.push(...g.attributes.color.array);
    for (const i of g.index.array) idx.push(i + off);
    off += g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.setIndex(idx);
  return g;
}
