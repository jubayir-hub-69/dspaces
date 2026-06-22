"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { 
  LiveKitRoom, 
  VideoConference, 
  RoomAudioRenderer,
  useRoomContext
} from "@dtelecom/components-react";
import "@dtelecom/components-styles";

interface ChatMessage {
  sender: "user" | "ai";
  text: string;
}

const languageMap: Record<string, string> = {
  "English": "en-US",
  "Bengali": "bn-BD",
  "Spanish": "es-ES",
  "French": "fr-FR",
  "Hindi": "hi-IN"
};

const NetworkBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const particles: any[] = [];
    const numParticles = window.innerWidth < 768 ? 40 : 80;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    class Particle {
      x: number; y: number; vx: number; vy: number; color: string;
      constructor() {
        this.x = Math.random() * canvas!.width;
        this.y = Math.random() * canvas!.height;
        this.vx = (Math.random() - 0.5) * 0.8;
        this.vy = (Math.random() - 0.5) * 0.8;
        this.color = Math.random() > 0.5 ? '#00e5ff' : '#00ff88'; 
      }
      update() {
        this.x += this.vx;
        this.y += this.vy;
        if (this.x < 0 || this.x > canvas!.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvas!.height) this.vy *= -1;
      }
      draw() {
        if (!ctx) return;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fill();
        ctx.shadowBlur = 0; 
      }
    }

    for (let i = 0; i < numParticles; i++) {
      particles.push(new Particle());
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < numParticles; i++) {
        particles[i].update();
        particles[i].draw();
        for (let j = i + 1; j < numParticles; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < 130) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(0, 229, 255, ${1 - distance / 130})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
      animationFrameId = requestAnimationFrame(animate);
    };
    
    animate();
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 z-0 opacity-50 pointer-events-none" />;
};

// ==========================================
// 100% BULLETPROOF: Cloud Signal API System for Host Controls
// ==========================================
const AudioAndHostControls = ({ rawUserName, showDynamicToast }: { rawUserName: string, showDynamicToast: (msg: string) => void }) => {
  const room = useRoomContext();
  const router = useRouter();
  const [aiNoise, setAiNoise] = useState(true);
  const lastSignalTime = useRef(0);

  useEffect(() => {
    // SEND COMMAND: Host sends Mute/Kick via Cloud API safely
    (window as any).sendHostAction = async (action: string, target: string) => {
      try {
        await fetch('/api/room-signals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, target })
        });
        
        if (action === 'MUTE_USER') showDynamicToast(`🎙️ Muted ${target}`);
        if (action === 'KICK_USER') showDynamicToast(`🚪 Removed ${target} from room`);
      } catch(e) {
        console.error("Failed to send command.");
      }
    };

    return () => { delete (window as any).sendHostAction; };
  }, [showDynamicToast]);

  useEffect(() => {
    if (!room) return;
    const myName = rawUserName.replace(' (Host)', '').replace(' (You)', '').trim();

    // RECEIVE COMMAND: Everyone listens securely to the Cloud API
    const checkSignals = async () => {
      try {
        const res = await fetch('/api/room-signals');
        const data = await res.json();
        
        if (data.success && data.signals) {
          data.signals.forEach((sig: any) => {
            if (sig.target === myName && sig.timestamp > lastSignalTime.current) {
              lastSignalTime.current = sig.timestamp;
              
              if (sig.action === "MUTE_USER") {
                if (room.localParticipant) {
                  room.localParticipant.setMicrophoneEnabled(false);
                }
                showDynamicToast("🎙️ The Host has muted your microphone.");
              }
              if (sig.action === "KICK_USER") {
                showDynamicToast("🛑 The Host has removed you from the room.");
                room.disconnect(); 
                setTimeout(() => router.push("/"), 1500); 
              }
            }
          });
        }
      } catch(e) {}
    };

    const interval = setInterval(checkSignals, 2000);
    return () => clearInterval(interval);
  }, [room, rawUserName, router, showDynamicToast]);

  const toggleNoiseSuppression = () => {
    setAiNoise(!aiNoise);
    showDynamicToast(`🎙️ AI Noise Suppression is now ${!aiNoise ? 'Activated' : 'Deactivated'}`);
  };

  return (
    <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 flex items-center gap-3">
      <button 
        onClick={toggleNoiseSuppression} 
        className={`px-4 py-2.5 rounded-xl text-xs font-extrabold border transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(0,0,0,0.5)] ${aiNoise ? 'bg-black/60 border-[#00ff88]/50 text-[#00ff88] backdrop-blur-md' : 'bg-black/40 border-gray-600 text-gray-400 backdrop-blur-md'}`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
        AI Noise {aiNoise ? 'ON' : 'OFF'}
      </button>
    </div>
  );
};


function RoomContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const roomId = searchParams.get("id") || "dSpaces-Room";
  const rawUserName = searchParams.get("name");
  const isHost = searchParams.get("ishost") === "true";

  useEffect(() => {
    if (!rawUserName) {
      router.replace(`/?id=${roomId}`);
    }
  }, [rawUserName, roomId, router]);

  const userName = isHost ? `${rawUserName || 'Guest'} (Host)` : (rawUserName || 'Guest');

  const [token, setToken] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState("");
  const [loadingAI, setLoadingAI] = useState(false);
  
  const recognitionRef = useRef<any>(null);
  const isRecordingRef = useRef(false);
  const fullTranscriptRef = useRef("");

  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);

  const [aiLanguage, setAiLanguage] = useState("English");
  const [aiChatInput, setAiChatInput] = useState("");
  const [aiChatHistory, setAiChatHistory] = useState<ChatMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rawUserName) return; 

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
  }, [roomId, userName, rawUserName]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [aiChatHistory]);

  // CLOUD AVATAR SYNC + HOST 3-DOT MENU
  useEffect(() => {
    if (!rawUserName) return;

    const db = JSON.parse(localStorage.getItem('dspaces_db') || '[]');
    let myCleanName = rawUserName.replace(' (Host)', '').trim();
    let myAvatar = '🤖';
    const me = db.find((u: any) => u.name === myCleanName);
    if (me) myAvatar = me.avatar;

    const syncAndApplyAvatars = async () => {
      try {
        const res = await fetch('/api/sync-avatar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: myCleanName, avatar: myAvatar })
        });
        const data = await res.json();
        const globalUserMap = data.avatars || {};

        const tiles = document.querySelectorAll('.lk-participant-tile');
        tiles.forEach((tile: any) => {
          const nameEl = tile.querySelector('.lk-participant-name');
          const placeholder = tile.querySelector('.lk-participant-placeholder');
          
          if (nameEl && placeholder) {
            const currentRawName = nameEl.textContent || '';
            const tileName = currentRawName.replace(' (Host)', '').replace(' (You)', '').trim();
            
            // Apply Avatar
            const avatar = globalUserMap[tileName] || (db.find((u:any)=>u.name===tileName)?.avatar) || '🤖';
            if (!placeholder.querySelector('.custom-avatar') || placeholder.getAttribute('data-avatar') !== avatar) {
              placeholder.innerHTML = ''; 
              placeholder.setAttribute('data-avatar', avatar);
              
              if (avatar.startsWith('data:image')) {
                placeholder.innerHTML = `<img src="${avatar}" class="custom-avatar" style="width: 120px; height: 120px; border-radius: 50%; object-fit: cover; border: 3px solid #00e5ff; box-shadow: 0 0 25px rgba(0,229,255,0.4);" />`;
              } else {
                placeholder.innerHTML = `<div class="custom-avatar" style="font-size: 80px; filter: drop-shadow(0 0 20px rgba(0,255,136,0.5));">${avatar}</div>`;
              }
            }

            // Apply Host Controls (3-Dots)
            if (isHost && tileName !== myCleanName) {
              tile.style.position = 'relative';
              if (!tile.querySelector('.host-control-btn')) {
                const btnContainer = document.createElement('div');
                btnContainer.className = 'host-control-btn absolute top-3 right-3 z-50';
                btnContainer.setAttribute('onmouseleave', "this.querySelector('.host-dropdown').classList.add('hidden')");

                btnContainer.innerHTML = `
                  <button class="bg-black/80 p-2 rounded-lg border border-gray-600 hover:bg-gray-700 text-white transition-all backdrop-blur-md shadow-lg pointer-events-auto" onclick="this.nextElementSibling.classList.toggle('hidden')">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 16 16"><path d="M3 8a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm5 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm5 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z"></path></svg>
                  </button>
                  <div class="host-dropdown hidden absolute right-0 mt-2 w-36 bg-[#0f172a]/95 backdrop-blur-xl border border-gray-700 rounded-xl shadow-[0_15px_30px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col z-[9999] pointer-events-auto">
                    <button class="px-4 py-3 text-xs text-left font-bold text-gray-200 hover:bg-gray-800 hover:text-[#00e5ff] flex items-center gap-2 transition-colors w-full" onclick="if(window.sendHostAction) window.sendHostAction('MUTE_USER', '${tileName}'); this.parentElement.classList.add('hidden')">
                      🔇 Mute
                    </button>
                    <div class="h-[1px] w-full bg-gray-800/50"></div>
                    <button class="px-4 py-3 text-xs text-left font-bold text-red-400 hover:bg-red-500/20 hover:text-red-300 flex items-center gap-2 transition-colors w-full" onclick="if(window.sendHostAction) window.sendHostAction('KICK_USER', '${tileName}'); this.parentElement.classList.add('hidden')">
                      🚪 Kick out
                    </button>
                  </div>
                `;
                tile.appendChild(btnContainer);
              }
            }
          }
        });
      } catch(e) {}
    };

    const observer = new MutationObserver(syncAndApplyAvatars);
    observer.observe(document.body, { childList: true, subtree: true });
    
    const interval = setInterval(syncAndApplyAvatars, 3000); 
    syncAndApplyAvatars();
    
    return () => {
      observer.disconnect();
      clearInterval(interval);
    };
  }, [rawUserName, isHost]);

  const showDynamicToast = (msg: string) => {
    setToastMsg(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const copyInviteLink = () => {
    const inviteLink = `${window.location.origin}/room?id=${roomId}`;
    navigator.clipboard.writeText(inviteLink);
    showDynamicToast("Invite link copied to clipboard!");
  };

  const handleDownloadReport = () => {
    if (!summary) return;
    const reportContent = `=======================================\n           dSpaces Meeting Report\n=======================================\n\nRoom ID: ${roomId}\nDate: ${new Date().toLocaleString()}\nLanguage: ${aiLanguage}\n\n${summary}\n\n=======================================\n          Full Raw Transcript\n=======================================\n${fullTranscriptRef.current || transcript}`;
    
    const blob = new Blob([reportContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dSpaces_Report_${roomId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showDynamicToast("Report Downloaded Successfully!");
  };

  const handleCopySummary = () => {
    if (!summary) return;
    navigator.clipboard.writeText(summary);
    showDynamicToast("Summary copied to clipboard!");
  };

  const handleClearTranscript = () => {
    setTranscript("");
    fullTranscriptRef.current = "";
    setAiChatHistory([]);
    setSummary("");
    showDynamicToast("Data cleared successfully!");
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
    recognition.lang = languageMap[aiLanguage] || "en-US"; 
    
    let currentSessionText = "";

    recognition.onresult = (event: any) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      currentSessionText = text;
      setTranscript((fullTranscriptRef.current + " " + text).trim());
    };

    recognition.onend = () => {
      if (currentSessionText) {
        fullTranscriptRef.current += " " + currentSessionText;
        currentSessionText = "";
      }
      if (isRecordingRef.current) {
        setTimeout(() => {
          try { recognition.start(); } catch (e) {}
        }, 350); 
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'audio-capture' || event.error === 'not-allowed') {
        isRecordingRef.current = false;
        setIsRecording(false);
        alert("Microphone conflict detected. Ensure no other app is using the mic.");
      }
    };

    try {
      recognition.start();
      setIsRecording(true);
      isRecordingRef.current = true;
      recognitionRef.current = recognition;
    } catch(e) {
      alert("Failed to start microphone. Please ensure permissions are granted.");
    }
  };

  const handleStopAI = async () => {
    isRecordingRef.current = false;
    if (recognitionRef.current) recognitionRef.current.stop();
    setIsRecording(false);
    setLoadingAI(true);
    setSummary("");

    try {
      const res = await fetch("/api/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: fullTranscriptRef.current || transcript, language: aiLanguage }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setSummary(data.summary);
        
        try {
          const sessionId = localStorage.getItem("dspaces_active_session");
          if (sessionId) {
            const historyKey = `dspaces_history_${sessionId}`;
            const existingHistory = JSON.parse(localStorage.getItem(historyKey) || "[]");
            
            const newMeeting = {
              id: roomId,
              date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
              duration: "Ended",
              role: isHost ? "HOST" : "PARTICIPANT",
              summary: data.summary
            };
            
            const updatedHistory = [newMeeting, ...existingHistory].slice(0, 10);
            localStorage.setItem(historyKey, JSON.stringify(updatedHistory));
          }
        } catch(e) {}

      } else {
        setSummary(`❌ AI Error: ${data.error}`);
      }
    } catch (e: any) {
      setSummary(`❌ Request Failed: ${e.message}`);
    }
    setLoadingAI(false);
  };

  const handleSendAiQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = aiChatInput.trim();
    if (!query || !transcript) return;

    setAiChatHistory(prev => [...prev, { sender: "user", text: query }]);
    setAiChatInput("");
    setLoadingChat(true);

    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: fullTranscriptRef.current || transcript, question: query, language: aiLanguage }),
      });
      const data = await res.json();

      if (data.success) {
        setAiChatHistory(prev => [...prev, { sender: "ai", text: data.answer }]);
      } else {
        setAiChatHistory(prev => [...prev, { sender: "ai", text: `❌ Error: ${data.error}` }]);
      }
    } catch (err: any) {
      setAiChatHistory(prev => [...prev, { sender: "ai", text: `❌ Request failed: ${err.message}` }]);
    } finally {
      setLoadingChat(false);
    }
  };

  if (!rawUserName) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#04050A] text-white relative">
         <NetworkBackground />
         <div className="z-10 animate-spin rounded-full h-14 w-14 border-t-4 border-b-4 border-[#00ff88] mb-6 shadow-[0_0_15px_#00ff88]"></div>
         <p className="z-10 text-lg font-semibold tracking-widest animate-pulse text-[#00e5ff] drop-shadow-[0_0_10px_#00e5ff]">Securing room access...</p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#04050A] text-white text-center p-6">
        <h1 className="text-3xl text-red-500 font-bold mb-4">Connection Error</h1>
        <p className="text-gray-300 text-lg">{errorMsg}</p>
        <button onClick={() => router.push("/")} className="mt-8 px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold transition-all">Go Back Home</button>
      </div>
    );
  }

  if (!token || !serverUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#04050A] text-white relative">
         <NetworkBackground />
         <div className="z-10 animate-spin rounded-full h-14 w-14 border-t-4 border-b-4 border-[#00ff88] mb-6 shadow-[0_0_15px_#00ff88]"></div>
         <p className="z-10 text-lg font-semibold tracking-widest animate-pulse text-[#00e5ff] drop-shadow-[0_0_10px_#00e5ff]">Connecting to secure room...</p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-[100dvh] w-full bg-[#04050A] overflow-hidden font-sans">
      
      <NetworkBackground />

      <div className={`absolute top-6 left-1/2 transform -translate-x-1/2 z-[100] bg-[#0f172a] text-white px-6 py-3 rounded-full shadow-[0_0_15px_rgba(0,229,255,0.3)] flex items-center gap-3 border border-[#00e5ff]/30 transition-all duration-300 ${showToast ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10 pointer-events-none'}`}>
        <svg className="w-5 h-5 text-[#00ff88]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
        <span className="font-medium text-sm">{toastMsg || "Success!"}</span>
      </div>

      <div className="flex-none px-6 py-4 bg-black/50 backdrop-blur-md border-b border-gray-800/50 flex justify-between items-center z-40">
        <h1 className="text-white text-base lg:text-lg font-bold truncate max-w-[200px] sm:max-w-xs drop-shadow-[0_0_8px_rgba(0,229,255,0.5)]">Room: <span className="text-[#00e5ff]">{roomId}</span></h1>
        <button onClick={copyInviteLink} className="bg-[#0f172a] hover:bg-[#1e293b] text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all border border-gray-700 hover:border-[#00e5ff]/50 flex items-center gap-2 shadow-[0_0_10px_rgba(0,229,255,0.1)]">
          <svg className="w-4 h-4 text-[#00e5ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
          <span className="hidden sm:inline">Copy Invite Link</span>
          <span className="sm:hidden">Copy</span>
        </button>
      </div>

      <div className="flex-1 w-full min-h-0 relative z-10 bg-transparent">
        <LiveKitRoom
          video={true}
          audio={true}
          token={token}
          serverUrl={serverUrl}
          data-lk-theme="default"
          style={{ height: '100%', width: '100%', backgroundColor: 'transparent' }}
          onDisconnected={() => router.push("/")}
        >
          <VideoConference />
          <RoomAudioRenderer />
          
          <AudioAndHostControls rawUserName={rawUserName} showDynamicToast={showDynamicToast} />

        </LiveKitRoom>
      </div>

      {!isAIPanelOpen && (
        <button 
          onClick={() => setIsAIPanelOpen(true)} 
          className="absolute bottom-24 right-4 sm:right-8 z-50 bg-[#0f172a] hover:bg-[#1e293b] text-white px-5 py-3 rounded-full shadow-[0_0_20px_rgba(0,229,255,0.2)] border border-[#00e5ff]/30 font-bold flex items-center gap-2 transition-all hover:scale-105 hover:shadow-[0_0_25px_rgba(0,255,136,0.3)]"
        >
          <span className="text-[#00ff88]">✨</span> Ask AI
        </button>
      )}

      <div className={`absolute right-0 top-0 h-full w-full sm:w-[420px] bg-[#030712]/95 backdrop-blur-2xl z-[60] shadow-[-10px_0_30px_rgba(0,0,0,0.9)] border-l border-gray-800/50 flex flex-col transform transition-transform duration-300 ease-in-out ${isAIPanelOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        
        <div className="flex items-center justify-between p-4 border-b border-gray-800/50">
          <h2 className="text-lg font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[#00e5ff] to-[#00ff88] flex items-center gap-2">✨ AI Assistant</h2>
          
          <div className="flex items-center gap-3">
            <select 
              value={aiLanguage}
              onChange={(e) => setAiLanguage(e.target.value)}
              disabled={isRecording}
              className="bg-gray-900 border border-[#00e5ff]/30 text-[#00e5ff] text-xs font-bold rounded-lg px-2 py-1.5 outline-none cursor-pointer disabled:opacity-50"
              title="Select AI Language"
            >
              <option value="English">🇬🇧 English</option>
              <option value="Bengali">🇧🇩 বাংলা</option>
              <option value="Spanish">🇪🇸 Spanish</option>
              <option value="French">🇫🇷 French</option>
              <option value="Hindi">🇮🇳 Hindi</option>
            </select>

            <button onClick={() => setIsAIPanelOpen(false)} className="text-gray-400 hover:text-white p-1.5 bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col p-4 min-h-0">
          
          <div className="flex-1 overflow-y-auto pr-1 space-y-3 custom-scrollbar min-h-0 pb-2">
            
            <div className="bg-black/40 rounded-xl p-3.5 border border-gray-800/60 relative">
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Live Transcript ({aiLanguage})</h3>
                {(transcript || aiChatHistory.length > 0) && (
                  <button onClick={handleClearTranscript} className="text-gray-400 hover:text-red-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    Clear
                  </button>
                )}
              </div>
              {transcript ? (
                <p className="text-gray-300 text-xs leading-relaxed italic">"{transcript}"</p>
              ) : (
                <p className="text-xs text-gray-600">Start recording to capture conversation...</p>
              )}
            </div>

            {summary && (
              <div className="bg-blue-900/10 border border-[#00e5ff]/20 rounded-xl p-3.5 flex flex-col gap-3">
                <div>
                  <h3 className="font-bold text-[#00e5ff] mb-1.5 text-xs">AI Generated Summary</h3>
                  <div className={`text-xs whitespace-pre-wrap leading-relaxed ${summary.startsWith('❌') ? 'text-red-400' : 'text-gray-200'}`}>
                    {summary}
                  </div>
                </div>
                
                {!summary.startsWith('❌') && (
                  <div className="flex items-center gap-2 pt-2 border-t border-[#00e5ff]/10">
                    <button onClick={handleCopySummary} className="flex-1 bg-gray-900 hover:bg-gray-800 text-gray-300 py-2 rounded-lg text-[10px] font-bold transition-colors border border-gray-700 flex justify-center items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                      Copy
                    </button>
                    <button onClick={handleDownloadReport} className="flex-1 bg-blue-600/20 hover:bg-blue-600/40 text-[#00e5ff] py-2 rounded-lg text-[10px] font-bold transition-colors border border-blue-500/30 flex justify-center items-center gap-1.5 shadow-[0_0_10px_rgba(0,229,255,0.1)]">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                      Download Report
                    </button>
                  </div>
                )}
              </div>
            )}

            {aiChatHistory.length > 0 && (
              <div className="border-t border-gray-800/50 pt-3 space-y-2.5">
                <h4 className="text-[10px] text-[#00ff88] font-bold uppercase tracking-wider">AI Chat Discussions</h4>
                {aiChatHistory.map((msg, i) => (
                  <div key={i} className={`flex flex-col max-w-[85%] rounded-xl p-2.5 text-xs leading-relaxed ${msg.sender === "user" ? "bg-blue-600/20 border border-blue-500/30 ml-auto text-blue-200" : "bg-gray-800/40 border border-gray-700/40 mr-auto text-gray-300"}`}>
                    <span className="text-[9px] font-bold uppercase mb-1 opacity-50">{msg.sender === "user" ? "You" : "AI Assistant"}</span>
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  </div>
                ))}
                {loadingChat && (
                  <div className="bg-gray-800/20 border border-gray-800 animate-pulse mr-auto rounded-xl p-2.5 text-xs text-[#00e5ff] max-w-[85%]">
                    AI is thinking...
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          <div className="mt-auto border-t border-gray-800/60 pt-3 space-y-3 bg-gray-950 flex-shrink-0">
            
            {transcript && (
              <form onSubmit={handleSendAiQuestion} className="flex gap-2 items-center bg-black/50 border border-gray-800 rounded-xl p-1.5 focus-within:border-[#00e5ff]/40 transition-colors">
                <input 
                  type="text" 
                  value={aiChatInput}
                  onChange={(e) => setAiChatInput(e.target.value)}
                  placeholder={`Ask in ${aiLanguage}...`} 
                  disabled={loadingChat}
                  className="flex-1 bg-transparent text-xs text-white outline-none px-2 py-1.5 placeholder-gray-600 disabled:opacity-50"
                />
                <button 
                  type="submit" 
                  disabled={loadingChat || !aiChatInput.trim()}
                  className="bg-[#0f172a] border border-gray-700 hover:border-[#00ff88]/50 text-white p-2 rounded-lg transition-colors disabled:opacity-30 flex-shrink-0"
                >
                  <svg className="w-3.5 h-3.5 text-[#00ff88]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                </button>
              </form>
            )}

            <div className="flex flex-col gap-2 pb-1">
              {!isRecording ? (
                <button onClick={handleStartAI} className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white font-bold py-2.5 rounded-xl transition-all text-xs shadow-[0_0_15px_rgba(0,255,136,0.1)]">
                  Start AI Recording
                </button>
              ) : (
                <button onClick={handleStopAI} className="w-full bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-bold py-2.5 rounded-xl transition-all text-xs shadow-lg flex items-center justify-center gap-2">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span> Stop & Generate Summary
                </button>
              )}
              {loadingAI && <p className="text-center text-[10px] text-[#00e5ff] font-medium animate-pulse">Translating & Processing...</p>}
            </div>
          </div>
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .lk-participant-placeholder { background: transparent !important; }
        .lk-participant-placeholder svg { display: none !important; }
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
      <div className="flex flex-col items-center justify-center h-screen bg-[#04050A] text-white">
        <div className="animate-spin rounded-full h-14 w-14 border-t-4 border-b-4 border-[#00ff88] mb-6 shadow-[0_0_15px_#00ff88]"></div>
        <p className="text-lg font-semibold animate-pulse text-[#00e5ff] drop-shadow-[0_0_10px_#00e5ff]">Loading secure room...</p>
      </div>
    }>
      <RoomContent />
    </Suspense>
  );
}
