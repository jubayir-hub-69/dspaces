<div align="center">

# 🛰️ dSpaces

**The AI-Powered Community Hub for dTelecom**

*Real-time voice & video meetings — with built-in AI, smart summaries, and Web3-native auth. Built on dTelecom's decentralized infrastructure.*

[![Live Demo](https://img.shields.io/badge/Live%20Demo-dspaces.vercel.app-6366f1?style=for-the-badge&logo=vercel)](https://dspaces.vercel.app)
[![Built on dTelecom](https://img.shields.io/badge/Built%20on-dTelecom-0ea5e9?style=for-the-badge)](https://dtelecom.org)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![Solana](https://img.shields.io/badge/Solana-Wallet%20Auth-9945FF?style=for-the-badge&logo=solana)](https://solana.com)

</div>

---

## What is dSpaces?

Most Web3 communities are stuck running their calls on Zoom or Google Meet — centralized platforms that don't talk to wallets, don't understand crypto context, and don't reward contributors.

**dSpaces fixes that.**

It's a decentralized meeting platform built on top of dTelecom's dRTC infrastructure — combining real-time video conferencing with an AI layer that transcribes, translates, summarizes, and moderates every session. No middlemen. No subscriptions. Just connect your wallet and start a room.

Built specifically for dTelecom node operators, ambassadors, community managers, and anyone who needs meetings that actually integrate with Web3.

---

## Features

### 🔐 Hybrid Authentication
Two ways to get in — no friction either way.
- **Solana Wallet Login** — connect any Solana wallet (Phantom, Backpack, etc.) for full Web3-native identity
- **Email OTP Login** — secure one-time password flow via email for users without a wallet
- Session persists across page reloads, no repeated logins

### 🤖 Real-Time AI Assistant
An AI co-host that actively participates in every room — not just a passive bot.
- **Live transcription** — every word spoken is captured in real time
- **Multilingual translation** — live captions across multiple languages, breaking down language barriers in global communities
- **Contextual chatbot** — participants can ask the AI questions about the ongoing discussion and get instant answers

### 🧠 Smart AI Summarization
No more writing post-call notes by hand.
- After every session, the AI analyzes the full transcript and generates:
  - **Executive Summary** — the TL;DR of the entire call
  - **Key Highlights** — the most important moments and decisions
  - **Action Items** — clear next steps extracted from the discussion
- Ready to share the moment the call ends

### 🎛️ Host Control Center
Full moderation authority for room creators.
- Accessible via a secure 3-dot menu — visible only to the host
- **Mute participants** — instantly silence any specific user
- **Remove participants** — kick out disruptive members with one tap
- Powered by a custom Cloud Signal API — actions are instant and reliable

### 🖼️ Global Avatar Sync
Every participant shows up with their real identity.
- Automatically fetches and renders high-resolution profile pictures for all participants
- Supports **NFT avatars** — Web3 native identity displayed directly in the room
- Syncs in real time as participants join or leave

### 🎙️ AI Noise Suppression
Crystal-clear audio, regardless of environment.
- One-click toggle to activate background noise filtering
- Removes static, street noise, keyboard sounds, and ambient interference
- Runs client-side — no extra latency, no data sent to a third party

### 📁 History & Report Export
Every meeting leaves a record.
- Past sessions are saved and accessible from your account
- Download the full **AI-generated report** (summary + highlights + action items) as a `.txt` file
- Download the **raw transcript** for full meeting archives
- Everything available offline — no cloud lock-in

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React, Tailwind CSS, TypeScript |
| Real-Time Infra | dTelecom Server SDK (dRTC / LiveKit-based) |
| AI Layer | dTelecom AI Agents SDK, Google Generative AI |
| Authentication | Solana Wallet Adapter + Email OTP (Nodemailer) |
| Blockchain | Solana (wallet identity) |
| Deployment | Vercel |

---

## Getting Started

### Prerequisites
- Node.js 18+
- A dTelecom API key ([get one here](https://dtelecom.org))
- A Gmail account for OTP sending (or any SMTP provider)

### Setup

```bash
# Clone the repo
git clone https://github.com/jubayir-hub-69/dspaces.git
cd dspaces

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
```

Fill in your `.env.local`:

```env
DTELECOM_API_KEY=your_dtelecom_api_key
DTELECOM_API_SECRET=your_dtelecom_api_secret
EMAIL_USER=your_gmail@gmail.com
EMAIL_PASS=your_gmail_app_password
NEXTAUTH_SECRET=your_random_secret_string
```

```bash
# Run locally
npm run dev
```

Open (https://dspaces.vercel.app/)

---

## How It Works

```
User connects wallet / verifies email
        ↓
Creates or joins a room via dTelecom SDK
        ↓
AI Co-Host joins the room automatically
        ↓
Live transcription + translation runs throughout the call
        ↓
Host moderates via Control Center (mute / kick)
        ↓
Call ends → AI generates Summary + Highlights + Action Items
        ↓
User downloads full report as .txt
```

---

## Why dTelecom?

dSpaces isn't just a video call app sitting on top of a centralized cloud. It's built directly on dTelecom's decentralized RTC infrastructure — meaning:

- **No single point of failure** — calls are routed through dTelecom's distributed node network
- **Lower latency** — nodes are geographically distributed, closer to users
- **Web3-native** — wallet auth, NFT avatars, and on-chain identity work out of the box
- **AI-first** — dTelecom's AI Agents SDK makes the co-host a real, active participant — not a bolt-on

---

## Roadmap

- [x] Wallet + Email authentication
- [x] Real-time video / audio rooms
- [x] AI Co-Host (transcription, translation, chatbot)
- [x] Smart AI Summarization
- [x] Host Control Center
- [x] NFT Avatar Sync
- [x] Noise Suppression
- [x] Meeting History + Export
- [ ] x402 Tip Jar (USDC micropayments to speakers)
- [ ] Token-Gated Rooms (post $DTEL TGE)
- [ ] Mobile App

---

## Built By

**JUBAYIR** — Web3 builder, community manager, and dTelecom ambassador based in Dhaka, Bangladesh.

[![Twitter](https://img.shields.io/badge/Twitter-@jubayirhaider90-1DA1F2?style=flat-square&logo=twitter)](https://twitter.com/jubayirhaider90)
[![GitHub](https://img.shields.io/badge/GitHub-jubayir--hub--69-181717?style=flat-square&logo=github)](https://github.com/jubayir-hub-69)

---

<div align="center">

*Built on dTelecom's decentralized infrastructure — the communication layer for AI agents and humans.*

</div>
