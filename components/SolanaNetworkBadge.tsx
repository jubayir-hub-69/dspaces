"use client";

import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";

export function SolanaNetworkBadge({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-emerald-300 shadow-[0_0_16px_rgba(16,185,129,0.22)] ${className}`}
      title="This app is connected to Solana Mainnet"
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
      </span>
      {compact ? "Mainnet" : "Solana Mainnet"}
    </span>
  );
}

export function ConnectedAccountChip({
  display,
  isWallet,
  isDark,
  onLogout,
}: {
  display: string;
  isWallet: boolean;
  isDark: boolean;
  onLogout: () => void;
}) {
  return (
    <div
      className={`group hidden sm:flex items-center gap-2 rounded-full border pl-2.5 pr-1.5 py-1 backdrop-blur-xl transition-all duration-300 ${
        isDark
          ? "border-white/10 bg-white/[0.06] shadow-[0_8px_30px_rgba(0,0,0,0.35)] hover:border-emerald-400/35 hover:bg-white/[0.09]"
          : "border-gray-200/80 bg-white/80 shadow-sm hover:border-emerald-400/40"
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/80" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.95)]" />
        </span>
        <span
          className={`max-w-[7.5rem] truncate font-mono text-[13px] font-semibold tracking-tight sm:max-w-[11rem] ${
            isDark ? "text-white" : "text-gray-900"
          }`}
        >
          {display}
        </span>
      </div>
      {isWallet && (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/35 bg-gradient-to-r from-emerald-500/20 to-cyan-400/10 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.16em] text-emerald-300 shadow-[0_0_18px_rgba(16,185,129,0.28)]">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,1)]" />
          Mainnet
        </span>
      )}
      <button
        onClick={onLogout}
        className="rounded-full border border-transparent bg-red-500/10 px-3 py-1.5 text-[11px] font-bold text-red-400 transition-all duration-300 hover:border-red-400/30 hover:bg-red-500 hover:text-white hover:shadow-[0_0_16px_rgba(239,68,68,0.35)]"
      >
        Logout
      </button>
    </div>
  );
}

export const SOLANA_NETWORK = WalletAdapterNetwork.Mainnet;
