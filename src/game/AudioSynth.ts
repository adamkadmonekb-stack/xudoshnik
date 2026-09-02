// ============================================================
// AudioSynth — весь звук синтезируется Web Audio API, без файлов.
// ============================================================

interface ToneOpts {
  freq: number; type?: OscillatorType; dur?: number; vol?: number;
  slideTo?: number; delay?: number; attack?: number;
}

export class AudioSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private muted = false;
  private musicTimer: number | null = null;
  private nextBarTime = 0;
  private barIndex = 0;
  musicOn = false;

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.22;
    this.musicGain.connect(this.master);
    this.noiseBuf = this.makeNoise();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }

  private makeNoise(): AudioBuffer | null {
    if (!this.ctx) return null;
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private tone(o: ToneOpts) {
    if (!this.ctx || !this.master || this.muted) return;
    const t0 = this.ctx.currentTime + (o.delay || 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slideTo), t0 + (o.dur || 0.2));
    const vol = o.vol || 0.2, atk = o.attack ?? 0.008;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (o.dur || 0.2));
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + (o.dur || 0.2) + 0.05);
  }

  private noise(opts: { dur: number; vol: number; freq: number; q?: number; type?: BiquadFilterType; delay?: number }) {
    if (!this.ctx || !this.master || !this.noiseBuf || this.muted) return;
    const t0 = this.ctx.currentTime + (opts.delay || 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = opts.type || 'bandpass'; f.frequency.value = opts.freq; f.Q.value = opts.q ?? 1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(opts.vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + opts.dur + 0.05);
  }

  // ---------- Эффекты ----------
  click() { this.tone({ freq: 880, type: 'triangle', dur: 0.06, vol: 0.08 }); }
  pop() { this.tone({ freq: 420, type: 'triangle', dur: 0.09, vol: 0.14, slideTo: 660 }); }
  hover() { this.tone({ freq: 1400, type: 'sine', dur: 0.03, vol: 0.025 }); }
  brush(size = 10) { this.noise({ dur: 0.05 + size * 0.001, vol: 0.05, freq: 1800 - size * 18, q: 0.7, type: 'lowpass' }); }
  scratch() { this.noise({ dur: 0.05, vol: 0.04, freq: 5200, q: 2.5, type: 'highpass' }); }
  marker() { this.noise({ dur: 0.04, vol: 0.045, freq: 900, q: 1 }); }
  squelch() {
    this.tone({ freq: 260, type: 'sine', dur: 0.12, vol: 0.1, slideTo: 130 });
    this.noise({ dur: 0.1, vol: 0.04, freq: 700, q: 0.6 });
  }
  erase() { this.noise({ dur: 0.12, vol: 0.05, freq: 2600, q: 0.5, type: 'lowpass' }); }
  doorbell() {
    this.tone({ freq: 659.25, type: 'sine', dur: 0.5, vol: 0.22, attack: 0.01 });
    this.tone({ freq: 523.25, type: 'sine', dur: 0.7, vol: 0.22, delay: 0.16, attack: 0.01 });
  }
  knock() {
    for (let i = 0; i < 3; i++) {
      this.tone({ freq: 120, type: 'sine', dur: 0.07, vol: 0.2, delay: i * 0.14 });
      this.noise({ dur: 0.04, vol: 0.06, freq: 500, delay: i * 0.14 });
    }
  }
  cash() {
    this.tone({ freq: 1318.5, type: 'square', dur: 0.09, vol: 0.06 });
    this.tone({ freq: 1760, type: 'square', dur: 0.16, vol: 0.06, delay: 0.07 });
  }
  coin() { this.tone({ freq: 988, type: 'square', dur: 0.07, vol: 0.07 }); this.tone({ freq: 1319, type: 'square', dur: 0.2, vol: 0.07, delay: 0.06 }); }
  mailDing() { this.tone({ freq: 880, type: 'sine', dur: 0.4, vol: 0.14 }); this.tone({ freq: 1320, type: 'sine', dur: 0.35, vol: 0.1, delay: 0.1 }); }
  error() { this.tone({ freq: 220, type: 'sawtooth', dur: 0.16, vol: 0.09 }); this.tone({ freq: 160, type: 'sawtooth', dur: 0.2, vol: 0.09, delay: 0.1 }); }
  levelUp() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.25, vol: 0.12, delay: i * 0.09 }));
  }
  meow() { this.tone({ freq: 720, type: 'sawtooth', dur: 0.28, vol: 0.06, slideTo: 480 }); this.tone({ freq: 520, type: 'sawtooth', dur: 0.2, vol: 0.05, slideTo: 380, delay: 0.12 }); }
  eat() { for (let i = 0; i < 3; i++) this.noise({ dur: 0.06, vol: 0.07, freq: 800 + i * 300, delay: i * 0.12, q: 0.8 }); }
  applause() {
    for (let i = 0; i < 14; i++) this.noise({ dur: 0.05, vol: 0.05, freq: 1500 + Math.random() * 2000, delay: Math.random() * 1.4, q: 0.5 });
  }
  whoosh() { this.noise({ dur: 0.35, vol: 0.08, freq: 600, q: 0.4, type: 'lowpass' }); }
  cameraShutter() { this.noise({ dur: 0.05, vol: 0.12, freq: 3000 }); this.tone({ freq: 2000, type: 'square', dur: 0.04, vol: 0.05, delay: 0.05 }); }

  // ---------- Лоу-фай музыка ----------
  private static CHORDS: number[][] = [
    [220.0, 261.63, 329.63, 392.0],   // Am
    [174.61, 220.0, 261.63, 329.63],  // Fmaj7
    [196.0, 246.94, 293.66, 392.0],   // G
    [164.81, 196.0, 246.94, 329.63],  // Em
  ];
  private static BASS = [110.0, 87.31, 98.0, 82.41];
  private static BAR = 3.2;

  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.nextBarTime = this.ctx.currentTime + 0.2;
    this.barIndex = 0;
    // треск винила
    const crackle = this.ctx.createBufferSource();
    crackle.buffer = this.noiseBuf; crackle.loop = true;
    const cf = this.ctx.createBiquadFilter();
    cf.type = 'lowpass'; cf.frequency.value = 3200;
    const cg = this.ctx.createGain(); cg.gain.value = 0.012;
    crackle.connect(cf); cf.connect(cg); cg.connect(this.musicGain!);
    crackle.start();
    (this as any)._crackle = crackle;
    this.musicTimer = window.setInterval(() => this.schedule(), 400);
  }

  stopMusic() {
    this.musicOn = false;
    if (this.musicTimer !== null) { clearInterval(this.musicTimer); this.musicTimer = null; }
    const c = (this as any)._crackle as AudioBufferSourceNode | undefined;
    if (c) { try { c.stop(); } catch { /* noop */ } (this as any)._crackle = null; }
  }

  private schedule() {
    if (!this.ctx || !this.musicOn || !this.musicGain) return;
    while (this.nextBarTime < this.ctx.currentTime + 1.2) {
      this.playBar(this.nextBarTime, this.barIndex);
      this.nextBarTime += AudioSynth.BAR;
      this.barIndex = (this.barIndex + 1) % 4;
    }
  }

  private playBar(t0: number, idx: number) {
    const ctx = this.ctx!, out = this.musicGain!;
    const chord = AudioSynth.CHORDS[idx];
    // пэд
    chord.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      osc.detune.value = (i % 2 ? 4 : -4) + Math.sin(idx + i) * 2;
      const flt = ctx.createBiquadFilter();
      flt.type = 'lowpass'; flt.frequency.value = 1100;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.045, t0 + 0.8);
      g.gain.setValueAtTime(0.045, t0 + AudioSynth.BAR - 1.1);
      g.gain.linearRampToValueAtTime(0, t0 + AudioSynth.BAR);
      osc.connect(flt); flt.connect(g); g.connect(out);
      osc.start(t0); osc.stop(t0 + AudioSynth.BAR + 0.1);
    });
    // бас
    const bass = ctx.createOscillator();
    bass.type = 'sine'; bass.frequency.value = AudioSynth.BASS[idx];
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0, t0);
    bg.gain.linearRampToValueAtTime(0.11, t0 + 0.1);
    bg.gain.exponentialRampToValueAtTime(0.001, t0 + AudioSynth.BAR * 0.9);
    bass.connect(bg); bg.connect(out);
    bass.start(t0); bass.stop(t0 + AudioSynth.BAR);
    // хэт со свингом
    for (let b = 0; b < 4; b++) {
      const swing = b % 2 === 1 ? 0.12 : 0;
      const ht = t0 + b * (AudioSynth.BAR / 4) + swing;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 6500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(b % 2 ? 0.014 : 0.02, ht);
      g.gain.exponentialRampToValueAtTime(0.0001, ht + 0.05);
      src.connect(f); f.connect(g); g.connect(out);
      src.start(ht); src.stop(ht + 0.06);
    }
  }
}
