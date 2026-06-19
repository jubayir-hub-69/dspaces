"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from "@dtelecom/components-react";
import "@dtelecom/components-styles";

function RoomContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const roomId = searchParams.get("id") || "dSpaces-Room";
  const rawUserName = searchParams.get("name") || "Guest";
  const isHost = searchParams.get("ishost") === "true";
  
  const userName = isHost ? `${rawUserName} (Host)` : rawUserName;

  const [token, setToken] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState("");
  const [loadingAI, setLoadingAI] = useState(false);
  const recognitionRef = useRef<any>(null);

  const [showToast, setShowToast] = useState(false);
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);

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
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
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
        body: JSON.stringify({ transcript, roomId, userName }), // Added roomId and userName for future DB saving
      });
      
      const data = await res.json();
      
      if (data.success) {
        setSummary(data.summary);
      } else {
        setSummary(`❌ AI Error: ${data.error}`);
      }
    } catch (e: any) {
      setSummary(`❌ Request Failed: ${e.message}`);
    }
    setLoadingAI(false);
  };

  if (errorMsg) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#050505] text-white text-center p-6">
        <h1 className="text-3xl text-red-500 font-bold mb-4">Connection Error</h1>
        <p className="text-gray-300 text-lg">{errorMsg}</p>
        <button onClick={() => router.push("/")} className="mt-8 px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold transition-all">Go Back Home</button>
      </div>
    );
  }

  if (!token || !serverUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#050505] text-white relative">
         <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-[#050505] to-black"></div>
         <div className="z-10 animate-spin rounded-full h-14 w-14 border-t-4 border-b-4 border-[#00ff88] mb-6"></div>
         <p className="z-10 text-lg font-semibold tracking-widest animate-pulse text-[#00e5ff]">Connecting to secure room...</p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-[100dvh] w-full bg-[#030712] overflow-hidden font-sans">
      
      {/* 3rd Picture Vibe: Glowing Background Gradients */}
      <div className="absolute inset-0 z-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#00ff88]/10 via-transparent to-transparent"></div>
      <div className="absolute inset-0 z-0 pointer-events-none bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-[#00e5ff]/10 via-[#030712] to-black"></div>

      {/* Modern Toast Notification */}
      <div className={`absolute top-6 left-1/2 transform -translate-x-1/2 z-[100] bg-[#0f172a] text-white px-6 py-3 rounded-full shadow-[0_0_15px_rgba(0,229,255,0.3)] flex items-center gap-3 border border-[#00e5ff]/30 transition-all duration-300 ${showToast ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10 pointer-events-none'}`}>
        <svg className="w-5 h-5 text-[#00ff88]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
        <span className="font-medium text-sm">Invite link copied to clipboard!</span>
      </div>

      {/* Top Header Bar */}
      <div className="flex-none px-6 py-4 bg-black/40 backdrop-blur-md border-b border-gray-800/50 flex justify-between items-center z-40">
        <h1 className="text-white text-base lg:text-lg font-bold truncate max-w-[200px] sm:max-w-xs drop-shadow-md">Room: <span className="text-[#00e5ff]">{roomId}</span></h1>
        <button onClick={copyInviteLink} className="bg-[#0f172a] hover:bg-[#1e293b] text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all border border-gray-700 hover:border-[#00e5ff]/50 flex items-center gap-2 shadow-lg">
          <svg className="w-4 h-4 text-[#00e5ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
          <span className="hidden sm:inline">Copy Invite Link</span>
          <span className="sm:hidden">Copy</span>
        </button>
      </div>

      {/* Main Video Area - PERFECT FLEXBOX SO BUTTONS WON'T HIDE */}
      <div className="flex-1 w-full min-h-0 relative z-10 bg-transparent">
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

      {/* DMeet Style Floating Ask AI Button */}
      {!isAIPanelOpen && (
        <button 
          onClick={() => setIsAIPanelOpen(true)} 
          className="absolute bottom-24 right-4 sm:right-8 z-50 bg-[#0f172a] hover:bg-[#1e293b] text-white px-5 py-3 rounded-full shadow-[0_0_20px_rgba(0,229,255,0.2)] border border-[#00e5ff]/30 font-bold flex items-center gap-2 transition-all hover:scale-105 hover:shadow-[0_0_25px_rgba(0,255,136,0.3)]"
        >
          <span className="text-[#00ff88]">✨</span> Ask AI
        </button>
      )}

      {/* Sliding AI Panel */}
      <div className={`absolute right-0 top-0 h-full w-full sm:w-[400px] bg-[#030712]/95 backdrop-blur-xl z-[60] shadow-[-10px_0_30px_rgba(0,0,0,0.8)] border-l border-gray-800/50 flex flex-col transform transition-transform duration-300 ease-in-out ${isAIPanelOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        
        {/* Panel Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-800/50">
          <h2 className="text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[#00e5ff] to-[#00ff88] flex items-center gap-2">✨ AI Assistant</h2>
          <button onClick={() => setIsAIPanelOpen(false)} className="text-gray-400 hover:text-white p-2 bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        {/* AI Panel Body */}
        <div className="flex-1 overflow-hidden flex flex-col p-5">
          <div className="flex-1 min-h-0 overflow-y-auto bg-black/40 rounded-2xl p-4 mb-4 border border-gray-800/50 custom-scrollbar relative">
            <h3 className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-2 absolute top-2 bg-black/60 px-2 rounded">Live Transcript</h3>
            <div className="mt-6">
              {transcript ? (
                <p className="text-gray-300 text-sm leading-relaxed italic">"{transcript}"</p>
              ) : (
                <p className="text-center text-sm text-gray-600 mt-4">Start recording to see live conversation...</p>
              )}
            </div>
          </div>

          {summary && (
            <div className="flex-1 min-h-0 overflow-y-auto bg-blue-900/10 border border-[#00e5ff]/20 rounded-2xl p-4 mb-4 custom-scrollbar">
              <h3 className="font-bold text-[#00e5ff] mb-2 text-sm">AI Generated Summary</h3>
              <div className={`text-sm whitespace-pre-wrap leading-relaxed ${summary.startsWith('❌') ? 'text-red-400 font-medium' : 'text-gray-200'}`}>
                {summary}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 mt-auto flex-shrink-0 pt-2">
            {!isRecording ? (
              <button onClick={handleStartAI} className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white font-bold py-3 rounded-xl transition-all text-sm shadow-[0_0_15px_rgba(0,255,136,0.2)]">
                Start AI Recording
              </button>
            ) : (
              <button onClick={handleStopAI} className="w-full bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-bold py-3 rounded-xl transition-all text-sm shadow-lg flex items-center justify-center gap-2">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span> Stop & Generate Summary
              </button>
            )}
            {loadingAI && <p className="text-center text-xs text-[#00e5ff] mt-2 font-medium animate-pulse">Generating AI Summary...</p>}
          </div>
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }
      `}} />
    </div>
  );
}

export default function RoomPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center h-screen bg-[#050505] text-white">
        <div className="animate-spin rounded-full h-14 w-14 border-t-4 border-b-4 border-[#00ff88] mb-6"></div>
        <p className="text-lg font-semibold animate-pulse text-[#00e5ff]">Loading secure room...</p>
      </div>
    }>
      <RoomContent />
    </Suspense>
  );
}
