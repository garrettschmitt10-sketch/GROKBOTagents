export class Sfx {
  private ctx: AudioContext | null = null;
  private muted = false;
  private master = 0.2;

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
    f.frequency.value = 700;
    src.connect(f);
    f.connect(g);
    g.connect(ctx.destination);
    src.start(t0);
  }

  click(): void {
    this.tone(420, 0.06, "square", 0.07);
  }
  deploy(): void {
    this.tone(140, 0.1, "triangle", 0.14);
    this.noise(0.09, 0.1);
  }
  hit(): void {
    this.tone(180, 0.05, "square", 0.07);
  }
  spell(kind: "barrage" | "smoke"): void {
    if (kind === "smoke") {
      this.noise(0.32, 0.12);
      this.tone(220, 0.22, "sine", 0.06, 0, 90);
    } else {
      this.noise(0.28, 0.22);
      this.tone(80, 0.3, "sawtooth", 0.14, 0, 40);
    }
  }
  tower(): void {
    this.tone(120, 0.14, "sine", 0.12);
  }
  win(): void {
    this.tone(392, 0.16, "triangle", 0.12, 0);
    this.tone(523, 0.16, "triangle", 0.12, 0.12);
    this.tone(659, 0.32, "triangle", 0.14, 0.24);
  }
  lose(): void {
    this.tone(220, 0.28, "sawtooth", 0.09, 0, 90);
  }
  overtime(): void {
    this.tone(620, 0.1, "square", 0.08);
    this.tone(620, 0.1, "square", 0.08, 0.16);
  }
}
