import { describe, it, expect } from "vitest";
import { buildShareIntent, SHARE_PRESETS } from "./social-share";

describe("buildShareIntent", () => {
  it("composes the share text with title, story, and hashtags", () => {
    const intent = buildShareIntent({
      title: "My plant is at 80%",
      story: "Small actions add up.",
      hashtags: ["LeafJourney", "Wellness"],
      shareUrl: "https://leafjourney.com",
    });
    expect(intent.text).toBe(
      "My plant is at 80% — Small actions add up. #LeafJourney #Wellness",
    );
    expect(intent.url).toBe("https://leafjourney.com");
  });

  it("strips spaces inside hashtags so they remain a single tag", () => {
    const intent = buildShareIntent({
      title: "x",
      story: "y",
      hashtags: ["Leaf Journey"],
      shareUrl: "https://leafjourney.com",
    });
    expect(intent.text).toContain("#LeafJourney");
  });

  it("omits the hashtag suffix when no tags are provided", () => {
    const intent = buildShareIntent({
      title: "x",
      story: "y",
      shareUrl: "https://leafjourney.com",
    });
    expect(intent.text).toBe("x — y");
  });

  it("URL-encodes the text and URL into every platform intent", () => {
    const intent = buildShareIntent({
      title: "Hello & welcome",
      story: "Step 1, step 2",
      shareUrl: "https://leafjourney.com/path?x=1",
    });
    // Twitter: text is URL-encoded
    expect(intent.platforms.twitter).toContain(
      encodeURIComponent("Hello & welcome — Step 1, step 2"),
    );
    expect(intent.platforms.twitter).toContain(
      encodeURIComponent("https://leafjourney.com/path?x=1"),
    );
    // Facebook
    expect(intent.platforms.facebook).toContain("facebook.com/sharer");
    // LinkedIn (URL only)
    expect(intent.platforms.linkedin).toContain(
      encodeURIComponent("https://leafjourney.com/path?x=1"),
    );
    // Email and SMS
    expect(intent.platforms.email.startsWith("mailto:")).toBe(true);
    expect(intent.platforms.sms.startsWith("sms:")).toBe(true);
  });
});

describe("SHARE_PRESETS", () => {
  it("plantHealth interpolates the score", () => {
    expect(SHARE_PRESETS.plantHealth(82).title).toContain("82%");
  });

  it("pillarStreak interpolates the average", () => {
    expect(SHARE_PRESETS.pillarStreak(74).title).toContain("74");
  });

  it("storybook interpolates the chapter count", () => {
    expect(SHARE_PRESETS.storybook(7).title).toContain("7 chapters");
  });

  it("spiritualWeek interpolates the score", () => {
    expect(SHARE_PRESETS.spiritualWeek(91).title).toContain("91");
  });
});
