"use client";

import { LiveKitRoom, VideoConference } from "@dtelecom/components-react";
import "@dtelecom/components-styles";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";

export default function RoomPage() {
  const [token, setToken] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [roomId, setRoomId] = useState("");
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const { connected, publicKey } = useWallet();

  useEffect(() => {
    if (!connected) return;

    (async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const roomName = urlParams.get("id") || "dSpaces-Global";
        setRoomId(roomName);
        const participantName = publicKey ? publicKey.toString().substring(0, 6) : "User_Web3";

        const response = await fetch(
          `/api/get-token?room=${roomName}&username=${participantName}`
        );
        const data = await response.json();

        if (data.token && data.wsUrl) {
          setToken(data.token);
          setServerUrl(data.wsUrl);
        } else {
          console.error("Token/URL Error:", data.error);
        }
      } catch (error) {
        console.error("Failed to fetch token:", error);
      }
    })();
  }, [connected, publicKey]);

  const copyInviteLink = () => {
    const link = window.location.href;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-gray-950 text-white p-6 text-center">
        <h2 className="text-red-500 font-bold text-3xl sm:text-4xl mb-4">Access Denied!</h2>
        <p className="mb-8 text-sm sm:text-base text-gray-400">You must connect your Solana Wallet to join the room.</p>
        <button 
          onClick={() => router.push('/')}
          className="px-6 py-3 sm:px-8 sm:py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold transition-colors w-full sm:w-auto"
        >
          Go Back to Home
        </button>
      </div>
    );
  }

  if (token === "" || serverUrl === "") {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-gray-950 text-white text-lg sm:text-xl">
        Generating secure connection...
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-[100dvh] w-full bg-black overflow-hidden">
      
      {/* Responsive Floating Copy Link Bar */}
      <div className="absolute top-2 left-2 sm:top-4 sm:left-4 z-50 flex items-center gap-2 sm:gap-4 bg-black/80 backdrop-blur-md px-3 py-2 sm:px-5 sm:py-3 rounded-lg sm:rounded-2xl border border-gray-700 shadow-2xl max-w-[95vw]">
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wider hidden sm:block">Room ID</span>
          <span className="font-bold text-white text-xs sm:text-lg truncate">{roomId}</span>
        </div>
        <div className="w-px h-6 sm:h-10 bg-gray-600 mx-1 sm:mx-2 shrink-0"></div>
        <button 
          onClick={copyInviteLink}
          className={`px-3 py-1 sm:px-5 sm:py-2 text-xs sm:text-base font-bold rounded-md sm:rounded-xl transition-all shrink-0 ${
            copied ? "bg-green-500 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"
          }`}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      <div className="flex-1 w-full h-full">
        <LiveKitRoom
          video={true}
          audio={true}
          token={token}
          serverUrl={serverUrl}
          connect={true}
          onDisconnected={() => router.push('/')}
        >
          <VideoConference />
        </LiveKitRoom>
      </div>
    </div>
  );
}
