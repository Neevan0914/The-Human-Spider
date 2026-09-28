// Hand-built landmarks: Empire State Building, Chrysler Building, Flatiron.
// Dimensions follow the real buildings at 0.75 scale.
import * as THREE from 'three';
import {
  Builder, MatBuilders, rectPoly, extrudeWalls, capPolygon, slab, insetPolygon, parapet,
  regularPoly, roundCorner, ensureCCW,
} from './geom.js';

export function facadeUV(mat, uOff = 0, vOff = 0, vBase = 5) {
  const { winM, floorM } = mat.userData;
  return (s, len, y) => [((s - len / 2) / winM + 0.5 + uOff) / 8, ((y - vBase) / floorM + vOff) / 8];
}
export function storefrontUV(uOff = 0) {
  return (s, len, y) => [s / 28 + uOff, y / 5];
}

function glowMat(M, color, emissive, glow, extra = {}) {
  const m = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0, roughness: 0.6, ...extra });
  m.userData = { glow, base: 0 };
  M.glowing.push(m);
  return m;
}

// A tier with facade walls, a trim band and a roof.
function tier(mb, M, col, poly, y0, y1, fac, opts = {}) {
  const uv = facadeUV(fac, opts.uOff || 0, opts.vOff || 0, opts.vBase ?? 5);
  if (opts.shops) {
    extrudeWalls(mb.get(M.storefront), poly, y0, y0 + 5, storefrontUV(opts.uOff || 0));
    extrudeWalls(mb.get(fac), poly, y0 + 5, y1, uv);
  } else {
    extrudeWalls(mb.get(fac), poly, y0, y1, uv);
  }
  const band = insetPolygon(poly, -0.35);
  if (band) slab(mb.get(opts.trim || M.trim), band, y1 - 0.9, y1 + 0.25, 1 / 4, false);
  capPolygon(mb.get(M.roof), poly, y1, true, 1 / 8);
  if (opts.parapet) parapet(mb.get(opts.trim || M.trim), poly, y1, y1 + opts.parapet);
  col.addPrism(poly, opts.colY0 ?? -30, y1, opts.tag);
}

function cyl(group, mat, rTop, rBot, h, y, x, z, seg = 8, rot = Math.PI / 8) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1);
  g.rotateY(rot);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true; m.receiveShadow = true;
  group.add(m);
  return m;
}

// ---------------------------------------------------------------------------
// Empire State Building — W 34th St & 5th Ave
// ---------------------------------------------------------------------------
export function buildEmpireState(M, col) {
  const group = new THREE.Group();
  group.name = 'Empire State Building';
  const mb = new MatBuilders();
  const cx = -65, cz = -330;
  const fac = M.facades.esb;
  const tag = { name: 'Empire State Building' };
  const stone = new THREE.MeshStandardMaterial({ color: 0xcfc6b1, roughness: 0.75 });
  const alu = new THREE.MeshStandardMaterial({ color: 0xb9bec2, roughness: 0.3, metalness: 0.9 });
  const lantern = glowMat(M, 0xd8d0bd, 0xfff1d0, 1.1, { roughness: 0.55 });

  // [width(x), depth(z), y0, y1]
  const tiers = [
    [97, 39, 0, 16.5],
    [84, 36, 16.5, 58],
    [76, 33, 58, 70],
    [66, 30, 70, 82],
    [58, 22, 82, 199],   // side wings
    [42, 29, 82, 225],   // main shaft
    [32, 21, 225, 233],  // 81st-85th floors; top is the 86th floor deck
    [24, 16, 233, 240],  // 86th floor observatory enclosure
  ];
  tiers.forEach(([w, d, y0, y1], i) => {
    tier(mb, M, col, rectPoly(cx, cz, w, d), y0, y1, fac, {
      shops: i === 0, uOff: i * 3, vOff: 0, vBase: 5, trim: stone, tag,
      parapet: i === 6 ? 1.3 : (i >= 4 ? 0.8 : 0.6),
    });
  });

  // Vertical aluminum ribs on the main shaft for the Art Deco streamlining.
  const ribB = mb.get(alu);
  for (const sx of [-1, 1]) for (let k = -3; k <= 3; k++) {
    const x = cx + k * 5.6;
    ribB.box(x, (82 + 225) / 2, cz + sx * 14.7, 0.5, 225 - 82, 0.5, 1 / 4);
  }
  for (const sx of [-1, 1]) for (let k = -2; k <= 2; k++) {
    const z = cz + k * 5.4;
    ribB.box(cx + sx * 21.2, (82 + 225) / 2, z, 0.5, 225 - 82, 0.5, 1 / 4);
  }
  mb.toMeshes(group);

  // Mooring mast: lantern, tapering octagons, glass crown, antenna.
  const mast = [
    [8.5, 8.5, 12, 240, lantern],
    [6.8, 7.8, 10, 252, lantern],
    [5.4, 6.4, 8, 262, lantern],
    [3.7, 5.4, 5, 270, stone],
  ];
  for (const [rt, rb, h, y, mat] of mast) {
    cyl(group, mat, rt, rb, h, y, cx, cz, 8);
    col.addPrism(regularPoly(cx, cz, rb * 0.95, 8, Math.PI / 8), y - 1, y + h, tag);
  }
  // Fins around the lantern
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.7, 22, 2.4), alu);
    fin.position.set(cx + Math.cos(a) * 8.2, 240 + 11, cz + Math.sin(a) * 8.2);
    fin.rotation.y = -a;
    fin.castShadow = true;
    group.add(fin);
  }
  const glass = new THREE.MeshStandardMaterial({ color: 0x33424d, roughness: 0.05, metalness: 0.9, emissive: 0xfff0c8, emissiveIntensity: 0 });
  glass.userData = { glow: 1.5, base: 0 };
  M.glowing.push(glass);
  cyl(group, glass, 3.2, 3.2, 6, 275, cx, cz, 16);
  cyl(group, alu, 1.4, 3.3, 4, 281, cx, cz, 16);
  // Antenna with rings
  const ant = [[0.9, 1.15, 14, 285], [0.55, 0.85, 14, 299], [0.3, 0.5, 12, 313], [0.07, 0.28, 8, 325]];
  for (const [rt, rb, h, y] of ant) cyl(group, alu, rt, rb, h, y, cx, cz, 12);
  for (const y of [291, 299, 305, 313]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.12, 6, 16), alu);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(cx, y, cz);
    group.add(ring);
  }
  col.addPrism(regularPoly(cx, cz, 3.2, 8), 275, 281, tag);
  col.addPrism(regularPoly(cx, cz, 2.0, 6), 281, 285, tag);
  col.addPrism(regularPoly(cx, cz, 1.0, 6), 285, 313, tag);
  col.addPrism(regularPoly(cx, cz, 0.5, 6), 313, 333, tag);

  // Red aircraft beacon
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  beacon.position.set(cx, 333.2, cz);
  group.add(beacon);

  return {
    group,
    beacon,
    name: 'Empire State Building',
    center: new THREE.Vector3(cx, 0, cz),
    spawn: new THREE.Vector3(cx + 11, 233 + 1.2, cz - 9.4),
    top: 333,
  };
}

// ---------------------------------------------------------------------------
// Chrysler Building — Lexington Ave & E 42nd St
// ---------------------------------------------------------------------------
export function buildChrysler(M, col, cx = 427, cz = -870) {
  const group = new THREE.Group();
  group.name = 'Chrysler Building';
  const mb = new MatBuilders();
  const fac = M.facades.chrysler;
  const tag = { name: 'Chrysler Building' };
  const steel = new THREE.MeshStandardMaterial({ color: 0xe4e8ec, roughness: 0.16, metalness: 1.0 });
  const darkBrick = new THREE.MeshStandardMaterial({ color: 0x3c3f45, roughness: 0.7 });

  const tiers = [
    [40, 0, 18], [36, 18, 45], [30, 45, 118], [26, 118, 150], [23, 150, 160], [21.5, 160, 172],
  ];
  tiers.forEach(([w, y0, y1], i) => {
    tier(mb, M, col, rectPoly(cx, cz, w, w), y0, y1, fac, { shops: i === 0, uOff: i * 2, trim: i >= 2 ? darkBrick : M.trim, tag });
  });
  // Dark vertical corner piers on the main shaft
  const pier = mb.get(darkBrick);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    pier.box(cx + sx * 14.6, (45 + 118) / 2, cz + sz * 14.6, 1.8, 73, 1.8, 1 / 4);
  }
  mb.toMeshes(group);

  // Terraced crown: seven nested arches per face, built as groin vaults.
  const crownB = new Builder();
  const tri = [];
  const nT = 7;
  for (let i = 0; i < nT; i++) {
    const w = 10.5 - i * 1.3;
    const yb = 172 + i * 6.3;
    const archH = w * 1.28;
    crownTier(crownB, cx, cz, w, yb, archH, i === 0 ? 170 : 172 + (i - 1) * 6.3);
    // Sunburst triangular windows along each arch
    for (let f = 0; f < 4; f++) {
      const ang = f * Math.PI / 2;
      const nx = Math.sin(ang), nz = Math.cos(ang);
      const lx = Math.cos(ang), lz = -Math.sin(ang);
      for (let k = 0; k < 5; k++) {
        const th = 0.25 * Math.PI + (k / 4) * 0.5 * Math.PI;
        const spread = 0.09;
        const P = (rr, t) => {
          const u = Math.cos(t) * w * rr, v = Math.sin(t) * archH * rr;
          return [cx + lx * u + nx * (w + 0.05), yb + v, cz + lz * u + nz * (w + 0.05)];
        };
        const apex = P(0.9, th), b1 = P(0.45, th - spread), b2 = P(0.45, th + spread);
        tri.push(...apex, ...b1, ...b2);
      }
    }
    col.addBox(cx, cz, w * 2, w * 2, 170, yb + archH * 0.55, tag);
  }
  const crown = new THREE.Mesh(crownB.build(), steel);
  crown.castShadow = true; crown.receiveShadow = true;
  group.add(crown);

  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
  tg.computeVertexNormals();
  const triMat = new THREE.MeshStandardMaterial({ color: 0x1b2229, emissive: 0xfff3dc, emissiveIntensity: 0, roughness: 0.1, metalness: 0.6, side: THREE.DoubleSide });
  triMat.userData = { glow: 2.6, base: 0 };
  M.glowing.push(triMat);
  group.add(new THREE.Mesh(tg, triMat));

  // Needle spire
  cyl(group, steel, 0.04, 1.35, 34, 212, cx, cz, 12);
  for (const y of [218, 224, 230]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.25 - (y - 212) / 34 * 1.2 + 0.2, 1.25 - (y - 212) / 34 * 1.2 + 0.25, 0.5, 12), steel);
    ring.position.set(cx, y, cz);
    group.add(ring);
  }
  col.addPrism(regularPoly(cx, cz, 1.2, 6), 205, 232, tag);
  col.addPrism(regularPoly(cx, cz, 0.5, 6), 232, 246, tag);

  // Eagle gargoyles on the 61st floor corners, winged radiator caps on the 31st.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    group.add(eagle(steel, cx + sx * 13, 150, cz + sz * 13, Math.atan2(sx, sz)));
    group.add(radiatorCap(steel, cx + sx * 15, 118, cz + sz * 15, sx, sz));
  }

  return { group, name: 'Chrysler Building', center: new THREE.Vector3(cx, 0, cz), top: 246 };
}

function crownTier(b, cx, cz, w, yb, archH, yStart) {
  const N = 28;
  // Faces with arched tops
  for (let f = 0; f < 4; f++) {
    const ang = f * Math.PI / 2;
    const nx = Math.sin(ang), nz = Math.cos(ang);
    const lx = Math.cos(ang), lz = -Math.sin(ang);
    const P = (t, top) => {
      const x = cx + nx * w + lx * t * w, z = cz + nz * w + lz * t * w;
      return [x, top ? yb + archH * Math.sqrt(Math.max(0, 1 - t * t)) : yStart, z];
    };
    for (let i = 0; i < N; i++) {
      const t0 = -1 + (2 * i) / N, t1 = -1 + (2 * (i + 1)) / N;
      b.quad(P(t0, false), P(t1, false), P(t1, true), P(t0, true), [nx, 0, nz]);
    }
  }
  // Groin vault roof (union of two barrel vaults)
  const G = 24;
  const V = (i, j) => {
    const x = -w + (2 * w * i) / G, z = -w + (2 * w * j) / G;
    const m = Math.min(x * x, z * z) / (w * w);
    return [cx + x, yb + archH * Math.sqrt(Math.max(0, 1 - m)), cz + z];
  };
  const faceN = (a, c, d) => {
    const e1 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (n[1] < 0) n = n.map(v => -v);
    const l = Math.hypot(...n) || 1;
    return n.map(v => v / l);
  };
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const a = V(i, j), c = V(i + 1, j), d = V(i + 1, j + 1), e = V(i, j + 1);
    // split along the diagonal that follows the vault's groin creases
    if ((i < G / 2) === (j < G / 2)) {
      b.tri(a, c, d, faceN(a, c, d)); b.tri(a, d, e, faceN(a, d, e));
    } else {
      b.tri(a, c, e, faceN(a, c, e)); b.tri(c, d, e, faceN(c, d, e));
    }
  }
}

function eagle(mat, x, y, z, yaw) {
  const g = new THREE.Group();
  const neck = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, 4.2), mat);
  neck.position.set(0, 0.6, 2.1);
  neck.rotation.x = -0.12;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.75, 2.4, 4), mat);
  head.rotation.x = Math.PI / 2;
  head.position.set(0, 0.95, 4.9);
  const crest = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 1.8), mat);
  crest.position.set(0, 1.4, 3.8);
  g.add(neck, head, crest);
  g.traverse(m => { m.castShadow = true; });
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  return g;
}

function radiatorCap(mat, x, y, z, sx, sz) {
  const g = new THREE.Group();
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 2.2, 12), mat);
  cap.position.y = 1.1;
  g.add(cap);
  // wings running along both faces from the corner
  const w1 = new THREE.Mesh(new THREE.BoxGeometry(6, 1.6, 0.25), mat);
  w1.position.set(-sx * 3, 1.3, 0);
  w1.rotation.z = sx * 0.08;
  const w2 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.6, 6), mat);
  w2.position.set(0, 1.3, -sz * 3);
  w2.rotation.x = -sz * 0.08;
  g.add(w1, w2);
  g.traverse(m => { m.castShadow = true; });
  g.position.set(x, y, z);
  return g;
}

// ---------------------------------------------------------------------------
// Flatiron Building — the wedge between Broadway and 5th Ave at 23rd St
// ---------------------------------------------------------------------------
export function buildFlatiron(M, col, poly) {
  const group = new THREE.Group();
  group.name = 'Flatiron Building';
  const mb = new MatBuilders();
  const fac = M.facades.flatiron;
  const tag = { name: 'Flatiron Building' };
  const cream = new THREE.MeshStandardMaterial({ color: 0xe7dcc4, roughness: 0.7 });
  poly = ensureCCW(poly);
  // Round the northern prow (smallest z)
  let tip = 0;
  poly.forEach((p, i) => { if (p[1] < poly[tip][1]) tip = i; });
  const rounded = roundCorner(poly, tip, 2.2, 8);

  const H = 57;
  extrudeWalls(mb.get(M.storefront), rounded, 0, 5, storefrontUV(0.3));
  extrudeWalls(mb.get(fac), rounded, 5, H, facadeUV(fac, 0, 0, 5));
  // Horizontal cornices at the base and top of the shaft
  for (const [y0, y1, o] of [[11, 11.8, 0.45], [17.5, 18.1, 0.35], [H - 0.2, H + 1.6, 1.3]]) {
    const band = insetPolygon(rounded, -o);
    if (band) slab(mb.get(cream), band, y0, y1, 1 / 4, y1 > H);
  }
  // Attic storey above the big cornice
  const attic = insetPolygon(rounded, 0.3);
  const top = attic || rounded;
  extrudeWalls(mb.get(fac), top, H + 1.6, H + 6.2, facadeUV(fac, 1, 3, 5));
  const cap = insetPolygon(top, -0.8);
  if (cap) slab(mb.get(cream), cap, H + 6.2, H + 7.2, 1 / 4, false);
  capPolygon(mb.get(M.roof), top, H + 7.2, true, 1 / 8);
  parapet(mb.get(cream), top, H + 7.2, H + 8.0);
  mb.toMeshes(group);

  col.addPrism(poly, -30, H + 1.6, tag);
  if (attic) col.addPrism(attic, H + 1.6, H + 7.2, tag);

  const c = poly.reduce((a, p) => [a[0] + p[0] / poly.length, a[1] + p[1] / poly.length], [0, 0]);
  return { group, name: 'Flatiron Building', center: new THREE.Vector3(c[0], 0, c[1]), top: H + 8 };
}
