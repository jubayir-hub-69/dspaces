"use client";

import { useEffect } from "react";

type AboutDspacesModalProps = {
  open: boolean;
  onClose: () => void;
  isDark?: boolean;
};

const features = [
  {
    title: "Instant Rooms",
    body: "Create a meeting in one click, or join with a Room ID. No plugins, no extra setup — just pick a name and go.",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
      </svg>
    ),
  },
  {
    title: "AI Assistant & Translation",
    body: "Capture live speech, ask questions during the call, and generate smart post-call summaries in multiple languages with Google Gemini.",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
  },
  {
    title: "Decentralized Infrastructure",
    body: "Media is routed on dTelecom’s decentralized real-time network for secure, resilient, low-latency video and audio.",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    ),
  },
  {
    title: "Screen Sharing & Grid Views",
    body: "Share your desktop or app window while everyone stays visible in a clean participant grid. Mobile devices show a clear notice if sharing is not available.",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13V6a2 2 0 012-2h14a2 2 0 012 2v7M3 13a2 2 0 002 2h14a2 2 0 002-2M3 13l6.75 4M21 13l-6.75 4" />
      </svg>
    ),
  },
  {
    title: "Important Meetings (Spaces Mode)",
    body: "Host a strict, stage-style room where only the creator can speak at first. Listeners raise a hand, and the host (or a co-host) can allow, deny, or demote speakers.",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
  },
];

const steps = [
  {
    n: "1",
    title: "Sign in",
    body: "Use email verification or a Solana wallet. Your session stays active so you can jump back in without repeating login.",
  },
  {
    n: "2",
    title: "Set your display name",
    body: "Choose the name others will see in the room. You can update it anytime from Home or Profile.",
  },
  {
    n: "3",
    title: "Create or join a room",
    body: "Tap Create New Room for an instant meeting, or paste a Room ID / invite link to join someone else.",
  },
  {
    n: "4",
    title: "Invite your team",
    body: "In the room header, use Copy Invite Link and share it. Guests open the link, sign in, and join the same room.",
  },
  {
    n: "5",
    title: "Enable camera & microphone",
    body: "Allow camera and mic when the browser asks. Use the bottom control bar to mute, stop video, or share your screen.",
  },
  {
    n: "6",
    title: "Use the AI assistant",
    body: "Open Ask AI, tap Start AI Recording, then Stop & Generate Summary. Transcripts, translations, and reports also appear in your Profile history.",
  },
];

export function AboutDspacesModal({ open, onClose, isDark = true }: AboutDspacesModalProps) {
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const overlay = "fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-6";
  const backdrop = isDark ? "bg-black/70" : "bg-gray-900/40";
  const panel = isDark
    ? "bg-[#030712]/90 border-white/10 text-white backdrop-blur-2xl"
    : "bg-white border-gray-200 text-gray-900";
  const muted = isDark ? "text-gray-400" : "text-gray-600";
  const card = isDark
    ? "bg-white/5 border-white/10"
    : "bg-gray-50 border-gray-200";
  const stepBg = isDark ? "bg-black/40 border-gray-800/70" : "bg-white border-gray-200";
  const closeBtn = isDark
    ? "bg-gray-900 border-gray-700 text-gray-300 hover:text-white hover:border-[#00e5ff]/50"
    : "bg-gray-100 border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-400";

  return (
    <div className={overlay} role="presentation" onClick={onClose}>
      <div className={`absolute inset-0 backdrop-blur-md ${backdrop}`} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-dspaces-title"
        onClick={(event) => event.stopPropagation()}
        className={`relative w-full sm:max-w-3xl max-h-[92dvh] overflow-hidden rounded-t-3xl sm:rounded-3xl border shadow-[0_20px_80px_rgba(0,0,0,0.45)] flex flex-col ${panel}`}
      >
        <div className={`flex items-start justify-between gap-4 px-5 sm:px-8 pt-5 sm:pt-7 pb-4 border-b ${isDark ? "border-gray-800/70" : "border-gray-200"}`}>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#00e5ff] mb-1.5">Welcome guide</p>
            <h2 id="about-dspaces-title" className="text-2xl sm:text-3xl font-black tracking-tight">
              About <span className="bg-gradient-to-r from-[#00e5ff] to-[#00ff88] bg-clip-text text-transparent">dSpaces</span>
            </h2>
            <p className={`mt-2 text-sm leading-relaxed max-w-xl ${muted}`}>
              A modern, decentralized video conferencing platform for secure, low-latency, high-quality real-time conversations.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close About dSpaces"
            className={`flex-shrink-0 p-2 rounded-xl border transition-all ${closeBtn}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-5 sm:px-8 py-6 space-y-8 about-dspaces-scroll">
          <section>
            <h3 className="text-sm font-extrabold uppercase tracking-widest text-[#00ff88] mb-3">What is dSpaces?</h3>
            <p className={`text-sm sm:text-[15px] leading-relaxed ${muted}`}>
              dSpaces is built for teams and communities that need reliable meetings without relying on a single centralized provider.
              You get real-time video and voice, optional Web3 sign-in, and an in-room AI assistant — all routed on dTelecom’s decentralized network so calls stay private, resilient, and fast.
            </p>
          </section>

          <section>
            <h3 className="text-sm font-extrabold uppercase tracking-widest text-[#00ff88] mb-4">Core features</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {features.map((feature) => (
                <article key={feature.title} className={`rounded-2xl border p-4 ${card}`}>
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/20">
                      {feature.icon}
                    </span>
                    <h4 className="font-bold text-sm">{feature.title}</h4>
                  </div>
                  <p className={`text-xs sm:text-sm leading-relaxed ${muted}`}>{feature.body}</p>
                </article>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-extrabold uppercase tracking-widest text-[#00ff88] mb-4">Getting started</h3>
            <ol className="space-y-3">
              {steps.map((step) => (
                <li key={step.n} className={`flex gap-3 rounded-2xl border p-3.5 sm:p-4 ${stepBg}`}>
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-[#00e5ff] to-[#00ff88] text-black font-black text-sm flex items-center justify-center">
                    {step.n}
                  </span>
                  <div>
                    <h4 className="font-bold text-sm mb-0.5">{step.title}</h4>
                    <p className={`text-xs sm:text-sm leading-relaxed ${muted}`}>{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className={`rounded-2xl border p-4 sm:p-5 ${isDark ? "bg-blue-500/5 border-blue-500/20" : "bg-blue-50 border-blue-100"}`}>
            <h3 className={`text-sm font-bold mb-1 ${isDark ? "text-[#00e5ff]" : "text-blue-700"}`}>A note on privacy</h3>
            <p className={`text-xs sm:text-sm leading-relaxed ${muted}`}>
              You control your camera, microphone, and screen share from the in-call controls. AI features only run when you start them,
              and you can export or clear your meeting notes from the assistant panel and your profile history.
            </p>
          </section>

          <section className={`rounded-2xl border p-5 sm:p-6 ${isDark ? "bg-gradient-to-br from-indigo-500/10 via-transparent to-cyan-500/10 border-white/10" : "bg-white border-gray-200"}`}>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#00e5ff] mb-2">Portfolio</p>
            <h3 className="text-sm font-extrabold uppercase tracking-widest text-[#00ff88] mb-4">About the Developer & Contact</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <a
                href="https://jubayir-69.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className={`group flex items-center gap-3 rounded-2xl border px-3.5 py-3 transition-all hover:shadow-lg hover:shadow-cyan-500/10 ${isDark ? "bg-black/40 border-white/10 hover:border-cyan-400/40" : "bg-gray-50 border-gray-200 hover:border-cyan-400"}`}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-400/20">
                  <svg className="w-4.5 h-4.5" width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.6 9h16.8M3.6 15h16.8M12 3c2.5 2.6 3.8 6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-6-3.8-9s1.3-6.4 3.8-9z" />
                  </svg>
                </span>
                <span className="text-left">
                  <span className="block text-[10px] uppercase tracking-wider font-bold text-gray-500">Website</span>
                  <span className="block text-sm font-semibold group-hover:text-cyan-300 transition-colors">Developer Portfolio</span>
                </span>
              </a>
              <a
                href="https://x.com/dspacesapp"
                target="_blank"
                rel="noopener noreferrer"
                className={`group flex items-center gap-3 rounded-2xl border px-3.5 py-3 transition-all hover:shadow-lg hover:shadow-white/10 ${isDark ? "bg-black/40 border-white/10 hover:border-white/30" : "bg-gray-50 border-gray-200 hover:border-gray-400"}`}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white border border-white/15">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.005 4.15H5.059z" />
                  </svg>
                </span>
                <span className="text-left">
                  <span className="block text-[10px] uppercase tracking-wider font-bold text-gray-500">X / Twitter</span>
                  <span className="block text-sm font-semibold group-hover:text-white transition-colors">dSpaces X</span>
                </span>
              </a>
              <a
                href="https://discordapp.com/users/775330417414635530"
                target="_blank"
                rel="noopener noreferrer"
                className={`group flex items-center gap-3 rounded-2xl border px-3.5 py-3 transition-all hover:shadow-lg hover:shadow-indigo-500/20 ${isDark ? "bg-black/40 border-white/10 hover:border-indigo-400/40" : "bg-gray-50 border-gray-200 hover:border-indigo-300"}`}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300 border border-indigo-400/20">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4.5 h-4.5" width="18" height="18" aria-hidden="true">
                    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
                  </svg>
                </span>
                <span className="text-left">
                  <span className="block text-[10px] uppercase tracking-wider font-bold text-gray-500">Discord</span>
                  <span className="block text-sm font-semibold group-hover:text-indigo-300 transition-colors">Dev Discord</span>
                </span>
              </a>
              <a
                href="https://t.me/JUBAYIR69"
                target="_blank"
                rel="noopener noreferrer"
                className={`group flex items-center gap-3 rounded-2xl border px-3.5 py-3 transition-all hover:shadow-lg hover:shadow-sky-500/20 ${isDark ? "bg-black/40 border-white/10 hover:border-sky-400/40" : "bg-gray-50 border-gray-200 hover:border-sky-300"}`}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 border border-sky-400/20">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4.5 h-4.5" width="18" height="18" aria-hidden="true">
                    <path d="M21.946 4.337c.10.0.2.3.192.553-.21 2.21-1.12 7.58-1.585 10.05-.197 1.05-.585 1.4-1.01 1.43-.92.08-1.62-.61-2.51-1.2-1.4-.92-2.19-1.49-3.55-2.39-1.57-1.04-.55-1.61.34-2.54.234-.24 4.27-3.92 4.35-4.25.01-.04.02-.19-.07-.27-.09-.08-.23-.05-.33-.03-.14.03-2.37 1.51-6.69 4.43-.63.43-1.2.64-1.71.63-.56-.01-1.65-.32-2.45-.58-.99-.32-1.77-.49-1.7-1.03.03-.28.42-.57 1.16-.86 4.56-1.99 7.6-3.3 9.13-3.94 4.36-1.81 5.26-2.13 5.85-2.14z" />
                  </svg>
                </span>
                <span className="text-left">
                  <span className="block text-[10px] uppercase tracking-wider font-bold text-gray-500">Telegram</span>
                  <span className="block text-sm font-semibold group-hover:text-sky-300 transition-colors">@JUBAYIR69</span>
                </span>
              </a>
            </div>
            <p className={`mt-4 text-xs sm:text-sm leading-relaxed ${muted}`}>
              For any feedback regarding the project, or for partnership and collaboration inquiries, please contact me via Discord or Twitter.
            </p>
          </section>
        </div>

        <style>{`
          .about-dspaces-scroll::-webkit-scrollbar { width: 6px; }
          .about-dspaces-scroll::-webkit-scrollbar-track { background: transparent; }
          .about-dspaces-scroll::-webkit-scrollbar-thumb { background: ${isDark ? "#1e293b" : "#d1d5db"}; border-radius: 10px; }
        `}</style>

        <div className={`px-5 sm:px-8 py-4 border-t flex justify-end ${isDark ? "border-gray-800/70 bg-black/30" : "border-gray-200 bg-gray-50"}`}>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-black bg-gradient-to-r from-[#00e5ff] to-[#00ff88] hover:opacity-90 transition-all shadow-[0_0_20px_rgba(0,229,255,0.2)]"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

export function AboutDspacesButton({
  onClick,
  isDark = true,
  compact = false,
}: {
  onClick: () => void;
  isDark?: boolean;
  compact?: boolean;
}) {
  const base = compact
    ? "p-2 rounded-xl"
    : "px-3 sm:px-4 py-2 rounded-xl gap-2";
  const tone = isDark
    ? "bg-white/5 border-white/10 text-gray-200 hover:text-white hover:border-cyan-400/40"
    : "bg-white border-gray-200 text-gray-700 hover:text-gray-900 hover:border-gray-400";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="About dSpaces"
      className={`inline-flex items-center justify-center border font-bold text-sm transition-all shadow-lg ${base} ${tone}`}
    >
      <svg className="w-4 h-4 text-[#00e5ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {!compact && <span className="hidden sm:inline">About</span>}
    </button>
  );
}
