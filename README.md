# dSpaces

Decentralized video conferencing on [dTelecom](https://video.dtelecom.org/). Sign in with a Solana wallet or email OTP, then create or join a WebRTC room.

## Features

- **WebRTC calls** — camera, microphone, and screen sharing on dTelecom’s decentralized SFU network
- **Multi-wallet login** — Phantom, Solflare, and Backpack on Solana mainnet-beta
- **Email OTP** — passwordless sign-in with a one-time code
- **Instant rooms** — create a meeting or join with a Room ID / invite link
- **Host moderation** — mute and remove participants through the dTelecom `RoomServiceClient` (host tokens include `roomAdmin`)
- **Important Meetings** — stage-style rooms with raise-hand, speakers, and co-hosts
- **Server-side transcription** — a backend AI agent joins the room and transcribes everyone’s audio (Gemini)
- **Ask AI / summaries** — question the live transcript and generate a post-call recap with Gemini
- **Profiles** — display name and avatar, stored in Vercel KV and participant metadata

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the env template and fill in your keys:

   ```bash
   cp .env.example .env.local
   ```

   Required values:

   | Variable | Purpose |
   | --- | --- |
   | `DTELECOM_API_KEY` / `DTELECOM_API_SECRET` | dTelecom Cloud credentials from [cloud.dtelecom.org](https://cloud.dtelecom.org) |
   | `GEMINI_API_KEY` | Google Gemini — chat, summaries, and transcription |
   | `EMAIL_USER` / `EMAIL_PASS` | SMTP account for Email OTP |
   | `NEXTAUTH_SECRET` | HMAC secret for OTP tokens |
   | `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Vercel KV (host identity, avatars, transcripts) |

3. Run the app:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## License

MIT
