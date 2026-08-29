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
    ? "bg-[#030712]/95 border-gray-800/80 text-white"
    : "bg-white border-gray-200 text-gray-900";
  const muted = isDark ? "text-gray-400" : "text-gray-600";
  const card = isDark
    ? "bg-[#0f172a]/80 border-gray-800/80"
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
    ? "bg-[#0f172a] border-gray-700 text-gray-200 hover:text-white hover:border-[#00e5ff]/50"
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
