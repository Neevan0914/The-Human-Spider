// Suits for the hero and outfits for the street thugs. A skin maps body
// roles (torso, hips, arm, leg, hand, foot, neck, head, emblem, emblemBack,
// hood, hoodInner) to materials; a missing role hides that part.
import * as THREE from 'three';
import {
  makeSuitTexture, makeMaskTexture, makeEmblemTexture, makeFabric, makeBalaclava,
} from './textures.js';

export const HERO_SKINS = [
  { id: 'noir', label: 'Black suit, red webbing', colors: ['#0b0b0e', '#d0121b'] },
  { id: 'classic', label: 'Red and blue suit', colors: ['#c8141c', '#1f3f9e'] },
  { id: 'ghost', label: 'White hooded suit, pink and teal', colors: ['#f2f2f4', '#ff4fa3'] },
];

const RED = '#c8141c', BLUE = '#1f3f9e', DARK = '#15080a';
const PINK = '#ff4fa3', TEAL = '#19b9c4', WHITE = '#f1f1f3';

const cache = new Map();

const COMMON = {
  roughness: 0.5, metalness: 0.0, sheen: 0.5, sheenRoughness: 0.45,
  clearcoat: 0.2, clearcoatRoughness: 0.45, bumpScale: 1.6,
};

function suitMat(tex, rx, ry, extra = {}) {
  const map = tex.map.clone(); map.repeat.set(rx, ry); map.needsUpdate = true;
  const bumpMap = tex.bumpMap.clone(); bumpMap.repeat.set(rx, ry); bumpMap.needsUpdate = true;
  return new THREE.MeshPhysicalMaterial({ ...COMMON, map, bumpMap, ...extra });
}

function plainMat(color, extra = {}) {
  return new THREE.MeshPhysicalMaterial({ ...COMMON, color, ...extra });
}

function maskMat(opts) {
  const m = makeMaskTexture(opts);
  return new THREE.MeshPhysicalMaterial({ ...COMMON, map: m.map, bumpMap: m.bumpMap, bumpScale: 1.2, clearcoat: 0.35 });
}

function emblemMat(color, scale = 1) {
  return new THREE.MeshPhysicalMaterial({
    map: makeEmblemTexture(color, scale), alphaTest: 0.5, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
}

const BUILDERS = {
  noir() {
    const suit = makeSuitTexture('#0b0b0e', '#d0121b', 29);
    const red = makeSuitTexture('#d0121b', '#140608', 31);
    const sheen = { sheenColor: new THREE.Color(0x3a0a0c) };
    const torso = suitMat(suit, 2, 1, sheen);
    const limb = suitMat(suit, 1, 1.3, sheen);
    const redM = suitMat(red, 1, 1.3, { sheenColor: new THREE.Color(0x5a0a0a) });
    return {
      torso, hips: torso, arm: limb, leg: limb, hand: redM, foot: redM,
      neck: plainMat(0x0d0d10), jaw: plainMat(0x0d0d10), head: maskMat({}),
      emblem: emblemMat('#d0121b'), emblemBack: emblemMat('#d0121b'),
    };
  },
  classic() {
    const sheen = { sheenColor: new THREE.Color(0x4a0a0e) };
    const torso = suitMat(makeSuitTexture(RED, DARK, 51, { bands: [[0.22, 0.78, BLUE, null]] }), 2, 1, sheen);
    const hips = suitMat(makeSuitTexture(BLUE, null, 52), 2, 1);
    const arm = suitMat(makeSuitTexture(RED, DARK, 53, { bands: [[0, 0.14, BLUE, null], [0.86, 1, BLUE, null]] }), 1, 1.3, sheen);
    const leg = suitMat(makeSuitTexture(BLUE, null, 54, { bands: [[0.18, 0.32, RED, DARK], [0.68, 0.82, RED, DARK]] }), 1, 1.3);
    const red = suitMat(makeSuitTexture(RED, DARK, 55), 1, 1.3, sheen);
    return {
      torso, hips, arm, leg, hand: red, foot: red, neck: red, jaw: plainMat(RED),
      detail: suitMat(makeSuitTexture(RED, DARK, 56), 1, 1, sheen), lat: plainMat(BLUE), knee: plainMat(BLUE),
      head: maskMat({ base: RED, line: DARK, lens: '#d3dbe2', frame: '#08080a', frameWidth: 1.3 }),
      emblem: emblemMat('#0b0b0e', 0.8), emblemBack: emblemMat('#0b0b0e', 1),
    };
  },
  ghost() {
    const sheen = { sheenColor: new THREE.Color(0x6a3a55) };
    const torso = suitMat(makeSuitTexture(WHITE, null, 61, { bands: [[0.33, 0.67, PINK, '#2a0a1c']] }), 2, 1, sheen);
    const arm = suitMat(makeSuitTexture(WHITE, null, 62, { bands: [[0, 0.16, PINK, '#2a0a1c'], [0.84, 1, PINK, '#2a0a1c']] }), 1, 1.3, sheen);
    const leg = suitMat(makeSuitTexture(WHITE, null, 63, { bands: [[0.22, 0.28, '#16161a', null], [0.72, 0.78, '#16161a', null]] }), 1, 1.3);
    const hoodInner = suitMat(makeSuitTexture(PINK, '#2a0a1c', 64), 3, 2, { side: THREE.BackSide });
    return {
      torso, hips: plainMat(WHITE), arm, leg,
      hand: plainMat(WHITE), foot: plainMat(TEAL, { roughness: 0.35, clearcoat: 0.5 }), neck: plainMat(WHITE),
      detail: plainMat(WHITE), knee: plainMat(WHITE), jaw: plainMat(WHITE),
      lat: suitMat(makeSuitTexture(PINK, '#2a0a1c', 65), 1, 1, sheen),
      head: maskMat({ base: WHITE, line: null, lens: '#ffffff', frame: '#111114', frameWidth: 1.28 }),
      emblem: emblemMat('#0b0b0e', 0.55), emblemBack: null,
      hood: plainMat(WHITE, { roughness: 0.7 }), hoodInner,
    };
  },
};

export function heroSkin(id) {
  if (!BUILDERS[id]) id = 'noir';
  if (!cache.has(id)) cache.set(id, BUILDERS[id]());
  return cache.get(id);
}

// ---- Street thugs: hoodies, jeans, sneakers and knit balaclavas ----
const HOODIES = ['#3b4a3a', '#5a2a2a', '#2e3440', '#5c5a55', '#3d3350'];
const SKIN_TONES = ['#b07a5a', '#8a5a3c', '#d1a07c', '#5e3b26'];

export function thugSkin(i) {
  const key = 'thug' + (i % 10);
  if (cache.has(key)) return cache.get(key);
  const hoodie = HOODIES[i % HOODIES.length];
  const tone = SKIN_TONES[(i * 3 + 1) % SKIN_TONES.length];
  const knit = new THREE.MeshStandardMaterial({ map: makeFabric(hoodie, 'knit', 70 + i), roughness: 0.95 });
  const denim = new THREE.MeshStandardMaterial({ map: makeFabric(i % 2 ? '#2d3f5c' : '#26272b', 'denim', 80 + i), roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: tone, roughness: 0.7 });
  const shoes = new THREE.MeshStandardMaterial({ color: i % 3 ? 0xdedede : 0x222222, roughness: 0.6 });
  const head = new THREE.MeshStandardMaterial({ map: makeBalaclava('#1b1c1f', tone, 90 + i), roughness: 0.95 });
  const s = {
    torso: knit, hips: denim, arm: knit, leg: denim, hand: skin, foot: shoes, neck: knit, head,
    jaw: new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.95 }),
    emblem: null, emblemBack: null,
    hood: knit, hoodInner: new THREE.MeshStandardMaterial({ color: 0x151515, side: THREE.BackSide, roughness: 1 }),
  };
  cache.set(key, s);
  return s;
}
