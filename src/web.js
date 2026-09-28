// Web strand: a thin tube rebuilt every frame between the hand and the anchor.
// It shoots out with a wobble, hangs in a catenary-like sag when slack and
// snaps straight under tension. A small web splat marks the anchor.
import * as THREE from 'three';
import { makeWebSplat } from './textures.js';

const SEG = 28, SIDES = 5;

export class WebLine {
  constructor(scene) {
    const n = (SEG + 1) * SIDES;
    this.pos = new Float32Array(n * 3);
    this.nor = new Float32Array(n * 3);
    const idx = [];
    for (let i = 0; i < SEG; i++) for (let s = 0; s < SIDES; s++) {
      const a = i * SIDES + s, b = i * SIDES + (s + 1) % SIDES;
      const c = a + SIDES, d = b + SIDES;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    this.mat = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.35, emissive: 0xc8d4e0, emissiveIntensity: 0.25 });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);

    this.splat = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.6),
      new THREE.MeshStandardMaterial({ map: makeWebSplat(), transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4 })
    );
    this.splat.visible = false;
    scene.add(this.splat);

    this.pts = Array.from({ length: SEG + 1 }, () => new THREE.Vector3());
    this.t = 0;
    this.shoot = 1;
    this.active = false;
    this.releasing = 0;
    this.from = new THREE.Vector3();
    this.to = new THREE.Vector3();
    this.releaseFrom = new THREE.Vector3();
  }

  attach(to, normal) {
    this.active = true;
    this.shoot = 0;
    this.releasing = 0;
    this.to.copy(to);
    this.splat.position.copy(to).addScaledVector(normal, 0.05);
    this.splat.lookAt(to.x + normal.x, to.y + normal.y, to.z + normal.z);
    this.splat.rotation.z += Math.random() * 6;
    this.splat.scale.setScalar(0.3);
    this.splat.visible = false;
    this.mesh.visible = true;
  }

  release() {
    if (!this.active) return;
    this.active = false;
    this.releasing = 1;
  }

  // slack in meters: 0 when taut.
  update(dt, hand, slack, radius = 0.028) {
    this.t += dt;
    if (!this.active && this.releasing <= 0) {
      this.mesh.visible = false;
      return;
    }
    const from = this.from.copy(hand);
    const to = this.to;
    let reach = 1;
    if (this.active && this.shoot < 1) {
      this.shoot = Math.min(1, this.shoot + dt / 0.12);
      reach = this.shoot;
      if (this.shoot >= 1 && this.showSplat !== false) { this.splat.visible = true; this.splat.scale.setScalar(1); }
    }
    let fade = 1;
    if (!this.active) {
      // the strand goes limp and the hand end falls away
      this.releasing -= dt / 0.35;
      fade = Math.max(0, this.releasing);
      from.copy(this.releaseFrom).lerp(to, 1 - fade);
      from.y -= (1 - fade) * 6;
      slack = Math.max(slack, 4 * (1 - fade) + 1);
      if (this.releasing <= 0) { this.mesh.visible = false; return; }
    } else {
      this.releaseFrom.copy(hand);
    }
    const len = from.distanceTo(to);
    const sag = Math.min(len * 0.25, Math.sqrt(Math.max(0, slack) * len * 0.375));
    const wob = (1 - reach) * 0.8;
    const P = this.pts;
    for (let i = 0; i <= SEG; i++) {
      const u = (i / SEG) * reach;
      const p = P[i].copy(from).lerp(to, u);
      p.y -= sag * 4 * u * (1 - u);
      if (wob > 0) {
        const w = Math.sin(u * 20 - this.t * 40) * wob * u;
        p.x += w * 0.4; p.z += w * 0.4; p.y += w * 0.3;
      }
    }
    // build tube
    const tan = new THREE.Vector3(), nrm = new THREE.Vector3(), bin = new THREE.Vector3(), ref = new THREE.Vector3(0, 1, 0);
    const r = radius * (0.6 + 0.4 * fade);
    for (let i = 0; i <= SEG; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(SEG, i + 1)];
      tan.subVectors(b, a).normalize();
      ref.set(0, 1, 0);
      if (Math.abs(tan.y) > 0.95) ref.set(1, 0, 0);
      nrm.crossVectors(tan, ref).normalize();
      bin.crossVectors(tan, nrm);
      for (let s = 0; s < SIDES; s++) {
        const ang = (s / SIDES) * Math.PI * 2;
        const cx = Math.cos(ang), sy = Math.sin(ang);
        const o = (i * SIDES + s) * 3;
        const nx = nrm.x * cx + bin.x * sy, ny = nrm.y * cx + bin.y * sy, nz = nrm.z * cx + bin.z * sy;
        this.pos[o] = P[i].x + nx * r; this.pos[o + 1] = P[i].y + ny * r; this.pos[o + 2] = P[i].z + nz * r;
        this.nor[o] = nx; this.nor[o + 1] = ny; this.nor[o + 2] = nz;
      }
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
    this.mesh.visible = true;
  }
}
