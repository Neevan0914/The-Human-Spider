// Keyboard + mouse (pointer lock) and a simple touch layout.
export class Input {
  constructor(dom) {
    this.dom = dom;
    this.keys = new Set();
    this.edges = new Set();
    this.look = { x: 0, y: 0 };
    this.mouseL = false; this.mouseR = false;
    this.touch = { move: { x: 0, y: 0 }, swing: false, jump: false, zip: false, dive: false };
    this.locked = false;

    addEventListener('keydown', e => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.edges.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouseL = this.mouseR = false; });
    dom.addEventListener('mousedown', e => {
      if (e.button === 0) { this.mouseL = true; this.edges.add('Mouse0'); }
      if (e.button === 2) { this.mouseR = true; this.edges.add('Mouse2'); }
      if (e.button === 1) { e.preventDefault(); this.edges.add('Mouse1'); }
    });
    addEventListener('mouseup', e => {
      if (e.button === 0) this.mouseL = false;
      if (e.button === 2) this.mouseR = false;
    });
    dom.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mousemove', e => {
      if (!this.locked) return;
      this.look.x += e.movementX;
      this.look.y += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
    });
    this._touchSetup();
  }

  requestLock() {
    try {
      const p = this.dom.requestPointerLock && this.dom.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch { /* pointer lock unavailable */ }
  }

  _touchSetup() {
    const pad = document.getElementById('touch');
    if (!pad) return;
    const stick = document.getElementById('stick');
    const knob = document.getElementById('knob');
    let stickId = null, lookId = null, sx = 0, sy = 0, lx = 0, ly = 0;
    const rect = () => stick.getBoundingClientRect();
    addEventListener('touchstart', e => {
      for (const t of e.changedTouches) {
        const btn = t.target.closest && t.target.closest('[data-act]');
        if (btn) { const a = btn.dataset.act; this.touch[a] = true; this.edges.add('T_' + a); btn.dataset.id = t.identifier; continue; }
        const r = rect();
        if (stickId === null && t.clientX < innerWidth * 0.45 && t.clientY > innerHeight * 0.35) {
          stickId = t.identifier; sx = r.left + r.width / 2; sy = r.top + r.height / 2;
        } else if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
      }
    }, { passive: true });
    addEventListener('touchmove', e => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          let dx = (t.clientX - sx) / 50, dy = (t.clientY - sy) / 50;
          const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
          this.touch.move.x = dx; this.touch.move.y = -dy;
          knob.style.transform = `translate(${dx * 36}px, ${dy * 36}px)`;
        } else if (t.identifier === lookId) {
          this.look.x += (t.clientX - lx) * 2.2; this.look.y += (t.clientY - ly) * 2.2;
          lx = t.clientX; ly = t.clientY;
        }
      }
    }, { passive: true });
    const end = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) { stickId = null; this.touch.move.x = this.touch.move.y = 0; knob.style.transform = ''; }
        if (t.identifier === lookId) lookId = null;
        document.querySelectorAll('[data-act]').forEach(b => { if (b.dataset.id == t.identifier) { this.touch[b.dataset.act] = false; b.dataset.id = ''; } });
      }
    };
    addEventListener('touchend', end);
    addEventListener('touchcancel', end);
  }

  down(code) { return this.keys.has(code); }
  tapped(code) { return this.edges.has(code); }

  move() {
    let x = 0, y = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    x += this.touch.move.x; y += this.touch.move.y;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  swingHeld() { return this.mouseL || this.down('ShiftLeft') || this.down('ShiftRight') || this.touch.swing; }
  swingPressed() { return this.tapped('Mouse0') || this.tapped('ShiftLeft') || this.tapped('ShiftRight') || this.tapped('T_swing'); }
  jumpHeld() { return this.down('Space') || this.touch.jump; }
  jumpPressed() { return this.tapped('Space') || this.tapped('T_jump'); }
  zipPressed() { return this.tapped('Mouse2') || this.tapped('KeyE') || this.tapped('T_zip'); }
  meleePressed() { return this.tapped('KeyF') || this.tapped('T_hit'); }
  webShotPressed() { return this.tapped('KeyQ') || this.tapped('Mouse1'); }
  // Removes a press so later handlers in the same frame don't see it.
  consume(...codes) { for (const c of codes) this.edges.delete(c); }
  diveHeld() { return this.down('KeyC') || this.down('ControlLeft') || this.touch.dive; }

  endFrame() {
    this.edges.clear();
    this.look.x = 0; this.look.y = 0;
  }
}
