/**
 * lib/sound.ts
 * ────────────
 * Game Audio Engine for 'Catch Me If You Can?'.
 * - Soundtrack: Bundled lossless stereo soundtrack (/audio/detective_mystery_theme.wav)
 *   Original 116 BPM energetic electronic detective theme (Em9 -> Cmaj7 -> Am9 -> B7#9)
 *   Licensed under Creative Commons Zero (CC0 1.0 Universal) - completely free and royalty-free.
 * - SFX: Low-latency Web Audio API synthesizers for click, victory, defeat, buzzer, etc.
 * - Autonomous autoplay unlock on first user gesture.
 * - Independent BGM and SFX volume controls with persistent client storage.
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private sfxVolume: number = 0.8;
  private musicVolume: number = 0.4;
  private musicEnabled: boolean = false;

  private sfxGain: GainNode | null = null;
  private bgmAudio: HTMLAudioElement | null = null;
  private isBgmPlaying: boolean = false;

  constructor() {
    if (typeof window !== "undefined") {
      try {
        const savedMute = localStorage.getItem("catchme_sfx_muted");
        if (savedMute !== null) this.isMuted = savedMute === "true";

        const savedSfxVol = localStorage.getItem("catchme_sfx_volume");
        if (savedSfxVol !== null) {
          const v = parseFloat(savedSfxVol);
          if (!isNaN(v) && v >= 0 && v <= 1) this.sfxVolume = v;
        }

        const savedMusicVol = localStorage.getItem("catchme_music_volume");
        if (savedMusicVol !== null) {
          const v = parseFloat(savedMusicVol);
          if (!isNaN(v) && v >= 0 && v <= 1) this.musicVolume = v;
        }

        const savedMusicEnabled = localStorage.getItem("catchme_music_enabled");
        if (savedMusicEnabled !== null) {
          this.musicEnabled = savedMusicEnabled === "true";
        }
      } catch {
        // ignore localStorage access limits
      }
    }
  }

  private initContext() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.setValueAtTime(this.isMuted ? 0 : this.sfxVolume, this.ctx.currentTime);
        this.sfxGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  private initBgmAudio() {
    if (typeof window === "undefined") return;
    if (!this.bgmAudio) {
      try {
        const audio = new Audio("/audio/detective_mystery_theme.wav");
        audio.loop = true;
        audio.preload = "auto";
        this.bgmAudio = audio;
        this.updateBgmVolume();
      } catch {
        // ignore audio creation errors
      }
    }
  }

  private updateBgmVolume() {
    if (this.bgmAudio) {
      const targetVol = this.isMuted ? 0 : this.musicVolume;
      this.bgmAudio.volume = Math.max(0, Math.min(1, targetVol));
    }
  }

  public handleUserInteraction() {
    this.initContext();
    if (this.musicEnabled) {
      this.startMusic();
    }
  }

  // ── Volume & Mute Controls ──────────────────────────────────────────

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (typeof window !== "undefined") {
      localStorage.setItem("catchme_sfx_muted", String(muted));
    }
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(muted ? 0 : this.sfxVolume, this.ctx.currentTime);
    }
    this.updateBgmVolume();
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  public setSfxVolume(vol: number) {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
    if (typeof window !== "undefined") {
      localStorage.setItem("catchme_sfx_volume", String(this.sfxVolume));
    }
    if (this.sfxGain && this.ctx && !this.isMuted) {
      this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
    }
  }

  public getSfxVolume(): number {
    return this.sfxVolume;
  }

  public setMusicVolume(vol: number) {
    this.musicVolume = Math.max(0, Math.min(1, vol));
    if (typeof window !== "undefined") {
      localStorage.setItem("catchme_music_volume", String(this.musicVolume));
    }
    this.updateBgmVolume();
  }

  public getMusicVolume(): number {
    return this.musicVolume;
  }

  public isMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  public isMusicPlaying(): boolean {
    return this.isBgmPlaying;
  }

  public toggleMusic(): boolean {
    if (this.musicEnabled) {
      this.stopMusic();
    } else {
      this.startMusic();
    }
    return this.musicEnabled;
  }

  public startMusic() {
    this.musicEnabled = true;
    if (typeof window !== "undefined") {
      localStorage.setItem("catchme_music_enabled", "true");
    }
    this.initBgmAudio();
    if (this.bgmAudio) {
      this.updateBgmVolume();
      const promise = this.bgmAudio.play();
      if (promise !== undefined) {
        promise
          .then(() => {
            this.isBgmPlaying = true;
          })
          .catch(() => {
            // Autoplay policy prevented playback until user interaction
            this.isBgmPlaying = false;
          });
      }
    }
  }

  public stopMusic() {
    this.musicEnabled = false;
    if (typeof window !== "undefined") {
      localStorage.setItem("catchme_music_enabled", "false");
    }
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.isBgmPlaying = false;
    }
  }

  public pauseMusic() {
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.isBgmPlaying = false;
    }
  }

  /** Legacy helper preserved for compatibility */
  public toggleBgm(enable: boolean) {
    if (enable) {
      this.startMusic();
    } else {
      this.stopMusic();
    }
  }

  // ── SFX Synthesizers ────────────────────────────────────────────────

  public playClick() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(600, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  }

  public playTurnChime() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);

      gain.gain.setValueAtTime(0.18, now + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.09 + 0.35);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 0.35);
    });
  }

  public playNotification() {
    this.playTurnChime();
  }

  public playSuspense() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.linearRampToValueAtTime(110, now + 0.5);

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.5);
  }

  public playVictory() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const notes = [440, 554.37, 659.25, 880]; // A major arpeggio
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const startTime = this.ctx.currentTime + idx * 0.12;

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.2, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.35);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(startTime);
      osc.stop(startTime + 0.35);
    });
  }

  public playCaughtBuzzer() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.linearRampToValueAtTime(90, now + 0.4);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.4);
  }
  public getAudioElement(): HTMLAudioElement | null {
    return this.bgmAudio;
  }
}

export const sound = new SoundEngine();

if (typeof window !== "undefined") {
  (window as any).__catchme_sound = sound;
}

// Auto-register browser interaction listener to unlock AudioContext & BGM
if (typeof window !== "undefined") {
  const onUserInteract = () => {
    sound.handleUserInteraction();
    window.removeEventListener("pointerdown", onUserInteract);
    window.removeEventListener("keydown", onUserInteract);
    window.removeEventListener("touchstart", onUserInteract);
  };
  window.addEventListener("pointerdown", onUserInteract, { once: true, passive: true });
  window.addEventListener("keydown", onUserInteract, { once: true, passive: true });
  window.addEventListener("touchstart", onUserInteract, { once: true, passive: true });
}
