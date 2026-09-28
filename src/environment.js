// Sky, sun/moon lighting, fog, clouds and stars with four time-of-day presets.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { makeClouds, mulberry32 } from './textures.js';

export const TIMES = [
  {
    name: 'Morning', elev: 16, azim: 115, turbidity: 5, rayleigh: 1.4, mie: 0.004, mieG: 0.8,
    sun: 0xffe2bf, sunI: 3.2, sky: 0xbfd6f2, ground: 0x5e544b, hemiI: 1.0,
    fog: 0xbecbd8, fogD: 0.00042, exposure: 0.52, night: 0, bloom: 0.18, clouds: 0xffffff, cloudA: 0.8,
  },
  {
    name: 'Noon', elev: 62, azim: 165, turbidity: 2.5, rayleigh: 1.0, mie: 0.003, mieG: 0.8,
    sun: 0xfff6ea, sunI: 3.6, sky: 0xb4cdef, ground: 0x625a50, hemiI: 1.0,
    fog: 0xb3c6dc, fogD: 0.00036, exposure: 0.46, night: 0, bloom: 0.12, clouds: 0xffffff, cloudA: 0.85,
  },
  {
    name: 'Golden Hour', elev: 5, azim: 252, turbidity: 9, rayleigh: 2.6, mie: 0.008, mieG: 0.86,
    sun: 0xffa760, sunI: 2.9, sky: 0x9fb2d4, ground: 0x5a4436, hemiI: 0.75,
    fog: 0xd9ad8a, fogD: 0.0005, exposure: 0.62, night: 0.35, bloom: 0.35, clouds: 0xffb488, cloudA: 0.9,
  },
  {
    name: 'Night', elev: -14, azim: 252, moonElev: 38, moonAzim: 150, turbidity: 2, rayleigh: 0.4, mie: 0.002, mieG: 0.8,
    sun: 0x9fb4e0, sunI: 0.45, sky: 0x2a3a5c, ground: 0x0e0e14, hemiI: 0.45,
    fog: 0x0c1322, fogD: 0.00065, exposure: 0.95, night: 1, bloom: 0.75, clouds: 0x2a3348, cloudA: 0.5,
  },
];

export class Environment {
  constructor(renderer, scene, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.skyScene = new THREE.Scene();
    this.sky = new Sky();
    this.sky.scale.setScalar(50);
    this.skyScene.add(this.sky);
    this.sunDir = new THREE.Vector3();

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);

    this.light = new THREE.DirectionalLight(0xffffff, 3);
    this.light.castShadow = true;
    const sz = quality === 'low' ? 1024 : 4096;
    this.light.shadow.mapSize.set(sz, sz);
    const cam = this.light.shadow.camera;
    this.shadowExtent = 170;
    cam.left = -this.shadowExtent; cam.right = this.shadowExtent;
    cam.top = this.shadowExtent; cam.bottom = -this.shadowExtent;
    cam.near = 1; cam.far = 1600;
    this.light.shadow.bias = -0.0003;
    this.light.shadow.normalBias = 0.5;
    scene.add(this.light);
    scene.add(this.light.target);

    scene.fog = new THREE.FogExp2(0xbfd0e0, 0.0004);

    // Cloud layer
    const ct = makeClouds(19);
    ct.repeat.set(3, 3);
    this.cloudMat = new THREE.MeshBasicMaterial({ map: ct, transparent: true, depthWrite: false, fog: false, opacity: 0.8 });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), this.cloudMat);
    this.clouds.rotation.x = Math.PI / 2;
    this.clouds.position.y = 1400;
    this.clouds.renderOrder = -1;
    scene.add(this.clouds);

    // Stars
    const r = mulberry32(77);
    const pos = [];
    for (let i = 0; i < 2500; i++) {
      const u = r() * 2 - 1, th = r() * Math.PI * 2;
      const y = Math.abs(u) * 0.95 + 0.05;
      const s = Math.sqrt(1 - y * y);
      pos.push(Math.cos(th) * s * 4200, y * 4200, Math.sin(th) * s * 4200);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0 });
    this.stars = new THREE.Points(sg, this.starMat);
    scene.add(this.stars);

    // Moon
    const mc = document.createElement('canvas'); mc.width = mc.height = 128;
    const mx = mc.getContext('2d');
    const g = mx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,245,1)'); g.addColorStop(0.35, 'rgba(240,240,230,1)');
    g.addColorStop(0.42, 'rgba(200,210,255,0.25)'); g.addColorStop(1, 'rgba(200,210,255,0)');
    mx.fillStyle = g; mx.fillRect(0, 0, 128, 128);
    const moonTex = new THREE.CanvasTexture(mc); moonTex.colorSpace = THREE.SRGBColorSpace;
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, transparent: true, depthWrite: false }));
    this.moon.scale.setScalar(260);
    scene.add(this.moon);

    this.envRT = null;
    this.index = 0;
  }

  apply(index) {
    this.index = index;
    const T = TIMES[index];
    this.preset = T;
    const u = this.sky.material.uniforms;
    u.turbidity.value = T.turbidity;
    u.rayleigh.value = T.rayleigh;
    u.mieCoefficient.value = T.mie;
    u.mieDirectionalG.value = T.mieG;
    const phi = THREE.MathUtils.degToRad(90 - T.elev);
    const theta = THREE.MathUtils.degToRad(T.azim);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    u.sunPosition.value.copy(this.sunDir);

    // Key light follows the sun, or the moon at night.
    this.lightDir = this.sunDir.clone();
    if (T.moonElev !== undefined) {
      this.lightDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - T.moonElev), THREE.MathUtils.degToRad(T.moonAzim));
    }
    this.moon.visible = T.moonElev !== undefined;
    this.light.color.set(T.sun);
    this.light.intensity = T.sunI;
    this.hemi.color.set(T.sky);
    this.hemi.groundColor.set(T.ground);
    this.hemi.intensity = T.hemiI;
    this.scene.fog.color.set(T.fog);
    this.scene.fog.density = T.fogD;
    this.renderer.toneMappingExposure = T.exposure;
    this.cloudMat.color.set(T.clouds);
    this.cloudMat.opacity = T.cloudA;
    this.starMat.opacity = T.night > 0.9 ? 0.9 : 0;

    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.skyScene, 0, 0.1, 200);
    let bg = this.envRT.texture;
    if (T.night > 0.9) {
      // The physical sky is black at night; use a deep blue gradient instead.
      bg = this._nightBackground();
      this.scene.environmentIntensity = 0.35;
    } else {
      this.scene.environmentIntensity = 1;
    }
    this.scene.background = bg;
    this.scene.environment = this.envRT.texture;
    if (T.night > 0.9) this.scene.environment = this._nightEnv();
  }

  _nightBackground() {
    if (this._nightBg) return this._nightBg;
    const c = document.createElement('canvas'); c.width = 16; c.height = 256;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#02040a'); g.addColorStop(0.45, '#081024'); g.addColorStop(0.5, '#141d33'); g.addColorStop(0.56, '#0c1322'); g.addColorStop(1, '#05070c');
    x.fillStyle = g; x.fillRect(0, 0, 16, 256);
    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.SRGBColorSpace;
    this._nightBg = t;
    return t;
  }

  _nightEnv() {
    if (this._nightEnvRT) return this._nightEnvRT.texture;
    this._nightEnvRT = this.pmrem.fromEquirectangular(this._nightBackground());
    return this._nightEnvRT.texture;
  }

  update(focus, camera, t) {
    // Keep the shadow frustum centered on the player, snapped to texels.
    const ext = this.shadowExtent;
    const texel = (ext * 2) / this.light.shadow.mapSize.x;
    const L = this.lightDir;
    const tx = Math.round(focus.x / texel) * texel;
    const ty = Math.round(focus.y / texel) * texel;
    const tz = Math.round(focus.z / texel) * texel;
    this.light.target.position.set(tx, ty, tz);
    this.light.position.set(tx + L.x * 700, ty + L.y * 700, tz + L.z * 700);
    this.light.target.updateMatrixWorld();

    this.clouds.position.x = camera.position.x;
    this.clouds.position.z = camera.position.z;
    const map = this.cloudMat.map;
    map.offset.set((camera.position.x / 3000) + t * 0.0015, (-camera.position.z / 3000) + t * 0.0006);

    this.stars.position.copy(camera.position);
    if (this.moon.visible) {
      this.moon.position.copy(camera.position).addScaledVector(this.lightDir, 3800);
    }
  }
}
