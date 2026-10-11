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
import { makeCanvas, mulberry32, makeWebSplat } from './textures.js';

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

export class Enemy {
  // opts: { scale, hp, mass, webKO, escape }
  constructor(mgr, skin, pos, opts = {}) {
    this.mgr = mgr;
    this.hero = new Hero(skin);
    this.scale = opts.scale ?? 1.05;
    this.hero.root.scale.setScalar(this.scale);
    mgr.scene.add(this.hero.root);
    this.p = pos.clone();
    this.home = pos.clone();
    this.v = new THREE.Vector3();
    this.yaw = Math.random() * Math.PI * 2;
    this.pitch = 0;
    this.state = 'idle';
    this.t = 0;
    this.maxHp = this.hp = opts.hp ?? 3;
    this.mass = opts.mass ?? 1;
    this.webKO = opts.webKO ?? true;      // any hit while webbed knocks out
    this.escapeTime = opts.escape ?? 5.5;  // seconds a web holds
    this.flying = false;
    this.isBoss = false;
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

  // dir: direction the web was travelling (used to pin them to a wall).
  web(dir) {
    if (!this.active || this.escapeTime <= 0) return false;
    const was = this.state === 'webbed';
    this.webs = Math.min(3, this.webs + 1);
    this.escape = was ? Math.min(this.escapeTime * 1.8, this.escape + this.escapeTime * 0.55) : this.escapeTime;
    this.state = 'webbed';
    this.flying = false;
    this.v.x *= 0.2; this.v.z *= 0.2;
    if (!was && dir) this.tryPin(dir);
    return true;
  }

  // A web that carries on past them and hits a wall within a few meters
  // sticks them to that wall.
  tryPin(dir) {
    const h = new THREE.Vector3(dir.x, 0, dir.z);
    if (h.lengthSq() < 1e-4) return;
    h.normalize();
    const from = this.chest(new THREE.Vector3());
    const hit = this.mgr.col.raycast(from, h, 6.5);
    if (!hit || Math.abs(hit.normal.y) > 0.3) return;
    const n = new THREE.Vector3(hit.normal.x, 0, hit.normal.z);
    this.pin = {
      pos: new THREE.Vector3(hit.point.x, hit.point.y - 0.45 * this.scale, hit.point.z).addScaledVector(n, 0.42 * this.scale),
      n,
      splat: this.mgr.addSplat(new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z), n),
    };
    this.webs = 3;
    this.escape *= 1.6;
    this.mgr.onMessage(this.isBoss ? `${this.name} is webbed to the wall!` : 'Webbed to the wall!');
  }

  clearPin() {
    if (!this.pin) return;
    this.mgr.scene.remove(this.pin.splat);
    this.pin = null;
  }

  takeHit(dmg, dir, heavy) {
    if (!this.active) return false;
    if (this.state === 'webbed') {
      if (this.webKO) { dmg = 99; heavy = true; } else dmg *= 2;
    }
    this.hp -= dmg;
    const k = (heavy ? 11 : 4.5) / this.mass;
    this.v.x += dir.x * k; this.v.z += dir.z * k;
    this.v.y = (heavy ? 6.5 : 2.5) / Math.sqrt(this.mass);
    this.grounded = false;
    this.webs = 0; this.cocoon.visible = false;
    if (this.hp <= 0) this.knockOut();
    else this.onHurt(heavy);
    return true;
  }

  onHurt(heavy) { this.state = 'stun'; this.t = heavy ? 0.8 : 0.45; }

  knockOut() {
    if (this.state === 'down') return;
    this.state = 'down';
    this.flying = false;
    this.downT = 0;
    this.webs = 0;
    this.cocoon.visible = false;
    this.mgr.onDefeat(this);
  }

  // Thug brain. Returns what the body should do this frame.
  think(dt, player, c) {
    const mgr = this.mgr, p = this.p;
    const o = { dir: null, speed: 0, anim: 'idle', animT: 0, faceP: false };
    switch (this.state) {
      case 'idle': {
        this.wander(dt, o);
        if (c.dist < 28 && c.sameLevel && player.state !== 'swing') { this.state = 'chase'; mgr.alert(this); }
        else if (c.dist < 45) { o.faceP = true; o.speed = 0; o.anim = 'guard'; }
        break;
      }
      case 'chase': {
        o.faceP = true;
        o.anim = 'guard';
        if (c.dist > 1.5) { o.dir = c.toP.clone(); o.speed = 5.4; }
        if (c.dist < 1.8 && c.sameLevel) { this.state = 'windup'; this.t = 0.5; }
        if (c.dist > 42 || Math.abs(c.dy) > 8) { this.state = 'idle'; this.wanderTo = null; }
        break;
      }
      case 'windup': {
        o.faceP = true;
        o.anim = 'punchR'; o.animT = 0.12 * (1 - this.t / 0.5);
        if (this.t <= 0) {
          if (c.dist < 2.3 && Math.abs(c.dy) < 1.6) player.hurt(12, c.toP);
          this.state = 'recover'; this.t = 0.55;
        }
        break;
      }
      case 'recover': {
        o.faceP = true;
        o.anim = 'punchR'; o.animT = 0.2 + 0.8 * (1 - this.t / 0.55);
        if (this.t <= 0) this.state = 'chase';
        break;
      }
      default: this.commonStates(dt, o);
    }
    void p;
    return o;
  }

  wander(dt, o) {
    const p = this.p;
    this.wanderT -= dt;
    if (!this.wanderTo || this.wanderT <= 0) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 4;
      this.wanderTo = new THREE.Vector3(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
      this.wanderT = 3 + Math.random() * 4;
    }
    const wx = this.wanderTo.x - p.x, wz = this.wanderTo.z - p.z, wl = Math.hypot(wx, wz);
    if (wl > 0.6) { o.dir = new THREE.Vector3(wx / wl, 0, wz / wl); o.speed = 1.5; }
  }

  // stun / webbed / down behave the same for everyone.
  commonStates(dt, o) {
    switch (this.state) {
      case 'stun':
        o.anim = 'hurt';
        if (this.t <= 0) this.state = 'chase';
        break;
      case 'webbed':
        o.anim = 'struggle';
        this.escape -= dt;
        if (this.escape <= 0) {
          this.webs = 0;
          this.state = 'stun'; this.t = 0.5;
          this.mgr.audio.rip();
        }
        break;
      case 'down':
        o.anim = 'down';
        this.downT += dt;
        if (this.downT > 5) {
          this.hero.root.position.y -= dt * 0.5;
          if (this.downT > 7) this.remove();
        }
        break;
    }
  }

  update(dt, player) {
    const P = player.p, p = this.p;
    const dx = P.x - p.x, dz = P.z - p.z;
    const c = {
      dx, dz, dist: Math.hypot(dx, dz), dy: P.y - p.y,
      toP: new THREE.Vector3(dx, 0, dz).normalize(),
    };
    c.sameLevel = Math.abs(c.dy) < 3;
    c.dist3 = Math.hypot(c.dist, c.dy);
    this.t -= dt;
    const o = this.think(dt, player, c);
    this.move(dt, o, c);
    this.visual(dt, o, c);
  }

  move(dt, o, c) {
    const p = this.p, mgr = this.mgr;
    if (this.pin) {
      if (this.state === 'webbed') {
        p.lerp(this.pin.pos, 1 - Math.exp(-14 * dt));
        this.v.set(0, 0, 0);
        this.grounded = true;
        this.lastVy = 0;
        return;
      }
      this.clearPin();
    }
    let speed = o.speed;
    if (this.flying) {
      // Flyers steer straight toward a desired velocity; no gravity.
      const fv = o.fly || _c.set(0, 0, 0);
      this.v.lerp(fv, 1 - Math.exp(-(o.flyResp ?? 3) * dt));
      p.addScaledVector(this.v, dt);
      this.collide(true);
    } else {
      // Don't walk off roofs.
      if (o.dir && speed > 0 && this.grounded && !o.charge) {
        const ax = p.x + o.dir.x * 1.1, az = p.z + o.dir.z * 1.1;
        const hit = mgr.col.raycast(_c.set(ax, p.y, az), DOWN_V, 3);
        if (!hit && p.y - FEET > 0.5) { speed = 0; o.ledge = true; }
      }
      if (this.grounded && this.state !== 'down') {
        const tx = o.dir ? o.dir.x * speed : 0, tz = o.dir ? o.dir.z * speed : 0;
        const k = 1 - Math.exp(-(this.state === 'stun' ? 3 : (o.accel ?? 10)) * dt);
        this.v.x += (tx - this.v.x) * k;
        this.v.z += (tz - this.v.z) * k;
      } else if (this.grounded) {
        this.v.x *= 1 - Math.min(1, dt * 5); this.v.z *= 1 - Math.min(1, dt * 5);
      }
      if (o.anim === 'idle' && speed > 0.5) o.anim = 'run';
      if (o.anim === 'guard' && speed > 2) o.anim = 'run';
      this.v.y -= G * dt;
      p.addScaledVector(this.v, dt);
      this.collide(false);
    }
    // Keep a little space from the hero.
    const minD = 0.8 * this.scale;
    if (this.active && c.dist < minD && Math.abs(c.dy) < 1.5) {
      p.x -= c.toP.x * (minD - c.dist); p.z -= c.toP.z * (minD - c.dist);
    }
  }

  visual(dt, o, c) {
    const p = this.p;
    let yawT = this.yaw;
    if (this.pin) yawT = Math.atan2(this.pin.n.x, this.pin.n.z);
    else if (o.faceP) yawT = Math.atan2(c.dx, c.dz);
    else if (o.faceDir) yawT = Math.atan2(o.faceDir.x, o.faceDir.z);
    else if (Math.hypot(this.v.x, this.v.z) > 0.5 && this.active) yawT = Math.atan2(this.v.x, this.v.z);
    let d = yawT - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    if ((this.state !== 'webbed' || this.pin) && this.state !== 'down') this.yaw += d * (1 - Math.exp(-dt * (o.turn ?? 10)));
    this.pitch += ((o.pitch ?? 0) - this.pitch) * (1 - Math.exp(-dt * 6));

    const root = this.hero.root;
    _q.setFromAxisAngle(UP, this.yaw);
    if (this.state === 'down') {
      _q2.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
      _q.multiply(_q2);
      root.quaternion.slerp(_q, 1 - Math.exp(-dt * 8));
      if (this.downT <= 5) root.position.set(p.x, p.y - FEET + 0.16 * this.scale, p.z);
    } else {
      if (this.pitch) { _q2.setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch); _q.multiply(_q2); }
      root.quaternion.copy(_q);
      root.position.set(p.x, p.y, p.z);
    }
    this.phase += dt * (5 + Math.hypot(this.v.x, this.v.z) * 0.55);
    this.hero.animate(dt, { state: o.anim, speed: Math.hypot(this.v.x, this.v.z), phase: this.phase, t: o.animT, webSide: o.side || 'R' });

    const cc = this.cocoon;
    cc.visible = this.state === 'webbed';
    if (cc.visible) {
      const full = this.webs >= 2;
      const wob = Math.sin(this.mgr.time * 13) * 0.04 * Math.min(1, this.escape);
      cc.position.set(p.x, p.y + (full ? 0.02 : -0.45) * this.scale, p.z);
      cc.scale.set(0.47 * this.scale, (full ? 1.02 : 0.55) * this.scale, 0.4 * this.scale);
      cc.rotation.set(wob, this.yaw, wob * 0.6);
    }
  }

  collide(flying) {
    const p = this.p, col = this.mgr.col;
    let ground = false, wall = false;
    const cb = n => {
      if (n.y > 0.7) ground = true; else if (Math.abs(n.y) < 0.3) wall = true;
      const vn = this.v.dot(n); if (vn < 0) this.v.addScaledVector(n, -vn);
    };
    const r = R * this.scale;
    for (const [off, step] of [[-0.55 * this.scale, flying ? 0 : 0.55], [0.3 * this.scale, 0]]) {
      _c.set(p.x, p.y + off, p.z);
      col.resolveSphere(_c, r, cb, step);
      p.set(_c.x, _c.y - off, _c.z);
    }
    const feet = FEET * this.scale;
    if (p.y < feet) { p.y = feet; ground = true; if (this.v.y < 0) this.v.y = 0; }
    // A long fall knocks a thug out (bosses just land hard).
    if (ground && !this.grounded && this.lastVy < -19 && this.active && !this.isBoss) { this.hp = 0; this.knockOut(); }
    this.lastVy = this.v.y;
    this.grounded = ground;
    this.hitWall = wall;
  }

  remove() {
    this.clearPin();
    this.removed = true;
    this.mgr.scene.remove(this.hero.root);
    this.mgr.scene.remove(this.cocoon);
    if (this.onRemove) this.onRemove();
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
    // bosses (factory injected by main.js to avoid a circular import)
    this.bossFactory = null;
    this.bossTypes = [];
    this.bossOrder = [];
    this.boss = null;
    this.wave = 0;
    this.bossTimer = 45;
    this.projectiles = [];
    this.fx = [];
    this.saidSand = false;
    this.bossTimer = 45;
    this.traffic = null;
    this.splatMat = new THREE.MeshStandardMaterial({ map: makeWebSplat(), transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4 });
  }

  addSplat(point, n) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), this.splatMat);
    m.position.copy(point).addScaledVector(n, 0.05);
    m.lookAt(point.x + n.x, point.y + n.y, point.z + n.z);
    m.rotation.z += Math.random() * 6;
    this.scene.add(m);
    return m;
  }

  makeCarMesh(color) {
    const mat = this.traffic.carMat.clone();
    mat.color.setHex(color);
    const m = new THREE.Mesh(this.traffic.carGeo, mat);
    m.castShadow = true;
    this.scene.add(m);
    return m;
  }

  reset() {
    for (const e of this.enemies) e.remove();
    this.enemies = [];
    for (const pr of this.projectiles) this.scene.remove(pr.mesh);
    for (const f of this.fx) this.scene.remove(f.mesh);
    this.projectiles = []; this.fx = [];
    this.boss = null;
    this.wave = 0;
    this.pending = null;
    this.shot = null;
    this.shotWeb.release();
    this.spawnTimer = 4;
  }

  get active() { return this.enemies.filter(e => e.active); }

  // Pick the next landmark and find a flat rooftop near it.
  // Two waves of thugs, then a boss, and repeat.
  spawnWave() {
    this.wave++;
    this.spawnPair();
  }

  nextSite() {
    if (!this.siteOrder.length) {
      this.siteOrder = this.sites.slice().sort(() => Math.random() - 0.5);
      if (this.siteOrder[0] === this.lastSite) this.siteOrder.push(this.siteOrder.shift());
    }
    const site = this.siteOrder.shift();
    this.lastSite = site;
    return site;
  }

  spawnBoss(type) {
    if (!type) {
      if (!this.bossOrder.length) this.bossOrder = this.bossTypes.slice().sort(() => Math.random() - 0.5);
      type = this.bossOrder.shift();
    }
    const site = this.nextSite();
    const spot = this.findSpot(site);
    if (type === 'goblin' || type === 'vulture') spot.y += 8;
    const b = this.bossFactory(this, type, spot);
    this.enemies.push(b);
    this.boss = b;
    this.onMessage(`${b.name} is near the ${site.name}`);
    return b;
  }

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
      const k = this.skinCounter++;
      this.enemies.push(new Enemy(this, thugSkin(k), pos, { scale: 1.04 + (k % 3) * 0.03 }));
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
    this.shot = { e, t: 0, hit: false, dir: _c.clone().sub(this.player.p).normalize() };
    this.player.gestureT = 0.35;
    this.audio.thwip(1.35);
  }

  melee(player, cam) {
    if (player.attack && player.attack.t < player.attack.dur * 0.55) return;
    if (player.state === 'swing' || player.state === 'zip') return;
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

  onDefeat(e) {
    this.defeated++;
    this.audio.hit(1.3);
    if (e && e.isBoss) {
      this.onMessage(`${e.name} is down!`);
      if (this.boss === e) this.boss = null;
      this.bossTimer = 70 + Math.random() * 40;
      this.spawnTimer = Math.min(this.spawnTimer, 8);
    } else if (!this.active.some(x => !x.isBoss)) {
      this.onMessage('Area clear');
      this.spawnTimer = 7;
    }
  }

  // ---- projectiles and effects ----
  _projMesh(type) {
    if (!this._pm) {
      this._pm = {
        bomb: [new THREE.SphereGeometry(0.22, 14, 10), new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff5a00, emissiveIntensity: 1.2, roughness: 0.5 })],
        feather: [new THREE.BoxGeometry(0.06, 0.03, 0.75), new THREE.MeshStandardMaterial({ color: 0xb8c0c8, metalness: 0.9, roughness: 0.25 })],
        sand: [new THREE.IcosahedronGeometry(0.4, 1), new THREE.MeshStandardMaterial({ color: 0xc2a271, roughness: 1, flatShading: true })],
      };
    }
    const [g, m] = this._pm[type];
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  _spawnProj(type, from, v, o) {
    this.projectiles.push({ type, p: from.clone(), v, life: 4, ...o, mesh: o.mesh || this._projMesh(type) });
  }

  // A car thrown (or dropped) by a boss.
  throwCar(mesh, from, player, drop = false) {
    let v;
    if (drop) v = new THREE.Vector3(0, 2, 0);
    else {
      const d = from.distanceTo(player.p);
      const T = Math.max(0.8, Math.min(1.6, d / 22));
      const tgt = player.p.clone().addScaledVector(player.v, T * 0.5);
      v = tgt.sub(from).divideScalar(T);
      v.y += 0.5 * G * T;
    }
    this._spawnProj('car', from, v, { gravity: true, dmg: drop ? 14 : 24, knock: 16, aoe: drop ? 3 : 4.6, radius: 1.5, mesh, spin: new THREE.Vector3(Math.random() * 3, Math.random() * 2, Math.random() * 3) });
    if (!drop) this.audio.swish();
  }

  // Ballistic throw that leads a moving target.
  lob(type, from, player) {
    const d = from.distanceTo(player.p);
    const T = Math.max(0.7, Math.min(1.5, d / 20));
    const tgt = player.p.clone().addScaledVector(player.v, T * 0.5);
    const v = tgt.sub(from).divideScalar(T);
    v.y += 0.5 * G * T;
    this._spawnProj(type, from, v, { gravity: true, dmg: 18, knock: 12, aoe: 4.2, radius: 0.35 });
  }

  // Straight shot with a little lead and an optional yaw spread.
  fire(type, from, player, spread = 0) {
    const tgt = player.p.clone().addScaledVector(player.v, 0.25);
    tgt.y += 0.2;
    const dir = tgt.sub(from).normalize();
    if (spread) dir.applyAxisAngle(UP, spread);
    const sp = type === 'feather' ? 42 : 26;
    const o = type === 'feather'
      ? { dmg: 8, knock: 4, aoe: 0, radius: 0.45 }
      : { dmg: 12, knock: 9, aoe: 1.8, radius: 0.7 };
    this._spawnProj(type, from, dir.multiplyScalar(sp), o);
    this.audio.swish();
  }

  burst(type, pos, size = 1) {
    const color = { bomb: 0xff8a2a, dust: 0xb8ab95, sand: 0xcaa874 }[type];
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9, depthWrite: false,
      blending: type === 'bomb' ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(0.2);
    this.scene.add(mesh);
    this.fx.push({ mesh, t: 0, size });
  }

  updateProjectiles(dt) {
    const player = this.player;
    for (const pr of this.projectiles) {
      pr.life -= dt;
      if (pr.gravity) pr.v.y -= G * dt;
      const step = pr.v.length() * dt;
      const dir = pr.v.clone().normalize();
      const wallHit = this.col.raycast(pr.p, dir, step + 0.05);
      pr.p.addScaledVector(pr.v, dt);
      pr.mesh.position.copy(pr.p);
      if (pr.type === 'feather') pr.mesh.lookAt(pr.p.clone().add(dir));
      else if (pr.spin) { pr.mesh.rotation.x += pr.spin.x * dt; pr.mesh.rotation.y += pr.spin.y * dt; pr.mesh.rotation.z += pr.spin.z * dt; }
      else pr.mesh.rotation.x += dt * 8;
      const pd = pr.p.distanceTo(player.p);
      const hitPlayer = pd < pr.radius + 0.55;
      if (hitPlayer || wallHit || pr.p.y < 0.2 || pr.life <= 0) {
        if (wallHit) pr.p.set(wallHit.point.x, wallHit.point.y, wallHit.point.z);
        if (pr.aoe) {
          this.burst(pr.type === 'bomb' ? 'bomb' : pr.type === 'car' ? 'dust' : 'sand', pr.p, pr.aoe);
          const d = pr.p.distanceTo(player.p);
          if (d < pr.aoe) {
            const away = player.p.clone().sub(pr.p).setY(0).normalize();
            player.hurt(Math.round(pr.dmg * (1 - d / pr.aoe * 0.5)), away, pr.knock, 6);
          }
          if (pr.type === 'bomb' || pr.type === 'car') { this.audio.land(1.2); if (d < 25) player.shake = Math.max(player.shake, 0.35); }
        } else if (hitPlayer) {
          player.hurt(pr.dmg, dir, pr.knock, 2);
        }
        pr.dead = true;
        this.scene.remove(pr.mesh);
        if (pr.type === 'car') pr.mesh.material.dispose();
      }
    }
    this.projectiles = this.projectiles.filter(p => !p.dead);
    for (const f of this.fx) {
      f.t += dt;
      const k = f.t / 0.45;
      f.mesh.scale.setScalar(0.2 + f.size * Math.min(1, k * 1.6));
      f.mesh.material.opacity = Math.max(0, 0.9 * (1 - k));
      if (k >= 1) { f.dead = true; this.scene.remove(f.mesh); f.mesh.material.dispose(); f.mesh.geometry.dispose(); }
    }
    this.fx = this.fx.filter(f => !f.dead);
  }

  alert() { /* thugs noticing the hero could bark lines here */ }

  update(dt) {
    this.time += dt;
    const player = this.player;
    this.comboT -= dt;

    // Thug pairs keep coming while no boss is around; bosses arrive on a timer.
    if (!this.boss && !this.active.some(x => !x.isBoss)) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) { this.spawnTimer = 1e9; this.spawnWave(); }
    }
    if (!this.boss && this.bossFactory) {
      this.bossTimer -= dt;
      if (this.bossTimer <= 0) { this.bossTimer = 1e9; this.spawnBoss(); }
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
          if (d < 2.7 && Math.abs(e.p.y - player.p.y) < 2.4) {
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
      if (!s.hit && s.t > 0.12) {
        s.hit = true;
        if (!s.e.web(s.dir) && !this.saidSand && s.e.type === 'sandman') { this.saidSand = true; this.onMessage('Webs slip right through the sand. Use your fists!'); }
      }
      if (s.t > 0.3) { this.shotWeb.release(); this.shot = null; }
    }
    player.hero.handWorld('R', this.hand);
    this.shotWeb.update(dt, this.hand, 0, 0.022);

    for (const e of this.enemies) e.update(dt, player);
    this.updateProjectiles(dt);
    this.enemies = this.enemies.filter(e => !e.removed);
  }
}
