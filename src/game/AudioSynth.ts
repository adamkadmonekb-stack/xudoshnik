// ============================================================
// AudioSynth — весь звук синтезируется Web Audio API.
// Без внешних файлов: скрип кисти, звонок, курьер, монеты, лоу-фай музыка.
// ============================================================

export class AudioSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicNodes: { stop: () => void } | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch { this.ctx = null; }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, opts: { slide?: number; delay?: number } = {}) {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + (opts.delay ?? 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, vol: number, freq: number, q = 1, type: BiquadFilterType = 'bandpass', delay = 0) {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  // ---------- игровые звуки ----------
  stroke(intensity = 0.5) { this.noise(0.06 + intensity * 0.05, 0.02 + intensity * 0.04, 1600 + Math.random() * 1800, 0.8); }
  dip() { this.tone(660, 0.07, 'sine', 0.12); this.tone(880, 0.06, 'sine', 0.08, { delay: 0.05 }); }
  pop() { this.tone(320, 0.09, 'triangle', 0.16, { slide: 560 }); }
  error() { this.tone(180, 0.2, 'sawtooth', 0.1); this.tone(140, 0.22, 'sawtooth', 0.09, { delay: 0.12 }); }
  coin() { this.tone(920, 0.08, 'square', 0.07); this.tone(1380, 0.14, 'square', 0.06, { delay: 0.07 }); }
  cash() { this.coin(); this.tone(1840, 0.12, 'square', 0.05, { delay: 0.14 }); }
  click() { this.tone(520, 0.04, 'square', 0.06); }
  hover() { this.tone(760, 0.03, 'sine', 0.03); }
  doorbell() {
    this.tone(830, 0.5, 'sine', 0.14);
    this.tone(660, 0.6, 'sine', 0.12, { delay: 0.25 });
    this.tone(830, 0.5, 'sine', 0.12, { delay: 0.55 });
  }
  knock() { this.noise(0.08, 0.2, 300, 1, 'lowpass'); this.noise(0.08, 0.2, 280, 1, 'lowpass', 0.22); }
  mailDing() { this.tone(1180, 0.1, 'sine', 0.1); this.tone(1560, 0.16, 'sine', 0.08, { delay: 0.09 }); }
  meow() { this.tone(620, 0.28, 'sawtooth', 0.05, { slide: 900 }); this.tone(880, 0.2, 'sawtooth', 0.04, { delay: 0.2, slide: 500 }); }
  levelUp() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.12, { delay: i * 0.09 }));
  }
  applause() {
    for (let i = 0; i < 14; i++) this.noise(0.05, 0.06 + Math.random() * 0.06, 2400 + Math.random() * 2000, 0.7, 'bandpass', i * 0.06 + Math.random() * 0.03);
  }

  // ---------- лоу-фай музыка ----------
  startMusic() {
    if (!this.ctx || !this.master || this.musicNodes) return;
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    g.connect(this.master);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    lp.connect(g);
    // виниловый треск
    const crackle = ctx.createBufferSource();
    crackle.buffer = this.noiseBuf;
    crackle.loop = true;
    const cf = ctx.createBiquadFilter();
    cf.type = 'highpass'; cf.frequency.value = 5000;
    const cg = ctx.createGain();
    cg.gain.value = 0.012;
    crackle.connect(cf).connect(cg).connect(this.master);
    crackle.start();
    // аккорды: Fmaj7 → Am7 → Dm7 → Bbmaj7
    const chords = [
      [174.6, 220, 261.6, 329.6],
      [220, 261.6, 329.6, 392],
      [146.8, 220, 261.6, 349.2],
      [233.1, 293.7, 349.2, 440],
    ];
    let step = 0;
    const playChord = () => {
      if (!this.musicNodes) return;
      const now = ctx.currentTime;
      chords[step % chords.length].forEach((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = i === 0 ? 'triangle' : 'sine';
        osc.frequency.value = f * (i === 0 ? 0.5 : 1);
        osc.detune.value = Math.random() * 8 - 4;
        const og = ctx.createGain();
        og.gain.setValueAtTime(0.0001, now);
        og.gain.linearRampToValueAtTime(0.5, now + 0.6);
        og.gain.exponentialRampToValueAtTime(0.0001, now + 3.6);
        osc.connect(og).connect(lp);
        osc.start(now);
        osc.stop(now + 3.8);
      });
      step++;
    };
    playChord();
    const iv = window.setInterval(playChord, 3800);
    this.musicNodes = {
      stop: () => {
        window.clearInterval(iv);
        try { crackle.stop(); } catch { /* noop */ }
        g.disconnect();
        cg.disconnect();
      },
    };
  }

  stopMusic() {
    if (this.musicNodes) { this.musicNodes.stop(); this.musicNodes = null; }
  }
}
