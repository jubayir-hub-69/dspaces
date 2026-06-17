"use client";

import { LiveKitRoom, VideoConference } from "@dtelecom/components-react";
import "@dtelecom/components-styles";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";

export default function RoomPage() {
  const [token, setToken] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const { connected, publicKey } = useWallet();

  useEffect(() => {
    if (!connected) return;

    (async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const roomName = urlParams.get("id") || "dSpaces-Global";
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
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-gray-950 text-white p-6 text-center">
        <h2 className="text-red-500 font-bold text-3xl mb-4">Access Denied!</h2>
        <button onClick={() => router.push('/')} className="px-8 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold">Go Back</button>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-[100dvh] w-full bg-black overflow-hidden">
      <div className="absolute top-2 left-2 z-[9999] flex items-center gap-2 bg-black/80 backdrop-blur-md px-3 py-2 rounded-lg border border-gray-700">
        <button onClick={copyInviteLink} className={`px-4 py-1 text-sm font-bold rounded-md ${copied ? "bg-green-500" : "bg-blue-600"} text-white`}>
          {copied ? "Copied!" : "Copy Link"}
        </button>
      </div>

      <div className="flex-1 w-full h-full pt-16">
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
