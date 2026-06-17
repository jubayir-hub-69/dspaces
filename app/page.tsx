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
  const [inputValue, setInputValue] = useState("");

  const handleCreateRoom = () => {
    const baseName = inputValue.trim() || "dSpaces";
    const randomCode = Math.floor(1000 + Math.random() * 9000);
    router.push(`/room?id=${baseName}-${randomCode}`);
  };

  const handleJoinRoom = () => {
    if (inputValue.trim() !== "") {
      let finalId = inputValue.trim();
      if (finalId.includes("?id=")) {
        finalId = finalId.split("?id=")[1];
      }
      router.push(`/room?id=${finalId}`);
    } else {
      alert("Please enter a Room ID or Link to join.");
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
          Create a unique secure room or join an existing one using a link.
        </p>
        
        <div className="flex flex-col items-center gap-6 mt-4 w-full max-w-lg bg-gray-900 p-8 rounded-2xl border border-gray-800 shadow-2xl">
          <input 
            type="text" 
            placeholder="Enter Name, Code, or Paste Link..." 
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="px-6 py-4 bg-gray-950 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-blue-500 text-lg w-full text-center"
          />
          
          <div className="flex flex-col sm:flex-row gap-4 w-full">
            <button 
              onClick={handleCreateRoom}
              className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all text-lg shadow-lg hover:shadow-blue-500/20"
            >
              + Create New Room
            </button>
            <button 
              onClick={handleJoinRoom}
              className="flex-1 py-4 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-xl transition-all text-lg border border-gray-700"
            >
              Join Existing
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
