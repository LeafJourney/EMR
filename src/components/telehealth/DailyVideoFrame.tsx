"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DailyCall,
  DailyEventObjectFatalError,
  DailyEventObjectNonFatalError,
} from "@daily-co/daily-js";
import { cn } from "@/lib/utils/cn";
import { LiveCaptions } from "./LiveCaptions";

// ─── Types ──────────────────────────────────────────────

export type ConnectionState =
  | "loading"
  | "joining"
  | "joined"
  | "left"
  | "error";

export interface DailyVideoFrameProps {
  roomUrl: string;
  token?: string;
  userName: string;
  className?: string;
  muted?: boolean;
  cameraOff?: boolean;
  screenSharing?: boolean;
  onConnectionStateChange?: (state: ConnectionState) => void;
  onParticipantCountChange?: (count: number) => void;
  onError?: (message: string) => void;
  /** EMR-122: show the in-app live caption / language overlay. Default on. */
  captions?: boolean;
}

// ─── Daily SDK loader ───────────────────────────────────
// The SDK is browser-only — guard the dynamic import so the module
// graph stays SSR-safe.

async function loadDaily() {
  const mod = await import("@daily-co/daily-js");
  return mod.default;
}

// ─── Component ──────────────────────────────────────────

export function DailyVideoFrame({
  roomUrl,
  token,
  userName,
  className,
  muted = false,
  cameraOff = false,
  screenSharing = false,
  onConnectionStateChange,
  onParticipantCountChange,
  onError,
  captions = true,
}: DailyVideoFrameProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const callRef = useRef<DailyCall | null>(null);
  const [state, setState] = useState<ConnectionState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [participantCount, setParticipantCount] = useState(1);

  const updateState = useCallback(
    (next: ConnectionState) => {
      setState(next);
      onConnectionStateChange?.(next);
    },
    [onConnectionStateChange],
  );

  const reportError = useCallback(
    (message: string) => {
      setErrorMessage(message);
      onError?.(message);
      updateState("error");
    },
    [onError, updateState],
  );

  // Join URL with token (Daily expects ?t=<token> for meeting tokens).
  const joinUrl = useMemo(() => {
    if (!token) return roomUrl;
    const sep = roomUrl.includes("?") ? "&" : "?";
    return `${roomUrl}${sep}t=${encodeURIComponent(token)}`;
  }, [roomUrl, token]);

  // Initialize the call frame once the container mounts.
  useEffect(() => {
    let cancelled = false;
    let call: DailyCall | null = null;

    async function init() {
      if (!containerRef.current) return;
      try {
        const Daily = await loadDaily();
        if (cancelled || !containerRef.current) return;

        call = Daily.createFrame(containerRef.current, {
          showLeaveButton: false,
          showFullscreenButton: true,
          iframeStyle: {
            position: "absolute",
            inset: "0",
            width: "100%",
            height: "100%",
            border: "0",
            borderRadius: "0.75rem",
          },
          userName,
        });
        callRef.current = call;

        const refreshParticipants = () => {
          const current = callRef.current;
          if (!current) return;
          const count = Object.keys(current.participants() ?? {}).length;
          setParticipantCount(count);
          onParticipantCountChange?.(count);
        };
        const onJoined = () => {
          updateState("joined");
          refreshParticipants();
        };
        const onLeft = () => updateState("left");
        const onFatal = (ev: DailyEventObjectFatalError) =>
          reportError(ev.errorMsg || "Video session failed");
        const onNonFatal = (ev: DailyEventObjectNonFatalError) =>
          console.warn("[Daily] non-fatal:", ev.errorMsg, ev);

        call.on("joined-meeting", onJoined);
        call.on("left-meeting", onLeft);
        call.on("participant-joined", refreshParticipants);
        call.on("participant-left", refreshParticipants);
        call.on("participant-updated", refreshParticipants);
        call.on("error", onFatal);
        call.on("nonfatal-error", onNonFatal);

        updateState("joining");
        await call.join({ url: joinUrl });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not start video session";
        if (!cancelled) reportError(message);
      }
    }

    init();

    return () => {
      cancelled = true;
      const current = callRef.current;
      callRef.current = null;
      if (current) {
        current.leave().catch(() => {});
        current.destroy().catch(() => {});
      }
    };
    // joinUrl/userName changes are treated as new sessions — re-init.
  }, [joinUrl, userName, onParticipantCountChange, reportError, updateState]);

  // Sync external mute / camera / screenshare toggles into the call.
  useEffect(() => {
    const call = callRef.current;
    if (!call || state !== "joined") return;
    call.setLocalAudio(!muted);
  }, [muted, state]);

  useEffect(() => {
    const call = callRef.current;
    if (!call || state !== "joined") return;
    call.setLocalVideo(!cameraOff);
  }, [cameraOff, state]);

  useEffect(() => {
    const call = callRef.current;
    if (!call || state !== "joined") return;
    if (screenSharing) {
      call.startScreenShare();
    } else {
      call.stopScreenShare();
    }
  }, [screenSharing, state]);

  return (
    <div
      className={cn(
        "relative w-full h-full overflow-hidden rounded-xl bg-black",
        className,
      )}
    >
      <div ref={containerRef} className="absolute inset-0" />

      {state !== "joined" && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 pointer-events-none">
          <div className="text-center text-white/80">
            {state === "error" ? (
              <>
                <p className="text-sm font-medium text-red-300">
                  Video session failed
                </p>
                {errorMessage && (
                  <p className="text-xs text-white/60 mt-1 max-w-sm">
                    {errorMessage}
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full border-2 border-white/30 border-t-white mx-auto mb-3 animate-spin" />
                <p className="text-sm">
                  {state === "loading" && "Loading video…"}
                  {state === "joining" && "Connecting to room…"}
                  {state === "left" && "Disconnected"}
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {state === "joined" && participantCount <= 1 && (
        <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-black/60 text-white/80 text-xs backdrop-blur-sm pointer-events-none">
          Waiting for the other participant to join…
        </div>
      )}

      {state === "joined" && captions && <LiveCaptions />}
    </div>
  );
}
