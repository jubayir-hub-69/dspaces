"use client";

import { useEffect, useMemo, useState } from "react";
import { splitBilingualSummary } from "../lib/summary";

export function BilingualSummary({
  summary,
  className = "",
  onVisibleChange,
  size = "sm",
}: {
  summary: string;
  className?: string;
  onVisibleChange?: (text: string) => void;
  size?: "sm" | "md";
}) {
  const parts = useMemo(() => splitBilingualSummary(summary), [summary]);
  const [tab, setTab] = useState<"english" | "bengali">("english");

  useEffect(() => {
    setTab("english");
  }, [summary]);

  const visible = parts ? (tab === "english" ? parts.english : parts.bengali) : summary;

  useEffect(() => {
    onVisibleChange?.(visible);
  }, [onVisibleChange, visible]);

  const tabClass = size === "md" ? "px-4 py-2 text-xs" : "px-3 py-1.5 text-[11px]";

  return (
    <div className="flex flex-col gap-3">
      {parts && (
        <div className="flex items-center gap-1 self-start rounded-full border border-white/10 bg-black/40 p-1">
          <button
            type="button"
            onClick={() => setTab("english")}
            className={`${tabClass} rounded-full font-bold transition-colors ${
              tab === "english"
                ? "bg-cyan-400 text-black"
                : "text-gray-400 hover:text-white"
            }`}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => setTab("bengali")}
            className={`${tabClass} rounded-full font-bold transition-colors ${
              tab === "bengali"
                ? "bg-cyan-400 text-black"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Bengali
          </button>
        </div>
      )}
      <div className={className}>{visible}</div>
    </div>
  );
}
