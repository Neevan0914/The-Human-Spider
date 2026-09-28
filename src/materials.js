import * as THREE from 'three';
import {
  makeFacade, makeStorefront, makeRoof, makeAsphalt, makeSidewalk, makeGrass,
  makeWaterNormal, makeBillboards, FACADE_STYLES,
} from './textures.js';

// Shared city materials. Night-time glow is driven by setNight().
export function createMaterials() {
  const M = { facades: {}, glowing: [] };

  let seed = 1;
  for (const name of Object.keys(FACADE_STYLES)) {
    const t = makeFacade(name, seed++);
    const mat = new THREE.MeshStandardMaterial({
      map: t.map,
      normalMap: t.normalMap,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughnessMap: t.roughMetal,
      metalnessMap: t.roughMetal,
      roughness: 1,
      metalness: 1,
      emissiveMap: t.emissiveMap,
      emissive: 0xffffff,
      emissiveIntensity: 0,
    });
    mat.userData = { winM: t.winM, floorM: t.floorM, glow: 1.6 };
    M.facades[name] = mat;
    M.glowing.push(mat);
  }

  const shop = makeStorefront(7);
  M.storefront = new THREE.MeshStandardMaterial({
    map: shop.map, roughnessMap: shop.roughMetal, metalnessMap: shop.roughMetal,
    roughness: 1, metalness: 1, emissiveMap: shop.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0,
  });
  M.storefront.userData = { glow: 1.8, base: 0.05 };
  M.glowing.push(M.storefront);

  M.roof = new THREE.MeshStandardMaterial({ map: makeRoof(5), roughness: 0.95, color: 0xbdbab5 });
  M.trim = new THREE.MeshStandardMaterial({ color: 0xa8a295, roughness: 0.8 });
  M.darkTrim = new THREE.MeshStandardMaterial({ color: 0x4a4c50, roughness: 0.6, metalness: 0.3 });
  M.metal = new THREE.MeshStandardMaterial({ color: 0x8a8e92, roughness: 0.45, metalness: 0.7 });
  M.wood = new THREE.MeshStandardMaterial({ color: 0x6d4b33, roughness: 0.9 });

  const asphalt = makeAsphalt(9);
  asphalt.repeat.set(1, 1);
  M.asphalt = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.92, color: 0xffffff });

  const sw = makeSidewalk(11);
  M.sidewalk = new THREE.MeshStandardMaterial({ map: sw.map, normalMap: sw.normalMap, roughness: 0.88 });
  M.curb = new THREE.MeshStandardMaterial({ color: 0x8f8b84, roughness: 0.85 });

  M.marking = new THREE.MeshStandardMaterial({ color: 0xe8e6df, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  M.markingYellow = new THREE.MeshStandardMaterial({ color: 0xe0b020, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

  M.grass = new THREE.MeshStandardMaterial({ map: makeGrass(13), roughness: 0.95 });
  M.path = new THREE.MeshStandardMaterial({ color: 0x9c9384, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });

  const wn = makeWaterNormal(17);
  wn.repeat.set(60, 60);
  M.water = new THREE.MeshStandardMaterial({
    color: 0x1d3a44, roughness: 0.08, metalness: 0.6, normalMap: wn, normalScale: new THREE.Vector2(0.35, 0.35),
  });
  M.quay = new THREE.MeshStandardMaterial({ color: 0x6f6b64, roughness: 0.9 });

  M.billboard = new THREE.MeshStandardMaterial({
    map: makeBillboards(23), emissiveMap: null, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.4,
  });
  M.billboard.emissiveMap = M.billboard.map;
  M.billboard.userData = { glow: 1.6, base: 0.7 };
  M.glowing.push(M.billboard);

  M.lampHead = new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffd9a0, emissiveIntensity: 0 });
  M.lampHead.userData = { glow: 6, base: 0 };
  M.glowing.push(M.lampHead);

  M.lampPole = new THREE.MeshStandardMaterial({ color: 0x2f3437, roughness: 0.5, metalness: 0.6 });

  M.farCity = new THREE.MeshStandardMaterial({ color: 0x7c828a, roughness: 0.9, emissive: 0xffcf8a, emissiveIntensity: 0 });
  M.farCity.userData = { glow: 0.12, base: 0 };
  M.glowing.push(M.farCity);

  return M;
}

export function setNight(M, f) {
  for (const m of M.glowing) {
    const u = m.userData;
    m.emissiveIntensity = (u.base || 0) + f * (u.glow ?? 1);
  }
}
