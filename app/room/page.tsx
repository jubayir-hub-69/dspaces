"use client";

import { LiveKitRoom, VideoConference } from "@dtelecom/components-react";
import "@dtelecom/components-styles";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";

export default function RoomPage() {
  const [token, setToken] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const router = useRouter();
  const { connected, publicKey } = useWallet();

  useEffect(() => {
    if (!connected) return;

    (async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const roomName = urlParams.get("id") || "dSpaces-Global";
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

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-white text-xl">
        <h2 className="text-red-500 font-bold text-4xl mb-4">Access Denied!</h2>
        <p className="mb-8 text-gray-400">You must connect your Solana Wallet to join the room.</p>
        <button 
          onClick={() => router.push('/')}
          className="px-8 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold transition-colors"
        >
          Go Back to Home
        </button>
      </div>
    );
  }

  if (token === "" || serverUrl === "") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950 text-white text-xl">
        Connecting to secure room...
      </div>
    );
  }

  return (
    <div style={{ height: "100vh" }}>
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
  );
}
