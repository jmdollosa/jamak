/**
 * Jamak's long-term memory during a live conversation, through this app's server
 * (app/api/memory/*), which talks to Jamak AI Core.
 *
 * - recallMemories() answers the model's recall_memories tool: Jamak looks something up.
 * - ConversationRecorder sends what was said, so the AI Core can learn from it.
 *
 * Both are best-effort. If memory is off or unavailable, the conversation carries on.
 */

/** The tool the model calls to look something up (declared in server/memory/session.ts). */
export const RECALL_MEMORIES_TOOL = "recall_memories";

const RECALL_ENDPOINT = "/api/memory/recall";
const REMEMBER_ENDPOINT = "/api/memory/remember";
/** The model waits for this mid-reply; the server gives the AI Core 3 seconds. */
const RECALL_TIMEOUT_MS = 4000;
/** What was said is sent once this many messages are ready, and when the conversation ends. */
const BATCH_SIZE = 8;
/** A turn still waiting for its transcript after this long is left out, so it can't hold up the rest. */
const TRANSCRIPT_WAIT_MS = 15000;

const str = (value: unknown) => (typeof value === "string" ? value : "");
const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;

/** The text of a message item's content parts of one type, e.g. ("input_text", "text"). */
function contentText(content: unknown, partType: string, key: string) {
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => field(part, "type") === partType)
    .map((part) => str(field(part, key)))
    .join(" ")
    .trim();
}

/**
 * Answers a recall_memories call (its JSON arguments) with what Jamak remembers, as text
 * for the model. Says so when nothing is relevant or memory can't be reached, so Jamak
 * can answer honestly instead of guessing.
 */
export async function recallMemories(argumentsJson: string): Promise<string> {
  let query = "";
  try {
    query = str(field(JSON.parse(argumentsJson), "query")).trim();
  } catch {
    // Not JSON: treated as no query.
  }
  if (!query) return "Nothing to look up.";

  try {
    const response = await fetch(RECALL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(RECALL_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return str(field(await response.json(), "text")) || "Nothing relevant in memory.";
  } catch (error) {
    console.warn("[memory] Couldn't recall:", error);
    return "Memory is unavailable right now.";
  }
}

export interface RememberedMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface MessageBatch {
  conversationId?: string;
  messages: RememberedMessage[];
}

/** Sends a batch and returns the AI Core's conversation id (null if that didn't work). */
export type SendBatch = (batch: MessageBatch, keepalive: boolean) => Promise<string | null>;

async function sendBatch(batch: MessageBatch, keepalive: boolean): Promise<string | null> {
  const response = await fetch(REMEMBER_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(batch),
    // Lets the last batch finish even if the page is being closed.
    keepalive,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return str(field(await response.json(), "conversationId")) || null;
}

interface Turn {
  /** The Realtime conversation item id; the AI Core stores each one once. */
  id: string;
  role: "user" | "assistant";
  text: string;
  /** The text is final: transcribed, typed, or known to be unavailable (then it's ""). */
  settled: boolean;
  since: number;
}

/**
 * Collects what's said in one voice conversation and sends it to the AI Core in order,
 * so Jamak can learn from it. Feed it every Realtime server event with handle(), and
 * call finish() when the conversation ends. It also finishes if the page is closed.
 *
 * Turns are kept in conversation order. A turn is sent once its words are known: typed
 * text right away, speech when its transcript arrives, Jamak's replies when their
 * transcript is done. Turns whose words never come (a failed transcription, a reply cut
 * off before any words) are left out.
 */
export class ConversationRecorder {
  private turns: Turn[] = [];
  private byId = new Map<string, Turn>();
  /** Turns before this index have been sent or left out. */
  private sentUpTo = 0;
  private conversationId: string | undefined;
  /** Batches go out one after another, so each carries the conversation id from the last. */
  private sending: Promise<void> = Promise.resolve();
  private finished = false;
  private readonly send: SendBatch;
  private readonly onPageHide = () => this.finish();

  constructor(send: SendBatch = sendBatch) {
    this.send = send;
    if (typeof window !== "undefined") window.addEventListener("pagehide", this.onPageHide);
  }

  /** Every Realtime server event of the conversation; the relevant ones are recorded. */
  handle(event: { type: string; [field: string]: unknown }) {
    if (this.finished) return;
    switch (event.type) {
      // A message joined the conversation. "created" is the event's older name.
      case "conversation.item.added":
      case "conversation.item.created": {
        const item = event.item;
        const role = field(item, "role");
        if (field(item, "type") !== "message" || (role !== "user" && role !== "assistant")) break;
        const turn = this.turn(str(field(item, "id")), role);
        // A typed message comes with its text; speech gets it from transcription.
        const typed = contentText(field(item, "content"), "input_text", "text");
        if (turn && typed) this.settle(turn, typed);
        break;
      }

      case "conversation.item.input_audio_transcription.completed":
        this.settle(this.turn(str(event.item_id), "user"), str(event.transcript));
        break;

      case "conversation.item.input_audio_transcription.failed":
        this.settle(this.turn(str(event.item_id), "user"), "");
        break;

      case "response.output_audio_transcript.done":
        this.settle(this.turn(str(event.item_id), "assistant"), str(event.transcript));
        break;

      // A reply ended. Settle any of its messages still without words (e.g. cut off),
      // then send what's ready.
      case "response.done": {
        const output = field(event.response, "output");
        for (const item of Array.isArray(output) ? output : []) {
          const turn = this.byId.get(str(field(item, "id")));
          if (turn && !turn.settled) {
            const content = field(item, "content");
            this.settle(turn, contentText(content, "output_audio", "transcript") || contentText(content, "output_text", "text"));
          }
        }
        this.flush(false);
        break;
      }
    }
  }

  /** The conversation is over: sends whatever hasn't been sent yet. Safe to call more than once. */
  finish() {
    if (this.finished) return;
    this.finished = true;
    if (typeof window !== "undefined") window.removeEventListener("pagehide", this.onPageHide);
    this.flush(true);
  }

  private turn(id: string, role: Turn["role"]): Turn | null {
    if (!id) return null;
    let turn = this.byId.get(id);
    if (!turn) {
      turn = { id, role, text: "", settled: false, since: Date.now() };
      this.turns.push(turn);
      this.byId.set(id, turn);
    }
    return turn;
  }

  private settle(turn: Turn | null, text: string) {
    if (!turn) return;
    turn.text = text.trim();
    turn.settled = true;
  }

  /** Sends the turns that are ready, in order, stopping at the first one still waiting for its words. */
  private flush(final: boolean) {
    const ready: RememberedMessage[] = [];
    const now = Date.now();
    let next = this.sentUpTo;
    for (; next < this.turns.length; next++) {
      const turn = this.turns[next];
      if (!turn.settled && !final && now - turn.since < TRANSCRIPT_WAIT_MS) break;
      if (turn.settled && turn.text) ready.push({ id: turn.id, role: turn.role, content: turn.text });
    }
    if (!final && ready.length < BATCH_SIZE) return;
    this.sentUpTo = next;
    if (ready.length === 0) return;

    this.sending = this.sending.then(async () => {
      try {
        const id = await this.send({ conversationId: this.conversationId, messages: ready }, final);
        if (id) this.conversationId = id;
      } catch (error) {
        console.warn("[memory] Couldn't save part of the conversation:", error);
      }
    });
  }
}
