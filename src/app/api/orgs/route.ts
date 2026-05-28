// EMR-420 — Organizations API for the Practice Onboarding wizard.
//
// GET   /api/orgs?q=...   — search/list organizations by legal or brand name.
// POST  /api/orgs         — create a new organization.
//
// Both endpoints are gated by requireImplementationAdmin() (EMR-428).

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { requireImplementationAdmin } from "@/lib/auth/super-admin";

export const runtime = "nodejs";

// US time zones we surface in the wizard. Kept in sync with the client
// component's dropdown.
const COMMON_US_TIME_ZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Phoenix",
  "America/Chicago",
  "America/New_York",
  "America/Anchorage",
  "Pacific/Honolulu",
] as const;

const npiSchema = z
  .string()
  .regex(/^\d{10}$/u, "NPI must be exactly 10 digits")
  .optional();

const createOrgSchema = z.object({
  legalName: z.string().trim().min(1, "Legal name is required").max(200),
  brandName: z.string().trim().min(1, "Brand name is required").max(200),
  primaryContactName: z
    .string()
    .trim()
    .min(1, "Primary contact name is required")
    .max(200),
  primaryContactEmail: z
    .string()
    .trim()
    .email("Must be a valid email")
    .max(320),
  phone: z
    .string()
    .trim()
    .min(1, "Phone number is required")
    .regex(/^\(\d{3}\) \d{3}-\d{4}$/, "Phone number must be in the format (555) 123-4567"),
  npi: npiSchema,
  street: z.string().trim().min(1, "Street is required").max(200),
  city: z.string().trim().min(1, "City is required").max(100),
  state: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/u, "State must be a 2-letter code")
    .transform((s) => s.toUpperCase()),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}(-\d{4})?$/u, "Postal code must be 5 or 9 digits"),
  timeZone: z
    .string()
    .trim()
    .min(1, "Time zone is required")
    .refine(
      (tz) => COMMON_US_TIME_ZONES.includes(tz as (typeof COMMON_US_TIME_ZONES)[number]),
      { message: "Unsupported time zone" },
    ),
});

function toJsonAddress(input: {
  street: string;
  city: string;
  state: string;
  postalCode: string;
}) {
  return {
    line1: input.street,
    city: input.city,
    state: input.state,
    postalCode: input.postalCode,
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 60);
}

function adminErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof Error && err.message === "FORBIDDEN") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  return null;
}

export async function GET(req: Request) {
  try {
    await requireImplementationAdmin();
  } catch (err) {
    const res = adminErrorResponse(err);
    if (res) return res;
    throw err;
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const take = Math.min(
    Math.max(Number.parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 1),
    50,
  );

  const where: Prisma.OrganizationWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { legalName: { contains: q, mode: "insensitive" } },
          { brandName: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  const orgs = await prisma.organization.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      name: true,
      legalName: true,
      brandName: true,
      practices: {
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      },
    },
  });

  return NextResponse.json({ organizations: orgs });
}

export async function POST(req: Request) {
  try {
    await requireImplementationAdmin();
  } catch (err) {
    const res = adminErrorResponse(err);
    if (res) return res;
    throw err;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = createOrgSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const input = parsed.data;
  // `name` and `slug` are required by the legacy Organization model; we
  // derive them from brand name here. EMR-409 may consolidate later.
  const baseSlug = slugify(input.brandName) || slugify(input.legalName) || "org";
  let slug = baseSlug;
  for (let i = 0; i < 5; i += 1) {
    const existing = await prisma.organization.findUnique({ where: { slug } });
    if (!existing) break;
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const org = await prisma.organization.create({
    data: {
      name: input.brandName,
      slug,
      legalName: input.legalName,
      brandName: input.brandName,
      primaryContactName: input.primaryContactName,
      primaryContactEmail: input.primaryContactEmail,
      phone: input.phone,
      npi: input.npi,
      street: input.street,
      city: input.city,
      state: input.state,
      postalCode: input.postalCode,
      timeZone: input.timeZone,
      billingNpi: input.npi,
      billingAddress: toJsonAddress(input),
    },
    select: {
      id: true,
      name: true,
      legalName: true,
      brandName: true,
    },
  });

  return NextResponse.json({ organization: org }, { status: 201 });
}
