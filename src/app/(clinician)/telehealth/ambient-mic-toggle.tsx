"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AmbientMicToggle() {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Release stream on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const toggle = useCallback(async () => {
    if (active) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setActive(false);
      setError(null);
      return;
    }

    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      streamRef.current = stream;
      setActive(true);
    } catch {
      setError("Microphone permission denied. Allow mic access in your browser settings.");
    }
  }, [active]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {active ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="absolute inset-0 rounded-full bg-danger animate-ping opacity-60" />
                <span className="relative rounded-full h-2 w-2 bg-danger" />
              </span>
              <span className="text-sm font-medium text-danger">Listening…</span>
            </>
          ) : (
            <span className="text-sm text-text-muted">Off</span>
          )}
        </div>
        <Button
          size="sm"
          variant={active ? "primary" : "secondary"}
          onClick={() => void toggle()}
          className={
            active
              ? "bg-danger/10 text-danger hover:bg-danger/20 border-danger/30"
              : undefined
          }
        >
          {active ? (
            <>
              <MicOff size={13} className="mr-1.5" /> Stop
            </>
          ) : (
            <>
              <Mic size={13} className="mr-1.5" /> Enable
            </>
          )}
        </Button>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <p className="text-xs text-text-subtle leading-relaxed">
        Keeps your microphone active between visits for hands-free ambient note
        capture. Stream is released when you stop or leave the page.
      </p>
    </div>
  );
}
