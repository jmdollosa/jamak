import { PersonalityError } from "@/server/voice/personality";
import { RealtimeSessionError, startRealtimeSession } from "@/server/voice/realtime";

/**
 * Starts a voice conversation: the browser POSTs its WebRTC offer and gets OpenAI's
 * answer back (see server/voice/realtime.ts). Audio then flows directly between the
 * browser and OpenAI.
 *
 * The API key, the session config and Jamak's personality stay on the server, so a
 * visitor can't borrow the key or change the assistant's instructions.
 */

/** A browser's offer is a few KB. */
const MAX_OFFER_BYTES = 32 * 1024;

function fail(status: number, error: string, message: string) {
  return Response.json({ error, message }, { status, headers: { "Cache-Control": "no-store" } });
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

  try {
    const answer = await startRealtimeSession(offer, request.signal);
    return new Response(answer, {
      status: 201,
      headers: { "Content-Type": "application/sdp", "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof RealtimeSessionError) return fail(error.status, error.code, error.message);
    if (error instanceof PersonalityError) {
      console.error("[personality]", error.message, error.cause ?? "");
      return fail(500, "personality_unavailable", "Jamak's personality couldn't be loaded. The server log has the details.");
    }
    throw error;
  }
}
