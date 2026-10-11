// Minor bosses. Each one reuses the Enemy body and physics and adds its own
// gear and brain:
//   Glider     - armored pilot on a bat-wing glider, throws bombs, swoops
//   Stinger    - scaled armor and a stinger tail with long reach, leaps
//   Winged Man - mechanical wings, feather-blade volleys and dive attacks
//   Four Arms  - trench coat and four steel arms that slam from range
//   Charger    - horned, armored bulk that charges; dazed if he hits a wall
//   Sandstorm  - sand fists that grow huge and sand blasts; webs pass through
// Flyers drop out of the sky when webbed. Bosses don't fold to one hit while
// webbed (they take double damage instead) and shrug off small hits.
import * as THREE from 'three';
import { Enemy } from './enemies.js';
import { bossSkin } from './skins.js';

const G = 22;
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();

export const BOSS_TYPES = ['goblin', 'scorpion', 'vulture', 'ock', 'rhino', 'sandman'];

export const BOSS_NAMES = {
  goblin: 'The Glider',
  scorpion: 'The Stinger',
  vulture: 'The Winged Man',
  ock: 'The Four Arms',
  rhino: 'The Charger',
  sandman: 'Sandstorm',
};

const steel = () => new THREE.MeshStandardMaterial({ color: 0x9aa1a8, metalness: 0.9, roughness: 0.28 });

function shadowAll(o) { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); }

// A chain of joints along +y. Returns the joint list; tip is joints[n-1] + segLen.
function makeChain(parent, n, segLen, r0, r1, mat, ballMat = mat) {
  const joints = [];
  let prev = parent;
  for (let i = 0; i < n; i++) {
    const j = new THREE.Object3D();
    if (i > 0) j.position.y = segLen;
    prev.add(j);
    const r = r0 + (r1 - r0) * (i / Math.max(1, n - 1));
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r, segLen, 10), mat);
    cyl.position.y = segLen / 2;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r * 1.15, 10, 8), ballMat);
    j.add(cyl, ball);
    joints.push(j);
    prev = j;
  }
  return joints;
}

function aimJoint(j, worldTarget, k) {
  j.getWorldPosition(_v);
  _w.copy(worldTarget).sub(_v).normalize();
  j.parent.getWorldQuaternion(_q).invert();
  _w.applyQuaternion(_q);
  j.quaternion.slerp(new THREE.Quaternion().setFromUnitVectors(UP, _w), k);
}

class Boss extends Enemy {
  constructor(mgr, type, pos, o) {
    super(mgr, bossSkin(type), pos, { scale: o.scale ?? 1.12, hp: o.hp, mass: o.mass ?? 1.8, webKO: false, escape: o.escape ?? 4 });
    this.type = type;
    this.isBoss = true;
    this.name = BOSS_NAMES[type];
    this.cool = 1.5;
    this.poise = this.maxPoise = o.poise ?? 3;
    this.state = 'idle';
    this.aggro = o.aggro ?? 55;
    this.gear = new THREE.Group();
    this.hero.root.add(this.gear);
  }

  // Bosses only stagger when their poise breaks.
  onHurt(heavy) {
    this.poise -= heavy ? 2 : 1;
    if (this.poise <= 0) { this.state = 'stun'; this.t = 0.7; this.poise = this.maxPoise; }
    else if (this.state === 'webbed') this.state = 'fight';
  }

  // shared start: wake up when the hero comes close
  idleThink(dt, c, o) {
    this.wander(dt, o);
    if (c.dist3 < this.aggro) { this.state = 'fight'; this.mgr.alert(this); }
  }

  commonStates(dt, o) {
    super.commonStates(dt, o);
    if (this.state === 'chase') this.state = 'fight';
  }

  done(cool) { this.state = 'fight'; this.cool = cool; }
}

// ---------------------------------------------------------------------------
class Goblin extends Boss {
  constructor(mgr, pos) {
    super(mgr, 'goblin', pos, { hp: 10, escape: 4, poise: 3 });
    this.flying = true;
    this.orbit = Math.random() * 6.28;
    // Bat-wing glider under the boots
    const sh = new THREE.Shape();
    const pts = [[0, 0.75], [0.45, 0.35], [1.35, 0.15], [1.2, -0.25], [0.95, -0.12], [0.75, -0.42], [0.45, -0.22], [0.2, -0.5], [0, -0.32]];
    sh.moveTo(0, pts[0][1]);
    for (const [x, y] of pts.slice(1)) sh.lineTo(x, y);
    for (const [x, y] of pts.slice(1, -1).reverse()) sh.lineTo(-x, y);
    sh.lineTo(0, pts[0][1]);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
    g.rotateX(-Math.PI / 2);
    const glider = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x2c2f33, metalness: 0.85, roughness: 0.35 }));
    const engine = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.12), new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffb020, emissiveIntensity: 3 }));
    engine.position.set(0, 0.04, -0.38);
    const eyes = [-1, 1].map(s => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd22e }));
      m.position.set(s * 0.18, 0.08, 0.45);
      return m;
    });
    this.glider = new THREE.Group();
    this.glider.add(glider, engine, ...eyes);
    this.glider.position.y = -1.02;
    this.gear.add(this.glider);
    // Helmet ear fins
    for (const s of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 4), this.hero.mat.jaw);
      fin.position.set(s * 0.1, 0.12, -0.02);
      fin.rotation.set(-0.9, 0, s * 0.5);
      this.hero.j.head.add(fin);
    }
    shadowAll(this.gear);
  }

  think(dt, player, c) {
    const o = { anim: 'glide', faceP: true, flyResp: 2.5 };
    const P = player.p, p = this.p;
    this.cool -= dt;
    if (this.state === 'webbed' || this.state === 'down') { this.commonStates(dt, o); o.anim = this.state === 'down' ? 'down' : 'struggle'; return o; }
    if (this.state === 'stun') { this.commonStates(dt, o); return o; }
    this.flying = true;
    if (this.state === 'idle') {
      o.fly = new THREE.Vector3(Math.sin(this.mgr.time * 0.6) * 6, (this.home.y + 6 - p.y) * 0.8, Math.cos(this.mgr.time * 0.6) * 6);
      if (c.dist3 < this.aggro) { this.state = 'fight'; this.mgr.alert(this); }
      return o;
    }
    const orbitTo = () => {
      this.orbit += dt * 0.45;
      const tx = P.x + Math.cos(this.orbit) * 13, tz = P.z + Math.sin(this.orbit) * 13;
      const ty = Math.max(P.y + 6, 8);
      o.fly = new THREE.Vector3(tx - p.x, ty - p.y, tz - p.z).multiplyScalar(1.1);
      if (o.fly.length() > 17) o.fly.setLength(17);
    };
    switch (this.state) {
      case 'fight':
        orbitTo();
        if (this.cool <= 0) {
          if (Math.random() < 0.6 || c.dist3 > 35) { this.state = 'bomb'; this.t = 0.55; }
          else { this.state = 'swoopUp'; this.t = 0.5; }
        }
        break;
      case 'bomb': {
        orbitTo();
        o.anim = 'throw'; o.animT = Math.min(1, 1 - this.t / 0.55);
        if (this.t <= 0) {
          const from = new THREE.Vector3();
          this.hero.handWorld('R', from);
          this.mgr.lob('bomb', from, player, 1.0);
          this.done(2.4);
        }
        break;
      }
      case 'swoopUp':
        o.fly = new THREE.Vector3(0, 6, 0);
        if (this.t <= 0) {
          this.state = 'swoop'; this.t = 1.4;
          this.swoopDir = new THREE.Vector3(P.x - p.x, P.y + 0.3 - p.y, P.z - p.z).normalize();
          this.mgr.audio.swish();
        }
        break;
      case 'swoop':
        o.fly = this.swoopDir.clone().multiplyScalar(25); o.flyResp = 8;
        o.pitch = 0.5;
        if (c.dist3 < 2.4) { player.hurt(16, this.swoopDir, 13, 6); this.done(2.6); }
        if (this.t <= 0 || this.hitWall) this.done(2.2);
        break;
    }
    o.pitch = o.pitch ?? Math.min(0.35, this.v.length() / 40);
    return o;
  }
}

// ---------------------------------------------------------------------------
class Scorpion extends Boss {
  constructor(mgr, pos) {
    super(mgr, 'scorpion', pos, { hp: 12, escape: 3, poise: 4, scale: 1.1 });
    const mat = this.hero.mat.torso, dark = this.hero.mat.hand;
    const base = new THREE.Object3D();
    base.position.set(0, -0.04, -0.12);
    this.hero.j.hips.add(base);
    this.tail = makeChain(base, 11, 0.21, 0.085, 0.045, mat, dark);
    const stinger = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.38, 10), new THREE.MeshStandardMaterial({ color: 0xd8e0e4, metalness: 0.9, roughness: 0.2, emissive: 0x66ff44, emissiveIntensity: 0 }));
    stinger.position.y = 0.21 + 0.18;
    this.tail[10].add(stinger);
    this.stinger = stinger;
    this.tailBase = base;
    shadowAll(base);
  }

  tip(out) { return this.stinger.getWorldPosition(out); }

  think(dt, player, c) {
    const o = { anim: 'guard', faceP: true };
    this.cool -= dt;
    let curl = 0.3, glow = 0;
    switch (this.state) {
      case 'idle': o.faceP = false; o.anim = 'idle'; this.idleThink(dt, c, o); break;
      case 'fight':
        if (c.dist > 3.2) { o.dir = c.toP.clone(); o.speed = 6.8; }
        if (c.dist > 9 && c.dist < 32 && Math.abs(c.dy) > 2.5 && this.grounded && this.cool <= 0) {
          // leap onto the hero's level
          const T = 1.0;
          this.v.set(c.dx / T, c.dy / T + 0.5 * G * T, c.dz / T);
          this.grounded = false; this.state = 'leap'; this.t = 2;
        } else if (this.cool <= 0 && c.dist < 4.4 && Math.abs(c.dy) < 2.5) {
          this.state = 'stab'; this.t = 0.6;
        } else if (c.dist < 1.9 && Math.abs(c.dy) < 1.6 && this.cool <= 0) {
          this.state = 'punch'; this.t = 0.45;
        }
        break;
      case 'leap':
        o.anim = 'rise'; o.speed = 0;
        if (this.grounded && this.t < 1.8) this.done(0.6);
        break;
      case 'stab':
        o.anim = 'guard';
        curl = 0.22; glow = 3 * (1 - this.t / 0.6);
        if (this.t <= 0) {
          this.state = 'stabHit'; this.t = 0.5;
          const tip = this.tip(new THREE.Vector3());
          if (c.dist < 4.8 && Math.abs(c.dy) < 2.5) player.hurt(18, c.toP, 10, 5);
          void tip;
          this.mgr.audio.swish();
        }
        break;
      case 'stabHit':
        curl = 0.42; glow = 1;
        if (this.t <= 0) this.done(1.3);
        break;
      case 'punch':
        o.anim = 'punchL'; o.animT = 1 - this.t / 0.45;
        if (this.t <= 0) {
          if (c.dist < 2.2 && Math.abs(c.dy) < 1.6) player.hurt(10, c.toP);
          this.done(0.8);
        }
        break;
      default: this.commonStates(dt, o);
    }
    // tail pose
    const k = 1 - Math.exp(-dt * 12);
    _q.setFromUnitVectors(UP, new THREE.Vector3(0, 0.35, -1).normalize());
    this.tailBase.quaternion.slerp(_q, k);
    const sway = Math.sin(this.mgr.time * 2.2) * 0.05;
    this.tail.forEach((j, i) => {
      if (i === 0) return;
      j.rotation.x += (curl + Math.sin(this.mgr.time * 3 + i * 0.6) * 0.03 - j.rotation.x) * k;
      j.rotation.z = sway;
    });
    this.stinger.material.emissiveIntensity = glow;
    return o;
  }
}

// ---------------------------------------------------------------------------
class Vulture extends Boss {
  constructor(mgr, pos) {
    super(mgr, 'vulture', pos, { hp: 9, escape: 4, poise: 3 });
    this.flying = true;
    this.orbit = Math.random() * 6.28;
    const metal = new THREE.MeshStandardMaterial({ color: 0x5d646b, metalness: 0.85, roughness: 0.35 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2b2f33, metalness: 0.8, roughness: 0.4 });
    this.wings = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Object3D();
      pivot.position.set(s * 0.12, 0.26, -0.12);
      this.hero.j.chest.add(pivot);
      for (let i = 0; i < 7; i++) {
        const L = 0.9 + i * 0.2;
        const blade = new THREE.Mesh(new THREE.BoxGeometry(L, 0.035, 0.24), i % 2 ? metal : darkMetal);
        blade.geometry.translate(s * L / 2, 0, 0);
        blade.rotation.z = s * (0.35 - i * 0.12);
        blade.rotation.y = -s * i * 0.06;
        blade.position.z = -i * 0.012;
        pivot.add(blade);
      }
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.12), darkMetal);
      pack.position.set(0, -0.05, 0);
      pivot.add(pack);
      this.wings.push({ pivot, s });
    }
    shadowAll(this.hero.j.chest);
  }

  think(dt, player, c) {
    const o = { anim: 'fly', faceP: true, flyResp: 2.5 };
    const P = player.p, p = this.p;
    this.cool -= dt;
    let flap = 1;
    if (this.state === 'webbed' || this.state === 'down' || this.state === 'stun') {
      this.commonStates(dt, o);
      if (this.state === 'webbed') o.anim = 'struggle';
      flap = 0;
    } else {
      this.flying = true;
      const orbitTo = (r = 16, h = 9) => {
        this.orbit += dt * 0.38;
        const tx = P.x + Math.cos(this.orbit) * r, tz = P.z + Math.sin(this.orbit) * r;
        o.fly = new THREE.Vector3(tx - p.x, Math.max(P.y + h, 10) - p.y, tz - p.z).multiplyScalar(1.0);
        if (o.fly.length() > 18) o.fly.setLength(18);
      };
      switch (this.state) {
        case 'idle':
          o.fly = new THREE.Vector3(Math.sin(this.mgr.time * 0.5) * 7, (this.home.y + 10 - p.y) * 0.6, Math.cos(this.mgr.time * 0.5) * 7);
          if (c.dist3 < this.aggro) { this.state = 'fight'; this.mgr.alert(this); }
          break;
        case 'fight':
          orbitTo();
          if (this.cool <= 0) {
            if (Math.random() < 0.5) { this.state = 'volley'; this.t = 0.55; }
            else { this.state = 'diveUp'; this.t = 0.7; }
          }
          break;
        case 'volley':
          orbitTo(); flap = 2;
          o.anim = 'throw'; o.animT = Math.min(1, 1 - this.t / 0.55);
          if (this.t <= 0) {
            const from = this.chest(new THREE.Vector3());
            for (const off of [-0.12, 0, 0.12]) this.mgr.fire('feather', from, player, off);
            this.done(2.6);
          }
          break;
        case 'diveUp':
          o.fly = new THREE.Vector3(0, 5, 0); flap = 2.5;
          if (this.t <= 0) {
            this.state = 'dive'; this.t = 1.6;
            this.diveDir = new THREE.Vector3(P.x - p.x, P.y + 0.2 - p.y, P.z - p.z).normalize();
            this.mgr.audio.swish();
          }
          break;
        case 'dive':
          o.fly = this.diveDir.clone().multiplyScalar(28); o.flyResp = 7; o.anim = 'dive'; flap = 0.1;
          if (c.dist3 < 2.4) { player.hurt(18, this.diveDir, 14, 7); this.done(2.8); }
          if (this.t <= 0 || this.hitWall || (this.grounded && this.t < 1.2)) this.done(2.4);
          break;
      }
      o.pitch = this.state === 'dive' ? 1.2 : Math.min(0.9, this.v.length() / 18);
    }
    // wings: flap in the air, fold on the ground
    const tt = this.mgr.time;
    for (const w of this.wings) {
      const z = flap ? w.s * (Math.sin(tt * 6 * flap) * 0.4 + 0.1) : w.s * -0.9;
      const y = flap ? 0 : -w.s * 1.0;
      w.pivot.rotation.z += (z - w.pivot.rotation.z) * (1 - Math.exp(-dt * 12));
      w.pivot.rotation.y += (y - w.pivot.rotation.y) * (1 - Math.exp(-dt * 6));
    }
    return o;
  }
}

// ---------------------------------------------------------------------------
class Ock extends Boss {
  constructor(mgr, pos) {
    super(mgr, 'ock', pos, { hp: 14, escape: 2, poise: 4, scale: 1.08, aggro: 50 });
    const mat = steel();
    const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.3, 0.8, 18, 1, true), this.hero.mat.torso.clone());
    coat.material.side = THREE.DoubleSide;
    coat.position.y = -0.42;
    this.hero.j.hips.add(coat);
    const harness = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 8, 20), mat);
    harness.rotation.x = Math.PI / 2;
    harness.scale.set(1, 0.7, 1);
    harness.position.set(0, 0.06, 0);
    this.hero.j.spine.add(harness);
    this.arms = [];
    const bases = [[-0.1, 0.12, -1, 1], [0.1, 0.12, 1, 1], [-0.1, 0.02, -1, -1], [0.1, 0.02, 1, -1]];
    for (const [x, y, sx, sy] of bases) {
      const b = new THREE.Object3D();
      b.position.set(x, y, -0.12);
      this.hero.j.spine.add(b);
      const joints = makeChain(b, 12, 0.24, 0.065, 0.042, mat);
      // three-pronged claw with a red sensor
      const claw = new THREE.Group();
      claw.position.y = 0.24;
      for (let i = 0; i < 3; i++) {
        const prong = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.22, 6), mat);
        const a = i / 3 * Math.PI * 2;
        prong.position.set(Math.cos(a) * 0.06, 0.1, Math.sin(a) * 0.06);
        prong.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
        claw.add(prong);
      }
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
      claw.add(eye);
      joints[11].add(claw);
      this.arms.push({ base: b, joints, claw, sx, sy, phase: Math.random() * 6 });
    }
    shadowAll(this.hero.j.spine);
    this.slamTarget = new THREE.Vector3();
    this.slamArms = [];
  }

  think(dt, player, c) {
    const o = { anim: 'guard', faceP: true };
    this.cool -= dt;
    switch (this.state) {
      case 'idle': o.faceP = false; o.anim = 'idle'; this.idleThink(dt, c, o); break;
      case 'fight':
        if (c.dist > 3.6) { o.dir = c.toP.clone(); o.speed = 3.6; }
        else if (c.dist < 2.5) { o.dir = c.toP.clone().negate(); o.speed = 2.5; }
        if (this.cool <= 0 && c.dist < 4.6 && Math.abs(c.dy) < 4) {
          this.state = 'slamUp'; this.t = 0.7;
          this.slamArms = Math.random() < 0.5 ? [0, 1] : [2, 3];
        }
        break;
      case 'slamUp':
        // aim slightly ahead of where the hero is moving
        this.slamTarget.copy(player.p).addScaledVector(player.v, 0.25);
        this.slamTarget.y -= 0.8;
        if (this.t <= 0) { this.state = 'slam'; this.t = 0.25; this.mgr.audio.swish(); }
        break;
      case 'slam':
        if (this.t <= 0) {
          const tip = new THREE.Vector3();
          let hit = false;
          for (const i of this.slamArms) {
            this.arms[i].claw.getWorldPosition(tip);
            if (tip.distanceTo(player.p) < 2.3) hit = true;
          }
          this.mgr.burst('dust', tip, 1.6);
          if (hit) player.hurt(16, c.toP, 11, 6);
          this.mgr.audio.land(0.7);
          this.state = 'slamHold'; this.t = 0.45;
        }
        break;
      case 'slamHold':
        if (this.t <= 0) this.done(1.4);
        break;
      default: this.commonStates(dt, o);
    }
    // arm motion
    const tt = this.mgr.time;
    const k = 1 - Math.exp(-dt * 10);
    this.arms.forEach((a, i) => {
      const striking = (this.state === 'slamUp' || this.state === 'slam' || this.state === 'slamHold') && this.slamArms.includes(i);
      if (striking) {
        const lift = this.state === 'slamUp' ? 1 : 0;
        const tgt = _w.copy(this.slamTarget);
        if (lift) tgt.y += 5;
        aimJoint(a.base, tgt, 1 - Math.exp(-dt * (this.state === 'slam' ? 30 : 8)));
        a.joints.forEach((j, n) => { if (n) { j.rotation.x += ((lift ? 0.08 : 0.0) - j.rotation.x) * k; j.rotation.z += (0 - j.rotation.z) * k; } });
      } else {
        const dir = new THREE.Vector3(a.sx * 0.55, a.sy > 0 ? 0.9 : 0.35, -0.55).normalize();
        a.base.quaternion.slerp(_q.setFromUnitVectors(UP, dir), k);
        a.joints.forEach((j, n) => {
          if (!n) return;
          j.rotation.x += (Math.sin(tt * 1.6 + a.phase + n * 0.45) * 0.16 + 0.05 - j.rotation.x) * k;
          j.rotation.z += (Math.cos(tt * 1.3 + a.phase + n * 0.4) * 0.1 * a.sx - j.rotation.z) * k;
        });
      }
    });
    return o;
  }
}

// ---------------------------------------------------------------------------
class Rhino extends Boss {
  constructor(mgr, pos) {
    super(mgr, 'rhino', pos, { hp: 16, escape: 1.4, poise: 6, scale: 1.45, mass: 3.2, aggro: 50 });
    // broad, heavy build
    this.hero.root.scale.set(this.scale * 1.2, this.scale, this.scale * 1.15);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.44, 12), new THREE.MeshStandardMaterial({ color: 0xcfc8b8, roughness: 0.5 }));
    horn.position.set(0, 0.22, 0.1);
    horn.rotation.x = 0.55;
    const horn2 = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 10), horn.material);
    horn2.position.set(0, 0.25, 0.0);
    horn2.rotation.x = 0.35;
    this.hero.j.head.add(horn, horn2);
    const ridge = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), this.hero.mat.torso);
    ridge.scale.set(0.17, 0.08, 0.1);
    ridge.position.set(0, 0.33, -0.05);
    this.hero.j.chest.add(ridge);
    shadowAll(this.hero.root);
  }

  onHurt(heavy) {
    if (this.state === 'dazed') return; // free hits while dazed
    super.onHurt(heavy);
  }

  web() {
    if (this.state === 'charge') {
      // a web across the legs trips him mid-charge
      this.state = 'dazed'; this.t = 2.2;
      this.v.multiplyScalar(0.3);
      this.mgr.onMessage && this.mgr.onMessage('Tripped him up!');
      return true;
    }
    return super.web();
  }

  think(dt, player, c) {
    const o = { anim: 'guard', faceP: true, accel: 6 };
    this.cool -= dt;
    switch (this.state) {
      case 'idle': o.faceP = false; o.anim = 'idle'; this.idleThink(dt, c, o); break;
      case 'fight':
        if (c.dist > 2.2) { o.dir = c.toP.clone(); o.speed = 3.8; }
        if (this.cool <= 0 && c.dist > 5 && c.dist < 34 && Math.abs(c.dy) < 3) { this.state = 'paw'; this.t = 0.9; }
        else if (this.cool <= 0 && c.dist < 2.6 && Math.abs(c.dy) < 2) { this.state = 'punch'; this.t = 0.6; }
        break;
      case 'paw':
        o.anim = 'crouch';
        if (this.t <= 0) {
          this.state = 'charge'; this.t = 1.9;
          this.chargeDir = c.toP.clone();
          this.mgr.audio.land(1);
        }
        break;
      case 'charge':
        o.faceP = false; o.faceDir = this.chargeDir; o.dir = this.chargeDir; o.speed = 21; o.accel = 4; o.anim = 'run'; o.charge = true;
        if (c.dist3 < 2.4) { player.hurt(22, this.chargeDir, 17, 7); this.done(1.6); this.state = 'recover'; this.t = 0.8; }
        else if (this.hitWall && this.t < 1.75) {
          this.state = 'dazed'; this.t = 2.6; this.v.multiplyScalar(-0.2);
          this.mgr.audio.land(1.2);
          this.mgr.onMessage && this.mgr.onMessage('He slammed into the wall. Hit him now!');
        } else if (!this.grounded && this.p.y > 3 && this.t < 1.7) {
          // ran off a roof edge
          this.state = 'dazed'; this.t = 2.4;
        } else if (this.t <= 0) { this.state = 'recover'; this.t = 0.8; }
        break;
      case 'recover':
        o.anim = 'idle';
        if (this.t <= 0) this.done(2.2);
        break;
      case 'dazed':
        o.anim = 'hurt'; o.faceP = false;
        if (this.t <= 0) this.done(1.5);
        break;
      case 'punch':
        o.anim = 'punchR'; o.animT = 1 - this.t / 0.6;
        if (this.t <= 0) {
          if (c.dist < 3 && Math.abs(c.dy) < 2) player.hurt(14, c.toP, 10, 5);
          this.done(1.2);
        }
        break;
      default: this.commonStates(dt, o);
    }
    return o;
  }
}

// ---------------------------------------------------------------------------
class Sandman extends Boss {
  constructor(mgr, pos) {
    super(mgr, 'sandman', pos, { hp: 14, escape: 0, poise: 4, scale: 1.15 });
    const n = 260;
    this.grains = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      this.grains[i * 4] = Math.random() * 6.28;
      this.grains[i * 4 + 1] = Math.random() * 1.9 - 0.95;
      this.grains[i * 4 + 2] = 0.25 + Math.random() * 0.45;
      this.grains[i * 4 + 3] = 0.6 + Math.random() * 1.4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.sand = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcaa874, size: 0.05, transparent: true, opacity: 0.85 }));
    this.sand.frustumCulled = false;
    mgr.scene.add(this.sand);
    this.fist = 1;
  }

  web() { this.mgr.burst('sand', this.chest(new THREE.Vector3()), 1); return false; }

  takeHit(dmg, dir, heavy) {
    this.mgr.burst('sand', this.chest(new THREE.Vector3()), heavy ? 1.6 : 1);
    return super.takeHit(dmg, dir, heavy);
  }

  remove() { super.remove(); this.mgr.scene.remove(this.sand); }

  think(dt, player, c) {
    const o = { anim: 'guard', faceP: true };
    this.cool -= dt;
    let fist = 1;
    switch (this.state) {
      case 'idle': o.faceP = false; o.anim = 'idle'; this.idleThink(dt, c, o); break;
      case 'fight':
        if (c.dist > 3) { o.dir = c.toP.clone(); o.speed = 4.2; }
        if (this.cool <= 0) {
          if (c.dist < 4 && Math.abs(c.dy) < 2.2) { this.state = 'fist'; this.t = 0.65; }
          else if (c.dist3 < 40) { this.state = 'blast'; this.t = 0.6; }
        }
        break;
      case 'fist':
        fist = 1 + 1.6 * Math.min(1, 1 - this.t / 0.65);
        o.anim = 'punchR'; o.animT = 0.15 * (1 - this.t / 0.65);
        if (this.t <= 0) {
          if (c.dist < 4.3 && Math.abs(c.dy) < 2.4) player.hurt(18, c.toP, 13, 6);
          this.mgr.audio.hit(0.6);
          this.state = 'fistHold'; this.t = 0.5;
        }
        break;
      case 'fistHold':
        fist = 2.6; o.anim = 'punchR'; o.animT = 0.3 + 0.7 * (1 - this.t / 0.5);
        if (this.t <= 0) this.done(1.4);
        break;
      case 'blast':
        o.anim = 'throw'; o.animT = Math.min(1, 1 - this.t / 0.6);
        if (this.t <= 0) {
          const from = new THREE.Vector3();
          this.hero.handWorld('R', from);
          this.mgr.fire('sand', from, player, 0);
          this.done(2);
        }
        break;
      default: this.commonStates(dt, o);
    }
    this.fist += (fist - this.fist) * (1 - Math.exp(-dt * 10));
    this.hero.j.elR.scale.setScalar(this.fist);
    // swirling grains
    const pos = this.sand.geometry.attributes.position.array, gr = this.grains, tt = this.mgr.time;
    const down = this.state === 'down';
    for (let i = 0; i < gr.length / 4; i++) {
      const a = gr[i * 4] + tt * gr[i * 4 + 3], y = gr[i * 4 + 1], r = gr[i * 4 + 2] * this.scale;
      pos[i * 3] = this.p.x + Math.cos(a) * r;
      pos[i * 3 + 1] = down ? this.p.y - 0.8 + Math.abs(y) * 0.1 : this.p.y + y * this.scale + Math.sin(tt * 2 + i) * 0.05;
      pos[i * 3 + 2] = this.p.z + Math.sin(a) * r;
    }
    this.sand.geometry.attributes.position.needsUpdate = true;
    return o;
  }
}

const CLASSES = { goblin: Goblin, scorpion: Scorpion, vulture: Vulture, ock: Ock, rhino: Rhino, sandman: Sandman };

export function makeBoss(mgr, type, pos) {
  return new CLASSES[type](mgr, pos);
}
