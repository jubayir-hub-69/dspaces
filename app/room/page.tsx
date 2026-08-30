"use client";

import { Suspense, useEffect, useState, useRef, useCallback, useMemo, memo, type CSSProperties } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { 
  LiveKitRoom, 
  VideoConference, 
  RoomAudioRenderer,
  useRoomContext,
  useLocalParticipantPermissions,
} from "@dtelecom/components-react";
import "@dtelecom/components-styles";
import "./room-layout.css";
import { AboutDspacesButton, AboutDspacesModal } from "../../components/AboutDspacesModal";
import { ImportantMeetingControls } from "../../components/ImportantMeetingControls";
import { ImportantMeetingStage } from "../../components/ImportantMeetingStage";

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

const isLikelyMobileDevice = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Mobi|Android|iPhone|iPod|iPad|webOS|IEMobile|Opera Mini/i.test(ua)
    || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
};

const getSpeechRecognitionCtor = () => {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
};

const LIVEKIT_ROOM_STYLE: CSSProperties = {
  height: "100%",
  width: "100%",
  backgroundColor: "transparent",
  minHeight: 0,
  overflow: "hidden",
};

const NetworkBackground = memo(function NetworkBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId = 0;
    let stopped = false;
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
      if (stopped) return;
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

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(animationFrameId);
        return;
      }
      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(animate);
    };
    
    animate();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 z-0 opacity-50 pointer-events-none" />;
});

const MeetingTracker = memo(function MeetingTracker({ setMaxParticipants }: { setMaxParticipants: (n: any) => void }) {
  const room = useRoomContext();
  useEffect(() => {
    if (!room) return;
    const updateCount = () => {
      setMaxParticipants((prev: number) => Math.max(prev, room.participants.size + 1));
    };
    room.on('participantConnected', updateCount);
    room.on('participantDisconnected', updateCount);
    updateCount(); 
    return () => {
      room.off('participantConnected', updateCount);
      room.off('participantDisconnected', updateCount);
    };
  }, [room, setMaxParticipants]);
  return null;
});

const SCREEN_SHARE_UNSUPPORTED_MSG = "Screen sharing is not supported on this mobile browser";

const isScreenShareSupported = () => {
  if (typeof navigator === "undefined") return false;
  const mediaDevices = navigator.mediaDevices as MediaDevices | undefined;
  return !!mediaDevices && typeof mediaDevices.getDisplayMedia === "function";
};

const ScreenShareGuard = memo(function ScreenShareGuard({ showDynamicToast }: { showDynamicToast: (msg: string) => void }) {
  const toastRef = useRef(showDynamicToast);
  toastRef.current = showDynamicToast;
  const permissions = useLocalParticipantPermissions();
  const canPublish = permissions?.canPublish !== false;

  useEffect(() => {
    let lastToastAt = 0;
    const notifyUnsupported = () => {
      const now = Date.now();
      if (now - lastToastAt < 800) return;
      lastToastAt = now;
      toastRef.current(SCREEN_SHARE_UNSUPPORTED_MSG);
    };

    const interceptShareClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest) return;
      if (!target.closest("[data-lk-source='screen_share']")) return;
      if (isScreenShareSupported()) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      notifyUnsupported();
    };

    document.addEventListener("click", interceptShareClick, true);

    const mediaDevices = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    const originalGetDisplayMedia = mediaDevices?.getDisplayMedia;
    if (mediaDevices && originalGetDisplayMedia && !(mediaDevices as MediaDevices & { __dspacesShareWrapped?: boolean }).__dspacesShareWrapped) {
      const wrappedGetDisplayMedia = ((constraints?: DisplayMediaStreamOptions) => {
        return originalGetDisplayMedia.call(mediaDevices, constraints).catch((err: unknown) => {
          const name = (err as { name?: string })?.name || "";
          if (name === "NotSupportedError") {
            notifyUnsupported();
          }
          throw err;
        });
      }) as typeof mediaDevices.getDisplayMedia;
      (mediaDevices as MediaDevices & { __dspacesShareWrapped?: boolean }).__dspacesShareWrapped = true;
      mediaDevices.getDisplayMedia = wrappedGetDisplayMedia;
    }

    const SCREEN_SHARE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="16" fill="none" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M0 2.75A2.75 2.75 0 0 1 2.75 0h14.5A2.75 2.75 0 0 1 20 2.75v10.5A2.75 2.75 0 0 1 17.25 16H2.75A2.75 2.75 0 0 1 0 13.25zM2.75 1.5c-.69 0-1.25.56-1.25 1.25v10.5c0 .69.56 1.25 1.25 1.25h14.5c.69 0 1.25-.56 1.25-1.25V2.75c0-.69-.56-1.25-1.25-1.25z" clip-rule="evenodd"/><path fill="currentColor" fill-rule="evenodd" d="M9.47 4.22a.75.75 0 0 1 1.06 0l2.25 2.25a.75.75 0 0 1-1.06 1.06l-.97-.97v4.69a.75.75 0 0 1-1.5 0V6.56l-.97.97a.75.75 0 0 1-1.06-1.06z" clip-rule="evenodd"/></svg>`;

    const syncFallbackButton = () => {
      const bar = document.querySelector(".lk-control-bar");
      if (!bar) return;

      const nativeBtn = bar.querySelector("[data-lk-source='screen_share']");
      const existingFallback = bar.querySelector("[data-dspaces-screenshare-fallback]");

      if (isScreenShareSupported() || nativeBtn) {
        existingFallback?.remove();
        return;
      }

      if (existingFallback) return;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lk-button";
      btn.setAttribute("data-dspaces-screenshare-fallback", "true");
      btn.setAttribute("aria-label", "Share Screen");
      btn.innerHTML = `${SCREEN_SHARE_ICON}<span class="dspaces-screenshare-label">Share Screen</span>`;
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        notifyUnsupported();
      });

      const insertBefore = bar.querySelector(".lk-chat-toggle") || bar.querySelector(".lk-disconnect-button");
      if (insertBefore) bar.insertBefore(btn, insertBefore);
      else bar.appendChild(btn);
    };

    let observer: MutationObserver | null = null;
    let debounceId: ReturnType<typeof setTimeout> | null = null;

    if (!isScreenShareSupported() && canPublish) {
      syncFallbackButton();
      observer = new MutationObserver(() => {
        if (debounceId != null) return;
        debounceId = setTimeout(() => {
          debounceId = null;
          syncFallbackButton();
        }, 300);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    } else if (!canPublish) {
      document.querySelector("[data-dspaces-screenshare-fallback]")?.remove();
    }

    return () => {
      document.removeEventListener("click", interceptShareClick, true);
      observer?.disconnect();
      if (debounceId != null) clearTimeout(debounceId);
      document.querySelector("[data-dspaces-screenshare-fallback]")?.remove();
      if (mediaDevices && originalGetDisplayMedia) {
        mediaDevices.getDisplayMedia = originalGetDisplayMedia;
        delete (mediaDevices as MediaDevices & { __dspacesShareWrapped?: boolean }).__dspacesShareWrapped;
      }
    };
  }, [canPublish]);

  return null;
});

const AudioAndHostControls = memo(function AudioAndHostControls({ rawUserName, showDynamicToast, isImportant, isSupremeHost }: { rawUserName: string, showDynamicToast: (msg: string) => void, isImportant?: boolean, isSupremeHost?: boolean }) {
  const room = useRoomContext();
  const [aiNoise, setAiNoise] = useState(true);
  const lastSignalTime = useRef(0);
  const toastRef = useRef(showDynamicToast);
  toastRef.current = showDynamicToast;
  const aiNoiseRef = useRef(aiNoise);
  aiNoiseRef.current = aiNoise;

  useEffect(() => {
    (window as any).sendHostAction = async (action: string, target: string) => {
      try {
        await fetch('/api/room-signals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, target })
        });
        
        if (action === 'MUTE_USER') toastRef.current(`🎙️ Muted ${target}`);
        if (action === 'KICK_USER') toastRef.current(`🚪 Removed ${target} from room`);
      } catch(e) {}
    };
    return () => { delete (window as any).sendHostAction; };
  }, []);

  useEffect(() => {
    if (!room) return;
    const myName = rawUserName.replace(' (Host)', '').replace(' (You)', '').trim();

    const checkSignals = async () => {
      try {
        const res = await fetch('/api/room-signals');
        const data = await res.json();
        
        if (data.success && data.signals) {
          data.signals.forEach((sig: any) => {
            if (sig.target === myName && sig.timestamp > lastSignalTime.current) {
              lastSignalTime.current = sig.timestamp;

              if (isImportant && isSupremeHost && (sig.action === "MUTE_USER" || sig.action === "KICK_USER")) {
                return;
              }
              
              if (sig.action === "MUTE_USER") {
                if (room.localParticipant) {
                  room.localParticipant.setMicrophoneEnabled(false);
                }
                toastRef.current("🎙️ The Host has muted your microphone.");
              }
              if (sig.action === "KICK_USER") {
                toastRef.current("🛑 The Host has removed you from the room.");
                room.disconnect(); 
              }
            }
          });
        }
      } catch(e) {}
    };

    const interval = setInterval(checkSignals, 2000);
    return () => clearInterval(interval);
  }, [room, rawUserName, isImportant, isSupremeHost]);

  const toggleNoiseSuppression = useCallback(() => {
    const next = !aiNoiseRef.current;
    setAiNoise(next);
    toastRef.current(`🎙️ AI Noise Suppression is now ${next ? 'Activated' : 'Deactivated'}`);
  }, []);

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
});

type RoomCallStageProps = {
  token: string;
  serverUrl: string;
  rawUserName: string;
  onDisconnected: () => void;
  showDynamicToast: (msg: string) => void;
  setMaxParticipants: (n: any) => void;
  isImportant?: boolean;
  isHost?: boolean;
  roomId?: string;
  joinRole?: string;
};

const RoomCallStage = memo(function RoomCallStage({
  token,
  serverUrl,
  rawUserName,
  onDisconnected,
  showDynamicToast,
  setMaxParticipants,
  isImportant = false,
  isHost = false,
  roomId = "",
  joinRole = "",
}: RoomCallStageProps) {
  const publishOnJoin = !isImportant || isHost;
  return (
    <div className="flex-1 w-full min-h-0 relative z-10 bg-transparent overflow-hidden flex flex-col">
      <LiveKitRoom
        video={publishOnJoin}
        audio={publishOnJoin}
        token={token}
        serverUrl={serverUrl}
        connectOptions={isImportant ? { autoSubscribe: true } : undefined}
        data-lk-theme="default"
        className="h-full min-h-0 overflow-hidden"
        style={LIVEKIT_ROOM_STYLE}
        onDisconnected={onDisconnected}
      >
        <MeetingTracker setMaxParticipants={setMaxParticipants} />
        {isImportant ? (
          <ImportantMeetingStage
            isHost={isHost}
            roomId={roomId}
            serverUrl={serverUrl}
            showDynamicToast={showDynamicToast}
          />
        ) : (
          <VideoConference />
        )}
        <RoomAudioRenderer />
        <ScreenShareGuard showDynamicToast={showDynamicToast} />
        <AudioAndHostControls rawUserName={rawUserName} showDynamicToast={showDynamicToast} isImportant={isImportant} isSupremeHost={isHost} />
        {isImportant && (
          <ImportantMeetingControls
            isHost={isHost}
            roomId={roomId}
            serverUrl={serverUrl}
            showDynamicToast={showDynamicToast}
          />
        )}
      </LiveKitRoom>
    </div>
  );
});

function RoomContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const roomId = searchParams.get("id") || "dSpaces-Room";
  const rawUserName = searchParams.get("name");
  const isHost = searchParams.get("ishost") === "true";
  const urlImportant = searchParams.get("mode") === "important";

  useEffect(() => {
    if (!rawUserName) {
      const modeQuery = urlImportant ? "&mode=important" : "";
      router.replace(`/?id=${roomId}${modeQuery}`);
    }
  }, [rawUserName, roomId, router, urlImportant]);

  const userName = useMemo(
    () => (isHost ? `${rawUserName || 'Guest'} (Host)` : (rawUserName || 'Guest')),
    [isHost, rawUserName]
  );

  const [token, setToken] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [detectedImportant, setDetectedImportant] = useState(false);
  const [joinRole, setJoinRole] = useState("");
  const isImportant = urlImportant || detectedImportant;

  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState("");
  const [loadingAI, setLoadingAI] = useState(false);
  
  const recognitionRef = useRef<any>(null);
  const isRecordingRef = useRef(false);
  const fullTranscriptRef = useRef("");
  const audioContextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAudioNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const bootSpeechRecognitionRef = useRef<() => boolean>(() => false);
  const translatorGenerationRef = useRef(0);
  const [aiListenPaused, setAiListenPaused] = useState(false);

  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  const [aiLanguage, setAiLanguage] = useState("English");
  const aiLanguageRef = useRef(aiLanguage);
  aiLanguageRef.current = aiLanguage;
  const [aiChatInput, setAiChatInput] = useState("");
  const [aiChatHistory, setAiChatHistory] = useState<ChatMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [meetingStartTime] = useState(Date.now());
  const [maxParticipants, setMaxParticipants] = useState(1);
  const maxParticipantsRef = useRef(maxParticipants);
  maxParticipantsRef.current = maxParticipants;
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showPostScreen, setShowPostScreen] = useState(false);
  const [finalStats, setFinalStats] = useState({ duration: "", participants: 1 });

  useEffect(() => {
    if (!rawUserName) return; 

    const fetchToken = async () => {
      try {
        const payload: Record<string, unknown> = { room: roomId, username: userName };
        if (urlImportant) {
          payload.mode = "important";
          payload.isHost = isHost;
        }
        const res = await fetch("/api/get-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        
        if (data.token && data.url) {
          setToken(data.token);
          setServerUrl(data.url);
          if (data.important) setDetectedImportant(true);
          if (data.role) setJoinRole(data.role);
        } else {
          setErrorMsg(data.error || "Failed to fetch connection token.");
        }
      } catch (err) {
        setErrorMsg("Unable to connect to the server.");
      }
    };
    fetchToken();
  }, [roomId, userName, rawUserName, urlImportant, isHost]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [aiChatHistory]);

  // FIX: SLUGGISHNESS RESOLVED - Removed MutationObserver, using pure Interval instead.
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

            if (isHost && !isImportant && tileName !== myCleanName) {
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

    // Safely running this every 4 seconds without any DOM mutation loops
    const interval = setInterval(syncAndApplyAvatars, 4000); 
    syncAndApplyAvatars();
    
    return () => clearInterval(interval);
  }, [rawUserName, isHost, isImportant]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden || !isRecordingRef.current) return;
      try {
        recognitionRef.current?.start();
        setAiListenPaused(false);
      } catch {
        setAiListenPaused(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      translatorGenerationRef.current += 1;
      try { recognitionRef.current?.abort(); } catch {}
      recognitionRef.current = null;
      try { micAudioNodeRef.current?.disconnect(); } catch {}
      micAudioNodeRef.current = null;
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
      const ctx = audioContextRef.current;
      audioContextRef.current = null;
      if (ctx && ctx.state !== "closed") {
        try { void ctx.close(); } catch {}
      }
    };
  }, []);

  const showDynamicToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setShowToast(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setShowToast(false), 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const copyInviteLink = useCallback(() => {
    const modeQuery = isImportant ? "&mode=important" : "";
    const inviteLink = `${window.location.origin}/room?id=${roomId}${modeQuery}`;
    navigator.clipboard.writeText(inviteLink);
    showDynamicToast("Invite link copied to clipboard!");
  }, [roomId, showDynamicToast, isImportant]);

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

  const stopTranslatorMic = () => {
    try { micAudioNodeRef.current?.disconnect(); } catch {}
    micAudioNodeRef.current = null;
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
  };

  const toastMicError = (err: any) => {
    const name = err?.name || "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      showDynamicToast("Microphone permission denied. Enable the mic in your browser settings to use the AI Translator.");
    } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      showDynamicToast("No microphone was found on this device.");
    } else if (name === "NotReadableError" || name === "TrackStartError") {
      showDynamicToast("This microphone is already in use. Close other apps and try again.");
    } else if (name === "SecurityError") {
      showDynamicToast("Microphone access is blocked on this page. Use HTTPS and try again.");
    } else if (name === "NotSupportedError") {
      showDynamicToast("Microphone access is not available in this browser.");
    } else {
      showDynamicToast("Could not access the microphone on this device.");
    }
  };

  const beginTranslatorFromUserGesture = () => {
    const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    let resumePromise: Promise<void> = Promise.resolve();

    if (Ctor) {
      if (!audioContextRef.current || audioContextRef.current.state === "closed") {
        audioContextRef.current = new Ctor();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") {
        resumePromise = ctx.resume().then(() => undefined).catch(() => undefined);
      }
      try {
        const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
      } catch {}
    }

    const existing = micStreamRef.current;
    const live = existing?.getAudioTracks().some((track) => track.readyState === "live");
    let micPromise: Promise<MediaStream>;

    if (!navigator.mediaDevices?.getUserMedia) {
      micPromise = Promise.reject(Object.assign(new Error("no mediaDevices"), { name: "NotSupportedError" }));
    } else if (existing && live) {
      micPromise = Promise.resolve(existing);
    } else {
      micPromise = navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      }).catch((err: any) => {
        if (err?.name === "OverconstrainedError" || err?.name === "ConstraintNotSatisfiedError") {
          return navigator.mediaDevices.getUserMedia({ audio: true });
        }
        throw err;
      });
    }

    return { resumePromise, micPromise };
  };

  const bootSpeechRecognition = () => {
    const SpeechRecognition = getSpeechRecognitionCtor();
    if (!SpeechRecognition || !isRecordingRef.current) return false;

    const generation = ++translatorGenerationRef.current;
    try { recognitionRef.current?.abort(); } catch {}

    const recognition = new SpeechRecognition();
    const mobile = isLikelyMobileDevice();
    recognition.continuous = !mobile;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = languageMap[aiLanguageRef.current] || "en-US";

    let currentSessionText = "";

    recognition.onresult = (event: any) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      currentSessionText = text;
      setTranscript((fullTranscriptRef.current + " " + text).trim());
    };

    let startedAt = Date.now();

    recognition.onend = () => {
      if (generation !== translatorGenerationRef.current) return;
      if (currentSessionText) {
        fullTranscriptRef.current += " " + currentSessionText;
        currentSessionText = "";
      }
      if (!isRecordingRef.current) return;

      if (Date.now() - startedAt < 150) {
        setAiListenPaused(true);
        showDynamicToast("Listening paused. Tap Continue to keep transcribing on this device.");
        return;
      }

      try {
        recognition.start();
        startedAt = Date.now();
      } catch {
        const restarted = bootSpeechRecognitionRef.current();
        if (!restarted) {
          setAiListenPaused(true);
          showDynamicToast("Listening paused. Tap Continue to keep transcribing on this device.");
        }
      }
    };

    recognition.onerror = (event: any) => {
      if (generation !== translatorGenerationRef.current) return;
      const error = event?.error;
      if (error === "no-speech" || error === "aborted") return;

      if (error === "not-allowed" || error === "service-not-allowed") {
        isRecordingRef.current = false;
        setIsRecording(false);
        setAiListenPaused(false);
        stopTranslatorMic();
        showDynamicToast("Microphone permission denied. Enable the mic in your browser settings to use the AI Translator.");
        return;
      }

      if (error === "audio-capture") {
        isRecordingRef.current = false;
        setIsRecording(false);
        setAiListenPaused(false);
        stopTranslatorMic();
        showDynamicToast("Could not capture audio. Check microphone permission or close other apps using the mic.");
        return;
      }

      if (error === "network") {
        showDynamicToast("Speech recognition lost network access. Check your connection.");
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      return false;
    }
    setAiListenPaused(false);
    return true;
  };
  bootSpeechRecognitionRef.current = bootSpeechRecognition;

  const finishTranslatorUnlock = async (resumePromise: Promise<void>, micPromise: Promise<MediaStream>) => {
    try { await resumePromise; } catch {}
    try {
      const stream = await micPromise;
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (err: any) {
      const name = err?.name || "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
        isRecordingRef.current = false;
        translatorGenerationRef.current += 1;
        try { recognitionRef.current?.abort(); } catch {}
        recognitionRef.current = null;
        setIsRecording(false);
        setAiListenPaused(false);
        stopTranslatorMic();
        toastMicError(err);
        return false;
      }
      return true;
    }
  };

  const handleStartAI = async () => {
    const SpeechRecognition = getSpeechRecognitionCtor();
    if (!SpeechRecognition) {
      showDynamicToast("AI speech detection is not supported in this mobile browser.");
      return;
    }

    const { resumePromise, micPromise } = beginTranslatorFromUserGesture();

    isRecordingRef.current = true;
    setIsRecording(true);
    setAiListenPaused(false);

    const started = bootSpeechRecognition();
    if (!started) {
      isRecordingRef.current = false;
      setIsRecording(false);
      showDynamicToast("Failed to start the AI Translator. Please tap the button again.");
      return;
    }

    showDynamicToast("AI Translator is listening.");
    await finishTranslatorUnlock(resumePromise, micPromise);
  };

  const handleResumeAI = async () => {
    const { resumePromise, micPromise } = beginTranslatorFromUserGesture();

    isRecordingRef.current = true;
    setIsRecording(true);
    setAiListenPaused(false);

    const started = bootSpeechRecognition();
    if (!started) {
      setAiListenPaused(true);
      showDynamicToast("Failed to start the AI Translator. Please tap the button again.");
      return;
    }

    await finishTranslatorUnlock(resumePromise, micPromise);
  };

  const handleStopAI = async () => {
    isRecordingRef.current = false;
    translatorGenerationRef.current += 1;
    setAiListenPaused(false);
    try { recognitionRef.current?.stop(); } catch {}
    recognitionRef.current = null;
    stopTranslatorMic();
    if (audioContextRef.current && audioContextRef.current.state === "running") {
      try { await audioContextRef.current.suspend(); } catch {}
    }
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

  const handleRoomDisconnect = useCallback(() => {
    isRecordingRef.current = false;
    translatorGenerationRef.current += 1;
    setAiListenPaused(false);
    try { recognitionRef.current?.abort(); } catch {}
    recognitionRef.current = null;
    try { micAudioNodeRef.current?.disconnect(); } catch {}
    micAudioNodeRef.current = null;
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;

    const endTime = Date.now();
    const diffMs = endTime - meetingStartTime;
    const diffMins = Math.floor(diffMs / 60000);
    const diffSecs = Math.floor((diffMs % 60000) / 1000);
    
    let durationStr = "";
    if (diffMins > 0) durationStr += `${diffMins} min `;
    durationStr += `${diffSecs} sec`;

    setFinalStats({ duration: durationStr, participants: maxParticipantsRef.current });
    setShowPostScreen(true);
  }, [meetingStartTime]);

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

  if (showPostScreen) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#04050A] text-white relative overflow-hidden">
         <NetworkBackground />
         <div className="absolute inset-0 bg-black/60 backdrop-blur-md z-0"></div>
         
         <div className="z-10 bg-[#0f172a]/90 border border-gray-800/80 rounded-[2rem] p-10 shadow-[0_8px_40px_rgba(0,0,0,0.8)] flex flex-col items-center text-center max-w-md w-full mx-4 transition-all animate-fade-in-up">
            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/30 shadow-[0_0_25px_rgba(239,68,68,0.2)]">
              <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 8l2-2m0 0l2-2m-2 2l-2 2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z"></path></svg>
            </div>
            
            <h2 className="text-3xl font-extrabold mb-2 text-white tracking-tight">Meeting Ended</h2>
            <p className="text-gray-400 text-sm mb-8 font-medium">Your secure connection has been concluded.</p>
            
            <div className="w-full flex justify-between items-center bg-black/50 p-5 rounded-2xl border border-gray-800/80 mb-4">
              <span className="text-gray-400 font-bold text-sm tracking-wide uppercase">Duration</span>
              <span className="text-[#00e5ff] font-black text-lg">{finalStats.duration}</span>
            </div>
            
            <div className="w-full flex justify-between items-center bg-black/50 p-5 rounded-2xl border border-gray-800/80 mb-8">
              <span className="text-gray-400 font-bold text-sm tracking-wide uppercase">Participants</span>
              <span className="text-[#00ff88] font-black text-lg">{finalStats.participants} {finalStats.participants === 1 ? 'Person' : 'People'}</span>
            </div>
            
            <button onClick={() => router.push("/")} className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black rounded-xl transition-all shadow-lg hover:shadow-blue-500/40 active:scale-[0.98]">
              Return to Home
            </button>
         </div>
         
         <style dangerouslySetInnerHTML={{__html: `
            @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
            .animate-fade-in-up { animation: fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
         `}} />
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
    <div className={`room-stage relative flex flex-col h-[100dvh] w-full bg-[#04050A] overflow-hidden font-sans${isImportant ? " important-meeting" : ""}`}>
      
      <NetworkBackground />

      <div className={`absolute top-6 left-1/2 transform -translate-x-1/2 z-[100] bg-[#0f172a] text-white px-6 py-3 rounded-full shadow-[0_0_15px_rgba(0,229,255,0.3)] flex items-center gap-3 border border-[#00e5ff]/30 transition-all duration-300 max-w-[min(92vw,36rem)] ${showToast ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10 pointer-events-none'}`}>
        <svg className="w-5 h-5 text-[#00ff88]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
        <span className="font-medium text-sm">{toastMsg || "Success!"}</span>
      </div>

      <div className="flex-none px-6 py-4 bg-black/40 backdrop-blur-xl border-b border-white/10 flex justify-between items-center z-40">
        <h1 className="text-white text-base lg:text-lg font-bold truncate max-w-[200px] sm:max-w-xs drop-shadow-[0_0_8px_rgba(0,229,255,0.5)]">Room: <span className="text-cyan-300">{roomId}</span>{isImportant ? " · Important Meeting" : ""}</h1>
        <div className="flex items-center gap-2">
          <AboutDspacesButton onClick={() => setAboutOpen(true)} compact />
          <button onClick={copyInviteLink} className="bg-white/5 hover:bg-white/10 text-white px-4 py-2 rounded-2xl text-sm font-semibold transition-all border border-white/10 hover:border-cyan-400/40 flex items-center gap-2 shadow-lg shadow-indigo-500/10">
            <svg className="w-4 h-4 text-[#00e5ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
            <span className="hidden sm:inline">Copy Invite Link</span>
            <span className="sm:hidden">Copy</span>
          </button>
        </div>
      </div>

      <RoomCallStage
        token={token}
        serverUrl={serverUrl}
        rawUserName={rawUserName || "Guest"}
        onDisconnected={handleRoomDisconnect}
        showDynamicToast={showDynamicToast}
        setMaxParticipants={setMaxParticipants}
        isImportant={isImportant}
        isHost={isHost}
        roomId={roomId}
        joinRole={joinRole}
      />

      {!isAIPanelOpen && (
        <button 
          onClick={() => setIsAIPanelOpen(true)} 
          className="absolute bottom-24 right-4 sm:right-8 z-50 bg-white/10 hover:bg-white/15 text-white px-5 py-3 rounded-full shadow-lg shadow-cyan-500/20 border border-white/10 font-bold flex items-center gap-2 backdrop-blur-xl transition-all hover:scale-105 hover:border-cyan-400/40"
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
                <>
                  {aiListenPaused && (
                    <button onClick={handleResumeAI} type="button" className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-2.5 rounded-xl transition-all text-xs shadow-lg">
                      Tap to continue listening
                    </button>
                  )}
                  <button onClick={handleStopAI} className="w-full bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-bold py-2.5 rounded-xl transition-all text-xs shadow-lg flex items-center justify-center gap-2">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span> Stop & Generate Summary
                  </button>
                </>
              )}
              {loadingAI && <p className="text-center text-[10px] text-[#00e5ff] font-medium animate-pulse">Translating & Processing...</p>}
            </div>
          </div>
        </div>
      </div>
      
      <AboutDspacesModal open={aboutOpen} onClose={() => setAboutOpen(false)} />

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
