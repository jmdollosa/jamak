# Jamak AI

A voice-driven personal assistant with a living orb. You talk to Jamak and it talks
back, using the [OpenAI Realtime API](https://developers.openai.com/api/docs/guides/realtime)
(speech to speech, over WebRTC).

## Setup

You need Node.js 20.9 or later, a microphone, and an OpenAI API key with access to the
Realtime API.

```bash
npm install
cp .env.example .env.local   # then put your key in OPENAI_API_KEY
npm run dev
```

Open http://localhost:3000. Restart `npm run dev` whenever you change `.env.local`.
(`.env` works too; both are git-ignored.)

| Variable | Required | Default | |
|---|---|---|---|
| `OPENAI_API_KEY` | yes | | Read only by the server. Never prefix it with `NEXT_PUBLIC_`. |
| `OPENAI_REALTIME_MODEL` | no | `gpt-realtime-2.1` | |
| `OPENAI_REALTIME_VOICE` | no | `marin` | e.g. `cedar`, `coral`, `sage` |

## Talking to Jamak

- **Start:** tap the mic button, the orb, or press Space. Allow the microphone when the
  browser asks. The caption shows "Connecting…", then the orb turns cyan: Jamak is listening.
  The mic button stays lit for as long as the conversation is open.
- **Talk normally.** There's nothing to press between sentences: Jamak notices when
  you've finished, thinks (violet), and answers out loud (indigo) with the reply written
  underneath. Then it listens again, until you end the conversation.
- **Interrupt** by talking over Jamak.
- **End** by tapping the mic button or the orb again, or pressing Esc. This releases the
  microphone (the browser's mic indicator goes off). Jamak also hangs up by itself after
  90 seconds of quiet.
- **Type** with the keyboard button: during a conversation, typed messages join it and
  get a spoken reply.

The states panel (sliders button) still previews every orb state, and "Play sample
conversation" and the panel's microphone switch run the simulated conversation, for
design work without using the API.

## How it works

```
Browser                                 Next.js server                      OpenAI
mic + RTCPeerConnection ── SDP offer ─▶ POST /api/realtime/session ─ offer + key + session config ─▶ /v1/realtime/calls
                        ◀─ SDP answer ──────────────────────────────────────────
           ◀════ audio both ways, plus the "oai-events" data channel, direct to OpenAI ════▶
```

The server only brokers the connection (OpenAI's "unified interface"), so the API key
and the session config never reach the browser.

| File | |
|---|---|
| `app/api/realtime/session/route.ts` | Starts a session: model, voice, personality instructions, turn detection, transcription. |
| `lib/assistant/realtime-voice.ts` | `RealtimeVoice`: one WebRTC conversation. Microphone, playback, event channel, voice levels, errors. |
| `lib/assistant/assistant-controller.ts` | Maps Realtime events onto the orb states and captions; handles interrupting, hanging up and errors. |
| `lib/assistant/level-meter.ts` | Loudness of the mic and of Jamak's voice, which drives the orb and the waveforms. |

## Testing

**Server route, without a browser.** With `npm run dev` running:

```bash
curl -i -X POST -H 'Content-Type: application/sdp' --data-binary $'v=0\r\n' \
  http://localhost:3000/api/realtime/session
```

- No key configured: `503` with `"error":"not_configured"`.
- Key configured: `502` with `"error":"upstream_error"`, because that isn't a real
  offer. The server log shows OpenAI's reason. A real offer only comes from a browser.

**A conversation.** Use Chrome, Edge or Safari on localhost:

1. Click the orb (or the mic button) and allow the microphone. Wait for "Listening…"
   (cyan orb, lit mic button).
2. Say "Hi Jamak, how are you today?" and stop talking. The orb should go violet, then
   indigo as you hear the answer; your words appear in quotes above the reply.
3. Without pressing anything, ask a follow-up. Jamak should answer it too, with context.
4. Ask something that needs a long answer, and talk over it. Jamak should stop and listen.
5. Click the orb again, or press Esc. The orb goes idle and the browser's mic indicator
   (in the tab or address bar) turns off.

**Errors.** Each should leave the orb idle (mic button not lit) with an explanation in
the caption:

- Block the microphone for the site, then tap the mic: "Microphone access is blocked…".
- Unplug or switch off the microphone during a conversation: "Your microphone was disconnected…".
- Set a wrong `OPENAI_API_KEY` and restart: "OpenAI rejected the server's API key…".
- Stop `npm run dev` with the page still open, then tap the mic: "I couldn't reach the Jamak server…".
- Turn off Wi-Fi during a conversation: within about 15 seconds, "The voice connection was lost…".

Tapping the mic twice quickly should never leave two conversations or two microphone
streams open: the second tap cancels the first.

## Troubleshooting

- **Jamak keeps interrupting itself:** it's hearing its own voice through the speakers.
  Use headphones, or lower the volume.
- **"Your browser paused my voice":** the browser blocked autoplay. Click anywhere on
  the page and the reply plays. (It shouldn't happen when you start with a click.)
- **No sound, but the reply text appears:** check the system output device and volume;
  the reply plays on the browser's default output.
- **"A firewall or VPN may be blocking it":** WebRTC needs outbound UDP. Try another
  network, or turn off the VPN.
- **Testing from a phone:** browsers only allow the microphone on https or localhost,
  so `http://192.168…` won't work.
- **"This API key can't use the Realtime model":** check the key's project permissions,
  or set `OPENAI_REALTIME_MODEL` to a Realtime model your account can use.

## Before deploying

- `/api/realtime/session` has no login, so anyone who can reach it can start
  conversations billed to your key. Add authentication or rate limiting first.
- The app now needs a Node.js server (`npm run build && npm start`, Vercel, Railway…),
  not static hosting.
- Realtime audio is billed per use; see OpenAI's pricing.
