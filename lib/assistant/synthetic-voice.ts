const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Speech-like loudness for the assistant's own voice, until real TTS audio exists. */
export function speechLevel(t: number): number {
  const syllables = Math.abs(Math.sin(t * 9.4 + Math.sin(t * 2.3) * 1.6));
  const phrasing = 0.5 + 0.5 * Math.sin(t * 1.7 + Math.sin(t * 0.6) * 2);
  return clamp01(syllables * (0.3 + 0.7 * phrasing));
}

/** A stand-in for the user's voice when the microphone is off or unavailable. */
export function simulatedVoiceLevel(t: number): number {
  const bursts = Math.max(0, Math.sin(t * 2.6) * 0.65 + Math.sin(t * 5.3 + 1.1) * 0.35);
  return clamp01(bursts * (0.55 + 0.45 * Math.abs(Math.sin(t * 13.7))));
}
