"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((mod) => mod.WalletMultiButton),
  { ssr: false }
);

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 text-white p-24 relative">
      <div className="absolute top-6 right-8">
        <WalletMultiButton />
      </div>

      <h1 className="text-5xl font-bold mb-4 text-blue-500">
        Welcome to dSpaces
      </h1>
      <p className="text-xl text-gray-400 mb-8">
        The Ultimate dTelecom Community Hub
      </p>

      <Link 
        href="/room" 
        className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors text-lg"
      >
        Join Instant Room
      </Link>
    </main>
  );
}