import "server-only";

/**
 * Jamak AI Core: the service that keeps Jamak's long-term memory (the jamak-ai-core
 * repository). Only this server talks to it, with the AI Core's API key and the user's
 * id; the browser never does, and never sees either.
 *
 * Memory is optional and best-effort. If AI_CORE_URL, AI_CORE_API_KEY or JAMAK_USER_ID
 * isn't set, or the AI Core is slow or down, Jamak carries on without memories. Problems
 * go to the server log, never to the conversation.
 */

interface AiCoreSettings {
  url: string;
  apiKey: string;
  /**
   * Whose memories these are. A fixed id while Jamak has a single user; with sign-in,
   * this becomes the signed-in user's id.
   */
  userId: string;
}

/** One message of a conversation, for the AI Core to learn from. */
export interface ConversationMessage {
  /** The Realtime item id: the AI Core stores each id once, so re-sending is harmless. */
  id: string;
  role: "user" | "assistant";
  content: string;
}

/** Room for the AI Core's own limits: 1–100 messages, at most 50,000 characters in total. */
export const MAX_MESSAGES = 100;
export const MAX_MESSAGE_CHARS = 20_000;
export const MAX_TOTAL_CHARS = 50_000;

let warnedNotConfigured = false;

function settings(): AiCoreSettings | null {
  const url = process.env.AI_CORE_URL?.trim().replace(/\/+$/, "");
  const apiKey = process.env.AI_CORE_API_KEY?.trim();
  const userId = process.env.JAMAK_USER_ID?.trim();
  if (url && apiKey && userId) return { url, apiKey, userId };
  if (!warnedNotConfigured) {
    warnedNotConfigured = true;
    console.warn("[memory] Memory is off: set AI_CORE_URL, AI_CORE_API_KEY and JAMAK_USER_ID to turn it on.");
  }
  return null;
}

/** Whether memory is set up. It can still be unavailable at any moment. */
export function memoryEnabled() {
  return settings() !== null;
}

/** POSTs to the AI Core and returns its JSON, or null if memory is off or the call failed. */
async function post<T>(path: string, body: unknown, timeoutMs: number): Promise<T | null> {
  const ai = settings();
  if (!ai) return null;
  try {
    const response = await fetch(`${ai.url}/api/v1${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ai.apiKey}`,
        "X-User-ID": ai.userId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!response.ok) {
      console.warn(`[memory] The AI Core refused ${path} (HTTP ${response.status}):`, await response.text().catch(() => ""));
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    console.warn(`[memory] ${timedOut ? "The AI Core took too long" : "Couldn't reach the AI Core"} for ${path}:`, timedOut ? "" : error);
    return null;
  }
}

/**
 * What Jamak remembers that's relevant to `query`, as text ready to add to its
 * instructions (a heading plus a few lines). Empty if nothing is relevant, or memory is
 * unavailable.
 */
export async function memoryContext(
  query: string,
  { maxTokens, timeoutMs }: { maxTokens?: number; timeoutMs: number },
): Promise<string> {
  const result = await post<{ text?: unknown }>(
    "/context",
    { query: query.slice(0, 2000), max_tokens: maxTokens },
    timeoutMs,
  );
  return typeof result?.text === "string" ? result.text : "";
}

/**
 * Hands conversation messages to the AI Core, which saves them and learns from them in
 * the background (a few seconds later). Returns the AI Core's id for the conversation,
 * to send with its later messages, or null if that didn't work.
 */
export async function rememberMessages(
  messages: ConversationMessage[],
  conversationId: string | undefined,
): Promise<string | null> {
  const result = await post<{ conversation_id?: unknown }>(
    "/memories/extract",
    { messages, conversation_id: conversationId },
    5000,
  );
  return typeof result?.conversation_id === "string" ? result.conversation_id : null;
}
