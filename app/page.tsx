"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((mod) => mod.WalletMultiButton),
  { ssr: false }
);

export default function Home() {
  const router = useRouter();
  const [roomName, setRoomName] = useState("");

  const handleJoinRoom = () => {
    if (roomName.trim() !== "") {
      router.push(`/room?id=${roomName.trim()}`);
    } else {
      router.push(`/room?id=dSpaces-Global`);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="flex justify-between items-center p-8">
        <h1 className="text-2xl font-bold text-blue-500">dSpaces</h1>
        <WalletMultiButton />
      </nav>

      <section className="flex flex-col items-center justify-center py-20 text-center">
        <h1 className="text-6xl font-extrabold mb-6 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          The Future of Web3 Meetings
        </h1>
        <p className="text-xl text-gray-400 mb-10 max-w-2xl">
          Connect your wallet, create a custom room, and collaborate in real-time with your community.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 items-center mt-4">
          <input 
            type="text" 
            placeholder="Enter Room Name..." 
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            className="px-6 py-4 bg-gray-900 border border-gray-700 rounded-full text-white focus:outline-none focus:border-blue-500 text-lg w-72"
          />
          <button 
            onClick={handleJoinRoom}
            className="px-10 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full transition-all text-lg shadow-lg hover:shadow-blue-500/20"
          >
            Join Meeting
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-8 px-12 py-20 mt-10">
        <FeatureCard title="Secure" description="Encrypted video rooms powered by dTelecom." />
        <FeatureCard title="Web3 Native" description="Connect with Solana Wallet seamlessly." />
        <FeatureCard title="Custom Rooms" description="Create or join private meeting rooms." />
      </section>
    </main>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-8 bg-gray-900 rounded-2xl border border-gray-800 hover:border-blue-500 transition-colors">
      <h3 className="text-2xl font-bold mb-4 text-blue-400">{title}</h3>
      <p className="text-gray-400">{description}</p>
    </div>
  );
}
