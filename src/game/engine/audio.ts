/**
 * Tiny synthesized sound kit — no audio files. Everything sounds like the
 * computer itself: mouse clicks, key clacks, error buzzes, notification chimes.
 * `M` toggles mute.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;
  private lastShot = 0;

  /** Must be called from a user gesture (first click) to satisfy autoplay rules. */
  unlock(): void {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.32;
        this.master.connect(this.ctx.destination);
        const len = Math.floor(this.ctx.sampleRate * 0.5);
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch {
        return;
      }
    }
    void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.32;
    return this.muted;
  }

  close(): void {
    void this.ctx?.close();
    this.ctx = null;
  }

  private get ready(): AudioContext | null {
    return this.ctx && this.ctx.state === 'running' && !this.muted ? this.ctx : null;
  }

  private burst(freq: number, q: number, dur: number, gain: number, type: BiquadFilterType = 'bandpass', at = 0): void {
    const ctx = this.ready;
    if (!ctx || !this.noise || !this.master) return;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.3, dur + 0.02);
  }

  private tone(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', at = 0, slideTo?: number): void {
    const ctx = this.ready;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Mouse click. */
  shoot(): void {
    const now = performance.now();
    if (now - this.lastShot < 45) return;
    this.lastShot = now;
    this.burst(3800 + Math.random() * 800, 6, 0.025, 0.5);
    this.tone(2200, 0.02, 0.05, 'square');
  }

  /** Key clack. */
  hit(): void {
    this.burst(1600 + Math.random() * 900, 3, 0.04, 0.35);
  }

  /** Scissors snip + paper tear. */
  cut(big: boolean): void {
    this.burst(5200, 2, 0.05, 0.4, 'highpass');
    this.burst(900, 0.8, big ? 0.28 : 0.14, big ? 0.55 : 0.3, 'lowpass', 0.03);
    if (big) this.tone(110, 0.25, 0.5, 'sine', 0, 45);
  }

  /** System error buzz. */
  hurt(): void {
    this.tone(140, 0.2, 0.25, 'square');
    this.tone(147, 0.2, 0.18, 'sawtooth');
  }

  /** Notification chime. */
  wave(): void {
    this.tone(880, 0.12, 0.18, 'triangle');
    this.tone(1320, 0.22, 0.16, 'triangle', 0.09);
  }

  dash(): void {
    this.burst(2400, 0.7, 0.12, 0.25, 'bandpass');
  }

  victory(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, 0.2, 'triangle', i * 0.09));
  }

  defeat(): void {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.4, 0.2, 'square', i * 0.13));
  }
}
