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
        const userName = urlParams.get("name") || (publicKey ? publicKey.toString().substring(0, 6) : "Web3User");

        const response = await fetch(
          `/api/get-token?room=${roomName}&username=${userName}`
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
    const url = new URL(window.location.href);
    const cleanLink = `${url.origin}/?room=${roomId}`;
    navigator.clipboard.writeText(cleanLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-white p-6 text-center">
        <h2 className="text-red-500 font-bold text-3xl mb-4">Access Denied!</h2>
        <button onClick={() => router.push('/')} className="px-8 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold">Go Back</button>
      </div>
    );
  }

  if (token === "" || serverUrl === "") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-white text-xl">
        <p>Connecting to secure room...</p>
      </div>
    );
  }

  return (
    <main className="h-screen w-full bg-black relative flex flex-col overflow-hidden">
      
      {/* Floating Copy Link Bar */}
      <div className="absolute top-4 left-4 z-50 flex items-center gap-2 bg-black/70 backdrop-blur-md px-3 py-2 rounded-lg border border-gray-700 shadow-lg">
        <span className="text-gray-300 text-xs sm:text-sm font-semibold mr-2">{roomId}</span>
        <button onClick={copyInviteLink} className={`px-4 py-1 text-xs sm:text-sm font-bold rounded-md transition-colors ${copied ? "bg-green-500 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"}`}>
          {copied ? "Copied!" : "Copy Link"}
        </button>
      </div>

      {/* LiveKit Video Room Container */}
      <div className="flex-1 w-full h-full min-h-0">
        <LiveKitRoom
          video={true}
          audio={true}
          token={token}
          serverUrl={serverUrl}
          connect={true}
          onDisconnected={() => router.push('/')}
          style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column" }}
        >
          <VideoConference />
        </LiveKitRoom>
      </div>
      
    </main>
  );
}
