// Web Audio API Synthesizer for authentic wooden board game sound effects
class SoundSystem {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;

  constructor() {
    const saved = localStorage.getItem('yayi_sound_enabled');
    if (saved !== null) {
      this.enabled = saved === 'true';
    }
  }

  private getContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public toggle(): boolean {
    this.enabled = !this.enabled;
    localStorage.setItem('yayi_sound_enabled', String(this.enabled));
    if (this.enabled) {
      this.playSelect();
    }
    return this.enabled;
  }

  // Subtle noise burst helper for crisp stone taps, wood snaps, and warfront blasts
  private playFilteredNoise(
    ctx: AudioContext,
    startTime: number,
    duration: number,
    filterType: BiquadFilterType,
    freqStart: number,
    freqEnd: number,
    q: number,
    volume: number
  ): void {
    const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.setValueAtTime(q, startTime);
    filter.frequency.setValueAtTime(freqStart, startTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), startTime + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    src.start(startTime);
    src.stop(startTime + duration + 0.01);
  }

  // ==================== 1. GOMOKU (云子点水 · 清脆石木鸣) ====================

  public playGomokuPlace(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Crisp slate-on-wood transient snap
    this.playFilteredNoise(ctx, now, 0.022, 'bandpass', 2400, 1100, 2.2, 0.24);

    // High crystalline stone click
    const hiOsc = ctx.createOscillator();
    const hiGain = ctx.createGain();
    hiOsc.type = 'sine';
    hiOsc.frequency.setValueAtTime(980, now);
    hiOsc.frequency.exponentialRampToValueAtTime(340, now + 0.055);
    hiGain.gain.setValueAtTime(0.22, now);
    hiGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    hiOsc.connect(hiGain);
    hiGain.connect(ctx.destination);
    hiOsc.start(now);
    hiOsc.stop(now + 0.065);

    // Warm wooden table resonance
    const woodOsc = ctx.createOscillator();
    const woodGain = ctx.createGain();
    woodOsc.type = 'triangle';
    woodOsc.frequency.setValueAtTime(240, now);
    woodOsc.frequency.exponentialRampToValueAtTime(135, now + 0.055);
    woodGain.gain.setValueAtTime(0.14, now);
    woodGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    woodOsc.connect(woodGain);
    woodGain.connect(ctx.destination);
    woodOsc.start(now);
    woodOsc.stop(now + 0.065);
  }

  public playGomokuWin(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      gain.gain.setValueAtTime(0.18, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.46);
    });
  }

  // ==================== 2. XIANGQI (木雕拍案 · 沉厚叩木鸣) ====================

  public playXiangqiMove(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Heavy mahogany piece body thud
    const bodyOsc = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(260, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(80, now + 0.095);
    bodyGain.gain.setValueAtTime(0.36, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    bodyOsc.connect(bodyGain);
    bodyGain.connect(ctx.destination);
    bodyOsc.start(now);
    bodyOsc.stop(now + 0.11);

    // Carved wood rim snap
    this.playFilteredNoise(ctx, now, 0.032, 'bandpass', 1250, 480, 1.8, 0.2);
  }

  public playXiangqiCapture(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Double wood-on-wood strike ("Pa-Dong")
    [
      { offset: 0, fStart: 390, fEnd: 115, vol: 0.28 },
      { offset: 0.055, fStart: 215, fEnd: 62, vol: 0.42 },
    ].forEach((hit) => {
      const t = now + hit.offset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(hit.fStart, t);
      osc.frequency.exponentialRampToValueAtTime(hit.fEnd, t + 0.115);
      gain.gain.setValueAtTime(hit.vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.125);

      this.playFilteredNoise(ctx, t, 0.03, 'bandpass', 1500, 520, 1.5, 0.24);
    });
  }

  public playXiangqiCheck(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // War drum thud
    const drum = ctx.createOscillator();
    const drumGain = ctx.createGain();
    drum.type = 'sine';
    drum.frequency.setValueAtTime(125, now);
    drum.frequency.exponentialRampToValueAtTime(52, now + 0.22);
    drumGain.gain.setValueAtTime(0.35, now);
    drumGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    drum.connect(drumGain);
    drumGain.connect(ctx.destination);
    drum.start(now);
    drum.stop(now + 0.25);

    // Resonant brass gong / bell partials
    [440, 659.25, 880].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now + 0.02);
      gain.gain.setValueAtTime(idx === 0 ? 0.2 : 0.11, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + 0.02);
      osc.stop(now + 0.44);
    });
  }

  // ==================== 3. JUNQI (沙盘翻牌 · 战火交锋声) ====================

  public playJunqiFlip(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    this.playFilteredNoise(ctx, now, 0.025, 'highpass', 1800, 3200, 1.0, 0.16);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(760, now + 0.07);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playJunqiMove(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Crisp tactical march stamp
    this.playFilteredNoise(ctx, now, 0.024, 'bandpass', 1900, 720, 2.0, 0.2);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(145, now + 0.052);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.056);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  public playJunqiClash(outcome: 'WIN' | 'LOSS' | 'BOMB'): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    if (outcome === 'BOMB') {
      // Low-pass filtered explosion noise sweep + sub-bass boom
      this.playFilteredNoise(ctx, now, 0.34, 'lowpass', 920, 110, 1.2, 0.4);
      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(115, now);
      sub.frequency.exponentialRampToValueAtTime(34, now + 0.28);
      subGain.gain.setValueAtTime(0.42, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      sub.connect(subGain);
      subGain.connect(ctx.destination);
      sub.start(now);
      sub.stop(now + 0.32);
      return;
    }

    if (outcome === 'WIN') {
      // Sharp clash + short triumphant military interval
      this.playFilteredNoise(ctx, now, 0.045, 'bandpass', 1600, 600, 1.4, 0.25);
      [523.25, 659.25].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + 0.03 + idx * 0.06);
        gain.gain.setValueAtTime(0.18, now + 0.03 + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22 + idx * 0.06);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + 0.03 + idx * 0.06);
        osc.stop(now + 0.24 + idx * 0.06);
      });
      return;
    }

    // LOSS: muted descending tactical thud
    this.playFilteredNoise(ctx, now, 0.05, 'lowpass', 680, 180, 1.0, 0.22);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(195, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.15);
    gain.gain.setValueAtTime(0.26, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  // Crisp wooden tap when selecting a piece
  public playSelect(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(280, now + 0.045);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.05);
  }

  // Legacy aliases delegating cleanly
  public playMove(): void {
    this.playXiangqiMove();
  }

  public playCapture(): void {
    this.playXiangqiCapture();
  }

  public playFlip(): void {
    this.playJunqiFlip();
  }

  public playCheck(): void {
    this.playXiangqiCheck();
  }

  // Oriental pentatonic arpeggio for Victory
  public playVictory(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Gong, Shang, Jue, Zhi, Yu (C5, D5, E5, G5, C6)
    const notes = [523.25, 587.33, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);

      gain.gain.setValueAtTime(0.2, now + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 0.46);
    });
  }
}

export const soundFX = new SoundSystem();
