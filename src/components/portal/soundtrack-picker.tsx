"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  SOUNDTRACKS,
  soundtrackByMood,
  suggestSoundtrack,
  type SoundtrackMood,
} from "@/lib/portal/soundtracks";

interface SoundtrackPickerProps {
  /** Headings from the AI fairytale; used to suggest a starting mood. */
  chapterHeadings?: string[];
}

type Platform = "spotify" | "apple";

const STORAGE_KEY = "lj-soundtrack-preference";

interface StoredPreference {
  mood: SoundtrackMood;
  platform: Platform;
}

function read(): StoredPreference | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPreference;
    if (
      ["spotify", "apple"].includes(parsed.platform) &&
      SOUNDTRACKS.some((s) => s.mood === parsed.mood)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function write(pref: StoredPreference) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
  } catch {
    // ignore quota
  }
}

export function SoundtrackPicker({ chapterHeadings = [] }: SoundtrackPickerProps) {
  const suggestion = useMemo(
    () => suggestSoundtrack(chapterHeadings),
    [chapterHeadings],
  );

  const [mood, setMood] = useState<SoundtrackMood>(suggestion);
  const [platform, setPlatform] = useState<Platform>("spotify");

  useEffect(() => {
    const pref = read();
    if (pref) {
      setMood(pref.mood);
      setPlatform(pref.platform);
    }
  }, []);

  const track = soundtrackByMood(mood);
  const url = platform === "spotify" ? track.spotifyUrl : track.appleMusicUrl;

  function pickMood(next: SoundtrackMood) {
    setMood(next);
    write({ mood: next, platform });
  }

  function pickPlatform(next: Platform) {
    setPlatform(next);
    write({ mood, platform: next });
  }

  return (
    <Card tone="raised" className="print:hidden">
      <CardContent className="py-5">
        <div className="flex items-baseline justify-between gap-2 mb-3 flex-wrap">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-accent">
              Soundtrack
            </p>
            <p className="font-display text-lg text-text">
              Read with music
            </p>
          </div>
          <div className="inline-flex rounded-full border border-border bg-surface text-xs">
            <button
              type="button"
              onClick={() => pickPlatform("spotify")}
              className={`px-3 py-1.5 rounded-full transition-colors ${
                platform === "spotify"
                  ? "bg-accent-soft text-accent"
                  : "text-text-muted hover:text-text"
              }`}
              aria-pressed={platform === "spotify"}
            >
              Spotify
            </button>
            <button
              type="button"
              onClick={() => pickPlatform("apple")}
              className={`px-3 py-1.5 rounded-full transition-colors ${
                platform === "apple"
                  ? "bg-accent-soft text-accent"
                  : "text-text-muted hover:text-text"
              }`}
              aria-pressed={platform === "apple"}
            >
              Apple Music
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {SOUNDTRACKS.map((s) => {
            const active = s.mood === mood;
            const isSuggested = s.mood === suggestion;
            return (
              <button
                key={s.mood}
                type="button"
                onClick={() => pickMood(s.mood)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs transition-all ${
                  active
                    ? "bg-accent-soft border-accent text-accent shadow-sm"
                    : "bg-surface border-border text-text-muted hover:border-accent/50 hover:text-text"
                }`}
                aria-pressed={active}
              >
                <span aria-hidden="true">{s.emoji}</span>
                <span className="font-medium">{s.label}</span>
                {isSuggested && !active && (
                  <Badge tone="neutral" className="text-[9px] ml-1">
                    suggested
                  </Badge>
                )}
              </button>
            );
          })}
        </div>

        <p className="text-sm text-text-muted leading-relaxed mb-4">
          {track.description}
        </p>

        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-2 h-9 px-4 text-sm font-medium rounded-md bg-gradient-to-b from-accent to-accent-strong text-accent-ink shadow-seal hover:scale-[1.02] transition-all"
        >
          <span aria-hidden="true">▶</span>
          Open in {platform === "spotify" ? "Spotify" : "Apple Music"}
        </a>
      </CardContent>
    </Card>
  );
}
