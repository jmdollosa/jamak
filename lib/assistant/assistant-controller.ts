import type { OrbState } from "@/components/orb/orb-presets";
import { MicMeter } from "./mic-meter";
import { replyFor } from "./mock-replies";
import { simulatedVoiceLevel, speechLevel } from "./synthetic-voice";

export const DEFAULT_PROMPT = "I'm your AI personal assistant. How can I help you today?";

export interface Caption {
  id: number;
  text: string;
  tone: "prompt" | "status" | "reply" | "notice";
  /** Words revealed so far while a reply is being spoken; null shows the whole line. */
  revealed: number | null;
}

export interface AssistantSnapshot {
  state: OrbState;
  caption: Caption;
  /** The message the user typed, shown above the reply. */
  userText: string | null;
  /** True while a state is pinned from the states panel instead of the conversation. */
  previewing: boolean;
  micEnabled: boolean;
}

const PREVIEW_CAPTIONS: Record<OrbState, string> = {
  idle: DEFAULT_PROMPT,
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "This is how I look while I'm talking to you.",
  empathetic: "A warmer, slower tone for gentler moments.",
  success: "Done.",
};

const SPEECH_THRESHOLD = 0.16;
const END_OF_SPEECH_MS = 1300;
const NO_SPEECH_MS = 9000;
const MAX_LISTEN_MS = 20000;
const SIMULATED_LISTEN_MS = 3400;

const wordDuration = (word: string) => 140 + word.length * 38;

/**
 * Drives the conversation flow (listen → think → speak → done) as an external store.
 *
 * Everything here is simulated except the microphone level. When the AI is wired in,
 * `respond()` is the seam: swap the mock reply and synthetic speech for the real thing.
 */
export class AssistantController {
  private snapshot: AssistantSnapshot = {
    state: "idle",
    caption: { id: 0, text: DEFAULT_PROMPT, tone: "prompt", revealed: null },
    userText: null,
    previewing: false,
    micEnabled: true,
  };
  private listeners = new Set<() => void>();
  private mic = new MicMeter();
  private liveMic = false;
  private run = 0;
  // Timeouts and intervals share one ID pool, so clearTimeout() clears either.
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private captionId = 0;
  private turn = 0;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  /** Voice level for the current state, polled every frame by the orb and waveforms. */
  getLevel = (): number => {
    const t = performance.now() / 1000;
    switch (this.snapshot.state) {
      case "listening":
        return this.liveMic ? this.mic.read() : simulatedVoiceLevel(t);
      case "speaking":
        return speechLevel(t);
      case "empathetic":
        return speechLevel(t * 0.75) * 0.7;
      default:
        return 0;
    }
  };

  /** The mic button: start listening, stop and answer, or interrupt a reply. */
  toggleMic = () => {
    if (this.snapshot.state === "listening" && !this.snapshot.previewing) {
      this.finishListening(this.run);
    } else {
      void this.listen(false);
    }
  };

  submit = (text: string) => {
    const message = text.trim();
    if (!message) return;
    const run = this.begin();
    this.update({ userText: message, previewing: false });
    void this.respond(message, run);
  };

  /** Walks through a full exchange with a simulated voice, without the microphone. */
  playSample = () => {
    void this.listen(true);
  };

  preview = (state: OrbState) => {
    this.begin();
    this.update({
      state,
      previewing: state !== "idle",
      userText: null,
      caption: this.caption(PREVIEW_CAPTIONS[state], state === "idle" ? "prompt" : "status"),
    });
  };

  cancel = () => {
    this.begin();
    this.update({
      state: "idle",
      previewing: false,
      userText: null,
      caption: this.caption(DEFAULT_PROMPT, "prompt"),
    });
  };

  setMicEnabled = (micEnabled: boolean) => {
    this.update({ micEnabled });
  };

  /** Stops timers and releases the microphone. The controller stays usable. */
  shutdown = () => {
    this.begin();
  };

  private update(patch: Partial<AssistantSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private caption(text: string, tone: Caption["tone"], revealed: number | null = null): Caption {
    return { id: ++this.captionId, text, tone, revealed };
  }

  /** Starts a new run, cancelling whatever the previous one was waiting on. */
  private begin() {
    this.run++;
    this.timers.forEach((id) => clearTimeout(id));
    this.timers.clear();
    this.liveMic = false;
    this.mic.stop();
    return this.run;
  }

  /** Resolves true after `ms`, or never if the run was cancelled in the meantime. */
  private sleep(ms: number, run: number) {
    return new Promise<boolean>((resolve) => {
      const id = setTimeout(() => {
        this.timers.delete(id);
        resolve(run === this.run);
      }, ms);
      this.timers.add(id);
    });
  }

  private async listen(simulate: boolean) {
    const run = this.begin();
    this.update({
      state: "listening",
      previewing: false,
      userText: null,
      caption: this.caption("Listening…", "status"),
    });

    if (!simulate && this.snapshot.micEnabled) {
      const result = await this.mic.start();
      if (run !== this.run) return;
      if (result === "live") {
        this.liveMic = true;
      } else if (result !== "cancelled") {
        const text =
          result === "blocked"
            ? "Microphone access is blocked, so I'm simulating your voice. Allow it in your browser to use your own."
            : "No microphone was found, so I'm simulating your voice.";
        this.update({ caption: this.caption(text, "notice") });
      }
    }

    if (this.liveMic) {
      this.watchForSpeech(run);
    } else if (await this.sleep(SIMULATED_LISTEN_MS, run)) {
      this.finishListening(run);
    }
  }

  /** Simple voice activity detection: stop after a pause that follows some speech. */
  private watchForSpeech(run: number) {
    const startedAt = performance.now();
    let heardAt = 0;
    let lastLoud = 0;

    const id = setInterval(() => {
      const now = performance.now();
      if (this.mic.read() > SPEECH_THRESHOLD) {
        heardAt ||= now;
        lastLoud = now;
      }
      if (!heardAt && now - startedAt > NO_SPEECH_MS) {
        void this.nothingHeard(run);
      } else if ((heardAt && now - lastLoud > END_OF_SPEECH_MS) || now - startedAt > MAX_LISTEN_MS) {
        this.finishListening(run);
      }
    }, 80);
    this.timers.add(id);
  }

  private finishListening(run: number) {
    if (run !== this.run) return;
    void this.respond(null, this.begin());
  }

  private async nothingHeard(run: number) {
    if (run !== this.run) return;
    const next = this.begin();
    this.update({
      state: "idle",
      caption: this.caption("I didn't hear anything. Tap the mic to try again.", "notice"),
    });
    if (await this.sleep(5000, next)) {
      this.update({ caption: this.caption(DEFAULT_PROMPT, "prompt") });
    }
  }

  private async respond(prompt: string | null, run: number) {
    this.update({ state: "thinking", caption: this.caption("Thinking…", "status") });
    if (!(await this.sleep(1500 + Math.random() * 700, run))) return;

    const reply = replyFor(prompt, this.turn++);
    const pace = reply.mood === "warm" ? 1.2 : 1;
    const words = reply.text.split(" ");
    this.update({
      state: reply.mood === "warm" ? "empathetic" : "speaking",
      caption: this.caption(reply.text, "reply", 0),
    });

    for (let i = 1; i <= words.length; i++) {
      if (!(await this.sleep(wordDuration(words[i - 1]) * pace, run))) return;
      this.update({ caption: { ...this.snapshot.caption, revealed: i } });
    }

    if (reply.done) {
      if (!(await this.sleep(900, run))) return;
      this.update({ state: "success", caption: this.caption(reply.done, "status") });
      if (!(await this.sleep(2600, run))) return;
    } else if (!(await this.sleep(2200, run))) {
      return;
    }

    this.update({
      state: "idle",
      userText: null,
      caption: this.caption(DEFAULT_PROMPT, "prompt"),
    });
  }
}
