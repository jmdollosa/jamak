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

| Variable | Required | Default | |
|---|---|---|---|
| `OPENAI_API_KEY` | yes | | Read only by the server. Never prefix it with `NEXT_PUBLIC_`. |
| `OPENAI_REALTIME_MODEL` | no | `gpt-realtime-2.1` | |
| `OPENAI_REALTIME_VOICE` | no | `marin` | e.g. `cedar`, `coral`, `sage` |

## Talking to Jamak

- **Start:** tap the mic button, the orb, or press Space. Allow the microphone when the
  browser asks. The caption shows "Connecting…", then the orb turns cyan: Jamak is listening.
- **Talk normally.** Jamak notices when you've finished, thinks (violet), and answers
  out loud (indigo) with the reply written underneath. The conversation keeps going
  until you end it.
- **Interrupt** by talking over Jamak, or by tapping the mic while it's thinking or talking.
- **End** by tapping the mic while Jamak is listening, or pressing Esc. It also hangs up
  by itself after 90 seconds of quiet.
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

1. Tap the mic, allow the microphone, and wait for "Listening…" (cyan orb).
2. Say "Hi Jamak, how are you today?" The orb should go violet, then indigo as it
   answers out loud; your words appear in quotes above the reply.
3. Ask something longer, and talk over the answer. Jamak should stop and listen.
4. Tap the mic or press Esc. The orb goes back to idle and the browser's mic indicator turns off.

**Errors.** Each should leave the orb idle with an explanation in the caption:

- Block the microphone for the site, then tap the mic.
- Set a wrong `OPENAI_API_KEY` and restart: "OpenAI rejected the server's API key…".
- Stop `npm run dev` with the page still open, then tap the mic: "I couldn't reach the Jamak server…".
- Turn off Wi-Fi during a conversation: within about 30 seconds (when the browser gives
  up on the connection), "The voice connection was lost…".

## Troubleshooting

- **Jamak keeps interrupting itself:** it's hearing its own voice through the speakers.
  Use headphones, or lower the volume.
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
