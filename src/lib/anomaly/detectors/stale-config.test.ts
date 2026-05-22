import { vi } from "vitest";
vi.mock("server-only", () => ({}));

vi.mock("@/lib/specialty-templates/registry", () => ({
  getSpecialtyTemplate: vi.fn(),
  listAllManifestVersions: vi.fn(),
}));

import { describe, it, expect, beforeEach } from "vitest";
import { staleConfigDetector } from "./stale-config";
import {
  getSpecialtyTemplate,
  listAllManifestVersions,
} from "@/lib/specialty-templates/registry";

const mockedGet = vi.mocked(getSpecialtyTemplate);
const mockedList = vi.mocked(listAllManifestVersions);

function fakePrismaWith(configs: Array<Record<string, unknown>>) {
  return {
    practiceConfiguration: {
      findMany: vi.fn().mockResolvedValue(configs),
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-17T12:00:00Z"));
});

describe("staleConfigDetector — EMR-741", () => {
  it("has stable slug stale_config", () => {
    expect(staleConfigDetector.slug).toBe("stale_config");
  });

  it("emits nothing when config is on the latest version", async () => {
    mockedGet.mockReturnValue({ slug: "pain-management", version: "1.0.0" } as never);
    mockedList.mockReturnValue([
      { slug: "pain-management", version: "1.0.0" },
    ] as never);
    const out = await staleConfigDetector.run(
      fakePrismaWith([
        {
          id: "c1",
          organizationId: "org1",
          practiceId: "p1",
          selectedSpecialty: "pain-management",
          selectedSpecialtyVersion: "1.0.0",
        },
      ]) as never,
    );
    expect(out).toEqual([]);
  });

  it("emits nothing when 1 version behind (within rollout lag)", async () => {
    mockedGet.mockReturnValue({ slug: "pain-management", version: "2.0.0" } as never);
    mockedList.mockReturnValue([
      { slug: "pain-management", version: "2.0.0" },
      { slug: "pain-management", version: "1.0.0" },
    ] as never);
    const out = await staleConfigDetector.run(
      fakePrismaWith([
        {
          id: "c1",
          organizationId: "org1",
          practiceId: "p1",
          selectedSpecialty: "pain-management",
          selectedSpecialtyVersion: "1.0.0",
        },
      ]) as never,
    );
    expect(out).toEqual([]);
  });

  it("emits INFO when 2 versions behind", async () => {
    mockedGet.mockReturnValue({ slug: "pain-management", version: "3.0.0" } as never);
    mockedList.mockReturnValue([
      { slug: "pain-management", version: "3.0.0" },
      { slug: "pain-management", version: "2.0.0" },
      { slug: "pain-management", version: "1.0.0" },
    ] as never);
    const out = await staleConfigDetector.run(
      fakePrismaWith([
        {
          id: "c1",
          organizationId: "org1",
          practiceId: "p1",
          selectedSpecialty: "pain-management",
          selectedSpecialtyVersion: "1.0.0",
        },
      ]) as never,
    );
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("info");
    expect(out[0].context.versionsBehind).toBe(2);
  });

  it("emits WARNING when 3+ versions behind", async () => {
    mockedGet.mockReturnValue({ slug: "pain-management", version: "4.0.0" } as never);
    mockedList.mockReturnValue([
      { slug: "pain-management", version: "4.0.0" },
      { slug: "pain-management", version: "3.0.0" },
      { slug: "pain-management", version: "2.0.0" },
      { slug: "pain-management", version: "1.0.0" },
    ] as never);
    const out = await staleConfigDetector.run(
      fakePrismaWith([
        {
          id: "c1",
          organizationId: "org1",
          practiceId: "p1",
          selectedSpecialty: "pain-management",
          selectedSpecialtyVersion: "1.0.0",
        },
      ]) as never,
    );
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("warning");
    expect(out[0].context.versionsBehind).toBe(3);
  });
});
