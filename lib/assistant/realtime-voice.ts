import { LevelMeter } from "./level-meter";
import { isMicBlocked, MIC_CONSTRAINTS } from "./mic-meter";

/** Brokers the WebRTC connection with OpenAI; see app/api/realtime/session/route.ts. */
const SESSION_ENDPOINT = "/api/realtime/session";
/** How long to wait for audio to start flowing once OpenAI has answered. */
const OPEN_TIMEOUT_MS = 15000;
/** A connection that stays "disconnected" this long is treated as lost. Chrome only gives up after ~30s. */
const DISCONNECT_GRACE_MS = 8000;
/** The assistant's voice arrives louder and steadier than a microphone does. */
const OUTPUT_GAIN = 5;

export type VoiceErrorCode =
  | "unsupported" // the browser has no WebRTC
  | "mic-blocked"
  | "mic-unavailable"
  | "not-configured" // the server has no OpenAI API key
  | "server" // the server or OpenAI refused to start a session
  | "network" // couldn't reach the server, or couldn't connect to OpenAI
  | "dropped" // an open conversation ended unexpectedly
  | "playback-blocked" // the browser wouldn't autoplay the reply; it resumes on the next click or key press
  | "playback" // the reply couldn't be played at all
  | "closed"; // close() was called while connecting

/** A voice connection failure whose message can be shown to the user as is. */
export class VoiceError extends Error {
  constructor(
    readonly code: VoiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "VoiceError";
  }
}

/** A Realtime API server event. Only `type` is guaranteed; see OpenAI's server events reference. */
export interface RealtimeServerEvent {
  type: string;
  [field: string]: unknown;
}

export interface RealtimeVoiceOptions {
  /** Every server event, as it arrives. */
  onEvent: (event: RealtimeServerEvent) => void;
  /**
   * An open conversation ended without close() being called: the network dropped,
   * OpenAI hung up, or the microphone went away.
   */
  onDisconnect: (error: VoiceError) => void;
  /** The reply couldn't be played. The conversation stays open. */
  onPlaybackError?: (error: VoiceError) => void;
  endpoint?: string;
}

type Status = "new" | "connecting" | "open" | "closed";

const isServerEvent = (value: unknown): value is RealtimeServerEvent =>
  typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";

/**
 * One speech-to-speech conversation with the OpenAI Realtime API, over WebRTC.
 *
 * The microphone streams straight to OpenAI and the reply plays as it arrives. Our
 * server only brokers the connection, so the API key never reaches the browser.
 * Each instance connects once; create a new one for the next conversation.
 */
export class RealtimeVoice {
  /** Whether this browser can hold a WebRTC voice conversation at all. */
  static isSupported() {
    return typeof window !== "undefined" && typeof window.RTCPeerConnection === "function";
  }

  private status: Status = "new";
  private abort = new AbortController();
  private context: AudioContext | null = null;
  private mic: MediaStream | null = null;
  private peer: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private speaker: HTMLAudioElement | null = null;
  private inputMeter: LevelMeter | null = null;
  private outputMeter: LevelMeter | null = null;
  /** Why the session ended while it was still connecting, if something broke rather than close(). */
  private failure: VoiceError | null = null;
  private graceTimer: ReturnType<typeof setTimeout> | undefined;
  private cancelPlaybackRetry: (() => void) | null = null;
  private playback: VoiceError | null = null;

  constructor(private options: RealtimeVoiceOptions) {}

  get isOpen() {
    return this.status === "open";
  }

  /** The current playback problem, if the reply can't be heard right now. */
  get playbackError() {
    return this.playback;
  }

  /**
   * Asks for the microphone, then connects to OpenAI. Call it from a click or tap so
   * the browser lets the reply play. Rejects with a VoiceError.
   */
  async connect(): Promise<void> {
    if (this.status !== "new") throw new Error("A RealtimeVoice connects once; create a new one to reconnect.");
    this.status = "connecting";
    try {
      await this.establish();
      this.throwIfClosed();
    } catch (error) {
      let failure: VoiceError;
      if (this.failure) {
        failure = this.failure;
      } else if (this.isClosed()) {
        failure = closedWhileConnecting();
      } else if (error instanceof VoiceError) {
        failure = error;
      } else {
        console.error("[RealtimeVoice] Connection failed:", error);
        failure = new VoiceError("network", "I couldn't start the voice connection. Tap the mic to try again.");
      }
      this.status = "closed";
      this.teardown();
      throw failure;
    }
    this.status = "open";
  }

  /** Sends a client event (see OpenAI's client events reference). False if the conversation isn't open. */
  send(event: { type: string; [field: string]: unknown }): boolean {
    if (this.status !== "open" || this.channel?.readyState !== "open") return false;
    this.channel.send(JSON.stringify(event));
    return true;
  }

  /** Adds a typed message to the conversation and asks for a spoken reply. */
  sendText(text: string) {
    return (
      this.send({
        type: "conversation.item.create",
        item: { type: "message", role: "user", content: [{ type: "input_text", text }] },
      }) && this.send({ type: "response.create" })
    );
  }

  /**
   * Answers a function call from the model with its result, then asks it to carry on with
   * its reply (unless `respond` is false, e.g. because the user has started talking).
   */
  sendToolResult(callId: string, output: string, respond = true) {
    const sent = this.send({
      type: "conversation.item.create",
      item: { type: "function_call_output", call_id: callId, output },
    });
    return sent && (!respond || this.send({ type: "response.create" }));
  }

  /** Stops the reply that's being generated or played. */
  interrupt() {
    this.send({ type: "response.cancel" });
    // Over WebRTC, OpenAI paces the audio out; this drops what it had already generated.
    this.send({ type: "output_audio_buffer.clear" });
  }

  /** Loudness of the user's microphone, 0–1. */
  inputLevel() {
    return this.inputMeter?.read() ?? 0;
  }

  /** Loudness of the assistant's voice as it plays, 0–1. */
  outputLevel() {
    return this.outputMeter?.read() ?? 0;
  }

  /** Ends the conversation and releases the microphone. Safe to call at any time, more than once. */
  close() {
    if (this.isClosed()) return;
    this.status = "closed";
    this.teardown();
  }

  private async establish() {
    if (!RealtimeVoice.isSupported()) {
      throw new VoiceError(
        "unsupported",
        "This browser can't hold a voice conversation. Try a current version of Chrome, Edge, Safari or Firefox.",
      );
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new VoiceError(
        "mic-unavailable",
        window.isSecureContext
          ? "I couldn't find a microphone to use."
          : "The microphone only works on a secure page. Open Jamak on localhost or over https.",
      );
    }

    // Created before the first await, while the tap that started this still counts as a
    // user gesture; Safari won't start audio processing otherwise.
    const context = new AudioContext();
    this.context = context;
    void context.resume().catch(() => {});

    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
    } catch (error) {
      this.throwIfClosed();
      throw isMicBlocked(error)
        ? new VoiceError(
            "mic-blocked",
            "Microphone access is blocked. Allow it for this site in your browser, then tap the mic again.",
          )
        : new VoiceError(
            "mic-unavailable",
            "I couldn't use your microphone. Check that it's connected and not in use by another app.",
          );
    }
    this.mic = mic;
    this.throwIfClosed();
    const [track] = mic.getAudioTracks();
    if (!track) throw new VoiceError("mic-unavailable", "I couldn't find a microphone to use.");
    // Fires if the device is unplugged or taken over, not when we stop the track ourselves.
    track.onended = () =>
      this.fail(new VoiceError("mic-unavailable", "Your microphone was disconnected. Tap the mic to start again."));
    this.inputMeter = new LevelMeter(context, mic);

    const peer = new RTCPeerConnection();
    this.peer = peer;
    peer.addTrack(track, mic);

    // The reply plays through a media element rather than Web Audio: echo cancellation
    // can only remove what it knows is playing, and Chrome only feeds remote WebRTC audio
    // into Web Audio (for the level meter) while a media element is playing it.
    const speaker = new Audio();
    speaker.autoplay = true;
    this.speaker = speaker;
    peer.ontrack = ({ track: remote, streams }) => {
      const stream = streams[0] ?? new MediaStream([remote]);
      speaker.srcObject = stream;
      this.play();
      this.outputMeter?.disconnect();
      this.outputMeter = new LevelMeter(context, stream, OUTPUT_GAIN);
    };

    const channel = peer.createDataChannel("oai-events");
    this.channel = channel;
    channel.onmessage = ({ data }) => this.receive(data);

    const offer = await peer.createOffer();
    this.throwIfClosed();
    await peer.setLocalDescription(offer);
    this.throwIfClosed();
    const answer = await this.requestAnswer(offer.sdp ?? "");
    this.throwIfClosed();
    await peer.setRemoteDescription({ type: "answer", sdp: answer });
    this.throwIfClosed();
    await this.whenOpen(peer, channel);

    channel.onclose = () =>
      this.fail(new VoiceError("dropped", "The voice connection ended. Tap the mic to start again."));
    peer.onconnectionstatechange = () => {
      const lost = () =>
        this.fail(new VoiceError("dropped", "The voice connection was lost. Tap the mic to start again."));
      clearTimeout(this.graceTimer);
      // "disconnected" can recover by itself (e.g. a Wi-Fi hiccup), so give it a moment.
      if (peer.connectionState === "failed") lost();
      else if (peer.connectionState === "disconnected") this.graceTimer = setTimeout(lost, DISCONNECT_GRACE_MS);
    };
  }

  private play() {
    this.speaker?.play().then(
      () => {
        this.playback = null;
      },
      (error: unknown) => this.playbackFailed(error),
    );
  }

  private playbackFailed(error: unknown) {
    if (this.isClosed()) return;
    const name = error instanceof DOMException ? error.name : "";
    // Superseded by a newer stream, or paused while closing.
    if (name === "AbortError") return;

    if (name === "NotAllowedError") {
      this.playback = new VoiceError("playback-blocked", "Your browser paused my voice. Click anywhere on the page to hear me.");
      this.retryPlaybackOnGesture();
    } else {
      console.error("[RealtimeVoice] The reply couldn't play:", error);
      this.playback = new VoiceError(
        "playback",
        "I couldn't play my voice. Check your sound output, or try another browser.",
      );
    }
    this.options.onPlaybackError?.(this.playback);
  }

  /** Autoplay was refused; browsers allow playback again after the next click or key press. */
  private retryPlaybackOnGesture() {
    if (this.cancelPlaybackRetry) return;
    const retry = () => {
      this.cancelPlaybackRetry?.();
      this.play();
    };
    window.addEventListener("click", retry, true);
    window.addEventListener("keydown", retry, true);
    this.cancelPlaybackRetry = () => {
      window.removeEventListener("click", retry, true);
      window.removeEventListener("keydown", retry, true);
      this.cancelPlaybackRetry = null;
    };
  }

  /** Sends our SDP offer through the server, which returns OpenAI's answer. */
  private async requestAnswer(offer: string): Promise<string> {
    let response: Response;
    try {
      response = await fetch(this.options.endpoint ?? SESSION_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: offer,
        signal: this.abort.signal,
      });
    } catch {
      this.throwIfClosed();
      throw new VoiceError("network", "I couldn't reach the Jamak server. Check that it's running, then try again.");
    }
    if (response.ok) return response.text();

    const body = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
    throw new VoiceError(
      body?.error === "not_configured" ? "not-configured" : "server",
      body?.message ?? `The server couldn't start a voice session (HTTP ${response.status}).`,
    );
  }

  /** Resolves once the event channel opens, which means audio is flowing too. */
  private whenOpen(peer: RTCPeerConnection, channel: RTCDataChannel) {
    return new Promise<void>((resolve, reject) => {
      const signal = this.abort.signal;
      const unreachable = () =>
        new VoiceError("network", "I couldn't open a voice connection to OpenAI. A firewall or VPN may be blocking it.");

      const settle = (error?: VoiceError) => {
        clearTimeout(timer);
        channel.removeEventListener("open", onOpen);
        peer.removeEventListener("connectionstatechange", onState);
        signal.removeEventListener("abort", onAbort);
        if (error) reject(error);
        else resolve();
      };
      const onOpen = () => settle();
      const onState = () => {
        if (peer.connectionState === "failed") settle(unreachable());
      };
      const onAbort = () => settle(closedWhileConnecting());
      const timer = setTimeout(() => settle(unreachable()), OPEN_TIMEOUT_MS);

      if (channel.readyState === "open") return settle();
      channel.addEventListener("open", onOpen);
      peer.addEventListener("connectionstatechange", onState);
      signal.addEventListener("abort", onAbort);
    });
  }

  private receive(data: unknown) {
    if (typeof data !== "string") return;
    let event: unknown;
    try {
      event = JSON.parse(data);
    } catch {
      return;
    }
    if (isServerEvent(event)) this.options.onEvent(event);
  }

  /**
   * Ends the session because something broke. While connecting, connect() rejects with
   * the error; once open, it's reported through onDisconnect.
   */
  private fail(error: VoiceError) {
    if (this.status === "connecting") {
      this.failure = error;
      this.status = "closed";
      this.teardown();
    } else if (this.status === "open") {
      this.status = "closed";
      this.teardown();
      this.options.onDisconnect(error);
    }
  }

  // A method rather than a comparison, so TypeScript doesn't narrow `status` across awaits.
  private isClosed() {
    return this.status === "closed";
  }

  private throwIfClosed() {
    if (this.isClosed()) throw closedWhileConnecting();
  }

  private teardown() {
    this.abort.abort();
    clearTimeout(this.graceTimer);
    this.cancelPlaybackRetry?.();
    const { channel, peer, mic, speaker, context } = this;
    if (channel) {
      channel.onmessage = null;
      channel.onclose = null;
      channel.close();
    }
    if (peer) {
      peer.ontrack = null;
      peer.onconnectionstatechange = null;
      peer.close();
    }
    mic?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    if (speaker) {
      speaker.pause();
      speaker.srcObject = null;
    }
    this.inputMeter?.disconnect();
    this.outputMeter?.disconnect();
    if (context && context.state !== "closed") void context.close().catch(() => {});

    this.channel = null;
    this.peer = null;
    this.mic = null;
    this.speaker = null;
    this.context = null;
    this.inputMeter = null;
    this.outputMeter = null;
  }
}

function closedWhileConnecting() {
  return new VoiceError("closed", "The voice connection was closed while connecting.");
}
