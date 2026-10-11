// Suits for the hero and outfits for the street thugs. A skin maps body
// roles (torso, hips, arm, leg, hand, foot, neck, head, emblem, emblemBack,
// hood, hoodInner) to materials; a missing role hides that part.
import * as THREE from 'three';
import {
  makeSuitTexture, makeMaskTexture, makeEmblemTexture, makeFabric, makeBalaclava,
  makeArmor, makeStripes, makeFaceTexture,
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

// ---- Bosses ----
function armorMats(tex, extra = {}) {
  const mk = (rx, ry) => {
    const map = tex.map.clone(); map.repeat.set(rx, ry); map.needsUpdate = true;
    const bumpMap = tex.bumpMap.clone(); bumpMap.repeat.set(rx, ry); bumpMap.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map, bumpMap, bumpScale: 2, roughness: 0.42, metalness: 0.45, ...extra });
  };
  return { torso: mk(2, 1), limb: mk(1, 1.3) };
}
function cloth(color, kind = 'knit', seed = 1, rx = 1, ry = 1) {
  const map = makeFabric(color, kind, seed); map.repeat.set(rx, ry);
  return new THREE.MeshStandardMaterial({ map, roughness: 0.92 });
}
function face(opts, extra = {}) {
  const t = makeFaceTexture(opts);
  return new THREE.MeshStandardMaterial({
    map: t.map, emissiveMap: t.emissiveMap, emissive: 0xffffff, emissiveIntensity: opts.glow ?? 0,
    roughness: 0.55, ...extra,
  });
}
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });

const BOSS_BUILDERS = {
  // Green armored glider pilot with a yellow-eyed helmet.
  goblin() {
    const a = armorMats(makeArmor('#36652a', '#16300f', { cell: 56, rivets: true, seed: 111 }));
    const dark = std(0x1d3a17, { metalness: 0.5, roughness: 0.4 });
    return {
      torso: a.torso, hips: a.torso, arm: a.limb, leg: a.limb, detail: a.torso, lat: a.limb, knee: dark,
      hand: dark, foot: dark, neck: dark, jaw: std(0x2f5a24, { metalness: 0.4 }),
      head: face({
        base: '#3a6a29', seam: '#1c3a14', glow: 2.2,
        eyes: { color: '#ffd42e', cx: 0.3, cy: 0.12, rx: 0.2, ry: 0.075, rot: -0.38, glow: true, frame: '#14260e' },
        brows: { color: '#1f3d17', cy: 0.27, w: 0.4, h: 0.04, tilt: 0.35 },
        mouth: { color: '#0f1d0a', cy: -0.4, w: 0.42, h: 0.04, curve: 0.35 },
      }, { metalness: 0.45, roughness: 0.4 }),
      emblem: null, emblemBack: null,
    };
  },
  // Green scaled armor and a segmented stinger tail.
  scorpion() {
    const a = armorMats(makeArmor('#3f7d2a', '#18330f', { cell: 36, cellH: 30, offsetRows: true, round: true, seed: 113 }));
    const dark = std(0x1b3412, { metalness: 0.4, roughness: 0.45 });
    return {
      torso: a.torso, hips: a.torso, arm: a.limb, leg: a.limb, detail: a.torso, lat: a.limb, knee: dark,
      hand: dark, foot: dark, neck: dark, jaw: std(0x3a7426, { metalness: 0.4 }),
      head: face({
        base: '#3f7d2a', seam: '#1a3510',
        eyes: { color: '#0a1408', cx: 0.3, cy: 0.1, rx: 0.24, ry: 0.1, rot: -0.28, frame: '#24481a' },
        mouth: { color: '#1f3d15', cy: -0.38, w: 0.3, h: 0.03 },
      }, { metalness: 0.4, roughness: 0.4 }),
      emblem: null, emblemBack: null,
    };
  },
  // Olive flight suit, leather helmet with glowing green goggles.
  vulture() {
    const suit = cloth('#4b543a', 'knit', 121, 2, 2);
    const glove = std(0x2a2118, { roughness: 0.5 });
    return {
      torso: suit, hips: suit, arm: suit, leg: suit, detail: suit, lat: suit, knee: suit,
      hand: glove, foot: std(0x141414), neck: std(0x3a3d34), jaw: std(0x3d4136, { roughness: 0.5 }),
      head: face({
        base: '#41463d', seam: '#26291f', glow: 2.5,
        eyes: { color: '#7dff8a', cx: 0.28, cy: 0.1, rx: 0.16, ry: 0.14, glow: true, frame: '#1a1a1a' },
        mouth: { color: '#2a2d26', cy: -0.36, w: 0.34, h: 0.08 },
      }, { roughness: 0.45, metalness: 0.2 }),
      emblem: null, emblemBack: null,
    };
  },
  // Trench coat, round dark glasses, four mechanical arms.
  ock() {
    const coat = cloth('#3b3227', 'knit', 131, 2, 2);
    const pants = cloth('#2a2a2d', 'denim', 132, 2, 2);
    const skin = std(0xd4a07a, { roughness: 0.7 });
    return {
      torso: coat, hips: coat, arm: coat, leg: pants, detail: coat, lat: coat, knee: pants,
      hand: skin, foot: std(0x111111, { roughness: 0.4 }), neck: skin, jaw: skin,
      head: face({
        base: '#d6a582', hair: { color: '#3a281c', top: 0.42, back: -0.25 },
        glasses: { color: '#090909', cx: 0.25, cy: 0.1, r: 0.12, frame: '#2b2b2b' },
        brows: { color: '#3a281c', cy: 0.26, w: 0.24, h: 0.025, tilt: -0.1 },
        mouth: { color: '#8a4a3a', cy: -0.37, w: 0.2, h: 0.022, curve: 0.25 },
      }),
      emblem: null, emblemBack: null,
    };
  },
  // Heavy gray armored hide; the horn is added as geometry.
  rhino() {
    const a = armorMats(makeArmor('#6d7174', '#33363a', { cell: 128, cellH: 96, rivets: true, seed: 141 }), { metalness: 0.25, roughness: 0.6 });
    const dark = std(0x4c5053, { roughness: 0.6 });
    return {
      torso: a.torso, hips: a.torso, arm: a.limb, leg: a.limb, detail: a.torso, lat: a.limb, knee: dark,
      hand: dark, foot: dark, neck: dark, jaw: std(0xc48f6c),
      head: face({
        base: '#6d7174', window: { color: '#c48f6c', ex: 0.5, min: -0.5, max: 0.24 },
        eyes: { color: '#1a1410', cx: 0.2, cy: 0.06, rx: 0.07, ry: 0.035 },
        brows: { color: '#4a3326', cy: 0.15, w: 0.2, h: 0.03, tilt: 0.3 },
        mouth: { color: '#7a4434', cy: -0.32, w: 0.22, h: 0.025, curve: 0.3 },
      }, { roughness: 0.6 }),
      emblem: null, emblemBack: null,
    };
  },
  // Green-and-black striped shirt, brown slacks, hands of sand.
  sandman() {
    const map = makeStripes(['#2f6b3a', '#161916'], 14);
    const shirtT = map.clone(); shirtT.repeat.set(2, 1); shirtT.needsUpdate = true;
    const shirt = new THREE.MeshStandardMaterial({ map: shirtT, roughness: 0.9 });
    const sleeve = new THREE.MeshStandardMaterial({ map, roughness: 0.9 });
    const pants = cloth('#5a4630', 'denim', 151, 2, 2);
    const sand = std(0xc2a271, { roughness: 1 });
    const skin = std(0xc9956c, { roughness: 0.7 });
    return {
      torso: shirt, hips: pants, arm: sleeve, leg: pants, detail: shirt, lat: shirt, knee: pants,
      hand: sand, foot: std(0x3a2a1c), neck: skin, jaw: skin,
      head: face({
        base: '#c9956c', hair: { color: '#4a3524', top: 0.55, back: 0.2 },
        eyes: { color: '#1d1410', cx: 0.22, cy: 0.07, rx: 0.06, ry: 0.03 },
        brows: { color: '#4a3524', cy: 0.16, w: 0.2, h: 0.025, tilt: 0.15 },
        mouth: { color: '#7a4a38', cy: -0.35, w: 0.2, h: 0.022 },
      }),
      emblem: null, emblemBack: null, sand,
    };
  },
};

export function bossSkin(id) {
  const key = 'boss-' + id;
  if (!cache.has(key)) cache.set(key, BOSS_BUILDERS[id]());
  return cache.get(key);
}
