export type MeetingHistoryEntry = {
  historyId: string;
  id: string;
  roomName: string;
  date: string;
  time: string;
  duration: string;
  participants: number;
  role: string;
  summary?: string;
};

const MAX_HISTORY = 10;

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function upsertMeetingHistory(
  historyId: string,
  patch: Partial<MeetingHistoryEntry> & Pick<MeetingHistoryEntry, "id" | "role">
) {
  try {
    if (typeof window === "undefined") return;
    const sessionId = localStorage.getItem("dspaces_active_session");
    if (!sessionId) return;

    const historyKey = `dspaces_history_${sessionId}`;
    const existing: MeetingHistoryEntry[] = JSON.parse(localStorage.getItem(historyKey) || "[]");
    const idx = existing.findIndex((item) => item.historyId === historyId);
    const now = new Date();

    const next: MeetingHistoryEntry = {
      historyId,
      id: patch.id,
      roomName: patch.roomName || patch.id,
      date: patch.date || (idx >= 0 ? existing[idx].date : formatDate(now)),
      time: patch.time || (idx >= 0 ? existing[idx].time : formatTime(now)),
      duration: patch.duration ?? (idx >= 0 ? existing[idx].duration : "In progress"),
      participants: patch.participants ?? (idx >= 0 ? existing[idx].participants : 1),
      role: patch.role,
      summary: patch.summary ?? (idx >= 0 ? existing[idx].summary : ""),
    };

    if (idx >= 0) {
      existing[idx] = { ...existing[idx], ...next, ...patch, historyId };
    } else {
      existing.unshift(next);
    }

    localStorage.setItem(historyKey, JSON.stringify(existing.slice(0, MAX_HISTORY)));
  } catch {
    // Ignore quota / private-mode failures; history is best-effort.
  }
}
