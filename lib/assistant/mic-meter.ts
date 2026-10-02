export type MicStartResult = "live" | "blocked" | "unavailable" | "cancelled";

interface MicSession {
  stream: MediaStream;
  context: AudioContext;
  analyser: AnalyserNode;
  samples: Float32Array<ArrayBuffer>;
}

/** Shared by several readers per frame (orb, waveforms, speech detection). */
const READ_INTERVAL_MS = 12;

/**
 * Turns the microphone into a smoothed loudness level between 0 and 1.
 * Only loudness is measured; no audio is recorded or sent anywhere.
 */
export class MicMeter {
  private session: MicSession | null = null;
  private generation = 0;
  private level = 0;
  private lastRead = 0;

  async start(): Promise<MicStartResult> {
    if (this.session) return "live";
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return "unavailable";
    }

    const generation = ++this.generation;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      return name === "NotAllowedError" || name === "SecurityError" ? "blocked" : "unavailable";
    }

    // stop() was called while the permission prompt was open.
    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      return "cancelled";
    }

    const context = new AudioContext();
    await context.resume().catch(() => {});
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);

    this.session = { stream, context, analyser, samples: new Float32Array(analyser.fftSize) };
    this.level = 0;
    this.lastRead = 0;
    return "live";
  }

  stop() {
    this.generation++;
    const session = this.session;
    this.session = null;
    this.level = 0;
    if (!session) return;
    session.stream.getTracks().forEach((track) => track.stop());
    void session.context.close();
  }

  read(): number {
    const session = this.session;
    if (!session) return 0;

    const now = performance.now();
    if (now - this.lastRead < READ_INTERVAL_MS) return this.level;
    const dt = this.lastRead ? Math.min((now - this.lastRead) / 1000, 0.1) : 1 / 60;
    this.lastRead = now;

    session.analyser.getFloatTimeDomainData(session.samples);
    let sum = 0;
    for (const sample of session.samples) sum += sample * sample;
    const rms = Math.sqrt(sum / session.samples.length);

    // Conversational speech lands roughly between 0.01 and 0.15 RMS.
    const target = Math.min(1, Math.max(0, (rms - 0.006) * 7)) ** 0.75;
    const rate = target > this.level ? 25 : 8;
    this.level += (target - this.level) * (1 - Math.exp(-dt * rate));
    return this.level;
  }
}
