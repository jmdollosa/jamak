import type { OrbState } from "@/components/orb/orb-presets";
import { ConversationRecorder, RECALL_MEMORIES_TOOL, recallMemories } from "./memory";
import { MicMeter } from "./mic-meter";
import { replyFor } from "./mock-replies";
import { type RealtimeServerEvent, RealtimeVoice, VoiceError } from "./realtime-voice";
import { simulatedVoiceLevel, speechLevel } from "./synthetic-voice";
import { ORB_STATE_FOR_PHASE, type VoicePhase } from "./voice-phase";

export const DEFAULT_PROMPT = "I'm your AI personal assistant. How can I help you today?";

export interface Caption {
  id: number;
  text: string;
  tone: "prompt" | "status" | "reply" | "notice";
  /** Words revealed so far while a reply is being spoken; null shows the whole line. */
  revealed: number | null;
}

export interface AssistantSnapshot {
  /** What the orb shows. In a live conversation it follows `voicePhase`. */
  state: OrbState;
  caption: Caption;
  /** What the user typed or said, shown above the reply. */
  userText: string | null;
  /** True while a state is pinned from the states panel instead of the conversation. */
  previewing: boolean;
  micEnabled: boolean;
  /** Where the live voice conversation is; "idle" when there isn't one. */
  voicePhase: VoicePhase;
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

/** A live conversation hangs up after this long with nobody speaking. */
const VOICE_IDLE_MS = 90000;
/** Once a reply has been generated, it counts as spoken after this much silence… */
const REPLY_TAIL_MS = 1200;
/** …or after this long if its audio never registered on the level meter. */
const REPLY_FALLBACK_MS = 15000;
/** Below this, Jamak's voice counts as silent. */
const OUTPUT_QUIET_LEVEL = 0.04;
/** About what fits in the three-line caption on a narrow screen. */
const CAPTION_CHARS = 160;

const wordDuration = (word: string) => 140 + word.length * 38;

/** The reply being generated or spoken in a live conversation. */
interface LiveReply {
  id: string;
  text: string;
  captionId: number | null;
  /** OpenAI has finished generating it; the audio may still be playing. */
  generated: boolean;
  heard: boolean;
  quietSince: number;
}

const str = (value: unknown) => (typeof value === "string" ? value : "");
const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;

/** The end of a long reply, from a sentence start where possible, so the caption keeps up with the voice. */
function captionTail(text: string) {
  if (text.length <= CAPTION_CHARS) return text;
  const recent = text.slice(-CAPTION_CHARS);
  const sentence = /[.!?…]["”’)]*\s+(?=\S)/.exec(recent);
  if (sentence) return recent.slice(sentence.index + sentence[0].length);
  return `…${recent.slice(recent.indexOf(" ") + 1)}`;
}

/**
 * Drives the conversation flow (listen → think → speak) as an external store.
 *
 * With the microphone on, the mic button opens a live speech-to-speech conversation
 * with the OpenAI Realtime API (see realtime-voice.ts) that continues until it's ended.
 * The states panel, the sample conversation and the mic-off mode still use the
 * simulated flow, with mock replies and a synthetic voice.
 *
 * Live conversations use Jamak's long-term memory (memory.ts): Jamak can recall what it
 * knows mid-conversation, and what's said is sent to the AI Core to learn from.
 */
export class AssistantController {
  private snapshot: AssistantSnapshot = {
    state: "idle",
    caption: { id: 0, text: DEFAULT_PROMPT, tone: "prompt", revealed: null },
    userText: null,
    previewing: false,
    micEnabled: true,
    voicePhase: "idle",
  };
  private listeners = new Set<() => void>();
  private mic = new MicMeter();
  private liveMic = false;
  private voice: RealtimeVoice | null = null;
  /** Records the live conversation for Jamak's memory; one per conversation. */
  private memory: ConversationRecorder | null = null;
  private phase: VoicePhase = "idle";
  private reply: LiveReply | null = null;
  private userSpeaking = false;
  private lastActivity = 0;
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
        if (this.voice) {
          // While Jamak's own voice is still audible (its last words, or echo reaching the
          // microphone), don't let it look as if the user is talking.
          return this.voice.outputLevel() > OUTPUT_QUIET_LEVEL ? 0 : this.voice.inputLevel();
        }
        return this.liveMic ? this.mic.read() : simulatedVoiceLevel(t);
      case "speaking":
        return this.voice ? this.voice.outputLevel() : speechLevel(t);
      case "empathetic":
        return speechLevel(t * 0.75) * 0.7;
      default:
        return 0;
    }
  };

  /**
   * The mic button and the orb: starts a voice conversation, or ends the one in progress.
   * (In the simulated flow it stops listening and answers.)
   */
  toggleMic = () => {
    if (this.voice) {
      this.cancel();
      return;
    }
    if (this.snapshot.state === "listening" && !this.snapshot.previewing) {
      this.finishListening(this.run);
    } else {
      void this.listen(false);
    }
  };

  submit = (text: string) => {
    const message = text.trim();
    if (!message) return;

    // Typed messages join a live conversation and get a spoken reply.
    if (this.voice?.isOpen) {
      if (this.reply) this.voice.interrupt();
      this.reply = null;
      this.voice.sendText(message);
      this.touch();
      this.setPhase("thinking", { userText: message, caption: this.caption("Thinking…", "status") });
      return;
    }

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

  /** Stops whatever is happening, including a live conversation, and goes idle. */
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

  /** Stops timers and releases the microphone and any live conversation. The controller stays usable. */
  shutdown = () => {
    this.begin();
  };

  private update(patch: Partial<AssistantSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch, voicePhase: this.phase };
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
    this.memory?.finish();
    this.memory = null;
    this.voice?.close();
    this.voice = null;
    this.phase = "idle";
    this.reply = null;
    this.userSpeaking = false;
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
    if (!simulate && this.snapshot.micEnabled && RealtimeVoice.isSupported()) {
      return this.converse();
    }

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
        void this.goQuiet(run, "I didn't hear anything. Tap the mic to try again.");
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

  /** Stops, says why, then goes back to the usual prompt. */
  private async goQuiet(run: number, notice: string) {
    if (run !== this.run) return;
    const next = this.begin();
    this.update({ state: "idle", userText: null, caption: this.caption(notice, "notice") });
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

  // ---------------------------------------------------------- live conversation
  //
  // The conversation's phase (voice-phase.ts) follows OpenAI Realtime events, and the
  // orb shows each phase with one of its existing states.

  private setPhase(phase: VoicePhase, patch: Partial<AssistantSnapshot> = {}) {
    this.phase = phase;
    this.update({ ...patch, state: ORB_STATE_FOR_PHASE[phase] });
  }

  /**
   * Opens a live speech-to-speech conversation, which runs until it's ended or drops.
   * begin() closes any previous one first, so there's only ever one session and one
   * microphone stream.
   */
  private async converse() {
    const run = this.begin();
    const voice = new RealtimeVoice({
      onEvent: (event) => {
        if (run === this.run) this.onVoiceEvent(event);
      },
      onDisconnect: (error) => {
        if (run === this.run) this.voiceFailed(error);
      },
      onPlaybackError: (error) => {
        // Shown unless a reply is on screen; the conversation carries on regardless.
        if (run === this.run && this.snapshot.caption.tone !== "reply") {
          this.update({ caption: this.caption(error.message, "notice") });
        }
      },
    });
    this.voice = voice;
    this.memory = new ConversationRecorder();
    this.setPhase("connecting", {
      previewing: false,
      userText: null,
      caption: this.caption("Connecting…", "status"),
    });

    try {
      await voice.connect();
    } catch (error) {
      if (run === this.run) this.voiceFailed(error);
      return;
    }
    if (run !== this.run) return;

    // Connected. Listening starts with OpenAI's session.created.
    this.touch();
    this.watchVoice(run);
  }

  private voiceFailed(error: unknown) {
    if (error instanceof VoiceError && error.code === "closed") return;
    console.warn("[Jamak] Voice conversation ended:", error);
    this.begin();
    this.setPhase("error", {
      previewing: false,
      userText: null,
      caption: this.caption(
        error instanceof VoiceError ? error.message : "Something went wrong with the voice connection. Tap the mic to try again.",
        "notice",
      ),
    });
  }

  private onVoiceEvent(event: RealtimeServerEvent) {
    this.memory?.handle(event);
    switch (event.type) {
      // The session is ready, so OpenAI is hearing the microphone from here on.
      case "session.created":
        if (this.phase === "connecting") {
          const blocked = this.voice?.playbackError;
          this.touch();
          this.setPhase("listening", {
            caption: blocked ? this.caption(blocked.message, "notice") : this.caption("Listening…", "status"),
          });
        }
        break;

      case "input_audio_buffer.speech_started": {
        // Talking over a reply, even one still being prepared, interrupts it: OpenAI
        // cancels it and stops its audio, and anything still arriving for it is ignored.
        const interrupting = this.reply !== null || this.phase === "speaking";
        this.userSpeaking = true;
        this.reply = null;
        this.touch();
        this.setPhase(interrupting ? "interrupted" : "listening", {
          userText: null,
          caption: this.caption("Listening…", "status"),
        });
        break;
      }

      case "input_audio_buffer.speech_stopped":
        this.userSpeaking = false;
        this.touch();
        if (this.phase === "listening" || this.phase === "interrupted") {
          this.setPhase("thinking", { caption: this.caption("Thinking…", "status") });
        }
        break;

      case "conversation.item.input_audio_transcription.completed": {
        const transcript = str(event.transcript).trim();
        if (transcript) this.update({ userText: transcript });
        break;
      }

      case "response.created":
        this.reply = {
          id: str(field(event.response, "id")),
          text: "",
          captionId: null,
          generated: false,
          heard: false,
          quietSince: performance.now(),
        };
        this.touch();
        if (this.phase === "listening" || this.phase === "interrupted") {
          this.setPhase("thinking", { caption: this.caption("Thinking…", "status") });
        }
        break;

      case "response.output_audio_transcript.delta":
        if (this.reply && this.isCurrentReply(event.response_id)) {
          this.reply.text += str(event.delta);
          // The words arrive a little ahead of the audio; they appear once it starts playing.
          if (this.phase === "speaking") this.showReply(this.reply);
        }
        break;

      // WebRTC only: OpenAI has started playing the reply to us.
      case "output_audio_buffer.started":
        if (this.reply && this.isCurrentReply(event.response_id)) this.startSpeaking(this.reply);
        break;

      // WebRTC only: the reply has finished playing.
      case "output_audio_buffer.stopped":
        if (this.isCurrentReply(event.response_id)) this.finishReply();
        break;

      // WebRTC only: the reply's audio was cut off before the end.
      case "output_audio_buffer.cleared":
        if (this.isCurrentReply(event.response_id)) this.replyInterrupted();
        break;

      case "response.done":
        this.onReplyDone(event.response);
        break;

      // Jamak wants to look something up in its memory (server/memory/session.ts).
      case "response.function_call_arguments.done":
        if (event.name === RECALL_MEMORIES_TOOL) void this.recall(str(event.call_id), str(event.arguments));
        break;

      case "error":
        // Usually a client event OpenAI couldn't apply; the conversation carries on.
        console.warn("[Jamak] Realtime error:", event.error);
        break;
    }
  }

  /** Answers Jamak's recall_memories call, then lets it carry on with its reply. */
  private async recall(callId: string, args: string) {
    const voice = this.voice;
    if (!voice || !callId) return;
    if (this.phase === "thinking") this.update({ caption: this.caption("Remembering…", "status") });
    const memories = await recallMemories(args);
    if (voice !== this.voice || !voice.isOpen) return;
    // If the user has started talking again, the reply waits for what they say next.
    voice.sendToolResult(callId, memories, !this.userSpeaking);
  }

  private isCurrentReply(responseId: unknown) {
    return this.reply !== null && (typeof responseId !== "string" || responseId === this.reply.id);
  }

  private startSpeaking(reply: LiveReply) {
    if (this.phase === "speaking") return;
    this.touch();
    this.setPhase("speaking");
    this.showReply(reply);
  }

  private showReply(reply: LiveReply) {
    const text = captionTail(reply.text.trim());
    if (!text) return;
    // Keep one caption per reply so it grows in place instead of fading in again.
    const current = this.snapshot.caption;
    const caption = current.id === reply.captionId ? { ...current, text } : this.caption(text, "reply");
    reply.captionId = caption.id;
    this.update({ caption });
  }

  private onReplyDone(response: unknown) {
    const reply = this.reply;
    if (!reply || !this.isCurrentReply(field(response, "id"))) return;

    const status = str(field(response, "status"));
    if (status === "failed") {
      console.warn("[Jamak] The reply failed:", field(response, "status_details"));
      this.reply = null;
      this.setPhase("listening", { caption: this.caption("I couldn't answer that. Could you say it again?", "notice") });
    } else if (status === "cancelled") {
      this.replyInterrupted();
    } else {
      // Generated, but the audio may still be playing; output_audio_buffer.stopped ends it.
      reply.generated = true;
      this.touch();
    }
  }

  /** The reply has finished playing: listen for the next turn, leaving its words up to read. */
  private finishReply() {
    const reply = this.reply;
    this.reply = null;
    this.touch();
    if (this.phase !== "speaking" && this.phase !== "thinking") return;
    // Shows the complete reply, including if its audio never registered.
    if (reply) this.showReply(reply);
    const { caption } = this.snapshot;
    this.setPhase("listening", {
      caption: caption.tone === "reply" ? caption : this.caption("Listening…", "status"),
    });
  }

  /** The reply was cut off or cancelled before it finished. */
  private replyInterrupted() {
    this.reply = null;
    this.touch();
    if (this.phase === "speaking" || this.phase === "thinking") {
      this.setPhase("interrupted", { caption: this.caption("Listening…", "status") });
    }
  }

  /**
   * Backs up the WebRTC playback events with the measured reply audio, which matters
   * because output_audio_buffer.stopped can arrive late; and hangs up after a long silence.
   */
  private watchVoice(run: number) {
    const id = setInterval(() => {
      const voice = this.voice;
      if (run !== this.run || !voice) return;
      const now = performance.now();
      const reply = this.reply;

      if (reply) {
        if (voice.outputLevel() > OUTPUT_QUIET_LEVEL) {
          reply.heard = true;
          reply.quietSince = now;
          if (this.phase === "thinking") this.startSpeaking(reply);
        }
        if (reply.generated && now - reply.quietSince > (reply.heard ? REPLY_TAIL_MS : REPLY_FALLBACK_MS)) {
          this.finishReply();
        }
      } else if (!this.userSpeaking && now - this.lastActivity > VOICE_IDLE_MS) {
        void this.goQuiet(run, "I stopped listening after a quiet stretch. Tap the mic when you need me.");
      }
    }, 150);
    this.timers.add(id);
  }

  private touch() {
    this.lastActivity = performance.now();
  }
}
