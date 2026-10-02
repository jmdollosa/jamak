import "server-only";
import { loadPersonality } from "./personality";

/**
 * Starts OpenAI Realtime voice sessions for the browser, using the WebRTC "unified
 * interface": the browser's SDP offer and our session config go to OpenAI together,
 * with the API key, and OpenAI's SDP answer goes back to the browser.
 *
 * This file is about how Jamak sounds and listens. What Jamak says, and how, is its
 * personality: config/personality.md, loaded by ./personality.ts.
 */

const OPENAI_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const DEFAULT_MODEL = "gpt-realtime-2.1";
const DEFAULT_VOICE = "marin";
/** Transcribes what the user says, for the caption. The model hears the audio itself. */
const TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const UPSTREAM_TIMEOUT_MS = 15000;

/** A session couldn't be started. `message` is safe to show the user; details go to the server log. */
export class RealtimeSessionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RealtimeSessionError";
  }
}

/** Voice, audio and turn-taking settings. Everything in the session except the instructions. */
function voiceConfig() {
  return {
    type: "realtime",
    model: process.env.OPENAI_REALTIME_MODEL || DEFAULT_MODEL,
    output_modalities: ["audio"],
    audio: {
      input: {
        // Filters the microphone before turn detection hears it. "far_field" suits laptop
        // microphones, which also pick up Jamak's voice from the speakers; the browser's
        // echo cancellation removes most of that before it gets here.
        noise_reduction: { type: "far_field" },
        transcription: { model: TRANSCRIPTION_MODEL },
        // OpenAI decides when the user has finished a thought, replies on its own, and
        // stops talking if the user talks over it.
        turn_detection: {
          type: "semantic_vad",
          eagerness: "auto",
          create_response: true,
          interrupt_response: true,
        },
      },
      output: { voice: process.env.OPENAI_REALTIME_VOICE || DEFAULT_VOICE },
    },
  };
}

/**
 * The full session config: voice settings plus the current personality as instructions.
 *
 * Instructions can also be changed on a live session with a `session.update` event
 * (`{ type: "session.update", session: { type: "realtime", instructions } }`), which is
 * how personality edits could later reach a conversation that's already running.
 */
async function sessionConfig() {
  return { ...voiceConfig(), instructions: await loadPersonality() };
}

/** What the browser is told when OpenAI refuses. */
function upstreamMessage(status: number) {
  if (status === 401) return "OpenAI rejected the server's API key. Check OPENAI_API_KEY in .env.local.";
  if (status === 403 || status === 404) {
    return "This API key can't use the Realtime model. Check the key's project permissions and OPENAI_REALTIME_MODEL.";
  }
  if (status === 429) return "OpenAI's rate limit or usage quota has been reached. Try again shortly.";
  if (status >= 500) return "OpenAI's voice service had a problem. Try again shortly.";
  return "OpenAI couldn't start the voice session. The server log has the details.";
}

/**
 * Starts a voice session for a browser's WebRTC offer and returns OpenAI's SDP answer.
 * Throws RealtimeSessionError, or PersonalityError if the personality can't be loaded.
 */
export async function startRealtimeSession(offer: string, signal?: AbortSignal): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new RealtimeSessionError(
      503,
      "not_configured",
      "Voice isn't set up yet. Add OPENAI_API_KEY to .env.local and restart the server.",
    );
  }

  const form = new FormData();
  form.set("sdp", offer);
  form.set("session", JSON.stringify(await sessionConfig()));

  const timeout = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
  let response: Response;
  let body: string;
  try {
    response = await fetch(OPENAI_CALLS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    body = await response.text();
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    console.error("[realtime] Couldn't reach OpenAI:", error);
    throw timedOut
      ? new RealtimeSessionError(504, "upstream_unreachable", "OpenAI took too long to answer. Try again.")
      : new RealtimeSessionError(502, "upstream_unreachable", "The server couldn't reach OpenAI. Check its internet connection.");
  }

  if (!response.ok) {
    console.error(`[realtime] OpenAI refused the session (HTTP ${response.status}):`, body);
    throw new RealtimeSessionError(502, "upstream_error", upstreamMessage(response.status));
  }
  return body;
}
