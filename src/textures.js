// All textures are painted procedurally on canvases at startup, so the game
// ships without any image assets.
import * as THREE from 'three';

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function canvasTexture(c, srgb = true, aniso = 8) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function jitter(hex, amt, r) {
  const [R, G, B] = hexToRgb(hex);
  const k = 1 + (r() * 2 - 1) * amt;
  const t = (r() * 2 - 1) * amt * 0.3;
  const c = (x, s) => Math.max(0, Math.min(255, Math.round(x * k * (1 + s))));
  return `rgb(${c(R, t)},${c(G, 0)},${c(B, -t)})`;
}

function gray(v) { v = Math.max(0, Math.min(255, Math.round(v * 255))); return `rgb(${v},${v},${v})`; }
// Roughness in G, metalness in B (three.js convention).
function rm(r, m) { return `rgb(0,${Math.round(r * 255)},${Math.round(m * 255)})`; }

export function normalFromHeight(hc, strength = 2) {
  const w = hc.width, h = hc.height;
  const src = hc.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const out = makeCanvas(w, h);
  const ctx = out.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const H = (x, y) => src[((((y + h) % h) * w) + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      let nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * w + x) * 4;
      d[i] = (nx / l * 0.5 + 0.5) * 255;
      d[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      d[i + 2] = (nz / l * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function noise(ctx, w, h, r, count, alpha, light = true) {
  for (let i = 0; i < count; i++) {
    const v = light ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${r() * alpha})`;
    const s = 1 + r() * 2;
    ctx.fillRect(r() * w, r() * h, s, s);
  }
}

// ---------------------------------------------------------------------------
// Facades. One texture tile is 8 windows wide by 8 floors high.
// ---------------------------------------------------------------------------

export const FACADE_STYLES = {
  brick:     { wall: '#83452f', wallVar: 0.10, brick: true, winW: 0.46, winTop: 0.2, winH: 0.56, glass: '#26303a', frame: '#e6dfcf', sill: '#cfc6b3', panes: true, rough: 0.92, glassRough: 0.1, glassMetal: 0.35, lit: 0.35, winM: 3.3, floorM: 3.4 },
  brownBrick:{ wall: '#5e4336', wallVar: 0.10, brick: true, winW: 0.5, winTop: 0.18, winH: 0.58, glass: '#222a33', frame: '#ded4bf', sill: '#b8ad99', panes: true, rough: 0.92, glassRough: 0.1, glassMetal: 0.35, lit: 0.35, winM: 3.2, floorM: 3.3 },
  tanBrick:  { wall: '#a88a64', wallVar: 0.08, brick: true, winW: 0.44, winTop: 0.2, winH: 0.56, glass: '#28323c', frame: '#3b3a36', sill: '#d9d0bd', panes: false, rough: 0.9, glassRough: 0.1, glassMetal: 0.35, lit: 0.35, winM: 3.2, floorM: 3.3 },
  limestone: { wall: '#bfb49d', wallVar: 0.05, winW: 0.42, winTop: 0.2, winH: 0.58, glass: '#27313b', frame: '#8d8674', sill: '#d8cfba', panes: true, rough: 0.85, glassRough: 0.08, glassMetal: 0.4, lit: 0.4, winM: 3.6, floorM: 3.8, bands: '#aaa089' },
  concrete:  { wall: '#8e8f8c', wallVar: 0.05, winW: 0.62, winTop: 0.25, winH: 0.48, glass: '#2b3844', frame: '#5d6064', panes: false, rough: 0.88, glassRough: 0.07, glassMetal: 0.5, lit: 0.4, winM: 3.4, floorM: 3.5 },
  glass:     { wall: '#38474f', wallVar: 0.02, winW: 0.94, winTop: 0.04, winH: 0.84, glass: '#6d8ea5', glassVar: 0.08, frame: null, panes: false, rough: 0.4, wallMetal: 0.8, glassRough: 0.04, glassMetal: 0.92, lit: 0.45, winM: 3.0, floorM: 3.9, spandrel: '#2d3a42' },
  darkGlass: { wall: '#16191c', wallVar: 0.02, winW: 0.9, winTop: 0.06, winH: 0.8, glass: '#27333d', glassVar: 0.05, frame: null, panes: false, rough: 0.35, wallMetal: 0.85, glassRough: 0.05, glassMetal: 0.95, lit: 0.45, winM: 3.0, floorM: 3.9 },
  greenGlass:{ wall: '#2f403c', wallVar: 0.02, winW: 0.9, winTop: 0.06, winH: 0.82, glass: '#5b8a86', glassVar: 0.06, frame: null, panes: false, rough: 0.4, wallMetal: 0.7, glassRough: 0.05, glassMetal: 0.9, lit: 0.45, winM: 3.0, floorM: 3.9 },
  deco:      { wall: '#b9a47d', wallVar: 0.05, winW: 0.4, winTop: 0.16, winH: 0.62, glass: '#252e37', frame: '#5a5042', sill: null, panes: true, rough: 0.85, glassRough: 0.09, glassMetal: 0.4, lit: 0.4, winM: 3.2, floorM: 3.5, pier: '#c8b48e', spandrel: '#6b5f4c' },
  // Landmarks
  esb:       { wall: '#cdc3ad', wallVar: 0.025, winW: 0.4, winTop: 0.14, winH: 0.6, glass: '#27313a', frame: '#9aa0a3', panes: true, rough: 0.8, glassRough: 0.08, glassMetal: 0.45, lit: 0.45, winM: 3.0, floorM: 3.7, pier: '#d4cbb6', spandrel: '#8f979b', spandrelMetal: 0.85 },
  chrysler:  { wall: '#dddbd5', wallVar: 0.02, brick: true, winW: 0.46, winTop: 0.2, winH: 0.56, glass: '#232c35', frame: '#4c4f55', panes: true, rough: 0.82, glassRough: 0.08, glassMetal: 0.45, lit: 0.45, winM: 3.0, floorM: 3.5, spandrel: '#3d4046' },
  flatiron:  { wall: '#d6c3a1', wallVar: 0.03, winW: 0.5, winTop: 0.2, winH: 0.58, glass: '#27303a', frame: '#efe6d3', sill: '#e8dcc3', panes: true, rough: 0.85, glassRough: 0.08, glassMetal: 0.4, lit: 0.4, winM: 2.7, floorM: 2.95, ornate: true },
};

export function makeFacade(styleName, seed = 1) {
  const st = FACADE_STYLES[styleName];
  const S = 1024, N = 8, cs = S / N;
  const E = 256, ecs = E / N;
  const r = mulberry32(seed * 7919 + styleName.length * 131);
  const col = makeCanvas(S), hgt = makeCanvas(S), rmc = makeCanvas(S), emi = makeCanvas(E);
  const c = col.getContext('2d'), h = hgt.getContext('2d'), m = rmc.getContext('2d'), e = emi.getContext('2d');

  // Wall base
  c.fillStyle = st.wall; c.fillRect(0, 0, S, S);
  h.fillStyle = gray(0.85); h.fillRect(0, 0, S, S);
  m.fillStyle = rm(st.rough, st.wallMetal || 0); m.fillRect(0, 0, S, S);
  e.fillStyle = '#000'; e.fillRect(0, 0, E, E);

  // Per-floor color variation
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      c.fillStyle = jitter(st.wall, st.wallVar, r);
      c.globalAlpha = 0.5;
      c.fillRect(i * cs, j * cs, cs, cs);
      c.globalAlpha = 1;
    }
  }

  if (st.brick) {
    // Running bond brick with mortar lines
    const bh = cs / 16, bw = cs / 5;
    for (let y = 0; y < S; y += bh) {
      const off = (Math.round(y / bh) % 2) * bw / 2;
      for (let x = -bw; x < S; x += bw) {
        c.fillStyle = jitter(st.wall, 0.12, r);
        c.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
      }
      c.fillStyle = 'rgba(210,200,185,0.35)';
      c.fillRect(0, y, S, 1.4);
      h.fillStyle = gray(0.72); h.fillRect(0, y, S, 1.5);
    }
  }
  noise(c, S, S, r, 9000, 0.06, true);
  noise(c, S, S, r, 9000, 0.08, false);

  // Horizontal bands (stone courses)
  if (st.bands) {
    for (let j = 0; j < N; j++) {
      c.fillStyle = st.bands; c.fillRect(0, j * cs + cs * 0.9, S, cs * 0.06);
      h.fillStyle = gray(1); h.fillRect(0, j * cs + cs * 0.9, S, cs * 0.06);
    }
  }

  const wx0 = (1 - st.winW) / 2 * cs, ww = st.winW * cs;
  const wy0 = st.winTop * cs, wh = st.winH * cs;

  // Vertical piers / spandrels (continuous vertical window strips)
  if (st.pier) {
    for (let i = 0; i < N; i++) {
      c.fillStyle = st.pier;
      c.fillRect(i * cs, 0, wx0 * 0.6, S);
      c.fillRect(i * cs + cs - wx0 * 0.6, 0, wx0 * 0.6, S);
      h.fillStyle = gray(1);
      h.fillRect(i * cs, 0, wx0 * 0.6, S);
      h.fillRect(i * cs + cs - wx0 * 0.6, 0, wx0 * 0.6, S);
    }
  }
  if (st.spandrel) {
    for (let i = 0; i < N; i++) {
      c.fillStyle = st.spandrel;
      c.fillRect(i * cs + wx0, 0, ww, S);
      h.fillStyle = gray(0.55);
      h.fillRect(i * cs + wx0, 0, ww, S);
      m.fillStyle = rm(0.35, st.spandrelMetal ?? 0.6);
      m.fillRect(i * cs + wx0, 0, ww, S);
      // subtle panel lines
      for (let j = 0; j < N; j++) {
        c.fillStyle = 'rgba(0,0,0,0.25)';
        c.fillRect(i * cs + wx0, j * cs + wy0 + wh + (cs - wh) * 0.5, ww, 1.5);
      }
    }
  }

  // Windows
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = i * cs + wx0, y = j * cs + wy0;
      // Glass with a vertical sky-reflection gradient
      const g = c.createLinearGradient(0, y, 0, y + wh);
      const base = jitter(st.glass, st.glassVar ?? 0.12, r);
      g.addColorStop(0, base);
      g.addColorStop(1, 'rgba(10,14,20,1)');
      c.fillStyle = base; c.fillRect(x, y, ww, wh);
      c.globalAlpha = 0.55; c.fillStyle = g; c.fillRect(x, y, ww, wh); c.globalAlpha = 1;
      // Blinds / curtains
      if (r() < 0.45) {
        const bh = wh * (0.15 + r() * 0.6);
        c.fillStyle = r() < 0.5 ? 'rgba(225,215,190,0.75)' : 'rgba(170,165,150,0.7)';
        c.fillRect(x, y, ww, bh);
      }
      h.fillStyle = gray(0.25); h.fillRect(x, y, ww, wh);
      m.fillStyle = rm(st.glassRough, st.glassMetal); m.fillRect(x, y, ww, wh);

      if (st.frame) {
        c.strokeStyle = st.frame; c.lineWidth = Math.max(2, cs * 0.035);
        c.strokeRect(x, y, ww, wh);
        h.strokeStyle = gray(0.55); h.lineWidth = cs * 0.04; h.strokeRect(x, y, ww, wh);
        if (st.panes) {
          c.lineWidth = Math.max(1.5, cs * 0.022);
          c.beginPath(); c.moveTo(x, y + wh * 0.5); c.lineTo(x + ww, y + wh * 0.5); c.stroke();
          if (ww > cs * 0.45) { c.beginPath(); c.moveTo(x + ww / 2, y); c.lineTo(x + ww / 2, y + wh); c.stroke(); }
        }
      } else {
        // curtain wall mullions
        c.fillStyle = 'rgba(20,26,30,0.9)';
        c.fillRect(x + ww / 2 - 1, y, 2, wh);
        h.fillStyle = gray(0.4); h.fillRect(x + ww / 2 - 1.5, y, 3, wh);
      }
      if (st.sill) {
        c.fillStyle = st.sill; c.fillRect(x - cs * 0.04, y + wh, ww + cs * 0.08, cs * 0.05);
        h.fillStyle = gray(1); h.fillRect(x - cs * 0.04, y + wh, ww + cs * 0.08, cs * 0.05);
      }
      if (st.ornate) {
        // Terra-cotta ornament band above each window
        c.fillStyle = 'rgba(120,95,65,0.35)';
        for (let k = 0; k < 6; k++) c.fillRect(i * cs + k * cs / 6 + 2, j * cs + 3, cs / 12, cs * 0.08);
        h.fillStyle = gray(1);
        for (let k = 0; k < 6; k++) h.fillRect(i * cs + k * cs / 6 + 2, j * cs + 3, cs / 12, cs * 0.08);
      }

      // Emissive: lit rooms at night
      if (r() < st.lit) {
        const warm = r() < 0.7;
        const b = 0.45 + r() * 0.55;
        const col3 = warm ? [255, 196 + r() * 30, 120 + r() * 40] : [205, 225, 255];
        e.fillStyle = `rgb(${col3.map(v => Math.round(v * b)).join(',')})`;
        const ex = i * ecs + wx0 / S * E, ey = j * ecs + wy0 / S * E;
        e.fillRect(ex, ey, ww / S * E, wh / S * E);
        if (r() < 0.3) { // partially drawn blinds
          e.fillStyle = 'rgba(0,0,0,0.6)';
          e.fillRect(ex, ey, ww / S * E, wh / S * E * r() * 0.6);
        }
      }
    }
  }

  return {
    map: canvasTexture(col, true),
    normalMap: canvasTexture(normalFromHeight(hgt, 3), false),
    roughMetal: canvasTexture(rmc, false),
    emissiveMap: canvasTexture(emi, true, 4),
    winM: st.winM, floorM: st.floorM,
  };
}

// Ground floor shops: 4 storefronts per tile, tile = 28m x 5m.
const SHOP_WORDS = ['DELI', 'PIZZA', 'BAGELS', 'PHARMACY', 'CAFE', 'SHOES', 'NEWS', 'DINER', 'FLOWERS', 'BOOKS', 'HARDWARE', 'LAUNDRY', 'BAKERY', 'NAILS', 'OPTICAL', 'WINE', 'GROCERY', 'TAILOR', 'RAMEN', 'TACOS'];
export function makeStorefront(seed = 3) {
  const W = 1024, H = 192;
  const r = mulberry32(seed);
  const col = makeCanvas(W, H), emi = makeCanvas(256, 48), rmc = makeCanvas(W, H);
  const c = col.getContext('2d'), e = emi.getContext('2d'), m = rmc.getContext('2d');
  c.fillStyle = '#3a3632'; c.fillRect(0, 0, W, H);
  e.fillStyle = '#000'; e.fillRect(0, 0, 256, 48);
  m.fillStyle = rm(0.8, 0); m.fillRect(0, 0, W, H);
  const colors = ['#8c1d18', '#1d4d8c', '#1e6b3a', '#6b1e5e', '#b0681a', '#222', '#0d5c63', '#7a5a1a'];
  const sw = W / 4;
  for (let s = 0; s < 4; s++) {
    const x = s * sw;
    // pilasters
    c.fillStyle = '#5a534b'; c.fillRect(x, 0, 10, H); c.fillRect(x + sw - 10, 0, 10, H);
    // sign band
    const sc = colors[Math.floor(r() * colors.length)];
    c.fillStyle = sc; c.fillRect(x + 10, 18, sw - 20, 40);
    c.fillStyle = '#f3efe6';
    c.font = 'bold 30px Arial, Helvetica, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const word = SHOP_WORDS[Math.floor(r() * SHOP_WORDS.length)];
    c.fillText(word, x + sw / 2, 39);
    e.fillStyle = sc; e.fillRect(s * 64 + 3, 4, 58, 10);
    e.fillStyle = '#fff'; e.font = 'bold 8px Arial'; e.textAlign = 'center'; e.textBaseline = 'middle';
    e.fillText(word, s * 64 + 32, 9.5);
    // shop glass
    const gy = 66, gh = H - 66 - 8;
    const g = c.createLinearGradient(0, gy, 0, gy + gh);
    g.addColorStop(0, '#50606c'); g.addColorStop(1, '#161b20');
    c.fillStyle = g; c.fillRect(x + 14, gy, sw - 28, gh);
    m.fillStyle = rm(0.06, 0.4); m.fillRect(x + 14, gy, sw - 28, gh);
    // display goods silhouettes
    for (let k = 0; k < 8; k++) {
      c.fillStyle = `rgba(${150 + r() * 100},${120 + r() * 100},${80 + r() * 100},0.35)`;
      c.fillRect(x + 20 + r() * (sw - 60), gy + gh * 0.5 + r() * gh * 0.4, 8 + r() * 20, 6 + r() * 20);
    }
    // door
    const dx = x + (r() < 0.5 ? 24 : sw - 70);
    c.fillStyle = '#20252a'; c.fillRect(dx, gy + 8, 44, gh - 8);
    c.strokeStyle = '#8a8f93'; c.lineWidth = 3; c.strokeRect(dx, gy + 8, 44, gh - 8);
    // mullions
    c.fillStyle = '#2a2724'; c.fillRect(x + sw / 2, gy, 4, gh);
    // awning
    if (r() < 0.4) {
      const ac = colors[Math.floor(r() * colors.length)];
      c.fillStyle = ac; c.fillRect(x + 12, 58, sw - 24, 16);
      c.fillStyle = 'rgba(255,255,255,0.25)';
      for (let k = 0; k < 12; k++) c.fillRect(x + 12 + k * (sw - 24) / 12, 58, (sw - 24) / 24, 16);
    }
    // interior light at night
    e.fillStyle = `rgba(255,${200 + r() * 40},${140 + r() * 60},${0.5 + r() * 0.4})`;
    e.fillRect(s * 64 + 4, 17, 56, 28);
    e.fillStyle = '#000'; e.fillRect(s * 64 + (dx - x) / 4, 18, 11, 28);
  }
  // cornice line on top
  c.fillStyle = '#4d4741'; c.fillRect(0, 0, W, 12);
  noise(c, W, H, r, 4000, 0.08, false);
  return { map: canvasTexture(col), emissiveMap: canvasTexture(emi, true, 4), roughMetal: canvasTexture(rmc, false) };
}

export function makeRoof(seed = 5) {
  const S = 512, r = mulberry32(seed);
  const cv = makeCanvas(S), c = cv.getContext('2d');
  c.fillStyle = '#4a4845'; c.fillRect(0, 0, S, S);
  for (let i = 0; i < 40000; i++) {
    const v = 50 + r() * 60;
    c.fillStyle = `rgba(${v},${v - 2},${v - 5},0.6)`;
    c.fillRect(r() * S, r() * S, 1 + r() * 2.5, 1 + r() * 2.5);
  }
  // membrane seams
  c.strokeStyle = 'rgba(30,30,30,0.5)'; c.lineWidth = 2;
  for (let y = 0; y < S; y += 128) { c.beginPath(); c.moveTo(0, y); c.lineTo(S, y); c.stroke(); }
  // stains
  for (let i = 0; i < 12; i++) {
    const g = c.createRadialGradient(r() * S, r() * S, 0, r() * S, r() * S, 60 + r() * 80);
    c.fillStyle = 'rgba(20,20,20,0.12)'; c.beginPath(); c.arc(r() * S, r() * S, 40 + r() * 70, 0, 7); c.fill();
    void g;
  }
  return canvasTexture(cv);
}

export function makeAsphalt(seed = 9) {
  const S = 512, r = mulberry32(seed);
  const cv = makeCanvas(S), c = cv.getContext('2d');
  c.fillStyle = '#34363a'; c.fillRect(0, 0, S, S);
  for (let i = 0; i < 60000; i++) {
    const v = 35 + r() * 45;
    c.fillStyle = `rgba(${v},${v},${v + 3},0.55)`;
    c.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2);
  }
  for (let i = 0; i < 18; i++) {
    c.strokeStyle = 'rgba(15,15,15,0.35)'; c.lineWidth = 1 + r() * 2;
    c.beginPath(); let x = r() * S, y = r() * S; c.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 60; c.lineTo(x, y); }
    c.stroke();
  }
  for (let i = 0; i < 10; i++) {
    c.fillStyle = `rgba(${r() < 0.5 ? 20 : 70},${r() < 0.5 ? 20 : 70},${r() < 0.5 ? 22 : 72},0.18)`;
    c.fillRect(r() * S, r() * S, 60 + r() * 120, 40 + r() * 90);
  }
  return canvasTexture(cv);
}

export function makeSidewalk(seed = 11) {
  const S = 512, r = mulberry32(seed);
  const cv = makeCanvas(S), c = cv.getContext('2d');
  const hc = makeCanvas(S), h = hc.getContext('2d');
  c.fillStyle = '#9d9a94'; c.fillRect(0, 0, S, S);
  h.fillStyle = gray(0.8); h.fillRect(0, 0, S, S);
  const n = 4, cs = S / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    c.fillStyle = jitter('#a29f98', 0.06, r); c.fillRect(i * cs + 2, j * cs + 2, cs - 4, cs - 4);
  }
  noise(c, S, S, r, 20000, 0.12, false);
  noise(c, S, S, r, 8000, 0.08, true);
  c.fillStyle = 'rgba(40,38,35,0.6)';
  h.fillStyle = gray(0.2);
  for (let i = 0; i <= n; i++) { c.fillRect(i * cs - 2, 0, 4, S); c.fillRect(0, i * cs - 2, S, 4); h.fillRect(i * cs - 2, 0, 4, S); h.fillRect(0, i * cs - 2, S, 4); }
  // gum spots
  for (let i = 0; i < 60; i++) { c.fillStyle = 'rgba(40,40,40,0.35)'; c.beginPath(); c.arc(r() * S, r() * S, 2 + r() * 3, 0, 7); c.fill(); }
  return { map: canvasTexture(cv), normalMap: canvasTexture(normalFromHeight(hc, 2), false) };
}

export function makeGrass(seed = 13) {
  const S = 512, r = mulberry32(seed);
  const cv = makeCanvas(S), c = cv.getContext('2d');
  c.fillStyle = '#3f5f2a'; c.fillRect(0, 0, S, S);
  for (let i = 0; i < 70000; i++) {
    const g = 70 + r() * 70;
    c.fillStyle = `rgba(${g * 0.55},${g},${g * 0.35},0.5)`;
    c.fillRect(r() * S, r() * S, 1, 2 + r() * 3);
  }
  return canvasTexture(cv);
}

export function makeWaterNormal(seed = 17) {
  const S = 512, r = mulberry32(seed);
  const hc = makeCanvas(S), h = hc.getContext('2d');
  h.fillStyle = gray(0.5); h.fillRect(0, 0, S, S);
  // Tileable sum of sine waves
  const img = h.getImageData(0, 0, S, S), d = img.data;
  const waves = [];
  for (let i = 0; i < 14; i++) waves.push([Math.floor(r() * 7) - 3 || 1, Math.floor(r() * 7) - 3 || 2, r() * 6.28, 0.3 + r() * 0.7]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0;
    for (const [kx, ky, ph, a] of waves) v += Math.sin((kx * x + ky * y) / S * Math.PI * 2 * 2 + ph) * a;
    const i = (y * S + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = 128 + v * 14;
    d[i + 3] = 255;
  }
  h.putImageData(img, 0, 0);
  return canvasTexture(normalFromHeight(hc, 4), false);
}

export function makeClouds(seed = 19) {
  const S = 1024, r = mulberry32(seed);
  const cv = makeCanvas(S), c = cv.getContext('2d');
  c.clearRect(0, 0, S, S);
  // Soft puffs drawn with wrap-around so the texture tiles
  for (let i = 0; i < 260; i++) {
    const x = r() * S, y = r() * S, rad = 20 + r() * 90, a = 0.03 + r() * 0.07;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const g = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    }
  }
  const t = canvasTexture(cv);
  return t;
}

// Times Square style screens: a 4x2 atlas of glowing ads.
export function makeBillboards(seed = 23) {
  const W = 1024, H = 512, r = mulberry32(seed);
  const cv = makeCanvas(W, H), c = cv.getContext('2d');
  const words = ['BROADWAY', 'SHOW TONIGHT', 'NEW YORK', 'LIVE', 'MUSICAL', 'SALE', 'COFFEE', 'CINEMA', 'NEWS 24', 'SUMMER'];
  const pal = [['#ff2d55', '#ffb800'], ['#00c2ff', '#7a00ff'], ['#00e08a', '#004dff'], ['#ff6a00', '#ff0080'], ['#fff200', '#ff3c00'], ['#ff00d4', '#00e5ff'], ['#ffffff', '#ff1e1e'], ['#39ff14', '#00796b']];
  for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) {
    const x = i * 256, y = j * 256, [a, b] = pal[j * 4 + i];
    const g = c.createLinearGradient(x, y, x + 256, y + 256);
    g.addColorStop(0, a); g.addColorStop(1, b);
    c.fillStyle = g; c.fillRect(x, y, 256, 256);
    for (let k = 0; k < 6; k++) {
      c.fillStyle = `rgba(255,255,255,${0.1 + r() * 0.25})`;
      c.beginPath(); c.arc(x + r() * 256, y + r() * 256, 10 + r() * 60, 0, 7); c.fill();
    }
    c.fillStyle = '#fff';
    c.font = 'bold 44px Impact, Arial Black, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 8;
    c.fillText(words[(j * 4 + i) % words.length], x + 128, y + 128);
    c.shadowBlur = 0;
    c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 6; c.strokeRect(x + 3, y + 3, 250, 250);
  }
  return canvasTexture(cv);
}

// ---------------------------------------------------------------------------
// Hero suit
// ---------------------------------------------------------------------------

const SUIT_BLACK = '#0b0b0e';
const SUIT_RED = '#d0121b';

// Web pattern that wraps limbs: vertical strands with sagging cross strands.
// bands: [[u0, u1, color, webLineColor|null], ...] paints vertical panels
// (u runs around the limb) on top of the base.
export function makeSuitTexture(base = SUIT_BLACK, line = SUIT_RED, seed = 29, opts = {}) {
  const S = 512, r = mulberry32(seed);
  const cv = makeCanvas(S), c = cv.getContext('2d');
  const hc = makeCanvas(S), h = hc.getContext('2d');
  const cols = 8, rows = 8, cw = S / cols, rh = S / rows;
  const drawWeb = (ctx, color, width) => {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
    for (let i = 0; i <= cols; i++) {
      ctx.beginPath(); ctx.moveTo(i * cw, -2); ctx.lineTo(i * cw, S + 2); ctx.stroke();
    }
    for (let j = 0; j <= rows; j++) for (let i = 0; i < cols; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cw, j * rh);
      ctx.quadraticCurveTo(i * cw + cw / 2, j * rh + rh * 0.32, i * cw + cw, j * rh);
      ctx.stroke();
    }
  };
  const paint = (color, webColor, x0, x1) => {
    c.save(); h.save();
    c.beginPath(); c.rect(x0, 0, x1 - x0, S); c.clip();
    h.beginPath(); h.rect(x0, 0, x1 - x0, S); h.clip();
    c.fillStyle = color; c.fillRect(0, 0, S, S);
    h.fillStyle = gray(0.3); h.fillRect(0, 0, S, S);
    if (webColor) { drawWeb(c, webColor, 3.2); drawWeb(h, gray(1), 5); }
    c.restore(); h.restore();
  };
  paint(base, line, 0, S);
  for (const [u0, u1, color, web] of opts.bands || []) {
    paint(color, web, u0 * S, u1 * S);
    // seam piping along the panel edges
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(u0 * S - 1.5, 0, 3, S); c.fillRect(u1 * S - 1.5, 0, 3, S);
    h.fillStyle = gray(0.9);
    h.fillRect(u0 * S - 1.5, 0, 3, S); h.fillRect(u1 * S - 1.5, 0, 3, S);
  }
  // fabric grain
  for (let i = 0; i < 26000; i++) {
    const v = r() < 0.5 ? 255 : 0;
    c.fillStyle = `rgba(${v},${v},${v},${0.03 + r() * 0.03})`;
    c.fillRect(r() * S, r() * S, 1, 1);
  }
  return { map: canvasTexture(cv), bumpMap: canvasTexture(hc, false) };
}

export function makeRedSuitTexture() {
  return makeSuitTexture(SUIT_RED, '#140608', 31);
}

// Plain cloth for street clothes: knit (hoodies) or denim.
export function makeFabric(color, kind = 'knit', seed = 41) {
  const S = 256, r = mulberry32(seed);
  const cv = makeCanvas(S), c = cv.getContext('2d');
  c.fillStyle = color; c.fillRect(0, 0, S, S);
  if (kind === 'denim') {
    for (let y = 0; y < S; y += 2) for (let x = 0; x < S; x += 4) {
      c.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.08})`;
      c.fillRect(x + (y / 2) % 4, y, 2, 1);
    }
  } else {
    for (let y = 0; y < S; y += 3) {
      c.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.05})`;
      c.fillRect(0, y, S, 1);
    }
  }
  for (let i = 0; i < 9000; i++) {
    const v = r() < 0.5 ? 255 : 0;
    c.fillStyle = `rgba(${v},${v},${v},${0.04 + r() * 0.05})`;
    c.fillRect(r() * S, r() * S, 1, 1);
  }
  return canvasTexture(cv);
}

// Knit balaclava with an eye slit, in the head sphere's UV space.
export function makeBalaclava(knit = '#1b1c1f', skin = '#b07a5a', seed = 43) {
  const W = 256, H = 128, r = mulberry32(seed);
  const cv = makeCanvas(W, H), c = cv.getContext('2d');
  const img = c.createImageData(W, H), d = img.data;
  const K = hexToRgb(knit), Sk = hexToRgb(skin);
  for (let py = 0; py < H; py++) {
    const th = (py + 0.5) / H * Math.PI;
    for (let px = 0; px < W; px++) {
      const ph = (px + 0.5) / W * Math.PI * 2;
      const dx = -Math.cos(ph) * Math.sin(th), dy = Math.cos(th), dz = Math.sin(ph) * Math.sin(th);
      const ex = Math.atan2(dx, dz), ey = Math.asin(dy);
      let col = K.map(v => v * (0.85 + ((py % 3) === 0 ? -0.1 : 0.05) + r() * 0.1));
      if (Math.abs(ex) < 0.62 && Math.abs(ey - 0.1) < 0.11) {
        col = Sk;
        for (const s of [-1, 1]) {
          const e = Math.hypot((ex - s * 0.3) / 0.12, (ey - 0.1) / 0.06);
          if (e < 1) col = e < 0.55 ? [25, 20, 18] : [235, 230, 225];
        }
      }
      const i = (py * W + px) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  const t = canvasTexture(cv);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Mask painted per pixel in the head sphere's UV space: a radial web centered
// on the face with large white eye lenses in thick black frames.
export function makeMaskTexture(opts = {}) {
  const W = 1024, H = 512;
  const cv = makeCanvas(W, H), c = cv.getContext('2d');
  const hc = makeCanvas(W, H), hctx = hc.getContext('2d');
  const img = c.createImageData(W, H), d = img.data;
  const himg = hctx.createImageData(W, H), hd = himg.data;
  const red = opts.line === null ? null : hexToRgb(opts.line || '#d0121b');
  const black = hexToRgb(opts.base || '#0b0b0e');
  const white = hexToRgb(opts.lens || '#f0f2f5');
  const frame = hexToRgb(opts.frame || '#060608');
  const frameW = opts.frameWidth ?? 1.35;
  // web center slightly below the eyes (nose)
  const F = [0, -0.18, 1]; const fl = Math.hypot(...F); F[0] /= fl; F[1] /= fl; F[2] /= fl;
  // reference axis for the azimuth around F
  const Ux = [1, 0, 0];
  const Uy = [F[1] * Ux[2] - F[2] * Ux[1], F[2] * Ux[0] - F[0] * Ux[2], F[0] * Ux[1] - F[1] * Ux[0]];
  const spokes = 16, ringStep = 0.3, lw = 0.016;
  for (let py = 0; py < H; py++) {
    const v = (py + 0.5) / H, th = v * Math.PI;
    for (let px = 0; px < W; px++) {
      const u = (px + 0.5) / W, ph = u * Math.PI * 2;
      const dx = -Math.cos(ph) * Math.sin(th), dy = Math.cos(th), dz = Math.sin(ph) * Math.sin(th);
      const cosA = dx * F[0] + dy * F[1] + dz * F[2];
      const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
      const bx = dx * Ux[0] + dy * Ux[1] + dz * Ux[2];
      const by = dx * Uy[0] + dy * Uy[1] + dz * Uy[2];
      const beta = Math.atan2(by, bx);
      // spokes
      const sp = beta / (Math.PI * 2) * spokes;
      const sf = sp - Math.round(sp);
      const spokeDist = Math.abs(sf) * (Math.PI * 2 / spokes) * Math.sin(alpha);
      // sagging rings between spokes
      const t = sp - Math.floor(sp);
      const sag = Math.sin(Math.PI * t) * 0.07;
      const ra = alpha + sag;
      const rk = Math.max(1, Math.round(ra / ringStep));
      const ringDist = Math.abs(ra - rk * ringStep);
      let col = black, hv = 0.3;
      if (red && alpha > 0.05 && (spokeDist < lw || ringDist < lw)) { col = red; hv = 1; }

      // eyes (yaw/pitch space)
      const ex = Math.atan2(dx, dz), ey = Math.asin(dy);
      for (const s of [-1, 1]) {
        const cx = 0.43 * s, cy = 0.1;
        let lx = ex - cx, ly = ey - cy;
        const rot = -0.42 * s; // outer corners sweep up
        const rx = lx * Math.cos(rot) - ly * Math.sin(rot);
        const ry = lx * Math.sin(rot) + ly * Math.cos(rot);
        let dd = Math.hypot(rx / 0.34, ry / 0.2);
        // pointed inner-lower tip
        if (rx * s < 0) dd = Math.hypot(rx / 0.4, ry / 0.2);
        if (dd < frameW) { col = frame; hv = 0.55; }
        if (dd < 1.0) {
          const shade = 1 - Math.max(0, ry / 0.2) * 0.08;
          col = [white[0] * shade, white[1] * shade, white[2] * shade]; hv = 0.45;
        }
      }
      const i = (py * W + px) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
      const hh = Math.round(hv * 255);
      hd[i] = hd[i + 1] = hd[i + 2] = hh; hd[i + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  hctx.putImageData(himg, 0, 0);
  const map = canvasTexture(cv);
  map.wrapS = THREE.RepeatWrapping; map.wrapT = THREE.ClampToEdgeWrapping;
  const bump = canvasTexture(hc, false);
  return { map, bumpMap: bump };
}

// Red spider emblem with long angular legs.
export function makeEmblemTexture(color = SUIT_RED, scale = 1) {
  const S = 512;
  const cv = makeCanvas(S), c = cv.getContext('2d');
  c.clearRect(0, 0, S, S);
  c.translate(256, 256); c.scale(scale, scale); c.translate(-256, -256);
  c.fillStyle = color; c.strokeStyle = color;
  c.lineJoin = 'miter'; c.lineCap = 'round';
  const legs = [
    [[238, 200], [150, 150], [118, 36]],
    [[234, 218], [128, 196], [62, 112]],
    [[234, 236], [130, 274], [70, 392]],
    [[240, 250], [168, 330], [132, 478]],
  ];
  for (const s of [1, -1]) {
    for (const leg of legs) {
      const p = leg.map(([x, y]) => [256 + (x - 256) * s, y]);
      c.lineWidth = 17;
      c.beginPath(); c.moveTo(p[0][0], p[0][1]); c.lineTo(p[1][0], p[1][1]); c.stroke();
      // tapered lower segment
      const [x1, y1] = p[1], [x2, y2] = p[2];
      const nx = -(y2 - y1), ny = x2 - x1, l = Math.hypot(nx, ny);
      c.beginPath();
      c.moveTo(x1 + nx / l * 8.5, y1 + ny / l * 8.5);
      c.lineTo(x2, y2);
      c.lineTo(x1 - nx / l * 8.5, y1 - ny / l * 8.5);
      c.closePath(); c.fill();
      c.beginPath(); c.arc(x1, y1, 8.5, 0, 7); c.fill();
    }
  }
  // head, thorax, abdomen
  c.beginPath(); c.ellipse(256, 168, 20, 24, 0, 0, 7); c.fill();
  c.beginPath(); c.ellipse(256, 226, 32, 40, 0, 0, 7); c.fill();
  c.beginPath();
  c.moveTo(256, 250);
  c.bezierCurveTo(300, 270, 298, 360, 256, 420);
  c.bezierCurveTo(214, 360, 212, 270, 256, 250);
  c.fill();
  return canvasTexture(cv);
}

export function makeWebSplat() {
  const S = 256;
  const cv = makeCanvas(S), c = cv.getContext('2d');
  c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 3; c.lineCap = 'round';
  const cx = S / 2, cy = S / 2;
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * 118, cy + Math.sin(a) * 118); c.stroke();
  }
  c.lineWidth = 2.2;
  for (let k = 1; k <= 4; k++) {
    const rr = k * 26;
    c.beginPath();
    for (let i = 0; i <= 10; i++) {
      const a = i / 10 * Math.PI * 2;
      const a0 = (i - 1) / 10 * Math.PI * 2;
      if (i === 0) c.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      else {
        const am = (a + a0) / 2;
        c.quadraticCurveTo(cx + Math.cos(am) * rr * 0.8, cy + Math.sin(am) * rr * 0.8, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
    }
    c.stroke();
  }
  const t = canvasTexture(cv);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
