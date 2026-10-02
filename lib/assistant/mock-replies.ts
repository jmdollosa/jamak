// Placeholder replies so the interface can be exercised end to end.
// Replace replyFor() with the real model call when the AI is connected.

export interface Reply {
  text: string;
  mood: "neutral" | "warm";
  /** Confirmation shown with the success state once the reply has been spoken. */
  done?: string;
}

const MEETINGS: Reply = {
  text: "You have three meetings today. The first is a design review at 10:00, so I'll remind you at 9:45.",
  mood: "neutral",
  done: "Reminder set for 9:45 AM",
};

const WEATHER: Reply = {
  text: "It's 24 degrees and clear right now, with a light breeze this evening. Good weather for a walk.",
  mood: "neutral",
};

const TASK: Reply = {
  text: "I've added “Send the project proposal” to your tasks for tomorrow morning.",
  mood: "neutral",
  done: "Task added",
};

const COMFORT: Reply = {
  text: "That sounds like a heavy day. Your evening is clear, so I'll keep notifications quiet and let you rest.",
  mood: "warm",
  done: "Notifications paused until 8 AM",
};

const NOT_CONNECTED: Reply = {
  text: "I can't answer that yet because my AI isn't connected. For now, I can show you how I listen, think and reply.",
  mood: "neutral",
};

/** Without speech-to-text we can't know what was said, so voice turns cycle through these. */
const VOICE_ROTATION = [MEETINGS, WEATHER, TASK, COMFORT];

const WARM = /\b(sad|tired|exhausted|stress(ed|ful)?|anxious|lonely|upset|overwhelm(ed|ing)?|worried|rough day|bad day)\b/i;

export function replyFor(text: string | null, turn: number): Reply {
  if (text === null) return VOICE_ROTATION[turn % VOICE_ROTATION.length];
  if (WARM.test(text)) return COMFORT;
  if (/\b(weather|rain|temperature|outside|forecast)\b/i.test(text)) return WEATHER;
  if (/\b(remind|meeting|meetings|calendar|schedule|today)\b/i.test(text)) return MEETINGS;
  if (/\b(task|tasks|todo|to-do)\b/i.test(text)) return TASK;
  return NOT_CONNECTED;
}
