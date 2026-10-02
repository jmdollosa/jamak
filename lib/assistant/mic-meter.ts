import { LevelMeter } from "./level-meter";

export type MicStartResult = "live" | "blocked" | "unavailable" | "cancelled";

/** Browser voice processing, which also keeps the assistant's own voice out of the mic. */
export const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
};

/** Whether a getUserMedia() failure means the user or browser refused access. */
export function isMicBlocked(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  return name === "NotAllowedError" || name === "SecurityError";
}

interface MicSession {
  stream: MediaStream;
  context: AudioContext;
  meter: LevelMeter;
}

/**
 * Turns the microphone into a smoothed loudness level between 0 and 1, for the
 * simulated conversation. Only loudness is measured; no audio is recorded or sent anywhere.
 */
export class MicMeter {
  private session: MicSession | null = null;
  private generation = 0;

  async start(): Promise<MicStartResult> {
    if (this.session) return "live";
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return "unavailable";
    }

    const generation = ++this.generation;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
    } catch (error) {
      return isMicBlocked(error) ? "blocked" : "unavailable";
    }

    // stop() was called while the permission prompt was open.
    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      return "cancelled";
    }

    const context = new AudioContext();
    await context.resume().catch(() => {});
    this.session = { stream, context, meter: new LevelMeter(context, stream) };
    return "live";
  }

  stop() {
    this.generation++;
    const session = this.session;
    this.session = null;
    if (!session) return;
    session.stream.getTracks().forEach((track) => track.stop());
    void session.context.close();
  }

  read(): number {
    return this.session?.meter.read() ?? 0;
  }
}
