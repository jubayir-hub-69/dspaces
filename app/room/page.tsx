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
        
        let userName = urlParams.get("name") || (publicKey ? publicKey.toString().substring(0, 6) : "Web3User");
        const isHost = urlParams.get("ishost") === "true";
        
        if (isHost) {
          userName = `${userName} (Host)`;
        }

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
      <main className="flex flex-col items-center justify-center min-h-[100dvh] bg-gray-950 text-white p-6 text-center">
        <h2 className="text-red-500 font-bold text-3xl mb-4">Access Denied!</h2>
        <button onClick={() => router.push('/')} className="px-8 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold">Go Back</button>
      </main>
    );
  }

  if (token === "" || serverUrl === "") {
    return (
      <main className="flex items-center justify-center min-h-[100dvh] bg-black text-white text-lg">
        Connecting to secure room...
      </main>
    );
  }

  return (
    <main data-lk-theme="default" className="w-full h-[100dvh] bg-black relative overflow-hidden">
      
      <style dangerouslySetInnerHTML={{__html: `
        .lk-participant-name {
          background-color: #2563eb !important;
          color: #ffffff !important;
          padding: 6px 12px !important;
          border-radius: 8px !important;
          font-weight: bold !important;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2) !important;
          border: 1px solid #3b82f6 !important;
        }
      `}} />

      <div className="absolute top-4 left-4 z-[999] flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-2 rounded-lg border border-gray-700">
        <span className="text-gray-300 text-xs sm:text-sm font-semibold mr-2">{roomId}</span>
        <button onClick={copyInviteLink} className={`px-4 py-1 text-xs sm:text-sm font-bold rounded-md transition-colors ${copied ? "bg-green-500 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"}`}>
          {copied ? "Copied!" : "Copy Link"}
        </button>
      </div>

      <LiveKitRoom
        video={true}
        audio={true}
        token={token}
        serverUrl={serverUrl}
        connect={true}
        onDisconnected={() => router.push('/')}
        style={{ height: '100%', width: '100%' }}
      >
        <VideoConference />
      </LiveKitRoom>
      
    </main>
  );
}
