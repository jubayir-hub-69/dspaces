export async function kickParticipant(options: {
  room: string;
  identity: string;
  token: string;
  serverUrl?: string;
}) {
  const res = await fetch("/api/kick", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.token}`,
    },
    body: JSON.stringify({
      room: options.room,
      identity: options.identity,
      serverUrl: options.serverUrl,
    }),
  });
  const data = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || data.success === false) {
    throw new Error(data.error || "Failed to remove participant.");
  }
}

export async function muteParticipant(options: {
  room: string;
  identity: string;
  token: string;
  serverUrl?: string;
  trackSid?: string;
  type?: "audio" | "video";
}) {
  const res = await fetch("/api/mute", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.token}`,
    },
    body: JSON.stringify({
      room: options.room,
      identity: options.identity,
      serverUrl: options.serverUrl,
      trackSid: options.trackSid,
      type: options.type,
    }),
  });
  const data = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || data.success === false) {
    throw new Error(data.error || "Failed to mute participant.");
  }
}

export async function updateStageParticipant(options: {
  room: string;
  identity: string;
  token: string;
  serverUrl?: string;
  action: "allow" | "demote" | "make-cohost";
}) {
  const res = await fetch("/api/update-participant", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.token}`,
    },
    body: JSON.stringify({
      room: options.room,
      identity: options.identity,
      serverUrl: options.serverUrl,
      action: options.action,
    }),
  });
  const data = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || data.success === false) {
    throw new Error(data.error || "Failed to update participant.");
  }
  return data;
}
