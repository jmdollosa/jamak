/** Shared by several readers per frame (orb, waveforms, speech detection). */
const READ_INTERVAL_MS = 12;

/**
 * Smoothed loudness of an audio stream, between 0 and 1, like a VU meter.
 * Only loudness is measured; no audio is recorded.
 */
export class LevelMeter {
  private source: MediaStreamAudioSourceNode;
  private analyser: AnalyserNode;
  private samples: Float32Array<ArrayBuffer>;
  private level = 0;
  private lastRead = 0;

  /**
   * `gain` maps RMS onto the 0–1 level. Conversational speech lands roughly between
   * 0.01 and 0.15 RMS, so the default reaches 1 when someone speaks up.
   */
  constructor(
    context: AudioContext,
    stream: MediaStream,
    private gain = 7,
  ) {
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.source = context.createMediaStreamSource(stream);
    this.source.connect(this.analyser);
    this.samples = new Float32Array(this.analyser.fftSize);
  }

  read(): number {
    const now = performance.now();
    if (now - this.lastRead < READ_INTERVAL_MS) return this.level;
    const dt = this.lastRead ? Math.min((now - this.lastRead) / 1000, 0.1) : 1 / 60;
    this.lastRead = now;

    this.analyser.getFloatTimeDomainData(this.samples);
    let sum = 0;
    for (const sample of this.samples) sum += sample * sample;
    const rms = Math.sqrt(sum / this.samples.length);

    const target = Math.min(1, Math.max(0, (rms - 0.006) * this.gain)) ** 0.75;
    const rate = target > this.level ? 25 : 8;
    this.level += (target - this.level) * (1 - Math.exp(-dt * rate));
    return this.level;
  }

  disconnect() {
    this.source.disconnect();
  }
}
