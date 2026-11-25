export class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.noiseBuf = null;
    this.thrustNode = null;
    this.thrustGain = null;
    this.thrustPlaying = false;
  }
  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.master.gain.value = 0.5;
    this._makeNoise();
  }
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
  setMute(m) {
    this.muted = !!m;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    if (this.thrustPlaying) {
      this.thrustGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.15);
    }
  }
  _makeNoise() {
    if (!this.ctx) return;
    const len = this.ctx.sampleRate * 0.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  _play(type, f0, f1, dur, vol = 0.12) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.linearRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
  _noiseBurst(dur, vol = 0.15, lowpass = true) {
    if (this.muted || !this.ctx || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const f = lowpass ? this.ctx.createBiquadFilter() : null;
    if (f) {
      f.type = 'lowpass';
      f.frequency.value = 1200;
      src.connect(f);
      f.connect(g);
    } else src.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }
  playFire() { this._play('square', 700, 180, 0.10, 0.14); }
  playThrustStart() {
    if (this.muted || !this.ctx || this.thrustPlaying) return;
    this.thrustPlaying = true;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    this.thrustNode = src;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 450;
    const g = this.ctx.createGain();
    this.thrustGain = g;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.12);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
  }
  playThrustStop() {
    if (!this.thrustPlaying) return;
    this.thrustPlaying = false;
    const t = this.ctx.currentTime;
    if (this.thrustGain) this.thrustGain.gain.linearRampToValueAtTime(0, t + 0.15);
    if (this.thrustNode) this.thrustNode.stop(t + 0.2);
    this.thrustNode = null;
    this.thrustGain = null;
  }
  playExplosion(size) {
    const dur = 0.22 + (3 - size) * 0.06;
    const vol = 0.16 + (3 - size) * 0.06;
    this._noiseBurst(dur, vol, true);
    this._play('sawtooth', 150 - size * 30, 40, dur * 0.7, 0.10);
  }
  playShipDie() {
    this._noiseBurst(0.5, 0.2, false);
    this._play('sawtooth', 200, 60, 0.5, 0.12);
  }
  playExtraLife() {
    this._play('square', 800, 1200, 0.12, 0.12);
    this._play('square', 1200, 1600, 0.12, 0.12);
  }
  playLevelStart() {
    this._play('square', 400, 400, 0.1, 0.1);
    this._play('square', 500, 500, 0.1, 0.1);
    this._play('square', 650, 650, 0.1, 0.1);
  }
  playHyperspace() {
    this._noiseBurst(0.25, 0.12, true);
    this._play('sine', 80, 400, 0.2, 0.15);
  }
  playUfoHit() {
    this._play('square', 300, 80, 0.15, 0.1);
  }
}

export const audio = new AudioSys();