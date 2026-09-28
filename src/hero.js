// The hero: a jointed, procedurally modeled body in a form-fitting black suit
// with red webbing, red gloves and boots, a red spider emblem on chest and
// back, and a full-head mask with large white lenses. Poses are blended per
// joint with quaternion slerps; arms can aim at world points (web lines).
import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

// Lathe helper: radii listed from the top of the limb to the bottom.
function limbGeo(radii, length, seg = 18, capTop = true, capBot = true) {
  const pts = [];
  const n = radii.length;
  const rb = radii[n - 1], rt = radii[0];
  if (capBot) for (let a = 0; a < 5; a++) {
    const ang = -Math.PI / 2 + (a / 5) * Math.PI / 2;
    pts.push(new THREE.Vector2(Math.max(0.0005, Math.cos(ang) * rb), -length + Math.sin(ang) * rb * 0.8));
  }
  for (let i = n - 1; i >= 0; i--) pts.push(new THREE.Vector2(radii[i], -length * (i / (n - 1))));
  if (capTop) for (let a = 1; a <= 5; a++) {
    const ang = (a / 5) * Math.PI / 2;
    pts.push(new THREE.Vector2(Math.max(0.0005, Math.cos(ang) * rt), Math.sin(ang) * rt * 0.8));
  }
  return new THREE.LatheGeometry(pts, seg, Math.PI, Math.PI * 2);
}

function profileGeo(profile, seg = 28) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0005, r), y)), seg, Math.PI, Math.PI * 2);
}

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
// Roles a skin may leave out, and what they borrow instead.
const FALLBACK = { detail: 'torso', lat: 'torso', knee: 'leg', jaw: 'neck' };

export class Hero {
  // mats: a skin from skins.js mapping body roles to materials.
  constructor(mats) {
    this.root = new THREE.Group();
    this.root.name = 'hero';
    this.body = new THREE.Group(); // bob / crouch offset
    this.root.add(this.body);
    this.j = {};
    this.mat = mats;
    this.roleMeshes = [];
    this._buildBody();
    this.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.setSkin(mats);
    this.time = 0;
    this.bob = 0;
  }

  // Swaps every body part to the matching material of another skin.
  setSkin(mats) {
    this.mat = mats;
    for (const m of this.roleMeshes) {
      const role = m.userData.role;
      const mat = role in mats ? mats[role] : mats[FALLBACK[role]];
      m.visible = !!mat;
      if (mat) m.material = mat;
    }
  }

  _roleMesh(geo, role) {
    const m = new THREE.Mesh(geo, this.mat.torso);
    m.userData.role = role;
    this.roleMeshes.push(m);
    return m;
  }

  _joint(name, parent, x, y, z) {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(x, y, z);
    parent.add(o);
    this.j[name] = o;
    return o;
  }

  _mesh(geo, role, parent, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
    const m = this._roleMesh(geo, role);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    parent.add(m);
    return m;
  }

  _buildBody() {
    const hips = this._joint('hips', this.body, 0, 0, 0);
    this._mesh(profileGeo([[0, -0.13], [0.09, -0.115], [0.135, -0.06], [0.15, 0.02], [0.14, 0.1], [0.132, 0.14]]), 'hips', hips, 0, 0, 0, 1, 1, 0.74);
    // glutes
    for (const s of [-1, 1]) this._mesh(new THREE.SphereGeometry(1, 20, 14), 'hips', hips, s * 0.062, -0.03, -0.055, 0.075, 0.08, 0.06);

    const spine = this._joint('spine', hips, 0, 0.1, 0);
    this._mesh(profileGeo([[0.132, -0.04], [0.128, 0.04], [0.13, 0.12], [0.14, 0.2]]), 'torso', spine, 0, 0, 0, 1, 1, 0.7);
    // abdominal definition
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
      this._mesh(new THREE.SphereGeometry(1, 12, 8), 'detail', spine, s * 0.034, 0.02 + i * 0.055, 0.075, 0.034, 0.028, 0.02);
    }

    const chest = this._joint('chest', spine, 0, 0.18, 0);
    this.chestMesh = this._mesh(profileGeo([
      [0.135, -0.06], [0.155, 0.04], [0.182, 0.13], [0.198, 0.21], [0.194, 0.27], [0.165, 0.32], [0.1, 0.355], [0.0, 0.365],
    ], 36), 'torso', chest, 0, 0, 0, 1, 1, 0.62);
    // pecs, lats, trapezius
    for (const s of [-1, 1]) {
      this._mesh(new THREE.SphereGeometry(1, 20, 14), 'detail', chest, s * 0.072, 0.205, 0.075, 0.085, 0.062, 0.045);
      this._mesh(new THREE.SphereGeometry(1, 16, 12), 'lat', chest, s * 0.13, 0.12, -0.02, 0.07, 0.12, 0.07);
    }
    this._mesh(new THREE.SphereGeometry(1, 20, 12), 'detail', chest, 0, 0.315, -0.025, 0.145, 0.055, 0.075);

    const neck = this._joint('neck', chest, 0, 0.345, 0.0);
    this._mesh(limbGeo([0.05, 0.054, 0.06], 0.1, 16, false, false), 'neck', neck, 0, 0.1, 0);
    const head = this._joint('head', neck, 0, 0.1, 0.005);
    this.headMesh = this._mesh(new THREE.SphereGeometry(1, 48, 32), 'head', head, 0, 0.095, 0.008, 0.097, 0.121, 0.107);
    // jaw/chin volume under the mask
    this._mesh(new THREE.SphereGeometry(1, 24, 16), 'jaw', head, 0, 0.035, 0.03, 0.07, 0.06, 0.07);
    // Optional hood (open at the face), white outside and colored inside.
    const hoodGeo = new THREE.SphereGeometry(1, 32, 20, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, Math.PI * 0.72);
    this._mesh(hoodGeo, 'hood', head, 0, 0.09, -0.012, 0.124, 0.148, 0.128);
    this._mesh(hoodGeo, 'hoodInner', head, 0, 0.09, -0.012, 0.122, 0.146, 0.126);

    for (const side of ['R', 'L']) {
      const s = side === 'R' ? -1 : 1;
      const sh = this._joint('sh' + side, chest, s * 0.195, 0.275, -0.01);
      this._mesh(new THREE.SphereGeometry(1, 20, 14), 'arm', sh, s * 0.012, -0.02, 0, 0.07, 0.066, 0.07);
      this._mesh(limbGeo([0.056, 0.058, 0.052, 0.045, 0.04], 0.28), 'arm', sh, 0, -0.02, 0);
      const el = this._joint('el' + side, sh, 0, -0.29, 0);
      this._mesh(limbGeo([0.042, 0.048, 0.043, 0.035, 0.029], 0.24), 'arm', el, 0, 0, 0);
      const wr = this._joint('wr' + side, el, 0, -0.255, 0);
      // glove: cuff + palm + fingers
      this._mesh(limbGeo([0.031, 0.033, 0.035], 0.06, 14, false, false), 'hand', wr, 0, 0.055, 0);
      this._mesh(new THREE.SphereGeometry(1, 16, 12), 'hand', wr, 0, -0.045, 0.004, 0.022, 0.05, 0.043);
      const fingers = [];
      const fz = [0.028, 0.009, -0.01, -0.027];
      const fl = [0.052, 0.058, 0.054, 0.044];
      for (let i = 0; i < 4; i++) {
        const f = this._joint(`f${side}${i}`, wr, 0, -0.092, fz[i]);
        this._mesh(limbGeo([0.0095, 0.009, 0.008], fl[i], 8), 'hand', f, 0, 0, 0);
        fingers.push(f);
      }
      const th = this._joint('th' + side, wr, -s * 0.012, -0.035, 0.036);
      th.rotation.set(0.7, 0, -s * 0.4);
      this._mesh(limbGeo([0.011, 0.01, 0.009], 0.045, 8), 'hand', th, 0, 0, 0);
      this['fingers' + side] = fingers;

      const hip = this._joint('hip' + side, hips, s * 0.092, -0.04, 0);
      this._mesh(limbGeo([0.086, 0.09, 0.082, 0.07, 0.056], 0.44, 20), 'leg', hip, 0, 0, 0);
      const knee = this._joint('knee' + side, hip, 0, -0.45, 0);
      this._mesh(new THREE.SphereGeometry(1, 12, 10), 'knee', knee, 0, 0, 0.012, 0.05, 0.05, 0.045);
      this._mesh(limbGeo([0.056, 0.063, 0.055, 0.042, 0.036], 0.42, 18), 'leg', knee, 0, 0, -0.005);
      const ank = this._joint('ank' + side, knee, 0, -0.435, 0);
      // boot
      this._mesh(limbGeo([0.042, 0.044, 0.046], 0.08, 14, false, false), 'foot', ank, 0, 0.1, 0);
      this._mesh(new THREE.SphereGeometry(1, 20, 12), 'foot', ank, 0, -0.03, 0.045, 0.047, 0.042, 0.118);
    }

    // Spider emblems projected onto the chest and back.
    this.root.updateMatrixWorld(true);
    const cw = new THREE.Vector3();
    this.j.chest.getWorldPosition(cw);
    const inv = this.chestMesh.matrixWorld.clone().invert();
    const front = new DecalGeometry(this.chestMesh, cw.clone().add(new THREE.Vector3(0, 0.2, 0.12)), new THREE.Euler(0, 0, 0), new THREE.Vector3(0.25, 0.3, 0.3));
    front.applyMatrix4(inv);
    this.chestMesh.add(this._roleMesh(front, 'emblem'));
    const back = new DecalGeometry(this.chestMesh, cw.clone().add(new THREE.Vector3(0, 0.17, -0.12)), new THREE.Euler(0, Math.PI, 0), new THREE.Vector3(0.3, 0.36, 0.3));
    back.applyMatrix4(inv);
    this.chestMesh.add(this._roleMesh(back, 'emblemBack'));
  }

  // ---- animation helpers ----

  _set(name, x, y, z, k) {
    _q.setFromEuler(_e.set(x, y, z));
    this.j[name].quaternion.slerp(_q, k);
  }

  pose(p, k) {
    for (const name in p) {
      const v = p[name];
      this._set(name, v[0], v[1], v[2], k);
    }
  }

  // Points an arm (shoulder chain) at a world position.
  aimArm(side, target, k) {
    const sh = this.j['sh' + side];
    sh.getWorldPosition(_v);
    _v2.copy(target).sub(_v).normalize();
    sh.parent.getWorldQuaternion(_q2).invert();
    _v2.applyQuaternion(_q2);
    _q.setFromUnitVectors(DOWN, _v2);
    sh.quaternion.slerp(_q, k);
    this._set('el' + side, -0.05, 0, 0, k);
    this._set('wr' + side, -0.3, 0, 0, k);
  }

  // Thwip: middle and ring fingers fold onto the palm.
  gesture(side, amount, k) {
    const s = side === 'R' ? 1 : -1;
    const fs = this['fingers' + side];
    fs.forEach((f, i) => {
      const fold = (i === 1 || i === 2) ? 1.9 * amount : 0.15;
      _q.setFromEuler(_e.set(0, 0, s * fold));
      f.quaternion.slerp(_q, k);
    });
  }

  handWorld(side, out) {
    const wr = this.j['wr' + side];
    out.set(0, -0.08, 0);
    return wr.localToWorld(out);
  }

  // ---- per-frame animation ----
  animate(dt, a) {
    this.time += dt;
    const t = this.time;
    const k = 1 - Math.exp(-dt * (a.blend || 14));
    const S = Math.sin, C = Math.cos;
    let bob = 0;
    const R = a.webSide || 'R', L = R === 'R' ? 'L' : 'R';
    const sR = R === 'R' ? -1 : 1; // sign for the web arm's outward z rotation

    switch (a.state) {
      case 'idle': {
        const b = S(t * 1.7) * 0.015;
        this.pose({
          hips: [0, 0, 0], spine: [0.05 + b, 0, 0], chest: [0.02 - b, 0, 0], neck: [0, 0, 0], head: [-0.04, 0, 0],
          shR: [0.1, 0, -0.16], elR: [-0.3, 0, 0], wrR: [0, 0, 0], shL: [0.1, 0, 0.16], elL: [-0.3, 0, 0], wrL: [0, 0, 0],
          hipR: [-0.06, 0.1, -0.07], kneeR: [0.12, 0, 0], ankR: [-0.06, 0, 0],
          hipL: [-0.06, -0.1, 0.07], kneeL: [0.12, 0, 0], ankL: [-0.06, 0, 0],
        }, k);
        bob = -0.03;
        break;
      }
      case 'run': {
        const p = a.phase, f = Math.min(1, a.speed / 10);
        const s = S(p), c = C(p);
        this.pose({
          hips: [0, 0.12 * s * f, 0], spine: [0.22 * f, 0, 0], chest: [0.05, -0.22 * s * f, 0], neck: [0, 0, 0], head: [-0.22 * f, 0.1 * s * f, 0],
          hipR: [-0.1 - 0.95 * s * f, 0, -0.04], kneeR: [0.25 + 1.5 * f * Math.max(0, c), 0, 0], ankR: [-0.2 * f * s, 0, 0],
          hipL: [-0.1 + 0.95 * s * f, 0, 0.04], kneeL: [0.25 + 1.5 * f * Math.max(0, -c), 0, 0], ankL: [0.2 * f * s, 0, 0],
          shR: [0.8 * s * f, 0, -0.12], elR: [-1.35, 0, 0], wrR: [0, 0, 0],
          shL: [-0.8 * s * f, 0, 0.12], elL: [-1.35, 0, 0], wrL: [0, 0, 0],
        }, k);
        bob = -0.05 + Math.abs(C(p)) * 0.06 * f;
        break;
      }
      case 'swing': {
        const ls = Math.max(-1, Math.min(1, a.legSwing || 0));
        this.aimArm(R, a.anchor, k);
        this.pose({
          hips: [0, 0, 0], spine: [-0.18 + ls * 0.1, 0, 0], chest: [-0.1, 0, sR * 0.12], neck: [0, 0, 0], head: [0.2, 0, 0],
          ['sh' + L]: [0.45, 0, -sR * 1.05], ['el' + L]: [-0.9, 0, 0], ['wr' + L]: [0, 0, 0],
          ['hip' + R]: [-0.25 - 0.55 * ls, 0, sR * 0.08], ['knee' + R]: [0.5 + 0.4 * Math.max(0, ls), 0, 0], ['ank' + R]: [0.3, 0, 0],
          ['hip' + L]: [0.15 - 0.9 * ls, 0, -sR * 0.1], ['knee' + L]: [1.2 + 0.5 * Math.max(0, -ls), 0, 0], ['ank' + L]: [0.4, 0, 0],
        }, k);
        break;
      }
      case 'zip': {
        this.aimArm('R', a.anchor, k);
        this.aimArm('L', a.anchor, k);
        this.pose({
          hips: [0, 0, 0], spine: [-0.15, 0, 0], chest: [-0.05, 0, 0], neck: [0, 0, 0], head: [0.1, 0, 0],
          hipR: [0.25, 0, -0.06], kneeR: [0.6, 0, 0], ankR: [0.4, 0, 0],
          hipL: [0.1, 0, 0.06], kneeL: [0.9, 0, 0], ankL: [0.4, 0, 0],
        }, k);
        break;
      }
      case 'flip': {
        this.pose({
          hips: [0, 0, 0], spine: [0.55, 0, 0], chest: [0.3, 0, 0], neck: [0, 0, 0], head: [0.3, 0, 0],
          shR: [-1.0, 0, -0.25], elR: [-1.9, 0, 0], shL: [-1.0, 0, 0.25], elL: [-1.9, 0, 0],
          hipR: [-2.0, 0, -0.12], kneeR: [2.3, 0, 0], ankR: [0.3, 0, 0],
          hipL: [-2.0, 0, 0.12], kneeL: [2.3, 0, 0], ankL: [0.3, 0, 0],
        }, 1 - Math.exp(-dt * 20));
        break;
      }
      case 'fall': {
        const w = S(t * 9) * 0.06;
        this.pose({
          hips: [0, 0, 0], spine: [0.12, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [-0.35, 0, 0],
          shR: [-0.5 + w, 0.3, -1.35], elR: [-0.95, 0, 0], wrR: [0.3, 0, 0], shL: [-0.5 - w, -0.3, 1.35], elL: [-0.95, 0, 0], wrL: [0.3, 0, 0],
          hipR: [-0.55, 0, -0.3], kneeR: [1.1, 0, 0], ankR: [0.3, 0, 0],
          hipL: [-0.35, 0, 0.3], kneeL: [0.8, 0, 0], ankL: [0.3, 0, 0],
        }, k);
        break;
      }
      case 'rise': {
        this.pose({
          hips: [0, 0, 0], spine: [0.1, 0, 0], chest: [-0.05, 0, 0], neck: [0, 0, 0], head: [-0.15, 0, 0],
          shR: [-0.9, 0, -0.55], elR: [-1.2, 0, 0], shL: [-0.6, 0, 0.7], elL: [-1.0, 0, 0],
          hipR: [-1.2, 0, -0.1], kneeR: [1.7, 0, 0], ankR: [0.3, 0, 0],
          hipL: [-0.4, 0, 0.1], kneeL: [1.2, 0, 0], ankL: [0.3, 0, 0],
        }, k);
        break;
      }
      case 'dive': {
        this.pose({
          hips: [0, 0, 0], spine: [-0.08, 0, 0], chest: [-0.05, 0, 0], neck: [-0.3, 0, 0], head: [-0.6, 0, 0],
          shR: [0.4, 0, -0.2], elR: [-0.1, 0, 0], wrR: [0, 0, 0], shL: [0.4, 0, 0.2], elL: [-0.1, 0, 0], wrL: [0, 0, 0],
          hipR: [0.05, 0, -0.03], kneeR: [0.15, 0, 0], ankR: [0.6, 0, 0],
          hipL: [0.05, 0, 0.03], kneeL: [0.25, 0, 0], ankL: [0.6, 0, 0],
        }, k);
        break;
      }
      case 'wall': {
        const p = a.phase, s = S(p) * Math.min(1, a.speed / 3);
        this.pose({
          hips: [0, 0, 0], spine: [-0.05, 0, 0], chest: [-0.05, 0, 0], neck: [-0.2, 0, 0], head: [-0.55, 0, 0],
          shR: [-2.3 + 0.6 * s, 0, -0.75], elR: [-1.0 - 0.3 * s, 0, 0], wrR: [-0.6, 0, 0],
          shL: [-2.3 - 0.6 * s, 0, 0.75], elL: [-1.0 + 0.3 * s, 0, 0], wrL: [-0.6, 0, 0],
          hipR: [-1.05 - 0.45 * s, 0, -0.75], kneeR: [1.95 + 0.3 * s, 0, 0], ankR: [0.5, 0, 0],
          hipL: [-1.05 + 0.45 * s, 0, 0.75], kneeL: [1.95 - 0.3 * s, 0, 0], ankL: [0.5, 0, 0],
        }, k);
        break;
      }
      case 'land': {
        this.pose({
          hips: [0, 0, 0], spine: [0.65, 0, 0], chest: [0.25, 0, 0], neck: [0, 0, 0], head: [-0.75, 0, 0],
          shR: [-0.55, 0, -0.25], elR: [-0.15, 0, 0], wrR: [0.9, 0, 0],
          shL: [0.5, 0, 1.2], elL: [-0.5, 0, 0], wrL: [0, 0, 0],
          hipR: [-1.9, 0, -0.35], kneeR: [2.35, 0, 0], ankR: [-0.35, 0, 0],
          hipL: [-0.35, 0, 0.35], kneeL: [2.3, 0, 0], ankL: [0.6, 0, 0],
        }, 1 - Math.exp(-dt * 26));
        bob = -0.5;
        break;
      }
      case 'punchR':
      case 'punchL': {
        // a.t: 0 -> 1 over the strike. Snap out fast, pull back slower.
        const P = a.state === 'punchR' ? 'R' : 'L', O = P === 'R' ? 'L' : 'R';
        const sp = P === 'R' ? -1 : 1;
        const ext = a.t < 0.35 ? a.t / 0.35 : 1 - (a.t - 0.35) / 0.65 * 0.7;
        this.pose({
          hips: [0, -sp * 0.25 * ext, 0], spine: [0.12, -sp * 0.35 * ext, 0], chest: [0.05, -sp * 0.25 * ext, 0], neck: [0, 0, 0], head: [-0.05, sp * 0.3 * ext, 0],
          ['sh' + P]: [-1.55 * ext - 0.3, 0, sp * 0.1], ['el' + P]: [-1.6 * (1 - ext) - 0.05, 0, 0], ['wr' + P]: [0, 0, 0],
          ['sh' + O]: [-0.9, 0, -sp * 0.25], ['el' + O]: [-2.1, 0, 0], ['wr' + O]: [0, 0, 0],
          hipR: [-0.45, 0, -0.1], kneeR: [0.5, 0, 0], ankR: [0, 0, 0],
          hipL: [0.25, 0, 0.1], kneeL: [0.35, 0, 0], ankL: [0, 0, 0],
        }, 1 - Math.exp(-dt * 30));
        break;
      }
      case 'kick': {
        const ext = a.t < 0.4 ? a.t / 0.4 : 1 - (a.t - 0.4) / 0.6 * 0.8;
        this.pose({
          hips: [0, 0.3 * ext, 0], spine: [-0.25 * ext, 0.2, 0], chest: [0, 0.2, 0], neck: [0, 0, 0], head: [0.1, -0.3, 0],
          shR: [-0.8, 0, -0.5], elR: [-1.9, 0, 0], shL: [0.3, 0, 1.1], elL: [-0.6, 0, 0],
          hipR: [-1.75 * ext, 0, -0.1], kneeR: [1.6 * (1 - ext) + 0.05, 0, 0], ankR: [0.5, 0, 0],
          hipL: [0.1, 0, 0.08], kneeL: [0.35, 0, 0], ankL: [0, 0, 0],
        }, 1 - Math.exp(-dt * 30));
        break;
      }
      case 'guard': {
        const b = S(t * 6) * 0.04;
        this.pose({
          hips: [0, 0.3, 0], spine: [0.18, 0, 0], chest: [0.05, -0.2, 0], neck: [0, 0, 0], head: [-0.1, -0.1, 0],
          shR: [-0.9 + b, 0, -0.3], elR: [-2.0, 0, 0], wrR: [0, 0, 0], shL: [-1.0 - b, 0, 0.25], elL: [-2.1, 0, 0], wrL: [0, 0, 0],
          hipR: [-0.35, 0, -0.12], kneeR: [0.45, 0, 0], ankR: [0, 0, 0],
          hipL: [0.2, 0, 0.12], kneeL: [0.4, 0, 0], ankL: [0, 0, 0],
        }, k);
        bob = -0.06 + b * 0.3;
        break;
      }
      case 'hurt': {
        this.pose({
          hips: [0, 0, 0], spine: [-0.4, 0, 0.1], chest: [-0.2, 0, 0], neck: [0, 0, 0], head: [0.35, 0, 0],
          shR: [0.5, 0, -0.7], elR: [-0.5, 0, 0], shL: [0.4, 0, 0.8], elL: [-0.6, 0, 0],
          hipR: [-0.3, 0, -0.1], kneeR: [0.6, 0, 0], ankR: [0, 0, 0],
          hipL: [0.2, 0, 0.1], kneeL: [0.4, 0, 0], ankL: [0, 0, 0],
        }, 1 - Math.exp(-dt * 25));
        break;
      }
      case 'struggle': {
        const w = S(t * 13) * 0.14, w2 = S(t * 9 + 1) * 0.1;
        this.pose({
          hips: [0, 0, w2], spine: [0.05, w, w], chest: [0, -w, 0], neck: [0, 0, 0], head: [0.1, w * 2, 0],
          shR: [0.05, 0, -0.06], elR: [-0.2, 0, 0], shL: [0.05, 0, 0.06], elL: [-0.2, 0, 0],
          hipR: [0, 0, -0.02], kneeR: [0.05, 0, 0], ankR: [0, 0, 0],
          hipL: [0, 0, 0.02], kneeL: [0.05, 0, 0], ankL: [0, 0, 0],
        }, k);
        break;
      }
      case 'down': {
        this.pose({
          hips: [0, 0, 0], spine: [-0.1, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0.6, 0],
          shR: [0.2, 0, -1.3], elR: [-0.4, 0, 0], shL: [-0.3, 0, 1.0], elL: [-0.9, 0, 0],
          hipR: [-0.2, 0, -0.2], kneeR: [0.5, 0, 0], ankR: [0.3, 0, 0],
          hipL: [0.05, 0, 0.15], kneeL: [0.1, 0, 0], ankL: [0.3, 0, 0],
        }, 1 - Math.exp(-dt * 10));
        break;
      }
      case 'crouch': {
        this.pose({
          hips: [0, 0, 0], spine: [0.5, 0, 0], chest: [0.15, 0, 0], neck: [0, 0, 0], head: [-0.6, 0, 0],
          shR: [-0.4, 0, -0.35], elR: [-0.6, 0, 0], shL: [-0.4, 0, 0.35], elL: [-0.6, 0, 0],
          hipR: [-1.5, 0, -0.3], kneeR: [2.2, 0, 0], ankR: [-0.5, 0, 0],
          hipL: [-1.5, 0, 0.3], kneeL: [2.2, 0, 0], ankL: [-0.5, 0, 0],
        }, 1 - Math.exp(-dt * 20));
        bob = -0.42;
        break;
      }
    }
    this.gesture(R, a.gesture || 0, 1 - Math.exp(-dt * 25));
    this.gesture(L, a.state === 'zip' ? 1 : 0, 1 - Math.exp(-dt * 25));
    this.bob += (bob - this.bob) * (1 - Math.exp(-dt * 12));
    this.body.position.y = this.bob;
  }
}
