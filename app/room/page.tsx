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
  const [accessAllowed, setAccessAllowed] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const router = useRouter();
  const { connected, publicKey } = useWallet();

  useEffect(() => {
    // Check if user is logged in via Wallet or Email
    const savedEmail = localStorage.getItem("dspaces_email");
    if (connected || savedEmail) {
      setAccessAllowed(true);
    } else {
      setAccessAllowed(false);
    }
    setCheckingAuth(false);
  }, [connected]);

  useEffect(() => {
    if (!accessAllowed) return;

    (async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const roomName = urlParams.get("id") || "dSpaces-Global";
        setRoomId(roomName);
        
        const savedEmail = localStorage.getItem("dspaces_email");
        const defaultUser = savedEmail ? savedEmail.split("@")[0] : (publicKey ? publicKey.toString().substring(0, 6) : "User");
        let userName = urlParams.get("name") || defaultUser;
        
        if (urlParams.get("ishost") === "true") userName = `${userName} (Host)`;

        const response = await fetch(`/api/get-token?room=${roomName}&username=${userName}`);
        const data = await response.json();

        if (data.token && data.wsUrl) {
          setToken(data.token);
          setServerUrl(data.wsUrl);
        }
      } catch (error) {
        console.error("Token error:", error);
      }
    })();
  }, [accessAllowed, connected, publicKey]);

  // State 1: Checking authentication
  if (checkingAuth) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-[#030712] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-400 font-medium">Verifying access...</p>
        </div>
      </main>
    );
  }

  // State 2: Access denied (Not logged in)
  if (!accessAllowed) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-[#030712] text-white p-4 text-center">
        <h1 className="text-4xl font-black text-red-500 mb-4">Access Denied!</h1>
        <p className="text-gray-400 mb-8">You need to log in with Email or Wallet to join a room.</p>
        <button onClick={() => router.push('/')} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all">
          Go to Login Page
        </button>
      </main>
    );
  }

  // State 3: Generating token / Connecting
  if (!token || !serverUrl) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-[#030712] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-400 font-medium">Connecting to secure room...</p>
        </div>
      </main>
    );
  }

  // State 4: Room connected successfully
  return (
    <main data-lk-theme="default" className="w-full h-screen bg-[#030712] relative overflow-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        .lk-participant-name {
          background-color: rgba(37, 99, 235, 0.9) !important;
          color: #ffffff !important;
          padding: 6px 12px !important;
          border-radius: 8px !important;
          font-weight: bold !important;
          backdrop-filter: blur(10px) !important;
        }
      `}} />
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
