// ============================================================================
// CRITTER POP · 萌宠开心消消乐 — WEB AUDIO SYNTH & COMBO CHIMES
// Ascending musical scale on cascades (C5 -> D5 -> E5 -> G5 -> A5 -> C6)
// ============================================================================

const COMBO_FREQS = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.5];

class SoundManager {
  constructor() {
    this.ctx = null;
    this.sfxOn = true;
    this.musicOn = true;
    this.bgm = new Audio('music/voxel_village.mp3');
    this.bgm.loop = true;
    this.bgm.volume = 0.25;
  }

  ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  startMusic() {
    this.ensureCtx();
    if (this.musicOn && this.bgm.paused) {
      this.bgm.play().catch(() => {});
    }
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    if (this.musicOn) {
      this.bgm.play().catch(() => {});
    } else {
      this.bgm.pause();
    }
    return this.musicOn;
  }

  toggleSfx() {
    this.sfxOn = !this.sfxOn;
    return this.sfxOn;
  }

  tone(freq, dur = 0.12, type = 'sine', vol = 0.14, slideTo = null) {
    if (!this.sfxOn) return;
    try {
      this.ensureCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(slideTo, now + dur);
      }
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + dur);
    } catch {
      // Ignore audio errors before user gesture
    }
  }

  click() {
    this.tone(660, 0.06, 'triangle', 0.1);
  }

  swap() {
    this.tone(440, 0.08, 'sine', 0.11, 580);
  }

  invalidSwap() {
    this.tone(240, 0.14, 'sawtooth', 0.09, 170);
  }

  pop(comboStep = 1) {
    const idx = Math.max(0, Math.min(COMBO_FREQS.length - 1, (comboStep || 1) - 1));
    const base = COMBO_FREQS[idx];
    this.tone(base, 0.14, 'triangle', 0.16, base * 1.25);
    setTimeout(() => this.tone(base * 1.5, 0.11, 'sine', 0.12), 45);
  }

  laser() {
    this.tone(880, 0.22, 'sawtooth', 0.14, 320);
    setTimeout(() => this.tone(1174, 0.18, 'triangle', 0.13, 520), 50);
  }

  bomb() {
    this.tone(180, 0.26, 'sawtooth', 0.18, 65);
    setTimeout(() => this.tone(520, 0.15, 'triangle', 0.12, 240), 40);
  }

  magicBird() {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      setTimeout(() => this.tone(f, 0.16, 'triangle', 0.15), i * 55);
    });
  }

  victory() {
    [523.25, 659.25, 783.99, 1046.5, 987.77, 1046.5].forEach((f, i) => {
      setTimeout(() => this.tone(f, 0.2, 'triangle', 0.16), i * 95);
    });
  }
}

export const sound = new SoundManager();
