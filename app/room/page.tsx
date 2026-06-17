"use client";

import { LiveKitRoom, VideoConference } from "@dtelecom/components-react";
import "@dtelecom/components-styles";
import { useEffect, useState } from "react";

export default function RoomPage() {
  const [token, setToken] = useState("");
  const [serverUrl, setServerUrl] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const roomName = "dSpaces-Global-Hub";
        const participantName = "User_" + Math.floor(Math.random() * 1000);

        const response = await fetch(
          `/api/get-token?room=${roomName}&username=${participantName}`
        );
        const data = await response.json();

        if (data.token && data.wsUrl) {
          setToken(data.token);
          setServerUrl(data.wsUrl);
        } else {
          console.error("Token/URL Error:", data.error);
        }
      } catch (error) {
        console.error("Failed to fetch token:", error);
      }
    })();
  }, []);

  if (token === "" || serverUrl === "") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950 text-white text-xl">
        Connecting to dTelecom Network...
      </div>
    );
  }

  return (
    <div style={{ height: "100vh" }}>
      <LiveKitRoom
        video={true}
        audio={true}
        token={token}
        serverUrl={serverUrl}
        connect={true}
      >
        <VideoConference />
      </LiveKitRoom>
    </div>
  );
}