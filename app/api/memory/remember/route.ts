import { fail, field, readJson } from "@/server/http";
import {
  type ConversationMessage,
  MAX_MESSAGE_CHARS,
  MAX_MESSAGES,
  MAX_TOTAL_CHARS,
  rememberMessages,
} from "@/server/memory/ai-core";

/**
 * Hands what was said in a voice conversation to Jamak AI Core, which saves it and learns
 * from it in the background (see lib/assistant/memory.ts, which sends it in batches).
 *
 * Request:  `{ conversationId?, messages: [{ id, role, content }] }`
 * Response: `{ conversationId }`, the id to send with the conversation's next batch
 *           (null if the AI Core couldn't be reached; the batch is then lost).
 */

const MAX_BODY_BYTES = 256 * 1024;
const MESSAGE_ID = /^[!-~]{1,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const { body, error } = await readJson(request, MAX_BODY_BYTES);
  if (error) return error;

  const batch = parseBatch(body);
  if (typeof batch === "string") return fail(400, "bad_request", batch);
  const conversationId = await rememberMessages(batch.messages, batch.conversationId);
  return Response.json({ conversationId }, { headers: { "Cache-Control": "no-store" } });
}

/** The batch, or what's wrong with it. */
function parseBatch(body: unknown): { messages: ConversationMessage[]; conversationId?: string } | string {
  const conversationId = field(body, "conversationId");
  if (conversationId !== undefined && conversationId !== null && (typeof conversationId !== "string" || !UUID.test(conversationId))) {
    return "conversationId must be the id from a previous response.";
  }
  const items = field(body, "messages");
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_MESSAGES) {
    return `Send 1 to ${MAX_MESSAGES} messages.`;
  }

  const messages: ConversationMessage[] = [];
  for (const item of items) {
    const id = field(item, "id");
    const role = field(item, "role");
    const content = field(item, "content");
    if (typeof id !== "string" || !MESSAGE_ID.test(id)) return "Each message needs its conversation item id.";
    if (role !== "user" && role !== "assistant") return "A message's role must be user or assistant.";
    if (typeof content !== "string" || !content.trim()) return "A message can't be empty.";
    messages.push({ id, role, content: content.trim().slice(0, MAX_MESSAGE_CHARS) });
  }
  if (messages.reduce((total, message) => total + message.content.length, 0) > MAX_TOTAL_CHARS) {
    return "That's too much text for one batch.";
  }
  return { messages, conversationId: typeof conversationId === "string" ? conversationId : undefined };
}
