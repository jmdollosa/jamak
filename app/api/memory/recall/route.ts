import { fail, field, readJson } from "@/server/http";
import { memoryContext } from "@/server/memory/ai-core";

/**
 * Looks something up in Jamak's memory, for the recall_memories tool during a voice
 * conversation (see lib/assistant/memory.ts). Answers `{ text }`: what Jamak remembers
 * about the query, ready to hand to the model, or "" if nothing is relevant or memory is
 * unavailable.
 */

const MAX_BODY_BYTES = 8 * 1024;
/** The model is waiting for this answer, mid-conversation. */
const RECALL_TIMEOUT_MS = 3000;
const RECALL_MAX_TOKENS = 300;

export async function POST(request: Request) {
  const { body, error } = await readJson(request, MAX_BODY_BYTES);
  if (error) return error;

  const query = field(body, "query");
  if (typeof query !== "string" || !query.trim()) {
    return fail(400, "bad_request", "Send the query to look up.");
  }
  const text = await memoryContext(query.trim(), { maxTokens: RECALL_MAX_TOKENS, timeoutMs: RECALL_TIMEOUT_MS });
  return Response.json({ text }, { headers: { "Cache-Control": "no-store" } });
}
