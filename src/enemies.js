// Street thugs that show up in pairs on rooftops near the landmarks.
//
// Thugs wander, chase the hero when he lands near them, wind up and punch.
// A web shot glues them in place; each extra web adds time, but they tear
// free after a few seconds. Punches and kicks (F) knock them back; three
// hits, a kick combo finisher or any hit while webbed knocks them out.
import * as THREE from 'three';
import { Hero } from './hero.js';
import { thugSkin } from './skins.js';
import { WebLine } from './web.js';
import { makeCanvas, mulberry32 } from './textures.js';

const G = 22, FEET = 0.97, R = 0.4;
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const DOWN_V = new THREE.Vector3(0, -1, 0);

function cocoonTexture() {
  const S = 256, r = mulberry32(99);
  const cv = makeCanvas(S), c = cv.getContext('2d');
  c.clearRect(0, 0, S, S);
  c.lineCap = 'round';
  for (let i = 0; i < 150; i++) {
    const y = r() * S, a = (r() - 0.5) * 60;
    c.strokeStyle = `rgba(240,244,248,${0.55 + r() * 0.45})`;
    c.lineWidth = 1.5 + r() * 3.5;
    c.beginPath();
    c.moveTo(-10, y);
    c.bezierCurveTo(S * 0.3, y + a, S * 0.7, y - a, S + 10, y + (r() - 0.5) * 20);
    c.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

class Enemy {
  constructor(mgr, skinIndex, pos) {
    this.mgr = mgr;
    this.hero = new Hero(thugSkin(skinIndex));
    this.scale = 1.04 + (skinIndex % 3) * 0.03;
    this.hero.root.scale.setScalar(this.scale);
    mgr.scene.add(this.hero.root);
    this.p = pos.clone();
    this.home = pos.clone();
    this.v = new THREE.Vector3();
    this.yaw = Math.random() * Math.PI * 2;
    this.state = 'idle';
    this.t = 0;
    this.hp = 3;
    this.webs = 0;
    this.escape = 0;
    this.wanderTo = null;
    this.wanderT = 0;
    this.grounded = true;
    this.downT = 0;
    this.phase = Math.random() * 6;
    this.removed = false;
    this.lastVy = 0;
    this.cocoon = new THREE.Mesh(mgr.cocoonGeo, mgr.cocoonMat);
    this.cocoon.visible = false;
    this.cocoon.castShadow = true;
    mgr.scene.add(this.cocoon);
  }

  get active() { return this.state !== 'down'; }

  chest(out) { return out.set(this.p.x, this.p.y + 0.45 * this.scale, this.p.z); }

  web() {
    if (!this.active) return;
    this.webs = Math.min(3, this.webs + 1);
    this.escape = this.state === 'webbed' ? Math.min(10, this.escape + 3) : 5.5;
    this.state = 'webbed';
    this.v.x *= 0.2; this.v.z *= 0.2;
  }

  takeHit(dmg, dir, heavy) {
    if (!this.active) return false;
    if (this.state === 'webbed') { dmg = 99; heavy = true; }
    this.hp -= dmg;
    const k = heavy ? 11 : 4.5;
    this.v.x += dir.x * k; this.v.z += dir.z * k;
    this.v.y = heavy ? 6.5 : 2.5;
    this.grounded = false;
    this.webs = 0; this.cocoon.visible = false;
    if (this.hp <= 0) this.knockOut();
    else { this.state = 'stun'; this.t = heavy ? 0.8 : 0.45; }
    return true;
  }

  knockOut() {
    if (this.state === 'down') return;
    this.state = 'down';
    this.downT = 0;
    this.webs = 0;
    this.cocoon.visible = false;
    this.mgr.onDefeat(this);
  }

  update(dt, player) {
    const mgr = this.mgr, P = player.p, p = this.p;
    const dx = P.x - p.x, dz = P.z - p.z;
    const dist = Math.hypot(dx, dz), dy = P.y - p.y;
    const toP = _v.set(dx, 0, dz).normalize();
    let speed = 0, dir = null, anim = 'idle', animT = 0, faceP = false;
    this.t -= dt;
    const sameLevel = Math.abs(dy) < 3;

    switch (this.state) {
      case 'idle': {
        this.wanderT -= dt;
        if (!this.wanderTo || this.wanderT <= 0) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * 4;
          this.wanderTo = new THREE.Vector3(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
          this.wanderT = 3 + Math.random() * 4;
        }
        const wx = this.wanderTo.x - p.x, wz = this.wanderTo.z - p.z, wl = Math.hypot(wx, wz);
        if (wl > 0.6) { dir = new THREE.Vector3(wx / wl, 0, wz / wl); speed = 1.5; }
        if (dist < 28 && sameLevel && player.state !== 'swing') { this.state = 'chase'; mgr.alert(this); }
        else if (dist < 45) { faceP = true; speed = 0; anim = 'guard'; }
        break;
      }
      case 'chase': {
        faceP = true;
        anim = 'guard';
        if (dist > 1.5) { dir = toP.clone(); speed = 5.4; }
        if (dist < 1.8 && sameLevel) { this.state = 'windup'; this.t = 0.5; }
        if (dist > 42 || Math.abs(dy) > 8) { this.state = 'idle'; this.wanderTo = null; }
        break;
      }
      case 'windup': {
        faceP = true;
        anim = 'punchR'; animT = 0.12 * (1 - this.t / 0.5);
        if (this.t <= 0) {
          if (dist < 2.3 && Math.abs(dy) < 1.6) player.hurt(12, toP);
          this.state = 'recover'; this.t = 0.55;
        }
        break;
      }
      case 'recover': {
        faceP = true;
        anim = 'punchR'; animT = 0.2 + 0.8 * (1 - this.t / 0.55);
        if (this.t <= 0) this.state = 'chase';
        break;
      }
      case 'stun': {
        anim = 'hurt';
        if (this.t <= 0) this.state = 'chase';
        break;
      }
      case 'webbed': {
        anim = 'struggle';
        this.escape -= dt;
        if (this.escape <= 0) {
          this.webs = 0;
          this.state = 'stun'; this.t = 0.5;
          mgr.audio.rip();
        }
        break;
      }
      case 'down': {
        anim = 'down';
        this.downT += dt;
        if (this.downT > 5) {
          this.hero.root.position.y -= dt * 0.5;
          if (this.downT > 7) this.remove();
        }
        break;
      }
    }

    // Don't walk off roofs.
    if (dir && speed > 0 && this.grounded) {
      const ax = p.x + dir.x * 1.1, az = p.z + dir.z * 1.1;
      const hit = mgr.col.raycast(_c.set(ax, p.y, az), DOWN_V, 3);
      if (!hit && p.y - FEET > 0.5) speed = 0;
    }
    if (this.grounded && this.state !== 'down') {
      const tx = dir ? dir.x * speed : 0, tz = dir ? dir.z * speed : 0;
      const k = 1 - Math.exp(-(this.state === 'stun' ? 3 : 10) * dt);
      this.v.x += (tx - this.v.x) * k;
      this.v.z += (tz - this.v.z) * k;
    } else if (this.grounded) {
      this.v.x *= 1 - Math.min(1, dt * 5); this.v.z *= 1 - Math.min(1, dt * 5);
    }
    if (anim === 'idle' && speed > 0.5) anim = 'run';
    if (anim === 'guard' && speed > 2) anim = 'run';

    // Physics: gravity, move, collide.
    this.v.y -= G * dt;
    p.addScaledVector(this.v, dt);
    this.collide();

    // Keep a little space from the hero.
    if (this.active && dist < 0.8 && Math.abs(dy) < 1.5) {
      p.x -= toP.x * (0.8 - dist); p.z -= toP.z * (0.8 - dist);
    }

    // Facing
    let yawT = this.yaw;
    if (faceP) yawT = Math.atan2(dx, dz);
    else if (Math.hypot(this.v.x, this.v.z) > 0.5 && this.active) yawT = Math.atan2(this.v.x, this.v.z);
    let d = yawT - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    if (this.state !== 'webbed' && this.state !== 'down') this.yaw += d * (1 - Math.exp(-dt * 10));

    // Visuals
    const root = this.hero.root;
    _q.setFromAxisAngle(UP, this.yaw);
    if (this.state === 'down') {
      _q2.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
      _q.multiply(_q2);
      root.quaternion.slerp(_q, 1 - Math.exp(-dt * 8));
      if (this.downT <= 5) root.position.set(p.x, p.y - FEET + 0.16, p.z);
    } else {
      root.quaternion.copy(_q);
      root.position.set(p.x, p.y + (this.scale - 1) * FEET, p.z);
    }
    this.phase += dt * (5 + Math.hypot(this.v.x, this.v.z) * 0.55);
    this.hero.animate(dt, { state: anim, speed: Math.hypot(this.v.x, this.v.z), phase: this.phase, t: animT, webSide: 'R' });

    const cc = this.cocoon;
    cc.visible = this.state === 'webbed';
    if (cc.visible) {
      const full = this.webs >= 2;
      const wob = Math.sin(this.mgr.time * 13) * 0.04 * Math.min(1, this.escape);
      cc.position.set(p.x, p.y + (full ? 0.02 : -0.45), p.z);
      cc.scale.set(0.47 * this.scale, (full ? 1.02 : 0.55) * this.scale, 0.4 * this.scale);
      cc.rotation.set(wob, this.yaw, wob * 0.6);
    }
  }

  collide() {
    const p = this.p, col = this.mgr.col;
    let ground = false;
    const cb = n => { if (n.y > 0.7) ground = true; const vn = this.v.dot(n); if (vn < 0) this.v.addScaledVector(n, -vn); };
    for (const [off, step] of [[-0.55, 0.55], [0.3, 0]]) {
      _c.set(p.x, p.y + off, p.z);
      col.resolveSphere(_c, R, cb, step);
      p.set(_c.x, _c.y - off, _c.z);
    }
    if (p.y < FEET) { p.y = FEET; ground = true; if (this.v.y < 0) this.v.y = 0; }
    // A long fall knocks a thug out.
    if (ground && !this.grounded && this.lastVy < -19 && this.active) { this.hp = 0; this.knockOut(); }
    this.lastVy = this.v.y;
    this.grounded = ground;
  }

  remove() {
    this.removed = true;
    this.mgr.scene.remove(this.hero.root);
    this.mgr.scene.remove(this.cocoon);
  }
}

export class EnemyManager {
  constructor(scene, col, player, audio, sites) {
    this.scene = scene;
    this.col = col;
    this.player = player;
    this.audio = audio;
    this.sites = sites;
    this.enemies = [];
    this.shotWeb = new WebLine(scene);
    this.shotWeb.showSplat = false;
    this.shot = null;
    this.combo = 0; this.comboT = 0;
    this.pending = null;
    this.defeated = 0;
    this.spawnTimer = 4;
    this.siteOrder = [];
    this.lastSite = null;
    this.time = 0;
    this.skinCounter = 0;
    this.onMessage = () => {};
    this.cocoonGeo = new THREE.SphereGeometry(1, 20, 16);
    this.cocoonMat = new THREE.MeshStandardMaterial({ map: cocoonTexture(), alphaTest: 0.35, roughness: 0.6, side: THREE.DoubleSide });
    this.aim = null;
    this.hand = new THREE.Vector3();
  }

  reset() {
    for (const e of this.enemies) e.remove();
    this.enemies = [];
    this.pending = null;
    this.shot = null;
    this.shotWeb.release();
    this.spawnTimer = 4;
  }

  get active() { return this.enemies.filter(e => e.active); }

  // Pick the next landmark and find a flat rooftop near it.
  spawnPair() {
    if (!this.siteOrder.length) {
      this.siteOrder = this.sites.slice().sort(() => Math.random() - 0.5);
      if (this.siteOrder[0] === this.lastSite) this.siteOrder.push(this.siteOrder.shift());
    }
    const site = this.siteOrder.shift();
    this.lastSite = site;
    const spot = this.findSpot(site);
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const pos = spot.clone();
      if (i === 1) {
        const q = this.findNear(spot, a);
        if (q) pos.copy(q);
      }
      this.enemies.push(new Enemy(this, this.skinCounter++, pos));
    }
    this.onMessage(`Two thugs spotted near the ${site.name}`);
  }

  _roofAt(x, z) {
    const hit = this.col.raycast(new THREE.Vector3(x, 420, z), DOWN_V, 440);
    if (!hit) return 0;
    return hit.normal.y > 0.7 ? hit.point.y : null;
  }

  findSpot(site) {
    for (let tries = 0; tries < 120; tries++) {
      const a = Math.random() * Math.PI * 2, r = 35 + Math.random() * 120;
      const x = site.x + Math.cos(a) * r, z = site.z + Math.sin(a) * r;
      const y = this._roofAt(x, z);
      if (y === null || y < 12 || y > 240) continue;
      let flat = true;
      for (const [ox, oz] of [[3.5, 0], [-3.5, 0], [0, 3.5], [0, -3.5]]) {
        const y2 = this._roofAt(x + ox, z + oz);
        if (y2 === null || Math.abs(y2 - y) > 0.25) { flat = false; break; }
      }
      if (flat) return new THREE.Vector3(x, y + FEET + 0.05, z);
    }
    // Fall back to the street next to the landmark.
    return new THREE.Vector3(site.x + 60, FEET + 0.3, site.z);
  }

  findNear(spot, a) {
    const x = spot.x + Math.cos(a) * 2.4, z = spot.z + Math.sin(a) * 2.4;
    const y = this._roofAt(x, z);
    if (y === null || Math.abs(y + FEET + 0.05 - spot.y) > 0.3) return null;
    return new THREE.Vector3(x, spot.y, z);
  }

  nearest(from) {
    let best = null, bd = Infinity;
    for (const e of this.enemies) {
      if (!e.active) continue;
      const d = e.p.distanceTo(from);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // Enemy closest to the crosshair, within a narrow cone and in sight.
  aimTarget(cam) {
    const o = cam.camera.position, f = cam.forward;
    let best = null, bestA = Infinity;
    for (const e of this.enemies) {
      if (!e.active) continue;
      e.chest(_c);
      const to = _c.clone().sub(o);
      const d = to.length();
      if (d > 80) continue;
      const ang = Math.acos(Math.min(1, to.dot(f) / d));
      const lim = d < 15 ? 0.3 : 0.16;
      if (ang > lim || ang >= bestA) continue;
      const from = this.player.p.clone(); from.y += 0.6;
      const los = _c.clone().sub(from);
      const ld = los.length();
      const hit = this.col.raycast(from, los.divideScalar(ld), ld - 0.8);
      if (hit) continue;
      best = e; bestA = ang;
    }
    return best;
  }

  // Called before the player update so aimed shots can take over the zip key.
  handleInput(input, cam) {
    const player = this.player;
    this.aim = this.aimTarget(cam);
    if (this.aim && (input.webShotPressed() || input.zipPressed())) {
      this.shoot(this.aim);
      input.consume('Mouse2', 'KeyE', 'T_zip', 'KeyQ', 'Mouse1');
    }
    if (input.meleePressed()) this.melee(player, cam);
  }

  shoot(e) {
    e.chest(_c);
    const n = _c.clone().sub(this.player.p).normalize().negate();
    this.shotWeb.attach(_c, n);
    this.shot = { e, t: 0, hit: false };
    this.player.gestureT = 0.35;
    this.audio.thwip(1.35);
  }

  melee(player, cam) {
    if (player.attack && player.attack.t < player.attack.dur * 0.55) return;
    if (player.state === 'swing' || player.state === 'zip' || player.state === 'wall') return;
    this.combo = this.comboT > 0 ? (this.combo + 1) % 3 : 0;
    this.comboT = 0.95;
    const kind = ['punchR', 'punchL', 'kick'][this.combo];
    const dur = this.combo === 2 ? 0.42 : 0.3;

    let target = null, bs = Infinity;
    for (const e of this.enemies) {
      if (!e.active) continue;
      const dx = e.p.x - player.p.x, dz = e.p.z - player.p.z, d = Math.hypot(dx, dz);
      if (d > 7 || Math.abs(e.p.y - player.p.y) > 3) continue;
      const front = (dx * cam.forwardH.x + dz * cam.forwardH.z) / (d || 1);
      const s = d - front * 2;
      if (s < bs) { bs = s; target = e; }
    }
    const dir = target
      ? new THREE.Vector3(target.p.x - player.p.x, 0, target.p.z - player.p.z).normalize()
      : cam.forwardH.clone();
    player.startAttack(kind, dur, dir);
    let lunge = 0;
    if (target) {
      const d = Math.hypot(target.p.x - player.p.x, target.p.z - player.p.z);
      if (d > 2.0) {
        lunge = Math.min(0.35, (d - 1.5) / 18);
        player.lungeT = lunge;
        player.lungeV.copy(dir).multiplyScalar(18);
      }
    }
    this.pending = { target, kind, t: 0, hitAt: dur * 0.3 + lunge, dir };
    this.audio.swish();
  }

  onDefeat() {
    this.defeated++;
    this.audio.hit(1.3);
    if (!this.active.length) {
      this.onMessage('Area clear');
      this.spawnTimer = 7;
    }
  }

  alert() { /* thugs noticing the hero could bark lines here */ }

  update(dt) {
    this.time += dt;
    const player = this.player;
    this.comboT -= dt;

    if (!this.active.length) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) { this.spawnTimer = 1e9; this.spawnPair(); }
    }

    // Melee resolution
    const pd = this.pending;
    if (pd) {
      pd.t += dt;
      const e = pd.target;
      if (e) {
        const d = Math.hypot(e.p.x - player.p.x, e.p.z - player.p.z);
        if (d < 1.5) player.lungeT = 0;
        if (pd.t >= pd.hitAt || (player.lungeT <= 0 && d < 2.3 && pd.t >= 0.08)) {
          if (d < 2.7 && Math.abs(e.p.y - player.p.y) < 2.2) {
            const dir = new THREE.Vector3(e.p.x - player.p.x, 0, e.p.z - player.p.z).normalize();
            const heavy = pd.kind === 'kick';
            if (e.takeHit(heavy ? 2 : 1, dir, heavy)) {
              this.audio.hit(heavy ? 1 : 0.7);
              player.shake = Math.max(player.shake, heavy ? 0.3 : 0.15);
            }
          }
          this.pending = null;
        }
      } else if (pd.t > pd.hitAt) this.pending = null;
    }

    // Web shot travel
    if (this.shot) {
      const s = this.shot;
      s.t += dt;
      s.e.chest(_c);
      this.shotWeb.to.copy(_c);
      if (!s.hit && s.t > 0.12) { s.hit = true; s.e.web(); }
      if (s.t > 0.3) { this.shotWeb.release(); this.shot = null; }
    }
    player.hero.handWorld('R', this.hand);
    this.shotWeb.update(dt, this.hand, 0, 0.022);

    for (const e of this.enemies) e.update(dt, player);
    this.enemies = this.enemies.filter(e => !e.removed);
  }
}
