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
      className={`inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300 ${className}`}
      title="This app is connected to Solana Mainnet"
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
      </span>
      {compact ? "Mainnet" : "Solana Mainnet"}
    </span>
  );
}

export const SOLANA_NETWORK = WalletAdapterNetwork.Mainnet;
