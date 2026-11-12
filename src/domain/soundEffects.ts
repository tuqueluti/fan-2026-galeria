/**
 * Motor acústico leve baseado em Web Audio API para efeitos táteis de virada de página
 * e passagem de fotografias (papel fotográfico suave), sem arquivos externos pesados.
 * Degrada silenciosamente em ambientes de teste (jsdom) ou navegadores sem Web Audio.
 */

export type PageSoundKind =
  | 'photo-next'
  | 'photo-prev'
  | 'page-turn-next'
  | 'page-turn-prev'
  | 'lightbox-open'
  | 'lightbox-close';

const STORAGE_KEY = 'fan2026_sound_enabled';

type AudioContextConstructor = typeof AudioContext;

function getAudioContextClass(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return win.AudioContext ?? win.webkitAudioContext ?? null;
}

class GallerySoundEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private enabled = true;
  private lastPlayedAt = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored === 'false') {
          this.enabled = false;
        }
      } catch {
        // Ignora bloqueios de storage em modo privado restrito
      }
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(next: boolean): void {
    this.enabled = next;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Ignora bloqueios de storage
      }
    }
  }

  private ensureContext(): AudioContext | null {
    const Ctor = getAudioContextClass();
    if (!Ctor) return null;

    if (!this.ctx) {
      try {
        this.ctx = new Ctor();
      } catch {
        return null;
      }
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    if (!this.noiseBuffer && this.ctx) {
      const sampleRate = this.ctx.sampleRate;
      const length = Math.floor(sampleRate * 0.35);
      const buffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);

      // Ruído rosa suave (filtro Kelvin-Paul simplificado) para textura natural de folha/papel couché
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.963 * b1 + white * 0.2965164;
        b2 = 0.57 * b2 + white * 1.0526913;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.18;
      }
      this.noiseBuffer = buffer;
    }

    return this.ctx;
  }

  public play(kind: PageSoundKind): void {
    if (!this.enabled) return;

    const nowMs = Date.now();
    // Evita sobreposição excessiva caso o usuário segure a tecla de seta
    if (nowMs - this.lastPlayedAt < 45) return;
    this.lastPlayedAt = nowMs;

    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    try {
      const t0 = ctx.currentTime;

      if (kind === 'page-turn-next' || kind === 'page-turn-prev') {
        this.triggerPaperFolio(ctx, t0, {
          duration: 0.19,
          startFreq: kind === 'page-turn-next' ? 760 : 1850,
          peakFreq: kind === 'page-turn-next' ? 2150 : 1200,
          endFreq: kind === 'page-turn-next' ? 980 : 680,
          q: 1.45,
          peakGain: 0.16,
          bodyFreq: kind === 'page-turn-next' ? 165 : 142,
        });
        return;
      }

      if (kind === 'photo-next' || kind === 'photo-prev') {
        this.triggerPaperFolio(ctx, t0, {
          duration: 0.135,
          startFreq: kind === 'photo-next' ? 950 : 1980,
          peakFreq: kind === 'photo-next' ? 2350 : 1320,
          endFreq: kind === 'photo-next' ? 1120 : 820,
          q: 1.75,
          peakGain: 0.125,
          bodyFreq: kind === 'photo-next' ? 190 : 168,
        });
        return;
      }

      if (kind === 'lightbox-open') {
        this.triggerPaperFolio(ctx, t0, {
          duration: 0.15,
          startFreq: 720,
          peakFreq: 1950,
          endFreq: 1380,
          q: 1.6,
          peakGain: 0.11,
          bodyFreq: 155,
        });
        return;
      }

      if (kind === 'lightbox-close') {
        this.triggerPaperFolio(ctx, t0, {
          duration: 0.11,
          startFreq: 1550,
          peakFreq: 980,
          endFreq: 560,
          q: 1.8,
          peakGain: 0.09,
          bodyFreq: 130,
        });
      }
    } catch {
      // Silencia qualquer restrição de áudio do navegador
    }
  }

  private triggerPaperFolio(
    ctx: AudioContext,
    t0: number,
    params: {
      duration: number;
      startFreq: number;
      peakFreq: number;
      endFreq: number;
      q: number;
      peakGain: number;
      bodyFreq: number;
    },
  ): void {
    if (!this.noiseBuffer) return;

    const { duration, startFreq, peakFreq, endFreq, q, peakGain, bodyFreq } = params;

    // Camada 1: atrito sedoso da folha de papel fotográfico (ruído rosa com varredura de formante)
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = this.noiseBuffer;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.Q.setValueAtTime(q, t0);
    bandpass.frequency.setValueAtTime(startFreq, t0);
    bandpass.frequency.exponentialRampToValueAtTime(peakFreq, t0 + duration * 0.42);
    bandpass.frequency.exponentialRampToValueAtTime(endFreq, t0 + duration);

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(320, t0);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(peakGain, t0 + duration * 0.22);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    noiseSrc.connect(highpass);
    highpass.connect(bandpass);
    bandpass.connect(env);
    env.connect(ctx.destination);

    noiseSrc.start(t0, 0, duration + 0.02);
    noiseSrc.stop(t0 + duration + 0.02);

    // Camada 2: leve corpo tátil do movimento da página
    const bodyOsc = ctx.createOscillator();
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(bodyFreq, t0);
    bodyOsc.frequency.exponentialRampToValueAtTime(bodyFreq * 0.58, t0 + 0.045);

    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.0001, t0);
    bodyGain.gain.linearRampToValueAtTime(peakGain * 0.24, t0 + 0.008);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(ctx.destination);

    bodyOsc.start(t0);
    bodyOsc.stop(t0 + 0.055);
  }
}

export const gallerySound = new GallerySoundEngine();
