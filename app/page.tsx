"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((mod) => mod.WalletMultiButton),
  { ssr: false }
);

export default function Home() {
  const router = useRouter();
  const [roomId, setRoomId] = useState("");
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const joinId = urlParams.get("room");
    if (joinId) setRoomId(joinId);
  }, []);

  const handleCreateRoom = () => {
    const baseName = roomId.trim() || "dSpaces";
    const randomCode = Math.floor(1000 + Math.random() * 9000);
    const finalName = userName.trim() || "Web3User";
    router.push(`/room?id=${baseName}-${randomCode}&name=${finalName}`);
  };

  const handleJoinRoom = () => {
    if (roomId.trim() !== "") {
      let finalId = roomId.trim();
      if (finalId.includes("id=")) {
        finalId = finalId.split("id=")[1].split("&")[0];
      }
      const finalName = userName.trim() || "Web3User";
      router.push(`/room?id=${finalId}&name=${finalName}`);
    } else {
      alert("Please enter a Room ID or Link to join.");
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white p-4">
      <nav className="flex justify-between items-center p-4">
        <h1 className="text-2xl font-bold text-blue-500">dSpaces</h1>
        <WalletMultiButton />
      </nav>

      <section className="flex flex-col items-center justify-center py-10 text-center">
        <h1 className="text-4xl sm:text-6xl font-extrabold mb-6 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          The Future of Web3 Meetings
        </h1>
        
        <div className="flex flex-col gap-4 w-full max-w-sm bg-gray-900 p-6 rounded-2xl border border-gray-800 shadow-2xl">
          <input 
            type="text" 
            placeholder="Enter Your Name..." 
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            className="px-4 py-3 bg-gray-950 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500 w-full"
          />
          <input 
            type="text" 
            placeholder="Room ID or Link..." 
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className="px-4 py-3 bg-gray-950 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500 w-full"
          />
          
          <div className="flex flex-col gap-2 w-full mt-2">
            <button onClick={handleCreateRoom} className="py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-all">
              Create New Room
            </button>
            <button onClick={handleJoinRoom} className="py-3 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-lg transition-all border border-gray-700">
              Join Existing
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
