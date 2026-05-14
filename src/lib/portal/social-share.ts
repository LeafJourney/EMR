/**
 * Social sharing — EMR-075
 *
 * Builds platform-specific share URLs and a fallback "copy to clipboard"
 * payload. Patients can share milestones from My Garden, Lifestyle, and the
 * Storybook without us ever holding their social credentials.
 *
 * Pure builders only — no DOM, no fetch. The client component handles the
 * native Web Share API (`navigator.share`) when available and falls back to
 * the per-platform URLs from this module.
 */
export type SocialPlatform = "twitter" | "facebook" | "linkedin" | "email" | "sms";

export interface ShareableMilestone {
  /** Title surfaced on the card. */
  title: string;
  /** One-line story line below the title. */
  story: string;
  /** Hashtags (without #). Spaces will be stripped. */
  hashtags?: string[];
  /** Public URL that opens the share preview / portal home. */
  shareUrl: string;
}

export interface BuiltShare {
  text: string;
  url: string;
  /** Platform-specific deep-link URLs to compose a share. */
  platforms: Record<SocialPlatform, string>;
}

const hashtagText = (tags?: string[]): string =>
  tags && tags.length
    ? " " + tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ")
    : "";

export function buildShareIntent(m: ShareableMilestone): BuiltShare {
  const text = `${m.title} — ${m.story}${hashtagText(m.hashtags)}`;
  const url = m.shareUrl;

  return {
    text,
    url,
    platforms: {
      twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
      email: `mailto:?subject=${encodeURIComponent(m.title)}&body=${encodeURIComponent(`${text}\n\n${url}`)}`,
      sms: `sms:?&body=${encodeURIComponent(`${text} ${url}`)}`,
    },
  };
}

export interface ShareCardSeed {
  emoji: string;
  headline: string;
  /** Big number, e.g. "37" leaves, "12" stems, "82" score. */
  stat: string | number;
  /** Caption under the stat. */
  caption: string;
}

/** Pre-baked share copy for common milestones. */
export const SHARE_PRESETS = {
  plantHealth: (score: number): ShareableMilestone => ({
    title: `My plant is at ${score}%`,
    story: "Small consistent care actually adds up. Trying the simple things.",
    hashtags: ["LeafJourney", "MyGarden", "Wellness"],
    shareUrl: "https://leafjourney.com",
  }),
  pillarStreak: (overall: number): ShareableMilestone => ({
    title: `Four Pillars average: ${overall}`,
    story: "Tracking physical, mental, emotional, and spiritual together.",
    hashtags: ["LeafJourney", "FourPillars", "Wellness"],
    shareUrl: "https://leafjourney.com",
  }),
  storybook: (chapterCount: number): ShareableMilestone => ({
    title: `Read my health storybook (${chapterCount} chapters)`,
    story: "AI turned my chart into a fairytale. A new way to tell a health story.",
    hashtags: ["LeafJourney", "Storybook"],
    shareUrl: "https://leafjourney.com",
  }),
  spiritualWeek: (score: number): ShareableMilestone => ({
    title: `Spiritual wellness this week: ${score}`,
    story: "Faith, family, charity, meditation, nature. The five practices, tracked.",
    hashtags: ["LeafJourney", "Spiritual"],
    shareUrl: "https://leafjourney.com",
  }),
} as const;
