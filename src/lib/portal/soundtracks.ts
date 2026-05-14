/**
 * Storybook soundtracks — EMR-074
 *
 * Curated background playlists for the AI fairytale chart summary. Patients
 * pick a mood; we hand them a Spotify (or Apple Music) deep link to play
 * while they read their storybook. We do not implement OAuth or playback —
 * just the launcher and the link.
 *
 * The hand-picked URIs map to platform-curated playlists that work for any
 * Spotify Free / Premium account and require no auth.
 */

export type SoundtrackMood =
  | "calm"
  | "focus"
  | "uplift"
  | "sleep"
  | "nature";

export interface SoundtrackTrack {
  mood: SoundtrackMood;
  emoji: string;
  label: string;
  description: string;
  /** Spotify deep link — opens the app on mobile, the player on web. */
  spotifyUrl: string;
  /** Apple Music deep link. */
  appleMusicUrl: string;
}

export const SOUNDTRACKS: SoundtrackTrack[] = [
  {
    mood: "calm",
    emoji: "\u{1F343}",
    label: "Calm currents",
    description:
      "Soft ambient strings and piano — for the chapters about pain or anxiety.",
    spotifyUrl: "https://open.spotify.com/playlist/37i9dQZF1DWZqd5JICZI0u",
    appleMusicUrl: "https://music.apple.com/us/playlist/peaceful-meditation/pl.4115391b1f334b2bbdacb787a7eea64f",
  },
  {
    mood: "focus",
    emoji: "\u{1F9E0}",
    label: "Quiet focus",
    description: "Low-key instrumentals to read your chart in flow.",
    spotifyUrl: "https://open.spotify.com/playlist/37i9dQZF1DX3PFzdbtx1Us",
    appleMusicUrl: "https://music.apple.com/us/playlist/pure-focus/pl.f4d106fed2bd41149aaacabb233eb5eb",
  },
  {
    mood: "uplift",
    emoji: "\u{2600}\u{FE0F}",
    label: "Soft uplift",
    description: "A gentle morning lift — for chapters about mood or movement.",
    spotifyUrl: "https://open.spotify.com/playlist/37i9dQZF1DX0UrRvztWcAU",
    appleMusicUrl: "https://music.apple.com/us/playlist/feel-good-piano/pl.4830ab73b8a341c2a59c773cb7437e80",
  },
  {
    mood: "sleep",
    emoji: "\u{1F319}",
    label: "Drifting to sleep",
    description: "Slow, low-bpm piano and pads — for the bedtime ritual.",
    spotifyUrl: "https://open.spotify.com/playlist/37i9dQZF1DWZd79rJ6a7lp",
    appleMusicUrl: "https://music.apple.com/us/playlist/sleep/pl.5bf83b5b1d8e4b21b4eb2a73c45e1316",
  },
  {
    mood: "nature",
    emoji: "\u{1F33F}",
    label: "Forest & rain",
    description: "Field-recorded nature soundscapes — no melody, just space.",
    spotifyUrl: "https://open.spotify.com/playlist/37i9dQZF1DX4PP3DA4J0N8",
    appleMusicUrl: "https://music.apple.com/us/playlist/nature-sounds/pl.7672e9bd1d59458ba4d61c2ab7be1f54",
  },
];

export function soundtrackByMood(mood: SoundtrackMood): SoundtrackTrack {
  return SOUNDTRACKS.find((s) => s.mood === mood) ?? SOUNDTRACKS[0];
}

/**
 * Heuristic: pick a default soundtrack mood for a story whose chapters mention
 * specific themes. Falls back to "calm" — the broadest, safest read-along.
 */
export function suggestSoundtrack(chapterHeadings: string[]): SoundtrackMood {
  const text = chapterHeadings.join(" ").toLowerCase();
  if (text.includes("sleep")) return "sleep";
  if (text.includes("pain") || text.includes("anxiet")) return "calm";
  if (text.includes("mood") || text.includes("joy")) return "uplift";
  if (text.includes("garden") || text.includes("nature")) return "nature";
  if (text.includes("focus") || text.includes("cogn")) return "focus";
  return "calm";
}
