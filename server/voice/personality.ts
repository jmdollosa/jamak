import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { USER_NAME } from "@/lib/assistant/config";

/** Jamak's personality, in plain Markdown. Committed to Git and edited by hand. */
const PERSONALITY_PATH = "config/personality.md";
const PERSONALITY_FILE = path.join(process.cwd(), PERSONALITY_PATH);

/** Values for the {{placeholders}} the file may use. */
const PLACEHOLDERS: Record<string, string> = {
  user_name: USER_NAME,
};

/** The personality file couldn't be used. The message names the file and the problem. */
export class PersonalityError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PersonalityError";
  }
}

/** The last version that loaded, used if the file is briefly unreadable mid-edit. */
let lastGood: string | null = null;

/**
 * Jamak's personality instructions, read from config/personality.md.
 *
 * The file is read again for every new conversation, so a saved edit applies to the
 * next one without restarting the server. If it can't be read but an earlier version
 * loaded, that version is used and a warning logged; otherwise this throws a
 * PersonalityError.
 */
export async function loadPersonality(): Promise<string> {
  let instructions: string;
  try {
    instructions = prepare(await readFile(PERSONALITY_FILE, "utf8"));
    if (!instructions) throw new PersonalityError(`${PERSONALITY_PATH} has no instructions in it.`);
  } catch (error) {
    const failure = error instanceof PersonalityError ? error : new PersonalityError(describe(error), { cause: error });
    if (lastGood === null) throw failure;
    console.warn(`[personality] ${failure.message} Using the last version that loaded.`);
    return lastGood;
  }

  if (lastGood !== null && instructions !== lastGood && process.env.NODE_ENV === "development") {
    console.info(`[personality] Loaded the updated ${PERSONALITY_PATH}.`);
  }
  lastGood = instructions;
  return instructions;
}

/** Drops comments meant for people editing the file, and fills in placeholders. */
function prepare(markdown: string) {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) => {
      if (name in PLACEHOLDERS) return PLACEHOLDERS[name];
      console.warn(`[personality] Unknown placeholder ${match} in ${PERSONALITY_PATH}; leaving it as is.`);
      return match;
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function describe(error: unknown) {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  if (code === "ENOENT") return `${PERSONALITY_PATH} wasn't found.`;
  if (code === "EISDIR") return `${PERSONALITY_PATH} is a folder, not a file.`;
  if (code === "EACCES" || code === "EPERM") return `${PERSONALITY_PATH} can't be read (permission denied).`;
  return `${PERSONALITY_PATH} couldn't be read: ${error instanceof Error ? error.message : String(error)}`;
}
