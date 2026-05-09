import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 3;

interface Bucket {
  count: number;
  resetAt: number;
}

// In-memory rate-limit store. Single-process only — see linked issue for
// the Supabase-backed replacement.
const bucketsByIp = new Map<string, Bucket>();

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

function checkRateLimit(ip: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const bucket = bucketsByIp.get(ip);
  if (!bucket || bucket.resetAt < now) {
    bucketsByIp.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true };
  }
  if (bucket.count >= RATE_LIMIT_MAX) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { ok: true };
}

const ALLOWED_PRODUCT_TYPES = new Set([
  "tinctures",
  "edibles",
  "topicals",
  "beverages",
  "serums",
  "capsules",
  "flower",
  "vapes",
  "other",
]);

interface ValidatedApplication {
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  website?: string;
  productTypes: string[];
  hasCoa: "yes" | "no";
  description: string;
}

function isEmail(value: string): boolean {
  // Pragmatic email check — RFC compliance is not the goal
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function validate(payload: unknown): { ok: true; data: ValidatedApplication } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!payload || typeof payload !== "object") {
    return { ok: false, errors: { _: "Invalid payload" } };
  }
  const p = payload as Record<string, unknown>;

  const companyName = typeof p.companyName === "string" ? p.companyName.trim() : "";
  const contactName = typeof p.contactName === "string" ? p.contactName.trim() : "";
  const email = typeof p.email === "string" ? p.email.trim() : "";
  const phone = typeof p.phone === "string" ? p.phone.trim() : "";
  const website = typeof p.website === "string" ? p.website.trim() : "";
  const description = typeof p.description === "string" ? p.description.trim() : "";
  const hasCoa = p.hasCoa === "yes" ? "yes" : p.hasCoa === "no" ? "no" : null;
  const rawTypes = Array.isArray(p.productTypes) ? p.productTypes : [];
  const productTypes = rawTypes
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.toLowerCase())
    .filter((v) => ALLOWED_PRODUCT_TYPES.has(v));

  if (!companyName) errors.companyName = "Company name is required";
  else if (companyName.length > 200) errors.companyName = "Keep it under 200 characters";

  if (!contactName) errors.contactName = "Contact name is required";
  else if (contactName.length > 200) errors.contactName = "Keep it under 200 characters";

  if (!email) errors.email = "Email is required";
  else if (!isEmail(email)) errors.email = "Enter a valid email address";

  if (website && !isHttpUrl(website)) errors.website = "Enter a valid http(s) URL";
  if (phone && phone.length > 50) errors.phone = "Phone number is too long";

  if (productTypes.length === 0) errors.productTypes = "Pick at least one product type";

  if (!hasCoa) errors.hasCoa = "Tell us about your COA testing";

  if (!description) errors.description = "A short description is required";
  else if (description.length < 20) errors.description = "Tell us a bit more (min 20 characters)";
  else if (description.length > 2000) errors.description = "Keep it under 2000 characters";

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      companyName,
      contactName,
      email,
      phone: phone || undefined,
      website: website || undefined,
      productTypes,
      hasCoa: hasCoa as "yes" | "no",
      description,
    },
  };
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rate = checkRateLimit(ip);
  if (!rate.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many submissions. Try again later." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const result = validate(payload);
  if (!result.ok) {
    return NextResponse.json({ ok: false, errors: result.errors }, { status: 400 });
  }

  await prisma.vendorApplication.create({
    data: {
      companyName: result.data.companyName,
      contactName: result.data.contactName,
      email: result.data.email,
      phone: result.data.phone ?? null,
      website: result.data.website ?? null,
      productTypes: result.data.productTypes,
      hasCoa: result.data.hasCoa,
      description: result.data.description,
      ip,
    },
  });

  return NextResponse.json(
    { ok: true, message: "We'll review your application within 5 business days." },
    { status: 201 },
  );
}
