"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from "@dtelecom/components-react";
import "@dtelecom/components-styles";

function RoomContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const roomId = searchParams.get("id") || "dSpaces-Room";
  const userName = searchParams.get("name") || "Guest";
  const isHost = searchParams.get("ishost") === "true";

  const [token, setToken] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState("");
  const [loadingAI, setLoadingAI] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const res = await fetch("/api/get-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room: roomId, username: userName }),
        });
        const data = await res.json();
        
        if (data.token && data.url) {
          setToken(data.token);
          setServerUrl(data.url);
        } else {
          setErrorMsg(data.error || "Failed to fetch connection token.");
        }
      } catch (err) {
        setErrorMsg("Unable to connect to the server.");
      }
    };
    fetchToken();
  }, [roomId, userName]);

  const copyInviteLink = () => {
    const inviteLink = `${window.location.origin}/room?id=${roomId}`;
    navigator.clipboard.writeText(inviteLink);
    alert("Invite link copied to clipboard! Share it with your friends.");
  };

  const handleStartAI = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser does not support AI Speech Detection.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US"; 

    recognition.onresult = (event: any) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript + " ";
      }
      setTranscript(text);
    };

    recognition.start();
    setIsRecording(true);
    recognitionRef.current = recognition;
  };

  const handleStopAI = async () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    setIsRecording(false);
    setLoadingAI(true);
    setSummary("");

    try {
      const res = await fetch("/api/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      
      if (!res.ok) {
        const errText = await res.text();
        setSummary(`❌ Vercel Server Error (${res.status}): ${errText.substring(0, 100)}`);
        setLoadingAI(false);
        return;
      }

      const data = await res.json();
      
      if (data.success) {
        setSummary(data.summary);
      } else {
        setSummary(`❌ AI Error: ${data.error}`);
      }
    } catch (e: any) {
      if (e.message.includes("Failed to fetch")) {
        setSummary("❌ Network Error: 'Failed to fetch'. Your browser blocked the request or your internet dropped. Please check your Wi-Fi or turn off AdBlockers.");
      } else {
        setSummary(`❌ Crash: ${e.message}`);
      }
    }
    setLoadingAI(false);
  };

  if (errorMsg) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white text-center p-6">
        <h1 className="text-3xl text-red-500 font-bold mb-4">Connection Error</h1>
        <p className="text-gray-300 text-lg">{errorMsg}</p>
        <button onClick={() => router.push("/")} className="mt-8 px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold transition-all">Go Back Home</button>
      </div>
    );
  }

  if (!token || !serverUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#030712] text-white">
        <div className="animate-spin rounded-full h-14 w-14 border-t-4 border-b-4 border-blue-500 mb-6"></div>
        <p className="text-lg font-semibold tracking-widest animate-pulse text-blue-400">Connecting to secure room...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row h-[100dvh] bg-[#030712] overflow-hidden font-sans">
      
      <div className="flex-1 flex flex-col min-h-0 relative shadow-2xl">
        
        <div className="flex-none px-6 py-4 bg-gray-950/90 border-b border-gray-800 flex justify-between items-center z-10">
          <div className="flex items-center gap-3">
            <h1 className="text-white text-lg font-bold truncate max-w-[150px] sm:max-w-xs">Room: {roomId}</h1>
            {isHost && (
              <span className="bg-blue-600 text-white px-2 py-1 rounded text-xs font-bold uppercase tracking-wider">
                Host
              </span>
            )}
          </div>
          <button onClick={copyInviteLink} className="bg-gray-800 hover:bg-gray-700 text-white px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition-all border border-gray-700 flex items-center gap-2 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
            <span className="hidden sm:inline">Copy Invite Link</span>
            <span className="sm:hidden">Copy</span>
          </button>
        </div>

        <div className="flex-1 min-h-0 relative bg-black">
          <div className="absolute inset-0">
            <LiveKitRoom
              video={true}
              audio={true}
              token={token}
              serverUrl={serverUrl}
              data-lk-theme="default"
              style={{ height: '100%', width: '100%' }}
              onDisconnected={() => router.push("/")}
            >
              <VideoConference />
              <RoomAudioRenderer />
            </LiveKitRoom>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-[400px] h-[40vh] lg:h-full bg-gray-950 border-t lg:border-t-0 lg:border-l border-gray-800 flex flex-col p-5 text-white z-50 flex-shrink-0">
        <h2 className="text-xl lg:text-2xl font-extrabold text-blue-400 mb-4 flex items-center gap-2 flex-shrink-0">
          AI Meeting Assistant
        </h2>

        <div className="flex-1 min-h-0 overflow-y-auto bg-black/60 rounded-2xl p-4 mb-4 border border-gray-800 custom-scrollbar relative">
          <h3 className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-2 absolute top-2 bg-black px-2">Live Transcript</h3>
          <div className="mt-6">
            {transcript ? (
              <p className="text-gray-300 text-sm leading-relaxed italic">"{transcript}"</p>
            ) : (
              <p className="text-center text-sm text-gray-600 mt-4">Start recording to see live conversation...</p>
            )}
          </div>
        </div>

        {summary && (
          <div className="flex-1 min-h-0 overflow-y-auto bg-blue-900/10 border border-blue-500/30 rounded-2xl p-4 mb-4 custom-scrollbar">
            <h3 className="font-bold text-blue-400 mb-2 text-sm">AI Generated Summary</h3>
            <div className={`text-sm whitespace-pre-wrap leading-relaxed ${summary.startsWith('❌') ? 'text-red-400 font-medium' : 'text-gray-200'}`}>
              {summary}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 mt-auto flex-shrink-0">
          {!isRecording ? (
            <button onClick={handleStartAI} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-xl transition-all text-sm">
              Start AI Recording
            </button>
          ) : (
            <button onClick={handleStopAI} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl transition-all text-sm">
              Stop & Generate Summary
            </button>
          )}
          {loadingAI && <p className="text-center text-xs text-blue-400 mt-1">Generating AI Summary...</p>}
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border-radius: 10px; }
      `}} />
    </div>
  );
}

export default function RoomPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center h-screen bg-[#030712] text-white">
        <div className="animate-spin rounded-full h-14 w-14 border-t-4 border-b-4 border-blue-500 mb-6"></div>
        <p className="text-lg font-semibold animate-pulse text-blue-400">Loading...</p>
      </div>
    }>
      <RoomContent />
    </Suspense>
  );
}
