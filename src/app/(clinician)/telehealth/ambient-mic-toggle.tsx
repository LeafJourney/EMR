"use client";

import { useState, useRef, useCallback, useEffect, type RefObject } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";

const BAR_COUNT = 5;

function AudioLevelBars({ streamRef }: { streamRef: RefObject<MediaStream | null> }) {
  const [levels, setLevels] = useState<number[]>(Array(BAR_COUNT).fill(0));
  const rafRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;

    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);
    analyserRef.current = analyser;

    const data = new Uint8Array(analyser.frequencyBinCount);

    function tick() {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(data);
      const bucketSize = Math.floor(data.length / BAR_COUNT);
      const bars = Array.from({ length: BAR_COUNT }, (_: unknown, i: number) => {
        let sum = 0;
        for (let j = 0; j < bucketSize; j++) {
          sum += data[i * bucketSize + j] ?? 0;
        }
        return Math.min(1, (sum / bucketSize) / 128);
      });
      setLevels(bars);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      analyserRef.current = null;
      source.disconnect();
      void ctx.close();
    };
  }, [streamRef]);

  return (
    <div className="flex items-end gap-[3px] h-5" aria-hidden>
      {levels.map((level: number, i: number) => (
        <div
          key={i}
          className="w-1.5 rounded-sm bg-danger transition-none"
          style={{ height: `${Math.max(10, level * 100)}%`, opacity: 0.5 + level * 0.5 }}
        />
      ))}
    </div>
  );
}

export function AmbientMicToggle() {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    };
  }, []);

  const toggle = useCallback(async () => {
    if (active) {
      streamRef.current?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
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
              <AudioLevelBars streamRef={streamRef} />
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
