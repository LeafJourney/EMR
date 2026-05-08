"use client";

import React, { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, Music } from "lucide-react";

/**
 * Ambient Classical Music Player (EMR-041)
 * Provides an ambient background music player, defaulting to classical/soothing tracks.
 */
export function AmbientPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // A soothing royalty-free classical placeholder track.
  // Replace with a finalized track URL in production.
  const AUDIO_SRC = "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3";

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch((err) => {
          console.error("Audio playback failed:", err);
        });
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  return (
    <div className="flex items-center gap-3 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border border-neutral-200 dark:border-neutral-800 rounded-full px-4 py-2 shadow-sm transition-all hover:shadow-md">
      <audio
        ref={audioRef}
        src={AUDIO_SRC}
        loop
        preload="none"
        onEnded={() => setIsPlaying(false)}
      />
      
      <button
        onClick={togglePlay}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-800/80 transition-colors"
        aria-label={isPlaying ? "Pause ambient music" : "Play ambient music"}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4 ml-0.5" />
        )}
      </button>

      <div className="flex flex-col">
        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
          <Music className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
          Ambient Harmony
        </span>
        <span className="text-[10px] text-neutral-500 dark:text-neutral-500">
          Classical Focus
        </span>
      </div>

      <div className="w-px h-6 bg-neutral-200 dark:bg-neutral-800 mx-1" />

      <button
        onClick={toggleMute}
        className="p-1.5 text-neutral-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
        aria-label={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? (
          <VolumeX className="w-4 h-4" />
        ) : (
          <Volume2 className="w-4 h-4" />
        )}
      </button>

      {/* Mini Volume Slider */}
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={volume}
        onChange={(e) => {
          setVolume(parseFloat(e.target.value));
          if (isMuted && parseFloat(e.target.value) > 0) setIsMuted(false);
        }}
        className="w-16 h-1 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-emerald-600"
        aria-label="Volume"
      />
    </div>
  );
}
