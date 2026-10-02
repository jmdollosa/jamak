import "server-only";
import { RECALL_MEMORIES_TOOL } from "@/lib/assistant/memory";
import { memoryContext, memoryEnabled } from "./ai-core";

/**
 * Memory in a voice session: what Jamak already knows when the conversation starts,
 * and a tool to look up more while it's going on. How Jamak should use its memories is
 * part of its personality (config/personality.md).
 */

/** Asked once per conversation, before it starts: the user's core context. */
const STARTING_QUERY = "Who is the user, what are they working on, and how do they like to be helped?";
/** Keeps the start of a conversation quick; without an answer by then, Jamak starts without memories. */
const STARTING_TIMEOUT_MS = 1500;
const STARTING_MAX_TOKENS = 400;

/** The memory parts of a Realtime session config: extra instructions and the recall tool. */
export async function sessionMemory(): Promise<{ instructions: string; tools: object[] }> {
  if (!memoryEnabled()) return { instructions: "", tools: [] };
  const instructions = await memoryContext(STARTING_QUERY, {
    maxTokens: STARTING_MAX_TOKENS,
    timeoutMs: STARTING_TIMEOUT_MS,
  });
  return { instructions, tools: [RECALL_TOOL] };
}

/** Answered in the browser (lib/assistant/memory.ts), through app/api/memory/recall. */
const RECALL_TOOL = {
  type: "function",
  name: RECALL_MEMORIES_TOOL,
  description:
    "Look up what you remember about the user from earlier conversations: their preferences, people " +
    "in their life, projects, goals, decisions and past events. Use it when they mention something " +
    "personal or from the past that isn't in this conversation or your instructions, or ask what you " +
    "remember. Don't use it for general knowledge.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "What to look up, in plain words, e.g. \"the user's sister\"." },
    },
    required: ["query"],
  },
};
