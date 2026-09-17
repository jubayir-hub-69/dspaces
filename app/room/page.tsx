"use client";

import { Suspense, useEffect, useState, useRef, useCallback, useMemo, memo, type CSSProperties } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { 
  LiveKitRoom, 
  RoomAudioRenderer,
  useRoomContext,
  useLocalParticipantPermissions,
} from "@dtelecom/components-react";
import "@dtelecom/components-styles";
import "./room-layout.css";
import { AboutDspacesButton, AboutDspacesModal } from "../../components/AboutDspacesModal";
import { BilingualSummary } from "../../components/BilingualSummary";
import { ImportantMeetingControls } from "../../components/ImportantMeetingControls";
import { ImportantMeetingStage } from "../../components/ImportantMeetingStage";
import { HostModeration } from "../../components/HostModeration";
import { ParticipantAvatarSync, TranscriptListener } from "../../components/RoomAgents";
import { upsertMeetingHistory } from "../../lib/meeting-history";
import { isImageAvatar } from "../../lib/account";
import { appendGroupedTranscript, formatGroupedTranscript, isHostRole, type TranscriptSegment } from "../../lib/types";

interface ChatMessage {
  sender: "user" | "ai";
  text: string;
}

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

const KickedListener = memo(function KickedListener({ showDynamicToast }: { showDynamicToast: (msg: string) => void }) {
  const room = useRoomContext();
  const toastRef = useRef(showDynamicToast);
  toastRef.current = showDynamicToast;

  useEffect(() => {
    if (!room) return;
    const onDisconnected = (reason?: unknown) => {
      const code = typeof reason === "number" ? reason : undefined;
      if (code === 4) {
        toastRef.current("The host removed you from the room.");
      }
    };
    room.on("disconnected", onDisconnected);
    return () => {
      room.off("disconnected", onDisconnected);
    };
  }, [room]);

  return null;
});

type RoomCallStageProps = {
  token: string;
  serverUrl: string;
  onConnected: () => void;
  onDisconnected: () => void;
  showDynamicToast: (msg: string) => void;
  setMaxParticipants: (n: any) => void;
  isImportant?: boolean;
  isHost?: boolean;
  isAdmin?: boolean;
  roomId?: string;
  avatars?: Record<string, string>;
  onTranscript?: (segment: TranscriptSegment, fullText: string) => void;
};

const RoomCallStage = memo(function RoomCallStage({
  token,
  serverUrl,
  onConnected,
  onDisconnected,
  showDynamicToast,
  setMaxParticipants,
  isImportant = false,
  isHost = false,
  isAdmin = false,
  roomId = "",
  avatars = {},
  onTranscript,
}: RoomCallStageProps) {
  const publishOnJoin = !isImportant || isHost;
  return (
    <div className="flex-1 w-full h-full min-h-0 relative z-10 bg-transparent overflow-hidden flex flex-col">
      <LiveKitRoom
        video={false}
        audio={publishOnJoin}
        token={token}
        serverUrl={serverUrl}
        connectOptions={isImportant ? { autoSubscribe: true } : undefined}
        data-lk-theme="default"
        className="lk-room-container h-full w-full min-h-0 overflow-hidden flex flex-col flex-1"
        style={LIVEKIT_ROOM_STYLE}
        onConnected={onConnected}
        onDisconnected={onDisconnected}
      >
        <MeetingTracker setMaxParticipants={setMaxParticipants} />
        {isImportant ? (
          <ImportantMeetingStage
            isHost={isHost}
            roomId={roomId}
            serverUrl={serverUrl}
            token={token}
            showDynamicToast={showDynamicToast}
          />
        ) : (
          <HostModeration
            token={token}
            roomId={roomId}
            serverUrl={serverUrl}
            isAdmin={isAdmin}
            showDynamicToast={showDynamicToast}
          />
        )}
        <RoomAudioRenderer />
        <ScreenShareGuard showDynamicToast={showDynamicToast} />
        <KickedListener showDynamicToast={showDynamicToast} />
        <ParticipantAvatarSync fallbackAvatars={avatars} />
        {onTranscript && <TranscriptListener onSegment={onTranscript} roomId={roomId} />}
        {isImportant && (
          <ImportantMeetingControls
            isHost={isHost}
            roomId={roomId}
            serverUrl={serverUrl}
            token={token}
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
  const urlImportant = searchParams.get("mode") === "important";

  useEffect(() => {
    if (!rawUserName) {
      const modeQuery = urlImportant ? "&mode=important" : "";
      router.replace(`/?id=${roomId}${modeQuery}`);
    }
  }, [rawUserName, roomId, router, urlImportant]);

  const userName = useMemo(() => rawUserName || "Guest", [rawUserName]);

  const [token, setToken] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [detectedImportant, setDetectedImportant] = useState(false);
  const [joinRole, setJoinRole] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>({});
  const isImportant = urlImportant || detectedImportant;
  const isHost = isHostRole(joinRole) || isAdmin;

  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState("");
  const [loadingAI, setLoadingAI] = useState(false);
  
  const isRecordingRef = useRef(false);
  const fullTranscriptRef = useRef("");
  const agentAbortRef = useRef<AbortController | null>(null);

  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  const [aiLanguage, setAiLanguage] = useState("Auto");
  const aiLanguageRef = useRef(aiLanguage);
  aiLanguageRef.current = aiLanguage;
  const [summaryLanguage, setSummaryLanguage] = useState<"English" | "Bengali" | "Both">("English");
  const restoredTranscriptRef = useRef("");
  const restoreGenRef = useRef(0);
  const restoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [aiChatInput, setAiChatInput] = useState("");
  const [aiChatHistory, setAiChatHistory] = useState<ChatMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [meetingStartTime] = useState(Date.now());
  const meetingHistoryIdRef = useRef(`meeting_${roomId}_${meetingStartTime}`);
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
        const db = JSON.parse(localStorage.getItem("dspaces_db") || "[]") as Array<{ name?: string; avatar?: string }>;
        const me = db.find((u) => u.name === userName);
        const avatar = me?.avatar && isImageAvatar(me.avatar) ? me.avatar : "";
        const payload: Record<string, unknown> = { room: roomId, username: userName, avatar };
        if (urlImportant) payload.mode = "important";
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
          setIsAdmin(data.isAdmin === true);
        } else {
          setErrorMsg(data.error || "Failed to fetch connection token.");
        }
      } catch (err) {
        setErrorMsg("Unable to connect to the server.");
      }
    };
    fetchToken();
  }, [roomId, userName, rawUserName, urlImportant]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [aiChatHistory]);

  useEffect(() => {
    if (!rawUserName) return;

    const db = JSON.parse(localStorage.getItem("dspaces_db") || "[]") as Array<{ name?: string; avatar?: string }>;
    const myAvatar = db.find((u) => u.name === userName)?.avatar || "";

    const syncAvatars = async () => {
      try {
        const res = await fetch("/api/sync-avatar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: userName,
            avatar: isImageAvatar(myAvatar) ? myAvatar : "",
            room: roomId,
            serverUrl,
          }),
        });
        const data = await res.json();
        if (data.avatars && typeof data.avatars === "object") {
          setAvatarMap(data.avatars as Record<string, string>);
        }
      } catch {
        // Avatar sync is best-effort; participant metadata is the live source.
      }
    };

    const interval = setInterval(syncAvatars, 8000);
    void syncAvatars();
    return () => clearInterval(interval);
  }, [rawUserName, userName, roomId, serverUrl]);

  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      agentAbortRef.current?.abort();
      agentAbortRef.current = null;
      if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
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
    const reportContent = `=======================================\n           dSpaces Meeting Report\n=======================================\n\nRoom ID: ${roomId}\nDate: ${new Date().toLocaleString()}\nLanguage: ${summaryLanguage}\n\n${summary}\n\n=======================================\n          Full Raw Transcript\n=======================================\n${restoredTranscriptRef.current || fullTranscriptRef.current || transcript}`;
    
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

  const visibleSummaryRef = useRef("");

  const handleCopySummary = () => {
    const text = visibleSummaryRef.current || summary;
    if (!text) return;
    navigator.clipboard.writeText(text);
    showDynamicToast("Summary copied to clipboard!");
  };

  const handleClearTranscript = () => {
    setTranscript("");
    fullTranscriptRef.current = "";
    restoredTranscriptRef.current = "";
    setAiChatHistory([]);
    setSummary("");
    showDynamicToast("Data cleared successfully!");
  };

  const runNativeScriptRestore = async (raw: string) => {
    const text = raw.trim();
    if (!text) return text;
    const gen = ++restoreGenRef.current;
    try {
      const res = await fetch("/api/ai-native-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (gen !== restoreGenRef.current) return restoredTranscriptRef.current || text;
      if (data.success && data.text) {
        restoredTranscriptRef.current = data.text;
        setTranscript(data.text);
        return data.text;
      }
    } catch {}
    return text;
  };

  const applyTranscript = useCallback((next: string) => {
    const text = next.trim();
    if (!text) return;
    fullTranscriptRef.current = text;
    setTranscript(text);
  }, []);

  const handleTranscriptSegment = useCallback((segment: TranscriptSegment, fullText: string) => {
    const grouped = (fullText || "").trim();
    if (grouped && grouped.length >= fullTranscriptRef.current.length) {
      applyTranscript(grouped);
      return;
    }
    applyTranscript(appendGroupedTranscript(fullTranscriptRef.current, segment.speaker, segment.text));
  }, [applyTranscript]);

  useEffect(() => {
    if (!roomId || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await fetch(`/api/transcription-agent?room=${encodeURIComponent(roomId)}`);
        const body = await snap.json();
        if (cancelled) return;
        if (Array.isArray(body.segments) && body.segments.length > 0) {
          applyTranscript(formatGroupedTranscript(body.segments));
        } else if (body.transcript) {
          applyTranscript(body.transcript);
        }
        if (body.agentActive) {
          isRecordingRef.current = true;
          setIsRecording(true);
        }
      } catch {
        // Existing transcript is optional until the agent starts.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyTranscript, roomId, token]);

  useEffect(() => {
    if (!isRecording || !roomId) return;
    const poll = setInterval(async () => {
      if (!isRecordingRef.current) return;
      try {
        const snap = await fetch(`/api/transcription-agent?room=${encodeURIComponent(roomId)}`);
        const body = await snap.json();
        if (Array.isArray(body.segments) && body.segments.length > 0) {
          applyTranscript(formatGroupedTranscript(body.segments));
        } else if (body.transcript) {
          applyTranscript(body.transcript);
        }
      } catch {
        // Polling is a fallback while the agent writes to KV / data channel.
      }
    }, 2000);
    return () => clearInterval(poll);
  }, [applyTranscript, isRecording, roomId]);

  const handleStartAI = async () => {
    if (!token) {
      showDynamicToast("Wait for the room to connect before starting transcription.");
      return;
    }

    agentAbortRef.current?.abort();
    const abort = new AbortController();
    agentAbortRef.current = abort;
    isRecordingRef.current = true;
    setIsRecording(true);
    console.log("[STT] Start AI Recording", { roomId, language: aiLanguageRef.current });
    showDynamicToast("Server AI agent is joining to transcribe the room.");

    try {
      const res = await fetch("/api/transcription-agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ room: roomId, language: aiLanguageRef.current, serverUrl }),
        signal: abort.signal,
      });

      const contentType = res.headers.get("content-type") || "";
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to start transcription agent." }));
        throw new Error(data.error || "Failed to start transcription agent.");
      }

      if (contentType.includes("text/event-stream") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!abort.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() || "";
          for (const chunk of chunks) {
            const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));
            if (!dataLine) continue;
            try {
              const payload = JSON.parse(dataLine.slice(6)) as {
                error?: string;
                transcript?: string;
                state?: string;
              };
              if (payload.error) {
                console.error("[STT] transcription-agent error", payload.error);
                showDynamicToast(payload.error);
              }
              if (payload.state) {
                console.log("[STT] transcription-agent", payload.state);
              }
              const sseSegments = (payload as { segments?: TranscriptSegment[] }).segments;
              if (Array.isArray(sseSegments) && sseSegments.length > 0) {
                applyTranscript(formatGroupedTranscript(sseSegments));
              } else if (payload.transcript) {
                applyTranscript(payload.transcript);
              }
            } catch {
              // Ignore malformed SSE frames.
            }
          }
        }
      } else {
        const data = await res.json();
        if (Array.isArray(data.segments) && data.segments.length > 0) {
          applyTranscript(formatGroupedTranscript(data.segments));
        } else if (data.transcript) {
          applyTranscript(data.transcript);
        }
      }
    } catch (error: unknown) {
      if ((error as { name?: string })?.name === "AbortError") return;
      isRecordingRef.current = false;
      setIsRecording(false);
      showDynamicToast(error instanceof Error ? error.message : "Failed to start the transcription agent.");
    }
  };

  const handleStopAI = async () => {
    isRecordingRef.current = false;
    agentAbortRef.current?.abort();
    agentAbortRef.current = null;
    setIsRecording(false);
    setLoadingAI(true);
    setSummary("");

    try {
      await fetch("/api/transcription-agent", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ room: roomId }),
      });
      const snap = await fetch(`/api/transcription-agent?room=${encodeURIComponent(roomId)}`);
      const snapData = await snap.json();
      if (Array.isArray(snapData.segments) && snapData.segments.length > 0) {
        applyTranscript(formatGroupedTranscript(snapData.segments));
      } else if (snapData.transcript) {
        applyTranscript(snapData.transcript);
      }
      const raw = (fullTranscriptRef.current || transcript).trim();
      const nativeTranscript = await runNativeScriptRestore(raw);
      const res = await fetch("/api/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: nativeTranscript || raw, language: summaryLanguage }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setSummary(data.summary);
        upsertMeetingHistory(meetingHistoryIdRef.current, {
          id: roomId,
          roomName: roomId,
          role: isHost ? "HOST" : "PARTICIPANT",
          participants: maxParticipantsRef.current,
          summary: data.summary,
        });
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
        body: JSON.stringify({ transcript: restoredTranscriptRef.current || fullTranscriptRef.current || transcript, question: query, language: aiLanguage }),
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

  const persistMeetingHistory = useCallback((patch: { duration?: string; summary?: string; participants?: number }) => {
    upsertMeetingHistory(meetingHistoryIdRef.current, {
      id: roomId,
      roomName: roomId,
      role: isHost ? "HOST" : "PARTICIPANT",
      participants: patch.participants ?? maxParticipantsRef.current,
      ...patch,
    });
  }, [roomId, isHost]);

  const handleRoomConnected = useCallback(() => {
    persistMeetingHistory({ duration: "In progress", participants: maxParticipantsRef.current });
  }, [persistMeetingHistory]);

  useEffect(() => {
    const onPageHide = () => {
      const diffMs = Date.now() - meetingStartTime;
      const diffMins = Math.floor(diffMs / 60000);
      const diffSecs = Math.floor((diffMs % 60000) / 1000);
      const durationStr = `${diffMins > 0 ? `${diffMins} min ` : ""}${diffSecs} sec`.trim();
      persistMeetingHistory({ duration: durationStr, participants: maxParticipantsRef.current });
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [meetingStartTime, persistMeetingHistory]);

  const handleRoomDisconnect = useCallback(() => {
    isRecordingRef.current = false;
    agentAbortRef.current?.abort();
    agentAbortRef.current = null;

    const endTime = Date.now();
    const diffMs = endTime - meetingStartTime;
    const diffMins = Math.floor(diffMs / 60000);
    const diffSecs = Math.floor((diffMs % 60000) / 1000);
    
    let durationStr = "";
    if (diffMins > 0) durationStr += `${diffMins} min `;
    durationStr += `${diffSecs} sec`;

    persistMeetingHistory({ duration: durationStr.trim(), participants: maxParticipantsRef.current });
    setFinalStats({ duration: durationStr, participants: maxParticipantsRef.current });
    setShowPostScreen(true);
  }, [meetingStartTime, persistMeetingHistory]);

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
        onConnected={handleRoomConnected}
        onDisconnected={handleRoomDisconnect}
        showDynamicToast={showDynamicToast}
        setMaxParticipants={setMaxParticipants}
        isImportant={isImportant}
        isHost={isHost}
        isAdmin={isAdmin}
        roomId={roomId}
        avatars={avatarMap}
        onTranscript={handleTranscriptSegment}
      />

      {!isAIPanelOpen && (
        <button 
          onClick={() => setIsAIPanelOpen(true)} 
          className="dspaces-ask-ai absolute z-[30] md:z-[45] max-md:top-[4.75rem] max-md:right-3 max-md:bottom-auto bottom-24 right-4 sm:right-8 bg-white/10 hover:bg-white/15 text-white px-4 py-2.5 md:px-5 md:py-3 rounded-full shadow-lg shadow-cyan-500/20 border border-white/10 font-bold flex items-center gap-2 backdrop-blur-xl transition-all hover:scale-105 hover:border-cyan-400/40"
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
              title="Preferred AI reply language. Speech is auto-detected."
            >
              <option value="Auto">🌐 Auto-detect</option>
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
                <h3 className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Live Transcript ({aiLanguage === "Auto" ? "Auto-detect" : aiLanguage})</h3>
                {(transcript || aiChatHistory.length > 0) && (
                  <button onClick={handleClearTranscript} className="text-gray-400 hover:text-red-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    Clear
                  </button>
                )}
              </div>
              {transcript ? (
                <p className="text-gray-300 text-xs leading-relaxed whitespace-pre-wrap">{transcript}</p>
              ) : (
                <p className="text-xs text-gray-600">Start the server AI agent to transcribe everyone in the room...</p>
              )}
            </div>

            {summary && (
              <div className="bg-blue-900/10 border border-[#00e5ff]/20 rounded-xl p-3.5 flex flex-col gap-3">
                <div>
                  <h3 className="font-bold text-[#00e5ff] mb-1.5 text-xs">AI Generated Summary</h3>
                  <BilingualSummary
                    summary={summary}
                    onVisibleChange={(text) => {
                      visibleSummaryRef.current = text;
                    }}
                    className={`text-xs whitespace-pre-wrap leading-relaxed ${summary.startsWith('❌') ? 'text-red-400' : 'text-gray-200'}`}
                  />
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
                  placeholder={aiLanguage === "Auto" ? "Ask in any language..." : `Ask in ${aiLanguage}...`} 
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
              <div className="rounded-xl border border-white/10 bg-black/40 p-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Select Summary Language</p>
                <div className="flex flex-col gap-1.5">
                  {([
                    { value: "English", label: "1. English" },
                    { value: "Bengali", label: "2. Bengali" },
                    { value: "Both", label: "3. Both (English & Bengali)" },
                  ] as const).map((option) => (
                    <label key={option.value} className="flex items-center gap-2 text-xs text-gray-200 cursor-pointer">
                      <input
                        type="radio"
                        name="summary-language"
                        value={option.value}
                        checked={summaryLanguage === option.value}
                        onChange={() => setSummaryLanguage(option.value)}
                        className="accent-cyan-400"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>
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
