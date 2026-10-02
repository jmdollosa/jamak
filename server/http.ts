import "server-only";

/** An error response the browser code can show or log: `{ error, message }`. */
export function fail(status: number, error: string, message: string) {
  return Response.json({ error, message }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Reads a small JSON request body, or returns the error response to send instead.
 *
 * Accepting only application/json also means browsers must send a CORS preflight, which
 * these routes don't grant, so other websites can't call them from a visitor's browser.
 */
export async function readJson(
  request: Request,
  maxBytes: number,
): Promise<{ body: unknown; error?: never } | { error: Response; body?: never }> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return { error: fail(415, "bad_request", "Send the request as application/json.") };
  }
  if (Number(request.headers.get("content-length")) > maxBytes) {
    return { error: fail(413, "bad_request", "That request is too large.") };
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    return { error: fail(413, "bad_request", "That request is too large.") };
  }
  try {
    return { body: JSON.parse(text) as unknown };
  } catch {
    return { error: fail(400, "bad_request", "That isn't valid JSON.") };
  }
}

/** `value[key]` if `value` is an object, else undefined. */
export const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
