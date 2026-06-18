"use client";

import { LiveKitRoom, VideoConference } from "@dtelecom/components-react";
import "@dtelecom/components-styles";
import { useEffect, useState, memo } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";

function InviteBanner({ roomId }: { roomId: string }) {
  const [copied, setCopied] = useState(false);

  const copyInviteLink = () => {
    const url = new URL(window.location.href);
    const cleanLink = `${url.origin}/?room=${roomId}`;
    navigator.clipboard.writeText(cleanLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <>
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[999] bg-[#1a1a1a]/90 border border-gray-700 px-6 py-2 rounded-xl text-sm text-gray-200 font-bold backdrop-blur-md shadow-lg flex items-center gap-2 pointer-events-auto">
         <span className="text-gray-400 text-[10px] uppercase tracking-wider font-normal">Room ID:</span> {roomId}
      </div>

      <div className="absolute top-4 right-4 sm:right-8 z-[999] pointer-events-auto">
        <button
          onClick={copyInviteLink}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all border shadow-lg ${
            copied 
              ? "bg-green-500/20 text-green-400 border-green-500/50" 
              : "bg-[#1a1a1a]/90 hover:bg-[#2a2a2a] text-white border-gray-600 hover:border-gray-400 backdrop-blur-md"
          }`}
        >
          {copied ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
              <span className="hidden sm:block">Copy meeting link</span>
              <span className="block sm:hidden">Copy</span>
            </>
          )}
        </button>
      </div>
    </>
  );
}

const MemoizedInviteBanner = memo(InviteBanner);

export default function RoomPage() {
  const [token, setToken] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [roomId, setRoomId] = useState("");
  const [accessAllowed, setAccessAllowed] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const router = useRouter();
  const { connected, publicKey } = useWallet();

  useEffect(() => {
    const savedEmail = localStorage.getItem("dspaces_email");
    const isWalletConnected = connected && publicKey !== null;
    
    if (isWalletConnected || savedEmail) {
      setAccessAllowed(true);
    } else {
      setAccessAllowed(false);
    }
    setCheckingAuth(false);
  }, [connected, publicKey]);

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

  if (checkingAuth) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-[#0f0f0f] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-400 font-medium">Verifying access...</p>
        </div>
      </main>
    );
  }

  if (!accessAllowed) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-[#0f0f0f] text-white p-4 text-center">
        <h1 className="text-4xl font-black text-red-500 mb-4">Access Denied!</h1>
        <p className="text-gray-400 mb-8">You need to log in with Email or Wallet to join this room.</p>
        <button onClick={() => router.push(`/?room=${roomId}`)} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-blue-500/30">
          Go to Login Page
        </button>
      </main>
    );
  }

  if (!token || !serverUrl) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-[#0f0f0f] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-400 font-medium">Connecting to secure room...</p>
        </div>
      </main>
    );
  }

  return (
    <main data-lk-theme="default" className="w-full h-screen bg-[#0f0f0f] relative overflow-hidden pointer-events-none">
      <style dangerouslySetInnerHTML={{__html: `
        .lk-participant-name {
          background-color: rgba(0, 0, 0, 0.7) !important;
          color: #ffffff !important;
          padding: 4px 8px !important;
          border-radius: 6px !important;
          font-size: 12px !important;
          backdrop-filter: blur(5px) !important;
        }
        .lk-participant-tile[data-lk-source="screen_share"] video {
          object-fit: contain !important;
        }
      `}} />

      <MemoizedInviteBanner roomId={roomId} />

      <div className="w-full h-full pointer-events-auto">
        <LiveKitRoom
          video={true}
          audio={true}
          token={token}
          serverUrl={serverUrl}
          connect={true}
          onDisconnected={() => router.push('/')}
          className="w-full h-full"
        >
          <VideoConference />
        </LiveKitRoom>
      </div>
    </main>
  );
}
