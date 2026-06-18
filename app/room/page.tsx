"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from "@dtelecom/components-react";
import "@dtelecom/components-styles";

// 1. We moved the main logic into a separate component called RoomContent
function RoomContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const roomId = searchParams.get("id") || "dSpaces-Room";
  const userName = searchParams.get("name") || "Guest";

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
        setErrorMsg("Unable to connect to the server. Please check your network.");
      }
    };
    fetchToken();
  }, [roomId, userName]);

  const handleStartAI = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser does not support AI Speech Detection. Please use Google Chrome.");
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

    try {
      const res = await fetch("/api/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      const data = await res.json();
      
      if (data.success) {
        setSummary(data.summary);
      } else {
        setSummary("Failed to generate AI Summary: " + data.error);
      }
    } catch (e) {
      setSummary("Server error! AI generation failed.");
    }
    setLoadingAI(false);
  };

  if (errorMsg) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white text-center p-6">
        <h1 className="text-3xl text-red-500 font-bold mb-4">⚠️ Connection Error</h1>
        <p className="text-gray-300 text-lg">{errorMsg}</p>
        <button onClick={() => router.push("/")} className="mt-8 px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold transition-all">Go Back Home</button>
      </div>
    );
  }

  if (!token || !serverUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#030712] text-white">
        <div className="animate-spin rounded-full h-14 w-14 border-t-4 border-b-4 border-blue-500 mb-6 shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
        <p className="text-lg font-semibold tracking-widest animate-pulse text-blue-400">Connecting to secure room...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-[#030712] overflow-hidden font-sans">
      
      <div className="flex-1 relative shadow-2xl">
        <LiveKitRoom
          video={true}
          audio={true}
          token={token}
          serverUrl={serverUrl}
          data-lk-theme="default"
          style={{ height: '100vh', backgroundColor: '#000' }}
          onDisconnected={() => router.push("/profile")}
        >
          <VideoConference />
          <RoomAudioRenderer />
        </LiveKitRoom>
      </div>

      <div className="w-full lg:w-[400px] bg-gray-950 border-l border-gray-800 flex flex-col p-5 text-white z-50 shadow-[-10px_0_30px_rgba(0,0,0,0.5)]">
        <h2 className="text-2xl font-extrabold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent mb-6 flex items-center gap-2">
          <span>✨</span> AI Meeting Assistant
        </h2>

        <div className="flex-1 overflow-y-auto bg-black/60 rounded-2xl p-5 mb-5 border border-gray-800 shadow-inner custom-scrollbar relative">
          <h3 className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-3 absolute top-3 bg-black px-2">Live Transcript</h3>
          <div className="mt-4">
            {transcript ? (
              <p className="text-gray-300 text-sm leading-relaxed italic">"{transcript}"</p>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-600 mt-10">
                <svg className="w-10 h-10 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                <p className="text-center text-sm">Start recording to see live conversation here...</p>
              </div>
            )}
          </div>
        </div>

        {summary && (
          <div className="flex-1 overflow-y-auto bg-blue-900/10 border border-blue-500/30 rounded-2xl p-5 mb-5 shadow-[0_0_15px_rgba(59,130,246,0.1)] custom-scrollbar">
            <h3 className="font-bold text-blue-400 mb-3 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              AI Generated Summary
            </h3>
            <div className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{summary}</div>
          </div>
        )}

        <div className="flex flex-col gap-3 mt-auto pt-2">
          {!isRecording ? (
            <button onClick={handleStartAI} className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold py-4 rounded-xl transition-all shadow-lg hover:shadow-green-500/25 active:scale-[0.98] flex items-center justify-center gap-2">
              <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span> Start AI Recording
            </button>
          ) : (
            <button onClick={handleStopAI} className="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold py-4 rounded-xl transition-all shadow-lg hover:shadow-red-500/25 active:scale-[0.98] flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd"></path></svg> Stop & Generate Summary
            </button>
          )}
          
          {loadingAI && (
             <div className="flex items-center justify-center gap-2 text-sm text-blue-400 mt-2 font-medium">
                <svg className="animate-spin h-4 w-4 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Gemini is analyzing meeting...
             </div>
          )}
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #4b5563; }
      `}} />
    </div>
  );
}

// 2. Here we export the default Page component wrapped inside <Suspense> 
// This completely fixes the Next.js 14 prerendering error
export default function RoomPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center h-screen bg-[#030712] text-white">
        <div className="animate-spin rounded-full h-14 w-14 border-t-4 border-b-4 border-blue-500 mb-6 shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
        <p className="text-lg font-semibold tracking-widest animate-pulse text-blue-400">Loading Secure Environment...</p>
      </div>
    }>
      <RoomContent />
    </Suspense>
  );
}
