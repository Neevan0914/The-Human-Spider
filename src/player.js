// Player physics and movement.
//
// The body is a point mass integrated at a fixed 120 Hz. While swinging, the
// web is an inextensible rope: after each step the position is projected back
// onto the sphere of radius L around the anchor and the outward radial
// velocity is removed, which is exactly the pendulum constraint. Forces are
// gravity, quadratic air drag (F = -k|v|v, giving a terminal velocity of
// about 55 m/s, or 85 m/s in a dive) and a small tangential "pump" from the
// player's legs. Collision uses two spheres against convex building prisms.
import * as THREE from 'three';
import { ISLAND } from './city.js';

const G = 22;              // gravity, m/s^2 (comic-book strong legs, real pendulum math)
const H = 1 / 120;         // physics step
const K_AIR = 0.0072;      // drag coefficient per unit mass: terminal ~55 m/s
const K_DIVE = 0.003;      // streamlined dive: terminal ~85 m/s
const K_SWING = 0.0042;
const RUN = 12;
const CLIMB = 8.5;
const PUMP = 9;
const ZIP_SPEED = 50;
const R = 0.42;
const OFF_LO = -0.55, OFF_HI = 0.3;
const FEET = 0.97;
const FLIP_DUR = 0.75;

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion();

export class Player {
  constructor(col, hero, web, audio) {
    this.col = col;
    this.hero = hero;
    this.web = web;
    this.audio = audio;
    this.p = new THREE.Vector3();
    this.v = new THREE.Vector3();
    this.state = 'air';
    this.anchor = new THREE.Vector3();
    this.anchorN = new THREE.Vector3();
    this.ropeL = 0; this.ropeL0 = 0; this.webT = 0;
    this.wallN = new THREE.Vector3(0, 0, 1);
    this.zip = { target: new THREE.Vector3(), normal: new THREE.Vector3(), ledge: false, t: 0 };
    this.facing = new THREE.Vector3(0, 0, -1);
    this.acc = 0;
    this.webSide = 'L';
    this.flipT = 0; this.landT = 0; this.gestureT = 0;
    this.runPhase = 0; this.crawlPhase = 0;
    this.coyote = 0; this.wallCooldown = 0; this.charge = 0; this.charging = false;
    this.preview = null; this.previewT = 0;
    this.zipPreview = null;
    this.hand = new THREE.Vector3();
    this.bodyQ = new THREE.Quaternion();
    this.shake = 0;
    this.lastImpact = 0;
    this.contacts = [];
    this.stats = { maxSpeed: 0, swings: 0 };
    this.diving = false;
  }

  spawn(pos, face) {
    this.p.copy(pos);
    this.v.set(0, 0, 0);
    this.state = 'ground';
    this.web.release();
    if (face) this.facing.copy(face).setY(0).normalize();
    _m.lookAt(new THREE.Vector3(), this.facing.clone().negate(), UP);
    this.bodyQ.setFromRotationMatrix(_m);
    this.hero.root.quaternion.copy(this.bodyQ);
  }

  get speed() { return this.v.length(); }

  // ------------------------------------------------------------------ input
  update(dt, input, cam) {
    const fwdH = cam.forwardH, rightH = cam.rightH;
    this.camRight = rightH;
    const mv = input.move();
    const wish = _a.set(0, 0, 0).addScaledVector(fwdH, mv.y).addScaledVector(rightH, mv.x);
    if (wish.lengthSq() > 1) wish.normalize();
    this.wish = wish.clone();
    this.moveIn = mv;

    this.wallCooldown = Math.max(0, this.wallCooldown - dt);
    this.gestureT = Math.max(0, this.gestureT - dt);
    this.landT = Math.max(0, this.landT - dt);
    if (this.flipT > 0) this.flipT = Math.max(0, this.flipT - dt);

    // Swing
    if (input.swingPressed()) this.tryStartSwing(fwdH, cam);
    if (this.state === 'swing' && !input.swingHeld()) this.releaseSwing(false);

    // Jump (charged on the ground: hold to crouch, release to leap)
    if (this.state === 'ground') {
      if (input.jumpHeld()) { this.charging = true; this.charge = Math.min(0.7, this.charge + dt); }
      else if (this.charging) {
        this.charging = false;
        const c = this.charge < 0.14 ? 0 : this.charge / 0.7;
        this.v.y = 11 + c * 17;
        this.v.addScaledVector(wish, 3 + c * 3);
        this.charge = 0;
        this.state = 'air';
        this.coyote = 0;
        this.p.y += 0.05;
        this.audio.jump(0.5 + c);
        if (c > 0.5) this.flipT = FLIP_DUR;
      }
    } else {
      this.charging = false; this.charge = 0;
      if (input.jumpPressed()) {
        if (this.state === 'swing') this.releaseSwing(true);
        else if (this.state === 'wall') this.wallJump(cam);
      }
    }

    if (input.zipPressed()) this.tryZip(cam);
    this.diving = input.diveHeld() && this.state === 'air';
    if (input.diveHeld() && this.state === 'wall') { this.state = 'air'; this.wallCooldown = 0.4; this.v.addScaledVector(this.wallN, 2); }

    // Fixed-step physics
    this.acc += dt;
    let steps = 0;
    while (this.acc >= H && steps < 10) {
      this.step(H, wish);
      this.acc -= H;
      steps++;
    }
    if (steps >= 10) this.acc = 0;

    // Previews for the HUD (a few times per second)
    this.previewT -= dt;
    if (this.previewT <= 0) {
      this.previewT = 0.1;
      this.preview = this.state === 'swing' ? null : this.findAnchor(fwdH, cam);
      this.zipPreview = this.findZip(cam);
    }
    const sp = this.speed;
    if (sp > this.stats.maxSpeed) this.stats.maxSpeed = sp;
    this.animate(dt);
  }

  // ---------------------------------------------------------------- swinging
  // Anchor search, in three passes so a web can reach any building:
  //  1. an automatic fan above and ahead (the smoothest swings),
  //  2. wherever the crosshair points,
  //  3. any building surface in any direction, even below you.
  findAnchor(fwdH, cam) {
    const hv = _b.set(this.v.x, 0, this.v.z);
    const dir = new THREE.Vector3();
    if (hv.length() > 6) dir.copy(hv.normalize()).multiplyScalar(0.6).addScaledVector(fwdH, 0.4);
    else dir.copy(fwdH);
    dir.y = 0;
    if (dir.lengthSq() < 1e-4) dir.copy(this.facing);
    dir.normalize();
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    const o = new THREE.Vector3(this.p.x, this.p.y + 1, this.p.z);
    const D = new THREE.Vector3();
    const toAnchor = hit => ({
      point: new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z),
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
    });
    const fan = (pitches, yaws, range, minHeight, minDist, scoreFn) => {
      let best = null, bestScore = -Infinity;
      for (const pd of pitches) for (const yd of yaws) {
        const pr = pd * Math.PI / 180, yr = yd * Math.PI / 180;
        D.copy(dir).multiplyScalar(Math.cos(yr)).addScaledVector(right, Math.sin(yr));
        D.multiplyScalar(Math.cos(pr)); D.y = Math.sin(pr);
        const hit = this.col.raycast(o, D, range);
        if (!hit) continue;
        const height = hit.point.y - this.p.y;
        if (height < minHeight || hit.t < minDist) continue;
        const dx = hit.point.x - this.p.x, dz = hit.point.z - this.p.z;
        const score = scoreFn(hit, height, dx * dir.x + dz * dir.z, Math.abs(dx * right.x + dz * right.z));
        if (score > bestScore) { bestScore = score; best = hit; }
      }
      return best;
    };

    // 1. Automatic: above and ahead, in line with travel.
    let hit = fan([58, 48, 68, 40, 78, 30, 86], [0, 22, -22, 40, -40, 60, -60], 200, 3, 8,
      (h, height, ahead, lateral) => -Math.abs(h.t - 52) * 0.5 + ahead * 0.35 + Math.min(height, 60) * 0.25
        - Math.max(0, lateral - 0.35 * height) * 0.45);
    if (hit) return toAnchor(hit);

    // 2. Crosshair.
    if (cam) {
      const c = this.col.raycast(cam.camera.position, cam.forward, 260);
      if (c && c.t > cam.camera.position.distanceTo(this.p) + 1) return toAnchor(c);
    }

    // 3. Anything: all around, upward first, then level and downward.
    const all = [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180];
    hit = fan([60, 35, 15, 80], all, 400, 0.5, 4, (h, height, ahead) => -h.t * 0.3 + ahead * 0.2 + height * 0.1);
    if (!hit) hit = fan([0, -20, -45, -70, -85], all, 520, -1e9, 4, (h, height, ahead) => -h.t * 0.3 + ahead * 0.2);
    return hit ? toAnchor(hit) : null;
  }

  tryStartSwing(fwdH, cam) {
    if (this.state === 'swing' || this.state === 'zip') return;
    const hit = this.findAnchor(fwdH, cam);
    if (!hit) { this.noAnchor = 0.5; return; }
    if (this.state === 'ground') { this.v.y = Math.max(this.v.y, 10); this.p.y += 0.1; }
    if (this.state === 'wall') { this.v.addScaledVector(this.wallN, 7).y += 3; this.wallCooldown = 0.4; }
    this.state = 'swing';
    this.anchor.copy(hit.point);
    this.anchorN.copy(hit.normal);
    this.ropeL0 = this.p.distanceTo(this.anchor);
    this.ropeL = this.ropeL0;
    this.webT = 0;
    this.webSide = this.webSide === 'R' ? 'L' : 'R';
    this.web.attach(this.anchor, this.anchorN);
    this.audio.thwip();
    this.gestureT = 0.4;
    this.stats.swings++;
  }

  releaseSwing(boost) {
    if (this.state !== 'swing') return;
    this.web.release();
    this.state = 'air';
    if (boost) {
      // Jump off the web: a push along the direction of travel plus lift.
      const hv = _b.set(this.v.x, 0, this.v.z);
      if (hv.lengthSq() > 1) hv.normalize(); else hv.copy(this.facing);
      this.v.addScaledVector(hv, 4);
      this.v.y = Math.max(this.v.y + 7, 7);
      this.flipT = FLIP_DUR;
      this.audio.jump(0.8);
    } else if (this.v.y > 0) {
      this.flipT = this.v.y > 12 ? FLIP_DUR : 0;
    }
  }

  // ------------------------------------------------------------------- zip
  findZip(cam) {
    const o = cam.camera.position;
    const d = cam.forward;
    const minT = o.distanceTo(this.p) + 1.5;
    const hit = this.col.raycast(o, d, 190);
    if (!hit || hit.t < minT) return null;
    const pt = new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z);
    if (pt.distanceTo(this.p) > 150) return null;
    const n = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z);
    const c = hit.collider;
    let ledge = false;
    const target = pt.clone();
    if (Math.abs(n.y) < 0.3 && c.y1 - pt.y < 6) {
      ledge = true;
      target.set(pt.x, c.y1 + 0.2, pt.z).addScaledVector(n, 0.6);
    } else if (n.y > 0.7) {
      target.y += 1.2;
    }
    return { point: pt, normal: n, target, ledge };
  }

  tryZip(cam) {
    const z = this.findZip(cam);
    if (!z) { this.noAnchor = 0.5; return; }
    if (this.state === 'swing') this.web.release();
    this.state = 'zip';
    this.zip.target.copy(z.target);
    this.zip.normal.copy(z.normal);
    this.zip.ledge = z.ledge;
    this.zip.t = 0;
    this.anchor.copy(z.ledge ? z.target : z.point);
    this.web.attach(z.ledge ? _c.copy(z.target).addScaledVector(z.normal, -0.6) : z.point, z.normal);
    this.webSide = 'R';
    this.audio.thwip(1.2);
    this.gestureT = 0.4;
  }

  wallJump(cam) {
    const N = this.wallN;
    const f = cam.forwardH;
    const away = f.dot(N);
    this.v.copy(N).multiplyScalar(9).addScaledVector(UP, 8);
    if (away > 0.2) this.v.addScaledVector(f, 7);
    this.state = 'air';
    this.wallCooldown = 0.35;
    this.flipT = FLIP_DUR * 0.9;
    this.audio.jump(0.7);
  }

  // ----------------------------------------------------------------- physics
  step(h, wish) {
    const v = this.v, p = this.p;
    switch (this.state) {
      case 'ground': {
        const a = 1 - Math.exp(-(wish.lengthSq() > 0.01 ? 9 : 12) * h);
        const run = this.charging ? RUN * 0.2 : RUN;
        v.x += (wish.x * run - v.x) * a;
        v.z += (wish.z * run - v.z) * a;
        v.y = Math.min(v.y, 0) - G * h;
        p.addScaledVector(v, h);
        this.collide(h);
        break;
      }
      case 'air': {
        v.y -= G * h;
        const k = this.diving ? K_DIVE : K_AIR;
        const s = v.length();
        v.addScaledVector(v, -k * s * h);
        if (this.diving) v.y -= 12 * h;
        // limited air control
        const along = v.x * wish.x + v.z * wish.z;
        if (along < 16) v.addScaledVector(wish, 7 * h);
        p.addScaledVector(v, h);
        this.collide(h);
        break;
      }
      case 'swing': {
        this.webT += h;
        v.y -= G * h;
        const s = v.length();
        v.addScaledVector(v, -K_SWING * s * h);
        const rope = _b.subVectors(p, this.anchor);
        const len = rope.length();
        const n = rope.divideScalar(len || 1);
        const taut = this.webT > 0.12 && len >= this.ropeL - 0.05;
        if (taut) {
          // Pumping: legs drive the swing tangentially.
          const wt = _c.copy(wish).addScaledVector(n, -wish.dot(n));
          v.addScaledVector(wt, PUMP * h);
          // Reel in a little so the swing has bite.
          this.ropeL = Math.max(this.ropeL0 * 0.88, this.ropeL - 3.5 * h);
        }
        p.addScaledVector(v, h);
        if (this.webT > 0.12) {
          _d.subVectors(p, this.anchor);
          const l2 = _d.length();
          if (l2 > this.ropeL) {
            _d.divideScalar(l2);
            p.copy(this.anchor).addScaledVector(_d, this.ropeL);
            const vr = v.dot(_d);
            if (vr > 0) v.addScaledVector(_d, -vr);
          }
        }
        this.collide(h);
        if (this.state !== 'swing') break;
        // Swinging above the anchor puts the web in compression: let go.
        // (Webs attached below you only let go once they have caught you.)
        if (p.y > this.anchor.y + 1.5 && this.webT > 0.5 && v.y > 0) this.releaseSwing(false);
        break;
      }
      case 'zip': {
        this.zip.t += h;
        const to = _b.subVectors(this.zip.target, p);
        const dist = to.length();
        to.divideScalar(dist || 1);
        const sp = Math.min(ZIP_SPEED, 12 + this.zip.t * 90);
        v.lerp(_c.copy(to).multiplyScalar(sp), 1 - Math.exp(-8 * h));
        p.addScaledVector(v, h);
        if (dist < 2.2) { this.arriveZip(); break; }
        if (this.zip.t > 4) { this.state = 'air'; this.web.release(); break; }
        this.collide(h);
        break;
      }
      case 'wall': this.wallStep(h, wish); break;
    }

    // Stay on the island
    if (p.x < ISLAND.minX + 1) { p.x = ISLAND.minX + 1; v.x = Math.max(0, v.x); }
    if (p.x > ISLAND.maxX - 1) { p.x = ISLAND.maxX - 1; v.x = Math.min(0, v.x); }
    if (p.z < ISLAND.minZ + 1) { p.z = ISLAND.minZ + 1; v.z = Math.max(0, v.z); }
    if (p.z > ISLAND.maxZ - 1) { p.z = ISLAND.maxZ - 1; v.z = Math.min(0, v.z); }
  }

  arriveZip() {
    this.web.release();
    if (this.zip.ledge) {
      // Point launch: vault up and over the ledge.
      this.v.copy(this.zip.normal).multiplyScalar(-6).addScaledVector(UP, 15);
      this.state = 'air';
      this.flipT = FLIP_DUR;
      this.audio.jump(1);
    } else if (Math.abs(this.zip.normal.y) < 0.3) {
      this.enterWall(this.zip.normal);
    } else {
      this.v.multiplyScalar(0.2);
      this.state = 'air';
    }
  }

  enterWall(n) {
    this.state = 'wall';
    this.wallN.set(n.x, 0, n.z).normalize();
    this.v.set(0, Math.max(0, Math.min(this.v.y, 8)), 0);
    if (this.web.active) this.web.release();
  }

  wallStep(h, wish) {
    const N = this.wallN, p = this.p, v = this.v;
    const side = _b.set(N.z, 0, -N.x);
    const mv = this.moveIn;
    // map screen-relative input onto the wall
    const camRight = this.camRight || side;
    const s = Math.sign(camRight.dot(side)) || 1;
    const target = _c.set(0, 0, 0).addScaledVector(UP, mv.y * CLIMB).addScaledVector(side, mv.x * s * CLIMB * 0.8);
    v.lerp(target, 1 - Math.exp(-12 * h));
    p.addScaledVector(v, h);
    this.crawlPhase += v.length() * h * 2.2;

    // stick to the wall
    const o = _d.set(p.x, p.y + 0.2, p.z);
    const hit = this.col.raycast(o, N.clone().negate(), 1.6);
    if (hit && Math.abs(hit.normal.y) < 0.3) {
      N.set(hit.normal.x, 0, hit.normal.z).normalize();
      const err = 0.48 - hit.t;
      p.addScaledVector(N, err);
    } else {
      // No wall at chest height: we are at the top edge or around a corner.
      const low = this.col.raycast(_d.set(p.x, p.y - 0.7, p.z), N.clone().negate(), 1.8);
      if (low && (mv.y > 0.1 || v.y > 0.5)) {
        v.copy(N).multiplyScalar(-4.5).addScaledVector(UP, 9.5);
        this.flipT = 0;
      }
      this.state = 'air';
      this.wallCooldown = 0.3;
      return;
    }
    if (p.y - FEET <= 0.02 && mv.y < 0) { this.state = 'ground'; p.y = FEET; }
    this.collide(h, true);
  }

  // ------------------------------------------------------------- collisions
  collide(h, onWall = false) {
    const p = this.p, v = this.v;
    const contacts = this.contacts;
    contacts.length = 0;
    const cb = n => contacts.push(n.x, n.y, n.z);
    for (const [off, step] of [[OFF_LO, 0.55], [OFF_HI, 0]]) {
      _c.set(p.x, p.y + off, p.z);
      this.col.resolveSphere(_c, R, cb, step);
      p.set(_c.x, _c.y - off, _c.z);
    }
    if (p.y < FEET) { p.y = FEET; contacts.push(0, 1, 0); }

    let ground = false, wall = null;
    const preVy = v.y;
    for (let i = 0; i < contacts.length; i += 3) {
      const nx = contacts[i], ny = contacts[i + 1], nz = contacts[i + 2];
      const vn = v.x * nx + v.y * ny + v.z * nz;
      if (vn < 0) { v.x -= nx * vn; v.y -= ny * vn; v.z -= nz * vn; }
      if (ny > 0.7) ground = true;
      else if (Math.abs(ny) < 0.3) wall = [nx, nz, -vn];
    }
    if (onWall) return;

    if (ground) {
      this.coyote = 0.12;
      if (this.state === 'air' || this.state === 'zip' || this.state === 'swing') {
        const impact = -preVy;
        if (this.state !== 'air') this.web.release();
        this.state = 'ground';
        this.flipT = 0;
        if (impact > 24) { this.landT = 0.5; this.shake = Math.min(1, impact / 45); this.audio.land(1); }
        else if (impact > 11) { this.landT = 0.18; this.audio.land(0.5); }
        this.lastImpact = impact;
      }
    } else if (this.state === 'ground') {
      this.coyote -= h;
      if (this.coyote <= 0) this.state = 'air';
    }

    if (wall && this.wallCooldown <= 0) {
      const n = _d.set(wall[0], 0, wall[1]);
      const into = wall[2];
      const wishInto = this.wish ? -this.wish.dot(n) : 0;
      if (this.state === 'ground' && wishInto > 0.6) this.enterWall(n);
      else if ((this.state === 'air' && (into > 3 || wishInto > 0.6)) ||
        (this.state === 'swing' && into > 7) || this.state === 'zip') {
        if (this.state === 'zip' && this.zip.ledge) { this.arriveZip(); return; }
        if (into > 30) this.shake = Math.min(1, into / 60);
        this.enterWall(n);
      }
    }
  }

  // -------------------------------------------------------------- animation
  animate(dt) {
    const hero = this.hero, v = this.v;
    const hs = Math.hypot(v.x, v.z);
    if (hs > 1) this.facing.set(v.x / hs, 0, v.z / hs);
    const a = { state: 'idle', speed: hs, phase: 0, webSide: this.webSide, gesture: this.gestureT > 0 ? 1 : 0, anchor: this.anchor };

    const fwd = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let flipAngle = 0;
    let rate = 10;

    switch (this.state) {
      case 'ground': {
        if (this.landT > 0) a.state = 'land';
        else if (this.charging && this.charge > 0.14) a.state = 'crouch';
        else if (hs > 0.8) { a.state = 'run'; this.runPhase += dt * (5 + hs * 0.55); a.phase = this.runPhase; }
        fwd.copy(this.facing);
        break;
      }
      case 'air': {
        if (this.flipT > 0) {
          a.state = 'flip';
          flipAngle = (1 - this.flipT / FLIP_DUR) * Math.PI * 2;
          fwd.copy(this.facing);
        } else if (this.diving || v.y < -30) {
          a.state = 'dive';
          up.copy(v).normalize();
          fwd.set(0, -1, 0).addScaledVector(up, up.y).normalize();
          if (fwd.lengthSq() < 0.01) fwd.copy(this.facing);
        } else if (v.y > 2) {
          a.state = 'rise';
          fwd.copy(this.facing);
        } else {
          a.state = 'fall';
          fwd.copy(this.facing);
          // pitch the body toward horizontal as the fall speeds up (skydiving)
          const pitch = Math.min(1, -v.y / 35) * 1.0;
          up.set(0, Math.cos(pitch), 0).addScaledVector(this.facing, Math.sin(pitch));
          fwd.set(0, -Math.sin(pitch), 0).addScaledVector(this.facing, Math.cos(pitch));
        }
        break;
      }
      case 'swing': {
        a.state = 'swing';
        up.subVectors(this.anchor, this.p).normalize();
        fwd.copy(v).addScaledVector(up, -v.dot(up));
        if (fwd.lengthSq() < 0.5) fwd.copy(this.facing).addScaledVector(up, -this.facing.dot(up));
        fwd.normalize();
        a.legSwing = v.dot(fwd) / 30 * Math.sign(v.y + 0.001) * -1;
        rate = 12;
        break;
      }
      case 'zip': {
        a.state = 'zip';
        up.subVectors(this.zip.target, this.p).normalize();
        fwd.set(0, -1, 0).addScaledVector(up, up.y).normalize();
        if (Math.abs(up.y) > 0.95 || fwd.lengthSq() < 0.01) fwd.copy(this.facing);
        break;
      }
      case 'wall': {
        a.state = 'wall';
        a.phase = this.crawlPhase;
        a.speed = v.length();
        fwd.copy(this.wallN).negate();
        up.set(0, 1, 0);
        break;
      }
    }

    // orthonormal body basis: x = left, y = up, z = forward
    const left = new THREE.Vector3().crossVectors(up, fwd);
    if (left.lengthSq() < 1e-6) left.set(1, 0, 0);
    left.normalize();
    fwd.crossVectors(left, up).normalize();
    _m.makeBasis(left, up, fwd);
    _q.setFromRotationMatrix(_m);
    this.bodyQ.slerp(_q, 1 - Math.exp(-rate * dt));
    const q = this.hero.root.quaternion.copy(this.bodyQ);
    if (flipAngle) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), flipAngle));
    this.hero.root.position.copy(this.p);
    if (this.state === 'wall') this.hero.root.position.addScaledVector(this.wallN, -0.12);
    this.hero.animate(dt, a);
    this.hero.root.updateMatrixWorld(true);
    this.hero.handWorld(this.webSide, this.hand);

    // web strand
    const slack = this.state === 'swing' ? Math.max(0, this.ropeL - this.p.distanceTo(this.anchor)) : 0;
    this.web.update(dt, this.hand, slack);
    if (this.noAnchor > 0) this.noAnchor -= dt;
  }
}
