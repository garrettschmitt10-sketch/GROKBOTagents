export class Sfx {
  private ctx: AudioContext | null = null;
  private muted = false;
  private master = 0.22;

  private ac(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!C) return null;
      this.ctx = new C();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  unlock(): void {
    this.ac();
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain = 0.2,
    at = 0,
    slide?: number,
  ): void {
    const ctx = this.ac();
    if (!ctx) return;
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(this.master * gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, gain = 0.12, at = 0): void {
    const ctx = this.ac();
    if (!ctx) return;
    const n = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = n;
    const g = ctx.createGain();
    const t0 = ctx.currentTime + at;
    g.gain.setValueAtTime(this.master * gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 900;
    src.connect(f);
    f.connect(g);
    g.connect(ctx.destination);
    src.start(t0);
  }

  click(): void {
    this.tone(520, 0.07, "square", 0.08);
  }
  deploy(): void {
    this.tone(180, 0.12, "triangle", 0.16);
    this.noise(0.08, 0.08);
  }
  hit(): void {
    this.tone(220, 0.06, "square", 0.07);
  }
  spell(kind: "riftburst" | "frostbind"): void {
    if (kind === "frostbind") {
      this.tone(740, 0.35, "sine", 0.12, 0, 240);
    } else {
      this.noise(0.22, 0.2);
      this.tone(90, 0.28, "sawtooth", 0.14, 0, 40);
    }
  }
  tower(): void {
    this.tone(140, 0.16, "sine", 0.14);
  }
  win(): void {
    this.tone(523, 0.18, "triangle", 0.14, 0);
    this.tone(659, 0.18, "triangle", 0.14, 0.12);
    this.tone(784, 0.35, "triangle", 0.16, 0.24);
  }
  lose(): void {
    this.tone(300, 0.25, "sawtooth", 0.1, 0, 110);
  }
  overtime(): void {
    this.tone(880, 0.12, "square", 0.1);
    this.tone(880, 0.12, "square", 0.1, 0.16);
  }
}
