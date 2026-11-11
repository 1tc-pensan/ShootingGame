import { Injectable } from '@angular/core';

export type SfxName =
  | 'shoot' | 'hit' | 'crit' | 'kill' | 'explosion' | 'hurt' | 'shield'
  | 'powerup' | 'ultimate' | 'dash' | 'wave' | 'boss' | 'gameover';

const STORAGE_KEY = 'soundSettings';
const MIN_INTERVAL_MS: Partial<Record<SfxName, number>> = {
  shoot: 45, hit: 35, crit: 60, kill: 40, explosion: 80, hurt: 120
};

// Minor-key bass line + arpeggio, one entry per 8th note
const BASS = [55, 55, 65.41, 65.41, 49, 49, 61.74, 61.74];
const ARP = [220, 261.63, 329.63, 261.63, 196, 246.94, 293.66, 246.94];

@Injectable({ providedIn: 'root' })
export class SoundService {
  sfxVolume = 0.6;
  musicVolume = 0.3;
  muted = false;

  private ctx: AudioContext | null = null;
  private sfxGain!: GainNode;
  private musicGain!: GainNode;
  private noiseBuffer: AudioBuffer | null = null;
  private lastPlayed: Partial<Record<SfxName, number>> = {};

  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private nextNoteTime = 0;
  private step = 0;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved) {
        this.sfxVolume = this.clamp(saved.sfxVolume ?? this.sfxVolume);
        this.musicVolume = this.clamp(saved.musicVolume ?? this.musicVolume);
        this.muted = !!saved.muted;
      }
    } catch { /* ignore corrupt settings */ }
  }

  // Must be called from a user gesture at least once (browser autoplay policy)
  unlock() {
    this.ensureContext();
  }

  setSfxVolume(v: number) {
    this.sfxVolume = this.clamp(v);
    this.applyVolumes();
    this.save();
  }

  setMusicVolume(v: number) {
    this.musicVolume = this.clamp(v);
    this.applyVolumes();
    this.save();
  }

  toggleMute() {
    this.muted = !this.muted;
    this.applyVolumes();
    this.save();
  }

  play(name: SfxName) {
    if (this.muted || this.sfxVolume === 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = performance.now();
    const minGap = MIN_INTERVAL_MS[name] ?? 0;
    if (now - (this.lastPlayed[name] ?? 0) < minGap) return;
    this.lastPlayed[name] = now;

    const t = ctx.currentTime;
    switch (name) {
      case 'shoot':
        this.tone(t, 880, 220, 0.07, 'square', 0.12);
        break;
      case 'hit':
        this.tone(t, 300, 150, 0.05, 'triangle', 0.15);
        break;
      case 'crit':
        this.tone(t, 1200, 1800, 0.12, 'sawtooth', 0.15);
        this.tone(t + 0.04, 1800, 2400, 0.1, 'square', 0.1);
        break;
      case 'kill':
        this.tone(t, 500, 90, 0.16, 'sawtooth', 0.18);
        this.noise(t, 0.1, 1500, 0.12);
        break;
      case 'explosion':
        this.noise(t, 0.5, 600, 0.45);
        this.tone(t, 120, 30, 0.5, 'sawtooth', 0.3);
        break;
      case 'hurt':
        this.tone(t, 200, 60, 0.3, 'sawtooth', 0.3);
        this.noise(t, 0.15, 800, 0.2);
        break;
      case 'shield':
        this.tone(t, 600, 900, 0.15, 'sine', 0.2);
        this.tone(t + 0.05, 900, 1300, 0.15, 'sine', 0.15);
        break;
      case 'powerup':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
          this.tone(t + i * 0.06, f, f, 0.12, 'square', 0.14));
        break;
      case 'ultimate':
        this.tone(t, 110, 880, 0.6, 'sawtooth', 0.3);
        this.noise(t, 0.6, 2000, 0.25);
        break;
      case 'dash':
        this.noise(t, 0.15, 3000, 0.2);
        this.tone(t, 400, 1200, 0.12, 'sine', 0.12);
        break;
      case 'wave':
        [392, 523.25, 659.25].forEach((f, i) =>
          this.tone(t + i * 0.1, f, f, 0.18, 'triangle', 0.2));
        break;
      case 'boss':
        for (let i = 0; i < 3; i++) {
          this.tone(t + i * 0.35, 90, 70, 0.3, 'sawtooth', 0.35);
          this.tone(t + i * 0.35, 135, 105, 0.3, 'square', 0.15);
        }
        break;
      case 'gameover':
        [392, 349.23, 311.13, 261.63].forEach((f, i) =>
          this.tone(t + i * 0.25, f, f * 0.97, 0.4, 'triangle', 0.3));
        break;
    }
  }

  startMusic() {
    if (this.musicTimer) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.step = 0;
    this.nextNoteTime = ctx.currentTime + 0.05;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 100);
  }

  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private scheduleMusic() {
    const ctx = this.ctx;
    if (!ctx) return;
    const noteLen = 60 / 140 / 2; // 8th notes at 140 BPM
    while (this.nextNoteTime < ctx.currentTime + 0.25) {
      const i = this.step % 8;
      const t = this.nextNoteTime;
      this.musicNote(t, BASS[i], noteLen * 0.9, 'sawtooth', 0.35, this.musicGain);
      this.musicNote(t, ARP[i], noteLen * 0.5, 'square', 0.1, this.musicGain);
      if (i % 2 === 0) this.musicNote(t, 40, 0.08, 'sine', 0.5, this.musicGain);
      this.nextNoteTime += noteLen;
      this.step++;
    }
  }

  private musicNote(t: number, freq: number, dur: number, type: OscillatorType, vol: number, dest: AudioNode) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private tone(t: number, f0: number, f1: number, dur: number, type: OscillatorType, vol: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(t: number, dur: number, cutoff: number, vol: number) {
    const ctx = this.ctx!;
    if (!this.noiseBuffer) {
      const len = ctx.sampleRate;
      this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(50, cutoff / 4), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(this.sfxGain);
    src.start(t, 0, dur);
  }

  private ensureContext(): AudioContext | null {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain.connect(this.ctx.destination);
      this.musicGain.connect(this.ctx.destination);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => { /* needs user gesture */ });
    }
    return this.ctx;
  }

  private applyVolumes() {
    if (!this.ctx) return;
    this.sfxGain.gain.value = this.muted ? 0 : this.sfxVolume;
    this.musicGain.gain.value = this.muted ? 0 : this.musicVolume;
  }

  private save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      sfxVolume: this.sfxVolume, musicVolume: this.musicVolume, muted: this.muted
    }));
  }

  private clamp(v: number) {
    return Math.min(1, Math.max(0, Number(v) || 0));
  }
}
