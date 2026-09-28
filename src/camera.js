// Third-person orbit camera with collision, speed-based FOV and auto-follow.
import * as THREE from 'three';

export class ThirdPersonCamera {
  constructor(camera, col) {
    this.camera = camera;
    this.col = col;
    this.yaw = 0;
    this.pitch = 0.12;
    this.dist = 5.5;
    this.target = new THREE.Vector3();
    this.forward = new THREE.Vector3(0, 0, -1);
    this.forwardH = new THREE.Vector3(0, 0, -1);
    this.rightH = new THREE.Vector3(1, 0, 0);
    this.idle = 0;
    this.fov = 70;
    this.shakeT = 0;
    this.sens = 0.0022;
    this.invertY = false;
    this._desired = new THREE.Vector3();
  }

  setYaw(dirX, dirZ) {
    this.yaw = Math.atan2(-dirX, -dirZ);
  }

  update(dt, player, look) {
    const lx = look.x, ly = look.y * (this.invertY ? -1 : 1);
    if (Math.abs(lx) + Math.abs(ly) > 0) this.idle = 0; else this.idle += dt;
    this.yaw -= lx * this.sens;
    this.pitch += ly * this.sens;
    this.pitch = Math.max(-1.25, Math.min(1.35, this.pitch));

    const v = player.v;
    const hs = Math.hypot(v.x, v.z);
    // Drift behind the direction of travel when the mouse is idle.
    if (this.idle > 1.0 && hs > 8 && player.state !== 'wall') {
      const want = Math.atan2(-v.x, -v.z);
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * (1 - Math.exp(-dt * 1.2));
    }

    const sp = player.speed;
    const tgt = player.p;
    const k = 1 - Math.exp(-dt * 18);
    this.target.lerp(new THREE.Vector3(tgt.x, tgt.y + 0.75, tgt.z), k);
    if (this.target.distanceTo(tgt) > 20) this.target.set(tgt.x, tgt.y + 0.75, tgt.z);

    const cp = Math.cos(this.pitch), spch = Math.sin(this.pitch);
    const f = this.forward.set(-Math.sin(this.yaw) * cp, -spch, -Math.cos(this.yaw) * cp);
    this.forwardH.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.rightH.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const wantDist = 5.2 + Math.min(4.5, sp * 0.06) + (player.state === 'wall' ? 0.8 : 0);
    this.dist += (wantDist - this.dist) * (1 - Math.exp(-dt * 3));
    const shoulder = 0.55;
    const pivot = _p.copy(this.target).addScaledVector(this.rightH, shoulder);
    const back = _b.copy(f).negate();
    let d = this.dist;
    const hit = this.col.raycast(pivot, back, d + 0.4);
    if (hit) d = Math.max(0.6, hit.t - 0.4);
    if (pivot.y + back.y * d < 0.5) d = Math.max(0.6, (pivot.y - 0.5) / Math.max(0.01, -back.y));
    const cam = this.camera;
    cam.position.copy(pivot).addScaledVector(back, d);

    // shake from hard landings
    if (player.shake > 0) { this.shakeT = Math.max(this.shakeT, player.shake * 0.45); player.shake = 0; }
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const s = this.shakeT * 0.6;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
    }
    cam.lookAt(_l.copy(cam.position).add(f));

    const fovT = 68 + Math.max(0, Math.min(24, (sp - 12) * 0.45));
    this.fov += (fovT - this.fov) * (1 - Math.exp(-dt * 3));
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }
}

const _p = new THREE.Vector3(), _b = new THREE.Vector3(), _l = new THREE.Vector3();
