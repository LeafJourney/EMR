import { describe, it, expect } from "vitest";
import {
  SOUNDTRACKS,
  soundtrackByMood,
  suggestSoundtrack,
} from "./soundtracks";

describe("SOUNDTRACKS", () => {
  it("covers all moods exactly once", () => {
    const moods = SOUNDTRACKS.map((s) => s.mood).sort();
    expect(moods).toEqual(["calm", "focus", "nature", "sleep", "uplift"]);
  });

  it("supplies both spotify and apple music urls for every entry", () => {
    for (const track of SOUNDTRACKS) {
      expect(track.spotifyUrl).toMatch(/^https:\/\/open\.spotify\.com\//);
      expect(track.appleMusicUrl).toMatch(/^https:\/\/music\.apple\.com\//);
    }
  });
});

describe("soundtrackByMood", () => {
  it("returns the matching track", () => {
    expect(soundtrackByMood("sleep").mood).toBe("sleep");
  });
});

describe("suggestSoundtrack", () => {
  it("picks sleep for sleep-themed chapters", () => {
    expect(suggestSoundtrack(["Your sleep journey"])).toBe("sleep");
  });

  it("picks calm for pain or anxiety chapters", () => {
    expect(suggestSoundtrack(["A chapter on pain"])).toBe("calm");
    expect(suggestSoundtrack(["Your anxiety arc"])).toBe("calm");
  });

  it("picks uplift for mood/joy chapters", () => {
    expect(suggestSoundtrack(["The joy of small wins"])).toBe("uplift");
  });

  it("picks nature for garden chapters", () => {
    expect(suggestSoundtrack(["My garden grows"])).toBe("nature");
  });

  it("defaults to calm when nothing matches", () => {
    expect(suggestSoundtrack(["Random heading"])).toBe("calm");
  });
});
