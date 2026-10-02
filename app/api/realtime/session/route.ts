import { ASSISTANT_NAME, USER_NAME } from "@/lib/assistant/config";

/**
 * Starts an OpenAI Realtime voice session for the browser, using OpenAI's WebRTC
 * "unified interface": the browser POSTs its SDP offer here, we attach the API key and
 * the session config, forward both to OpenAI and return OpenAI's SDP answer. Audio then
 * flows directly between the browser and OpenAI.
 *
 * The API key and the session config never reach the browser, so a visitor can't
 * borrow the key or change the assistant's instructions.
 */

const OPENAI_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const DEFAULT_MODEL = "gpt-realtime-2.1";
const DEFAULT_VOICE = "marin";
/** Transcribes what the user says, for the caption. The model hears the audio itself. */
const TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
/** A browser's offer is a few KB. */
const MAX_OFFER_BYTES = 32 * 1024;
const UPSTREAM_TIMEOUT_MS = 15000;

const INSTRUCTIONS = `You are ${ASSISTANT_NAME}, a personal voice assistant, talking with ${USER_NAME}.

Personality: natural, warm and conversational, like a thoughtful friend who happens to be very capable. Relaxed and kind, never stiff or formal. A little light humour is fine when it fits.

How you speak:
- This is a spoken conversation. Keep replies short, usually one to three sentences, and offer more detail rather than giving it all at once.
- Talk the way people talk: no lists, headings, markdown, emoji or links.
- If you didn't catch something, or it could mean several things, ask a short question.
- Reply in the language ${USER_NAME} speaks.
- If ${USER_NAME} sounds stressed or down, slow down and be gentle.

What you can't do yet:
- You can't see or change calendars, tasks, reminders, notes, files or messages, and you can't look up live information such as the weather or the news.
- You don't remember earlier conversations.
- If asked for any of these, say plainly that you can't do it yet and help however you can by talking it through. Never claim to have done something you can't do.`;

function sessionConfig() {
  return {
    type: "realtime",
    model: process.env.OPENAI_REALTIME_MODEL || DEFAULT_MODEL,
    instructions: INSTRUCTIONS,
    output_modalities: ["audio"],
    audio: {
      input: {
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

function fail(status: number, error: string, message: string) {
  return Response.json({ error, message }, { status, headers: { "Cache-Control": "no-store" } });
}

/** What the browser is told when OpenAI refuses. The details go to the server log only. */
function upstreamMessage(status: number) {
  if (status === 401) return "OpenAI rejected the server's API key. Check OPENAI_API_KEY in .env.local.";
  if (status === 403 || status === 404) {
    return "This API key can't use the Realtime model. Check the key's project permissions and OPENAI_REALTIME_MODEL.";
  }
  if (status === 429) return "OpenAI's rate limit or usage quota has been reached. Try again shortly.";
  if (status >= 500) return "OpenAI's voice service had a problem. Try again shortly.";
  return "OpenAI couldn't start the voice session. The server log has the details.";
}

export async function POST(request: Request) {
  // Accepting only application/sdp also means browsers must send a CORS preflight, which
  // this route doesn't grant, so other websites can't call it from a visitor's browser.
  if (!request.headers.get("content-type")?.startsWith("application/sdp")) {
    return fail(415, "bad_request", "Send the WebRTC offer as application/sdp.");
  }
  if (Number(request.headers.get("content-length")) > MAX_OFFER_BYTES) {
    return fail(413, "bad_request", "That offer is too large.");
  }
  const offer = await request.text();
  if (!offer.startsWith("v=0") || offer.length > MAX_OFFER_BYTES) {
    return fail(400, "bad_request", "That isn't a WebRTC offer.");
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return fail(503, "not_configured", "Voice isn't set up yet. Add OPENAI_API_KEY to .env.local and restart the server.");
  }

  const form = new FormData();
  form.set("sdp", offer);
  form.set("session", JSON.stringify(sessionConfig()));

  let upstream: Response;
  let body: string;
  try {
    upstream = await fetch(OPENAI_CALLS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)]),
    });
    body = await upstream.text();
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    console.error("[realtime] Couldn't reach OpenAI:", error);
    return fail(
      timedOut ? 504 : 502,
      "upstream_unreachable",
      timedOut ? "OpenAI took too long to answer. Try again." : "The server couldn't reach OpenAI. Check its internet connection.",
    );
  }

  if (!upstream.ok) {
    console.error(`[realtime] OpenAI refused the session (HTTP ${upstream.status}):`, body);
    return fail(502, "upstream_error", upstreamMessage(upstream.status));
  }

  return new Response(body, {
    status: 201,
    headers: { "Content-Type": "application/sdp", "Cache-Control": "no-store" },
  });
}
