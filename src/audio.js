// Synthesized sound: wind that rises with speed, web "thwips", jumps and
// landings. Nothing is loaded from disk.
export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = b * 3; }
    this.noise = buf;

    const white = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const w = white.getChannelData(0);
    for (let i = 0; i < w.length; i++) w[i] = Math.random() * 2 - 1;
    this.white = white;

    // Wind bed
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 400;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    src.connect(this.windFilter).connect(this.windGain).connect(this.master);
    src.start();

    // City ambience: low rumble
    const amb = ctx.createBufferSource();
    amb.buffer = buf; amb.loop = true; amb.playbackRate.value = 0.5;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
    this.ambGain = ctx.createGain(); this.ambGain.gain.value = 0.12;
    amb.connect(lp).connect(this.ambGain).connect(this.master);
    amb.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  wind(speed, height) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = Math.min(1, speed / 60);
    this.windGain.gain.setTargetAtTime(s * s * 0.9, t, 0.1);
    this.windFilter.frequency.setTargetAtTime(250 + s * 1600, t, 0.1);
    this.ambGain.gain.setTargetAtTime(0.14 * Math.max(0.15, 1 - height / 250), t, 0.3);
  }

  _burst(freq, q, dur, gain, type = 'bandpass', sweep = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const f = ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  thwip(pitch = 1) {
    this._burst(3200 * pitch, 4, 0.16, 0.5, 'bandpass', 0.35);
    this._burst(900 * pitch, 2, 0.08, 0.25, 'bandpass', 2);
  }

  jump(s = 1) { this._burst(500, 1, 0.25, 0.18 * s, 'lowpass', 0.3); }

  hit(s = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(180 * s, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.2);
    this._burst(1200, 0.8, 0.07, 0.5 * s, 'bandpass', 0.4);
  }

  swish() { this._burst(1800, 1.2, 0.14, 0.18, 'bandpass', 0.45); }

  rip() { this._burst(2600, 2, 0.35, 0.3, 'bandpass', 0.3); }

  land(s = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.6 * s, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.45);
    this._burst(300, 0.7, 0.3, 0.4 * s, 'lowpass', 0.2);
  }
}
