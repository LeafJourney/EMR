// Seed the database with a demo organization, clinicians, patients, and
// enough data to make every surface of the app feel alive in local dev.
//
// Run with: npm run db:seed
//
// The seed is fully idempotent — safe to run multiple times.

import {
  Prisma,
  PrismaClient,
  Role,
  PatientStatus,
  EncounterStatus,
  NoteStatus,
  DocumentKind,
  MessageStatus,
  TaskStatus,
  AgentJobStatus,
  ProductType,
  ProductStatus,
  DeliveryRoute,
  MedicationType,
  AppointmentStatus,
  ClaimStatus,
  PaymentSource,
  FinancialEventType,
  StatementStatus,
  PaymentPlanStatus,
  CoverageType,
  EligibilityStatus,
  VendorType,
  VendorStatus,
  VendorDocumentType,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { CATEGORIES, PRODUCTS } from "../src/lib/marketplace/data";

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { defaultShippableStatesForVendorType } from "../src/lib/marketplace/shipping-restrictions";

const connectionString = `${process.env.DATABASE_URL}`;
const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const now = Date.now();

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

/** Deterministic date relative to "now". */
function daysAgo(n: number): Date {
  return new Date(now - n * DAY_MS);
}
function daysFromNow(n: number): Date {
  return new Date(now + n * DAY_MS);
}

/** Delete rows that would clash on re-seed (non-upsertable tables). */
async function cleanIdempotent() {
  // Global tables without org scoping
  await prisma.educationCompound.deleteMany();

  // OutcomeLogs, Messages, Documents, Notes, Encounters, Tasks, AgentJobs,
  // AssessmentResponses, and MessageThreads don't have natural unique keys,
  // so we delete-and-recreate. We scope deletions to our demo org to be safe.
  const org = await prisma.organization.findUnique({
    where: { slug: "green-path-health" },
  });
  if (!org) return; // first run — nothing to clean

  // Order matters because of FK constraints
  // LabOutreach cascades from LabResult on delete, but it's safer to
  // list both — order: children before parents.
  await prisma.refillRequest.deleteMany({
    where: { organizationId: org.id },
  });
  await prisma.labOutreach.deleteMany({
    where: { labResult: { organizationId: org.id } },
  });
  await prisma.labResult.deleteMany({
    where: { organizationId: org.id },
  });
  await prisma.patientMedication.deleteMany({
    where: { patient: { organizationId: org.id } },
  });
  await prisma.doseLog.deleteMany({
    where: { patient: { organizationId: org.id } },
  });
  await prisma.dosingRegimen.deleteMany({
    where: { patient: { organizationId: org.id } },
  });
  await prisma.cannabisProduct.deleteMany({
    where: { organizationId: org.id },
  });
  await prisma.codingSuggestion.deleteMany({
    where: { note: { encounter: { organizationId: org.id } } },
  });
  await prisma.note.deleteMany({
    where: { encounter: { organizationId: org.id } },
  });
  await prisma.document.deleteMany({ where: { organizationId: org.id } });
  await prisma.encounter.deleteMany({ where: { organizationId: org.id } });
  await prisma.message.deleteMany({
    where: { thread: { patient: { organizationId: org.id } } },
  });
  await prisma.messageThread.deleteMany({
    where: { patient: { organizationId: org.id } },
  });
  await prisma.assessmentResponse.deleteMany({
    where: { patient: { organizationId: org.id } },
  });
  await prisma.outcomeLog.deleteMany({
    where: { patient: { organizationId: org.id } },
  });
  await prisma.task.deleteMany({ where: { organizationId: org.id } });
  await prisma.agentJob.deleteMany({ where: { organizationId: org.id } });
  await prisma.appointment.deleteMany({
    where: { patient: { organizationId: org.id } },
  });

  // ── Billing tables (Phase 1-3) ─────────────────────────────────
  // FK order: payments → financial events → claims → statements →
  // payment plans → coverage → stored payment methods.
  // Statement.statementNumber has @unique so we MUST clean these up
  // or the seed crashes on duplicate inserts every deploy.
  await prisma.payment.deleteMany({
    where: { claim: { organizationId: org.id } },
  });
  await prisma.financialEvent.deleteMany({
    where: { organizationId: org.id },
  });
  await prisma.claim.deleteMany({ where: { organizationId: org.id } });
  await prisma.statement.deleteMany({ where: { organizationId: org.id } });
  await prisma.paymentPlan.deleteMany({
    where: { patient: { organizationId: org.id } },
  });
  await prisma.patientCoverage.deleteMany({
    where: { patient: { organizationId: org.id } },
  });
  await prisma.storedPaymentMethod.deleteMany({
    where: { patient: { organizationId: org.id } },
  });
  await prisma.feeScheduleEntry.deleteMany({
    where: { organizationId: org.id },
  });

  // ── Marketplace ────────────────────────────────────────────────
  // Cart cascades to CartItem; Order cascades to OrderItem; Product
  // cascades to ProductVariant, ProductReview, ProductCategory,
  // CartItem. Delete Orders before Products because OrderItem.product
  // is restrict-on-delete.
  await prisma.cart.deleteMany({
    where: { patient: { organizationId: org.id } },
  });
  await prisma.order.deleteMany({ where: { organizationId: org.id } });
  await prisma.product.deleteMany({ where: { organizationId: org.id } });
  // MarketplaceCategory is global (not org-scoped); only delete seed slugs.
  await prisma.marketplaceCategory.deleteMany({
    where: { slug: { in: CATEGORIES.map((c) => c.slug) } },
  });
}

// ---------------------------------------------------------------------------
// Marketplace seed
// ---------------------------------------------------------------------------

const PRODUCT_STATUS_MAP: Record<string, ProductStatus> = {
  draft: ProductStatus.draft,
  active: ProductStatus.active,
  archived: ProductStatus.archived,
  out_of_stock: ProductStatus.out_of_stock,
};

async function seedMarketplace(organizationId: string) {
  // Categories first — products reference them via ProductCategory joins.
  const categoryIdBySlug = new Map<string, string>();
  for (const cat of CATEGORIES) {
    const row = await prisma.marketplaceCategory.create({
      data: {
        name: cat.name,
        slug: cat.slug,
        description: cat.description ?? null,
        type: cat.type,
        icon: cat.icon ?? null,
      },
    });
    categoryIdBySlug.set(cat.slug, row.id);
  }

  // Static CATEGORIES use synthetic ids like "cat-sleep"; map those to
  // the real cuids we just created so the product join rows resolve.
  const seedCategoryIdToRealId = new Map<string, string>();
  for (const cat of CATEGORIES) {
    const realId = categoryIdBySlug.get(cat.slug);
    if (realId) seedCategoryIdToRealId.set(cat.id, realId);
  }

  for (const p of PRODUCTS) {
    const product = await prisma.product.create({
      data: {
        organizationId,
        name: p.name,
        slug: p.slug,
        brand: p.brand,
        description: p.description,
        shortDescription: p.shortDescription ?? null,
        price: p.price,
        compareAtPrice: p.compareAtPrice ?? null,
        status: PRODUCT_STATUS_MAP[p.status] ?? ProductStatus.active,
        format: p.format,
        imageUrl: p.imageUrl ?? null,
        images: p.images,
        thcContent: p.thcContent ?? null,
        cbdContent: p.cbdContent ?? null,
        cbnContent: p.cbnContent ?? null,
        terpeneProfile: (p.terpeneProfile ?? {}) as Prisma.InputJsonValue,
        strainType: p.strainType ?? null,
        symptoms: p.symptoms,
        goals: p.goals,
        useCases: p.useCases,
        onsetTime: p.onsetTime ?? null,
        duration: p.duration ?? null,
        dosageGuidance: p.dosageGuidance ?? null,
        beginnerFriendly: p.beginnerFriendly,
        labVerified: p.labVerified,
        coaUrl: p.coaUrl ?? null,
        clinicianPick: p.clinicianPick,
        clinicianNote: p.clinicianNote ?? null,
        inStock: p.inStock,
        averageRating: p.averageRating,
        reviewCount: p.reviewCount,
        featured: p.featured,
        bgColor: p.bgColor ?? null,
        deepColor: p.deepColor ?? null,
        displayShape: p.displayShape ?? null,
        doseLabel: p.doseLabel ?? null,
        outcomePct: p.outcomePct ?? null,
        outcomeSampleSize: p.outcomeSampleSize ?? null,
        variants: {
          create: p.variants.map((v, i) => ({
            name: v.name,
            upc: v.upc ?? null,
            price: v.price,
            compareAtPrice: v.compareAtPrice ?? null,
            inStock: v.inStock,
            sortOrder: i,
          })),
        },
        reviews: {
          create: p.reviews.map((r) => ({
            authorName: r.authorName,
            rating: r.rating,
            title: r.title ?? null,
            body: r.body ?? null,
            verified: r.verified,
            createdAt: new Date(r.createdAt),
          })),
        },
      },
    });

    // Join-table rows for product ↔ category
    for (const seedCatId of p.categoryIds) {
      const realCatId = seedCategoryIdToRealId.get(seedCatId);
      if (!realCatId) continue;
      await prisma.productCategory.create({
        data: { productId: product.id, categoryId: realCatId },
      });
    }
  }

  // ── Bridge: CannabisProduct → marketplace Product (EMR-268) ───────
  // Authoritative FK when set; ranking engine prefers it over the
  // name-match fallback. Two-phase backfill:
  //   1. Generic: normalized-name + optional-brand match. Production
  //      vendor onboarding is what actually populates this in real use.
  //   2. Demo overrides: hardcoded pairs for the 3 clinical products the
  //      seed creates for Maya / James / Sarah. Names don't overlap with
  //      branded marketplace listings, so the generic pass matches 0
  //      rows — without these overrides the demo "Recommended for You"
  //      section can't show product-efficacy boosts.
  const marketplaceByKey = new Map<string, string>(); // normalized "name|brand" → productId
  const marketplaceByName = new Map<string, string>(); // normalized "name" → productId (ambiguity last-write-wins)
  {
    const rows = await prisma.product.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true, brand: true },
    });
    for (const r of rows) {
      const k = `${r.name.trim().toLowerCase()}|${r.brand.trim().toLowerCase()}`;
      marketplaceByKey.set(k, r.id);
      marketplaceByName.set(r.name.trim().toLowerCase(), r.id);
    }
  }

  const clinicalRows = await prisma.cannabisProduct.findMany({
    where: { organizationId, marketplaceProductId: null },
    select: { id: true, name: true, brand: true },
  });

  let bridged = 0;
  for (const c of clinicalRows) {
    const keyed = marketplaceByKey.get(
      `${c.name.trim().toLowerCase()}|${(c.brand ?? "").trim().toLowerCase()}`,
    );
    const named = keyed ?? marketplaceByName.get(c.name.trim().toLowerCase());
    if (!named) continue;
    await prisma.cannabisProduct.update({
      where: { id: c.id },
      data: { marketplaceProductId: named },
    });
    bridged++;
  }

  // Demo overrides — map clinical seed products to their closest marketplace
  // twin by clinical intent. Matched on CannabisProduct.name (seeded by this
  // repo's seed.ts) and product slug (seeded by seedMarketplace above).
  const DEMO_BRIDGES: Record<string, string> = {
    "Balanced THC:CBD Tincture": "solace-calm-drops",
    "CBD Isolate Capsules 25mg": "canopy-clinical-balance-capsules",
    "High-CBD Sleep Tincture": "solace-nightfall-tincture",
    "Night Capsule 10:5 THC:CBN": "botanica-rest-gummies",
  };
  for (const [cannabisName, marketplaceSlug] of Object.entries(DEMO_BRIDGES)) {
    const target = await prisma.product.findUnique({
      where: { slug: marketplaceSlug },
      select: { id: true },
    });
    if (!target) continue;
    const updated = await prisma.cannabisProduct.updateMany({
      where: { organizationId, name: cannabisName, marketplaceProductId: null },
      data: { marketplaceProductId: target.id },
    });
    bridged += updated.count;
  }

  console.log(
    `  Marketplace: ${CATEGORIES.length} categories, ${PRODUCTS.length} products seeded. Bridged ${bridged} CannabisProduct → Product.`,
  );
}

// ---------------------------------------------------------------------------
// Phase 8 Track 3 — Pharmacology & Commerce seed data
//
// Seeds:
//   - Strain reference catalog (EMR-018)
//   - Dispensaries + SKUs in the SF Bay area (EMR-002 / EMR-017)
//   - Affiliate partner registry (EMR-039)
//   - Supply Store catalog (EMR-007)
//   - Supplement compounds for the Symptom/Diagnosis wheel (EMR-151)
//   - One reimbursement record per demo patient (EMR-145)
// ---------------------------------------------------------------------------

async function seedTrack8Data(organizationId: string, patientIds: string[]) {
  // ----- Strains (EMR-018) -------------------------------------------------
  const strainSeeds: Array<{
    slug: string;
    name: string;
    classification: "indica" | "sativa" | "hybrid" | "cbd";
    thcPercent: number;
    cbdPercent: number;
    dominantTerpene: string;
    symptoms: string[];
    effects: string[];
    flavors: string[];
    description: string;
  }> = [
    {
      slug: "northern-lights",
      name: "Northern Lights",
      classification: "indica",
      thcPercent: 18,
      cbdPercent: 0.5,
      dominantTerpene: "Myrcene",
      symptoms: ["insomnia", "pain", "anxiety", "stress"],
      effects: ["relaxed", "sleepy", "happy"],
      flavors: ["earthy", "sweet", "pine"],
      description:
        "Classic indica beloved for deeply sedating relaxation. A go-to for nighttime pain and sleep onset.",
    },
    {
      slug: "granddaddy-purple",
      name: "Granddaddy Purple",
      classification: "indica",
      thcPercent: 17,
      cbdPercent: 0.4,
      dominantTerpene: "Myrcene",
      symptoms: ["insomnia", "pain", "stress", "appetite"],
      effects: ["relaxed", "sleepy", "euphoric"],
      flavors: ["grape", "berry"],
      description:
        "Famous purple indica with a sweet grape profile. Heavy body relaxation; appetite-supportive.",
    },
    {
      slug: "blue-dream",
      name: "Blue Dream",
      classification: "hybrid",
      thcPercent: 19,
      cbdPercent: 0.4,
      dominantTerpene: "Myrcene",
      symptoms: ["depression", "pain", "stress", "fatigue"],
      effects: ["uplifted", "relaxed", "creative"],
      flavors: ["berry", "sweet"],
      description:
        "Sativa-leaning hybrid with gentle full-body relaxation paired with a clear-headed cerebral lift.",
    },
    {
      slug: "sour-diesel",
      name: "Sour Diesel",
      classification: "sativa",
      thcPercent: 22,
      cbdPercent: 0.2,
      dominantTerpene: "Caryophyllene",
      symptoms: ["depression", "fatigue", "stress", "focus"],
      effects: ["energetic", "uplifted", "focus"],
      flavors: ["diesel", "pungent"],
      description:
        "Energizing sativa with a quick uplifting onset. Daytime use for fatigue and low mood.",
    },
    {
      slug: "girl-scout-cookies",
      name: "Girl Scout Cookies",
      classification: "hybrid",
      thcPercent: 22,
      cbdPercent: 0.3,
      dominantTerpene: "Caryophyllene",
      symptoms: ["pain", "appetite", "nausea", "stress"],
      effects: ["euphoric", "relaxed", "happy"],
      flavors: ["sweet", "earthy", "mint"],
      description:
        "Potent hybrid favored for chronic pain and nausea. Euphoric body relaxation without total sedation.",
    },
    {
      slug: "harlequin",
      name: "Harlequin",
      classification: "cbd",
      thcPercent: 7,
      cbdPercent: 9,
      dominantTerpene: "Myrcene",
      symptoms: ["anxiety", "pain", "inflammation"],
      effects: ["clear-headed", "relaxed", "alert"],
      flavors: ["earthy", "musk"],
      description:
        "Reliable 1:1 THC:CBD strain. Clear-headed relief for anxious patients who need to function.",
    },
    {
      slug: "acdc",
      name: "ACDC",
      classification: "cbd",
      thcPercent: 1,
      cbdPercent: 14,
      dominantTerpene: "Myrcene",
      symptoms: ["anxiety", "pain", "seizures", "inflammation"],
      effects: ["clear-headed", "relaxed", "focus"],
      flavors: ["earthy", "wood"],
      description:
        "High-CBD, low-THC strain. Therapeutic with minimal psychoactive effect — common starting point.",
    },
    {
      slug: "jack-herer",
      name: "Jack Herer",
      classification: "sativa",
      thcPercent: 19,
      cbdPercent: 0.3,
      dominantTerpene: "Terpinolene",
      symptoms: ["depression", "fatigue", "focus", "stress"],
      effects: ["energetic", "creative", "focus"],
      flavors: ["pine", "wood"],
      description:
        "Bright, focused sativa. Often a first try for daytime mood and concentration support.",
    },
    {
      slug: "wedding-cake",
      name: "Wedding Cake",
      classification: "hybrid",
      thcPercent: 23,
      cbdPercent: 0.3,
      dominantTerpene: "Limonene",
      symptoms: ["pain", "insomnia", "appetite"],
      effects: ["relaxed", "euphoric", "happy"],
      flavors: ["sweet", "vanilla"],
      description:
        "Indica-leaning hybrid known for full-body calm and a creamy vanilla profile.",
    },
    {
      slug: "cannatonic",
      name: "Cannatonic",
      classification: "cbd",
      thcPercent: 6,
      cbdPercent: 12,
      dominantTerpene: "Myrcene",
      symptoms: ["anxiety", "muscle spasm", "pain"],
      effects: ["relaxed", "clear-headed"],
      flavors: ["earthy", "citrus"],
      description:
        "High-CBD strain with mild THC. Useful for anxiety and muscle spasms without strong intoxication.",
    },
  ];

  const strainIdBySlug = new Map<string, string>();
  for (const s of strainSeeds) {
    const row = await prisma.strain.upsert({
      where: { slug: s.slug },
      update: {
        name: s.name,
        classification: s.classification,
        thcPercent: s.thcPercent,
        cbdPercent: s.cbdPercent,
        dominantTerpene: s.dominantTerpene,
        symptoms: s.symptoms,
        effects: s.effects,
        flavors: s.flavors,
        description: s.description,
        active: true,
      },
      create: {
        slug: s.slug,
        name: s.name,
        classification: s.classification,
        thcPercent: s.thcPercent,
        cbdPercent: s.cbdPercent,
        dominantTerpene: s.dominantTerpene,
        symptoms: s.symptoms,
        effects: s.effects,
        flavors: s.flavors,
        description: s.description,
        active: true,
      },
    });
    strainIdBySlug.set(s.slug, row.id);
  }

  // ----- Dispensaries (EMR-002 / EMR-017) ---------------------------------
  const dispensarySeeds: Array<{
    slug: string;
    name: string;
    addressLine1: string;
    city: string;
    state: string;
    postalCode: string;
    latitude: number;
    longitude: number;
    phone: string;
    websiteUrl: string;
    hoursLine: string;
    licenseNumber: string;
    licenseState: string;
  }> = [
    {
      slug: "leafly-collective-sf",
      name: "Leafly Collective — SF",
      addressLine1: "415 Valencia St",
      city: "San Francisco",
      state: "CA",
      postalCode: "94103",
      latitude: 37.7659,
      longitude: -122.4222,
      phone: "+1 415 555 0182",
      websiteUrl: "https://example.com/leafly-collective",
      hoursLine: "Mon–Sat 9a–9p · Sun 10a–6p",
      licenseNumber: "C10-0000123-LIC",
      licenseState: "CA",
    },
    {
      slug: "oakland-green-room",
      name: "Oakland Green Room",
      addressLine1: "1860 Broadway",
      city: "Oakland",
      state: "CA",
      postalCode: "94612",
      latitude: 37.8084,
      longitude: -122.2683,
      phone: "+1 510 555 0144",
      websiteUrl: "https://example.com/green-room",
      hoursLine: "Daily 8a–10p",
      licenseNumber: "C10-0000456-LIC",
      licenseState: "CA",
    },
    {
      slug: "berkeley-patient-care",
      name: "Berkeley Patient Care",
      addressLine1: "2366 Telegraph Ave",
      city: "Berkeley",
      state: "CA",
      postalCode: "94704",
      latitude: 37.8625,
      longitude: -122.2585,
      phone: "+1 510 555 0167",
      websiteUrl: "https://example.com/bpc",
      hoursLine: "Mon–Fri 10a–8p",
      licenseNumber: "C10-0000789-LIC",
      licenseState: "CA",
    },
  ];

  const dispensaryIdBySlug = new Map<string, string>();
  for (const d of dispensarySeeds) {
    const row = await prisma.dispensary.upsert({
      where: { slug: d.slug },
      update: {
        name: d.name,
        addressLine1: d.addressLine1,
        city: d.city,
        state: d.state,
        postalCode: d.postalCode,
        latitude: d.latitude,
        longitude: d.longitude,
        phone: d.phone,
        websiteUrl: d.websiteUrl,
        hoursLine: d.hoursLine,
        status: "active",
        lastSyncedAt: new Date(),
      },
      create: {
        organizationId,
        slug: d.slug,
        name: d.name,
        addressLine1: d.addressLine1,
        city: d.city,
        state: d.state,
        postalCode: d.postalCode,
        latitude: d.latitude,
        longitude: d.longitude,
        phone: d.phone,
        websiteUrl: d.websiteUrl,
        hoursLine: d.hoursLine,
        licenseNumber: d.licenseNumber,
        licenseState: d.licenseState,
        status: "active",
        syncSource: "manual",
        lastSyncedAt: new Date(),
      },
    });
    dispensaryIdBySlug.set(d.slug, row.id);
  }

  // SKU seeds — a handful per dispensary covering the regimen targets in
  // the demo charts (sleep, pain, anxiety) so the locator's "matches your
  // regimen" view has something to surface.
  const skuSeeds: Array<{
    dispensarySlug: string;
    sku: string;
    name: string;
    brand: string;
    format:
      | "flower"
      | "tincture"
      | "capsule"
      | "vape"
      | "preroll"
      | "edible"
      | "topical"
      | "concentrate";
    strainSlug?: string;
    thcMgPerUnit?: number;
    cbdMgPerUnit?: number;
    thcPercent?: number;
    cbdPercent?: number;
    priceCents: number;
    inStock: boolean;
  }> = [
    {
      dispensarySlug: "leafly-collective-sf",
      sku: "LC-NL-3.5",
      name: "Northern Lights 3.5g",
      brand: "Sunset Cannabis Co.",
      format: "flower",
      strainSlug: "northern-lights",
      thcPercent: 18,
      cbdPercent: 0.5,
      priceCents: 4500,
      inStock: true,
    },
    {
      dispensarySlug: "leafly-collective-sf",
      sku: "LC-NF-30",
      name: "Nightfall Tincture 30mL — 1:1",
      brand: "Solace Botanica",
      format: "tincture",
      strainSlug: "harlequin",
      thcMgPerUnit: 5,
      cbdMgPerUnit: 5,
      priceCents: 5800,
      inStock: true,
    },
    {
      dispensarySlug: "leafly-collective-sf",
      sku: "LC-CBD-25",
      name: "CBD Isolate Capsule 25mg (30ct)",
      brand: "Canopy Clinical",
      format: "capsule",
      strainSlug: "acdc",
      thcMgPerUnit: 0,
      cbdMgPerUnit: 25,
      priceCents: 4200,
      inStock: true,
    },
    {
      dispensarySlug: "oakland-green-room",
      sku: "OGR-GDP-3.5",
      name: "Granddaddy Purple 3.5g",
      brand: "Sunset Cannabis Co.",
      format: "flower",
      strainSlug: "granddaddy-purple",
      thcPercent: 17,
      cbdPercent: 0.4,
      priceCents: 4200,
      inStock: true,
    },
    {
      dispensarySlug: "oakland-green-room",
      sku: "OGR-BD-VP",
      name: "Blue Dream Live Resin Vape 0.5g",
      brand: "Garden Path",
      format: "vape",
      strainSlug: "blue-dream",
      thcPercent: 78,
      cbdPercent: 0.3,
      priceCents: 4800,
      inStock: true,
    },
    {
      dispensarySlug: "oakland-green-room",
      sku: "OGR-HRL-30",
      name: "Harlequin Tincture 30mL — 1:1",
      brand: "Solace Botanica",
      format: "tincture",
      strainSlug: "harlequin",
      thcMgPerUnit: 5,
      cbdMgPerUnit: 5,
      priceCents: 5500,
      inStock: true,
    },
    {
      dispensarySlug: "berkeley-patient-care",
      sku: "BPC-ACDC-30",
      name: "ACDC High-CBD Tincture 30mL",
      brand: "Canopy Clinical",
      format: "tincture",
      strainSlug: "acdc",
      thcMgPerUnit: 1,
      cbdMgPerUnit: 20,
      priceCents: 6800,
      inStock: true,
    },
    {
      dispensarySlug: "berkeley-patient-care",
      sku: "BPC-CT-CAP",
      name: "Cannatonic Capsules 10mg (30ct)",
      brand: "Canopy Clinical",
      format: "capsule",
      strainSlug: "cannatonic",
      thcMgPerUnit: 2,
      cbdMgPerUnit: 10,
      priceCents: 4800,
      inStock: true,
    },
    {
      dispensarySlug: "berkeley-patient-care",
      sku: "BPC-WC-PR",
      name: "Wedding Cake Pre-Roll 1g",
      brand: "Garden Path",
      format: "preroll",
      strainSlug: "wedding-cake",
      thcPercent: 23,
      cbdPercent: 0.3,
      priceCents: 1500,
      inStock: false,
    },
  ];

  for (const sku of skuSeeds) {
    const dispensaryId = dispensaryIdBySlug.get(sku.dispensarySlug);
    if (!dispensaryId) continue;
    const strainId = sku.strainSlug ? strainIdBySlug.get(sku.strainSlug) : null;
    const strainType = sku.strainSlug
      ? (strainSeeds.find((s) => s.slug === sku.strainSlug)?.classification ?? "na")
      : "na";
    await prisma.dispensarySku.upsert({
      where: { dispensaryId_sku: { dispensaryId, sku: sku.sku } },
      update: {
        name: sku.name,
        brand: sku.brand,
        format: sku.format,
        strainType,
        strainId: strainId ?? null,
        thcMgPerUnit: sku.thcMgPerUnit,
        cbdMgPerUnit: sku.cbdMgPerUnit,
        thcPercent: sku.thcPercent,
        cbdPercent: sku.cbdPercent,
        priceCents: sku.priceCents,
        inStock: sku.inStock,
        active: true,
      },
      create: {
        dispensaryId,
        sku: sku.sku,
        name: sku.name,
        brand: sku.brand,
        format: sku.format,
        strainType,
        strainId: strainId ?? null,
        thcMgPerUnit: sku.thcMgPerUnit,
        cbdMgPerUnit: sku.cbdMgPerUnit,
        thcPercent: sku.thcPercent,
        cbdPercent: sku.cbdPercent,
        priceCents: sku.priceCents,
        inStock: sku.inStock,
      },
    });
  }

  // ----- Affiliate partners (EMR-039) -------------------------------------
  const affiliateSeeds: Array<{
    slug: string;
    name: string;
    domain: string;
    websiteUrl: string;
    description: string;
    category: string;
    sortOrder: number;
  }> = [
    {
      slug: "phytorx",
      name: "PhytoRx",
      domain: "phytorx.co",
      websiteUrl: "https://phytorx.co/products/cbd-cbg-beverage-concentrate",
      description:
        "Physician-formulated CBD + CBG beverage concentrates for pain and recovery. Fast-absorbing emulsion technology developed with clinical input.",
      category: "Beverages",
      sortOrder: 10,
    },
    {
      slug: "flower-powered-products",
      name: "Flower Powered Products",
      domain: "flowerpoweredproductsllc.com",
      websiteUrl: "https://flowerpoweredproductsllc.com/shop",
      description:
        "Full line of CBD-only wellness products. Topicals, balms, and creams. Third-party tested, physician-recommended.",
      category: "Topicals",
      sortOrder: 20,
    },
    {
      slug: "aulv",
      name: "AULV Wellness",
      domain: "aulv.org",
      websiteUrl: "https://aulv.org",
      description:
        "Wellness collective focused on plant-based therapies, education, and community-supported research. Curated alongside our care team.",
      category: "Wellness",
      sortOrder: 30,
    },
  ];
  const DEFAULT_DISCLAIMER =
    "You are leaving Leafjourney to visit a partner website. Please consult your healthcare provider before considering these products. Cannabis products are not FDA-approved medications and individual results may vary. This is a joint decision between you and your care team.";
  const JOINT_DECISION_NOTE =
    "Adding any product to your regimen is a joint decision between you and your care team. Bring this product up at your next visit so we can document it and watch for interactions.";
  for (const p of affiliateSeeds) {
    await prisma.affiliatePartner.upsert({
      where: { slug: p.slug },
      update: {
        name: p.name,
        domain: p.domain,
        websiteUrl: p.websiteUrl,
        description: p.description,
        category: p.category,
        status: "active",
        disclaimerText: DEFAULT_DISCLAIMER,
        jointDecisionNote: JOINT_DECISION_NOTE,
        utmSource: "leafjourney",
        sortOrder: p.sortOrder,
      },
      create: {
        slug: p.slug,
        name: p.name,
        domain: p.domain,
        websiteUrl: p.websiteUrl,
        description: p.description,
        category: p.category,
        status: "active",
        disclaimerText: DEFAULT_DISCLAIMER,
        jointDecisionNote: JOINT_DECISION_NOTE,
        utmSource: "leafjourney",
        sortOrder: p.sortOrder,
      },
    });
  }

  // ----- Supply Store (EMR-007) -------------------------------------------
  const supplySeeds: Array<{
    slug: string;
    name: string;
    brand: string;
    category:
      | "cough_cold"
      | "sleep"
      | "pain"
      | "digestive"
      | "vitamins_supplements"
      | "dme"
      | "topical"
      | "oral_care"
      | "mental_health"
      | "general_wellness";
    description: string;
    shortDescription: string;
    priceCents: number;
    symptoms: string[];
    conditions: string[];
    contraindications: string[];
    fsaEligible: boolean;
    featured: boolean;
  }> = [
    {
      slug: "magnesium-glycinate-200mg",
      name: "Magnesium Glycinate 200mg",
      brand: "Pure Roots",
      category: "sleep",
      description:
        "Highly bioavailable magnesium glycinate. 200mg per capsule, 90 count. Calms the nervous system and supports sleep.",
      shortDescription: "Sleep + muscle support · 90ct",
      priceCents: 2299,
      symptoms: ["insomnia", "sleep", "muscle tension", "anxiety"],
      conditions: ["insomnia", "anxiety"],
      contraindications: ["kidney disease"],
      fsaEligible: true,
      featured: true,
    },
    {
      slug: "low-dose-melatonin-0_5mg",
      name: "Low-Dose Melatonin 0.5mg",
      brand: "Pure Roots",
      category: "sleep",
      description:
        "Sublingual melatonin at the physiologic dose (0.5mg). Stacks safely with bedtime CBN. 60 count.",
      shortDescription: "Sublingual · 60ct · 0.5mg",
      priceCents: 1499,
      symptoms: ["insomnia", "jet lag", "shift work"],
      conditions: ["insomnia"],
      contraindications: ["pregnant"],
      fsaEligible: true,
      featured: false,
    },
    {
      slug: "elderberry-zinc-throat-spray",
      name: "Elderberry + Zinc Throat Spray",
      brand: "Pure Roots",
      category: "cough_cold",
      description:
        "Elderberry, zinc, and propolis throat spray for early cough and sore throat. 30mL.",
      shortDescription: "Cough + sore throat · 30mL",
      priceCents: 1299,
      symptoms: ["cough", "sore throat"],
      conditions: ["common cold"],
      contraindications: [],
      fsaEligible: false,
      featured: false,
    },
    {
      slug: "omega-3-1000mg",
      name: "Omega-3 EPA/DHA 1000mg",
      brand: "Pure Roots",
      category: "vitamins_supplements",
      description:
        "Triple-strength fish oil. 600mg EPA + 400mg DHA per softgel. Supports anti-inflammatory and cognitive pathways.",
      shortDescription: "Anti-inflammatory · 90ct softgels",
      priceCents: 2799,
      symptoms: ["inflammation", "joint pain", "mood", "cognition"],
      conditions: ["chronic inflammation"],
      contraindications: ["warfarin"],
      fsaEligible: true,
      featured: true,
    },
    {
      slug: "ashwagandha-600mg",
      name: "Ashwagandha KSM-66 600mg",
      brand: "Pure Roots",
      category: "mental_health",
      description:
        "KSM-66 standardized ashwagandha extract. 600mg per capsule. Adaptogen for stress and HPA axis support.",
      shortDescription: "Stress + cortisol · 60ct",
      priceCents: 2499,
      symptoms: ["stress", "anxiety", "fatigue"],
      conditions: ["anxiety"],
      contraindications: ["thyroid disease"],
      fsaEligible: false,
      featured: false,
    },
    {
      slug: "compression-knee-sleeve",
      name: "Compression Knee Sleeve",
      brand: "MoveWell",
      category: "dme",
      description:
        "Medical-grade compression sleeve for knee pain and post-exercise recovery. Sized S/M/L/XL.",
      shortDescription: "Joint support · medical-grade",
      priceCents: 3499,
      symptoms: ["joint pain", "knee pain"],
      conditions: ["osteoarthritis"],
      contraindications: [],
      fsaEligible: true,
      featured: false,
    },
    {
      slug: "vitamin-d3-k2-5000iu",
      name: "Vitamin D3 + K2 5000IU",
      brand: "Pure Roots",
      category: "vitamins_supplements",
      description:
        "Vitamin D3 with cofactor K2 (MK-7). 5000IU per softgel. Mood, immune, and bone support.",
      shortDescription: "Mood + immune · 90ct softgels",
      priceCents: 1899,
      symptoms: ["fatigue", "mood", "immunity"],
      conditions: ["vitamin d deficiency"],
      contraindications: [],
      fsaEligible: true,
      featured: false,
    },
    {
      slug: "menthol-arnica-pain-rub",
      name: "Menthol + Arnica Pain Rub",
      brand: "MoveWell",
      category: "topical",
      description:
        "Cooling menthol topical with arnica extract. For sore muscles and minor joint pain. 4oz tube.",
      shortDescription: "Cooling topical · 4oz",
      priceCents: 1599,
      symptoms: ["muscle pain", "joint pain", "soreness"],
      conditions: ["myalgia"],
      contraindications: ["broken skin"],
      fsaEligible: true,
      featured: false,
    },
  ];
  for (const s of supplySeeds) {
    await prisma.supplyProduct.upsert({
      where: { slug: s.slug },
      update: {
        name: s.name,
        brand: s.brand,
        category: s.category,
        description: s.description,
        shortDescription: s.shortDescription,
        priceCents: s.priceCents,
        symptoms: s.symptoms,
        conditions: s.conditions,
        contraindications: s.contraindications,
        isOTC: true,
        fsaEligible: s.fsaEligible,
        featured: s.featured,
        active: true,
      },
      create: {
        organizationId,
        slug: s.slug,
        name: s.name,
        brand: s.brand,
        category: s.category,
        description: s.description,
        shortDescription: s.shortDescription,
        priceCents: s.priceCents,
        symptoms: s.symptoms,
        conditions: s.conditions,
        contraindications: s.contraindications,
        isOTC: true,
        fsaEligible: s.fsaEligible,
        featured: s.featured,
      },
    });
  }

  // ----- Supplement compounds (EMR-151) -----------------------------------
  // Mirrors the BUILTIN_SUPPLEMENTS list in src/lib/domain/supplement-wheel.ts
  // so the wheel renders the same content with or without DB connectivity.
  const supplementSeeds: Array<{
    id: string;
    name: string;
    category: string;
    color: string;
    evidence: "strong" | "moderate" | "emerging";
    description: string;
    symptoms: string[];
    benefits: string[];
    risks: string[];
    cannabisInteraction: string;
    sortOrder: number;
  }> = [
    {
      id: "magnesium-glycinate",
      name: "Magnesium Glycinate",
      category: "Mineral",
      color: "#7C9F8C",
      evidence: "strong",
      description: "Highly bioavailable form of magnesium with calming effects.",
      symptoms: ["sleep", "muscle tension", "anxiety"],
      benefits: ["Improves sleep onset", "Reduces nighttime cramps", "Calms nervous system"],
      risks: ["Loose stools at high doses"],
      cannabisInteraction: "Generally synergistic with CBD for sleep and muscle relaxation.",
      sortOrder: 10,
    },
    {
      id: "melatonin",
      name: "Melatonin",
      category: "Hormone",
      color: "#5B6F8E",
      evidence: "strong",
      description: "Endogenous sleep-onset hormone; useful for shifted circadian rhythms.",
      symptoms: ["sleep", "jet lag", "shift work"],
      benefits: ["Shortens sleep latency", "Stabilizes sleep timing"],
      risks: ["Morning grogginess at >1 mg", "Vivid dreams"],
      cannabisInteraction: "Stack low-dose melatonin (0.3–1 mg) with bedtime CBN for sleep.",
      sortOrder: 20,
    },
    {
      id: "omega-3",
      name: "Omega-3 (EPA/DHA)",
      category: "Essential Fatty Acid",
      color: "#3F7D8A",
      evidence: "strong",
      description: "EPA + DHA fish oil; supports anti-inflammatory and cognitive pathways.",
      symptoms: ["inflammation", "joint pain", "mood", "cognition"],
      benefits: ["Reduces systemic inflammation", "Supports mood stability"],
      risks: ["Mild blood-thinning at high doses"],
      cannabisInteraction: "Complements CBD's anti-inflammatory action.",
      sortOrder: 30,
    },
    {
      id: "ashwagandha",
      name: "Ashwagandha",
      category: "Adaptogen",
      color: "#9C7C5A",
      evidence: "moderate",
      description: "Ayurvedic adaptogen; shown to lower cortisol and support resilience.",
      symptoms: ["stress", "anxiety", "fatigue"],
      benefits: ["Lowers cortisol", "Improves stress resilience"],
      risks: ["Avoid with thyroid medications without supervision"],
      cannabisInteraction: "Pairs well with mid-day microdose CBD for stress without sedation.",
      sortOrder: 40,
    },
    {
      id: "l-theanine",
      name: "L-Theanine",
      category: "Amino",
      color: "#6FA89A",
      evidence: "strong",
      description: "Amino acid from green tea; promotes alpha brainwaves and calm focus.",
      symptoms: ["anxiety", "focus", "stress"],
      benefits: ["Calm without sedation", "Smooths caffeine"],
      risks: ["Generally well-tolerated"],
      cannabisInteraction: "Can offset THC-induced anxiety; safe to combine.",
      sortOrder: 50,
    },
    {
      id: "vitamin-d3",
      name: "Vitamin D3",
      category: "Vitamin",
      color: "#D4A04E",
      evidence: "strong",
      description: "Sun-derived vitamin; deficiency linked to mood and immune issues.",
      symptoms: ["fatigue", "mood", "immunity"],
      benefits: ["Mood support", "Immune function"],
      risks: ["Toxic at very high doses without K2 cofactor"],
      cannabisInteraction: "No notable interaction; foundational stack.",
      sortOrder: 60,
    },
  ];
  for (const s of supplementSeeds) {
    await prisma.supplementCompound.upsert({
      where: { id: s.id },
      update: {
        name: s.name,
        category: s.category,
        color: s.color,
        evidence: s.evidence,
        description: s.description,
        symptoms: s.symptoms,
        benefits: s.benefits,
        risks: s.risks,
        cannabisInteraction: s.cannabisInteraction,
        sortOrder: s.sortOrder,
        active: true,
      },
      create: {
        id: s.id,
        name: s.name,
        category: s.category,
        color: s.color,
        evidence: s.evidence,
        description: s.description,
        symptoms: s.symptoms,
        benefits: s.benefits,
        risks: s.risks,
        cannabisInteraction: s.cannabisInteraction,
        sortOrder: s.sortOrder,
        active: true,
      },
    });
  }

  // ----- Reimbursement records (EMR-145) ----------------------------------
  // Each demo patient gets one prior-month record so the operator
  // dashboard renders meaningful data on first load.
  const now = new Date();
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const dispensariesArr = Array.from(dispensaryIdBySlug.values());
  const reimbursementRows: Array<{
    patientId: string;
    dispensaryId: string;
    documentedSpendCents: number;
    reimbursableCents: number;
    status: "draft" | "submitted" | "approved";
  }> = patientIds.map((pid, i) => ({
    patientId: pid,
    dispensaryId: dispensariesArr[i % dispensariesArr.length],
    documentedSpendCents: 18_000 + i * 6_000,
    reimbursableCents: Math.min(50_000, 18_000 + i * 6_000),
    status: i === 0 ? "approved" : i === 1 ? "submitted" : "draft",
  }));
  for (const r of reimbursementRows) {
    await prisma.dispensaryReimbursement.upsert({
      where: { patientId_serviceMonth: { patientId: r.patientId, serviceMonth: lastMonth } },
      update: {
        documentedSpendCents: r.documentedSpendCents,
        reimbursableCents: r.reimbursableCents,
        status: r.status,
      },
      create: {
        organizationId,
        dispensaryId: r.dispensaryId,
        patientId: r.patientId,
        serviceMonth: lastMonth,
        documentedSpendCents: r.documentedSpendCents,
        reimbursableCents: r.reimbursableCents,
        status: r.status,
      },
    });
  }

  console.log(
    `  Track 8: ${strainSeeds.length} strains, ${dispensarySeeds.length} dispensaries, ${skuSeeds.length} SKUs, ${affiliateSeeds.length} affiliates, ${supplySeeds.length} supply items, ${supplementSeeds.length} supplement compounds, ${reimbursementRows.length} reimbursement rows.`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Cleaning previous seed data...");
  await cleanIdempotent();

  console.log("Seeding demo organization...");

  // ------------------------------------------------------------------
  // Organization
  // ------------------------------------------------------------------
  const org = await prisma.organization.upsert({
    where: { slug: "green-path-health" },
    update: {},
    create: {
      name: "Leafjourney",
      slug: "green-path-health",
    },
  });

  const passwordHash = await bcrypt.hash("Longbeach2026!", 12);

  // ------------------------------------------------------------------
  // Marketplace vendors (EMR-237)
  // ------------------------------------------------------------------
  const vendorSeeds: Array<{
    slug: string;
    name: string;
    vendorType: VendorType;
    categories: string[];
    productLines?: string[];
    takeRatePct: number;
    foundingPartnerFlag: boolean;
    foundingPartnerExpiresAt?: Date;
    payoutSchedule?: string;
    reservePct?: number;
    reserveDays?: number;
    status: VendorStatus;
  }> = [
    {
      slug: "phytorx",
      name: "PhytoRx",
      vendorType: VendorType.hemp_brand,
      categories: ["beverage", "cbd", "cbg"],
      takeRatePct: 0.10,
      foundingPartnerFlag: true,
      foundingPartnerExpiresAt: new Date("2028-04-23"),
      payoutSchedule: "weekly",
      reservePct: 0.10,
      reserveDays: 14,
      status: VendorStatus.pending,
    },
    {
      slug: "flower-powered",
      name: "Flower Powered",
      vendorType: VendorType.hemp_brand,
      categories: ["cbd", "topical", "tincture"],
      takeRatePct: 0.10,
      foundingPartnerFlag: true,
      foundingPartnerExpiresAt: new Date("2028-04-23"),
      payoutSchedule: "weekly",
      reservePct: 0.10,
      reserveDays: 14,
      status: VendorStatus.pending,
    },
    {
      slug: "greenleaf-co",
      name: "Greenleaf Co.",
      vendorType: VendorType.hemp_brand,
      categories: ["plant_powered_wellness"],
      takeRatePct: 0.10,
      foundingPartnerFlag: true,
      foundingPartnerExpiresAt: new Date("2028-04-23"),
      payoutSchedule: "weekly",
      reservePct: 0.10,
      reserveDays: 14,
      status: VendorStatus.pending,
    },
    {
      slug: "potency-710",
      name: "Potency 710",
      vendorType: VendorType.hemp_brand,
      categories: ["topical", "skincare"],
      productLines: ["Gold Skin Serum"],
      takeRatePct: 0.10,
      foundingPartnerFlag: true,
      foundingPartnerExpiresAt: new Date("2028-04-23"),
      payoutSchedule: "weekly",
      reservePct: 0.10,
      reserveDays: 14,
      status: VendorStatus.pending,
    },
  ];

  for (const vendorSeed of vendorSeeds) {
    const shippableStates = defaultShippableStatesForVendorType(
      vendorSeed.vendorType,
    );
    const vendor = await prisma.vendor.upsert({
      where: { slug: vendorSeed.slug },
      update: {
        name: vendorSeed.name,
        vendorType: vendorSeed.vendorType,
        categories: vendorSeed.categories,
        productLines: vendorSeed.productLines ?? [],
        takeRatePct: vendorSeed.takeRatePct,
        foundingPartnerFlag: vendorSeed.foundingPartnerFlag,
        foundingPartnerExpiresAt: vendorSeed.foundingPartnerExpiresAt ?? null,
        payoutSchedule: vendorSeed.payoutSchedule ?? "weekly",
        reservePct: vendorSeed.reservePct ?? 0.10,
        reserveDays: vendorSeed.reserveDays ?? 14,
        shippableStates,
        status: vendorSeed.status,
      },
      create: {
        organizationId: org.id,
        slug: vendorSeed.slug,
        name: vendorSeed.name,
        vendorType: vendorSeed.vendorType,
        categories: vendorSeed.categories,
        productLines: vendorSeed.productLines ?? [],
        takeRatePct: vendorSeed.takeRatePct,
        foundingPartnerFlag: vendorSeed.foundingPartnerFlag,
        foundingPartnerExpiresAt: vendorSeed.foundingPartnerExpiresAt ?? null,
        payoutSchedule: vendorSeed.payoutSchedule ?? "weekly",
        reservePct: vendorSeed.reservePct ?? 0.10,
        reserveDays: vendorSeed.reserveDays ?? 14,
        shippableStates,
        status: vendorSeed.status,
      },
    });

    const requiredDocuments: VendorDocumentType[] = [
      VendorDocumentType.insurance,
      VendorDocumentType.w9,
      VendorDocumentType.coa,
    ];

    for (const documentType of requiredDocuments) {
      await prisma.vendorDocument.upsert({
        where: {
          vendorId_documentType: {
            vendorId: vendor.id,
            documentType,
          },
        },
        update: {
          fileUrl: null,
        },
        create: {
          organizationId: org.id,
          vendorId: vendor.id,
          documentType,
          fileUrl: null,
        },
      });
    }
  }

  // ------------------------------------------------------------------
  // Users
  // ------------------------------------------------------------------

  // Practice owner / operator
  const owner = await prisma.user.upsert({
    where: { email: "owner@demo.health" },
    update: { passwordHash },
    create: {
      email: "owner@demo.health",
      passwordHash,
      firstName: "Avery",
      lastName: "Hale",
      memberships: {
        create: [
          { organizationId: org.id, role: Role.practice_owner },
          { organizationId: org.id, role: Role.operator },
        ],
      },
    },
  });

  // Clinician
  const clinicianUser = await prisma.user.upsert({
    where: { email: "clinician@demo.health" },
    update: { passwordHash },
    create: {
      email: "clinician@demo.health",
      passwordHash,
      firstName: "Dr. Lena",
      lastName: "Okafor",
      memberships: {
        create: { organizationId: org.id, role: Role.clinician },
      },
    },
  });

  const provider = await prisma.provider.upsert({
    where: { userId: clinicianUser.id },
    update: {},
    create: {
      userId: clinicianUser.id,
      organizationId: org.id,
      title: "MD, Integrative Oncology",
      specialties: ["oncology", "pain management", "palliative care"],
      bio: "Board-certified integrative oncologist focused on symptom management and cannabis-assisted therapy.",
    },
  });

  // ------------------------------------------------------------------
  // Patient 1 — Maya Reyes (active, richest record)
  // ------------------------------------------------------------------
  const mayaUser = await prisma.user.upsert({
    where: { email: "patient@demo.health" },
    update: { passwordHash },
    create: {
      email: "patient@demo.health",
      passwordHash,
      firstName: "Maya",
      lastName: "Reyes",
      memberships: {
        create: { organizationId: org.id, role: Role.patient },
      },
    },
  });

  const maya = await prisma.patient.upsert({
    where: { userId: mayaUser.id },
    update: {},
    create: {
      userId: mayaUser.id,
      organizationId: org.id,
      status: PatientStatus.active,
      firstName: "Maya",
      lastName: "Reyes",
      dateOfBirth: new Date("1986-04-12"),
      email: "patient@demo.health",
      phone: "+1 415 555 0142",
      addressLine1: "742 Evergreen Terrace",
      city: "Oakland",
      state: "CA",
      postalCode: "94612",
      presentingConcerns:
        "Chronic neuropathic pain and sleep disturbance following chemotherapy.",
      treatmentGoals:
        "Reduce nighttime pain, improve sleep continuity, minimize opioid reliance.",
      allergies: ["Ibuprofen", "Sulfa drugs"],
      contraindications: ["Tramadol (prior anxiety reaction)"],
      cannabisHistory: {
        priorUse: true,
        formats: ["tincture", "vape"],
        reportedBenefits: ["better sleep onset"],
        reportedSideEffects: ["mild dry mouth"],
      },
      intakeAnswers: {
        symptoms: { pain: 7, sleep: 4, anxiety: 5 },
        completedSteps: ["demographics", "history", "goals"],
      },
    },
  });

  // Chart summary
  await prisma.chartSummary.upsert({
    where: { patientId: maya.id },
    update: {},
    create: {
      patientId: maya.id,
      completenessScore: 78,
      missingFields: ["current medications", "recent labs"],
      generatedBy: "agent:intake@1.0.0",
      summaryMd: `## Maya Reyes, 38F

**Presenting:** Neuropathic pain (7/10) and sleep disturbance (4/10) post-chemotherapy.

**Goals:** Reduce nighttime pain, improve sleep, minimize opioid use.

**Cannabis history:** Prior tincture and vape use; reports improved sleep onset, mild dry mouth.

**Gaps:** Current medication list not yet provided. No recent labs uploaded.
`,
    },
  });

  // Maya — Outcome logs (past 30 days, pain/sleep/anxiety) with a clearly
  // improving pain trend so the Command Center peek sparkline visually
  // communicates "getting better" to the featured-patient viewer.
  // Pain: 7 → 3 over 30 days, sleep: 4 → 7 (improving), anxiety: ~5 flat.
  for (let day = 29; day >= 0; day--) {
    const progress = (29 - day) / 29; // 0 → 1 over the window
    // Pain: starts 7, ends 3 (lower = better)
    const painBase = 7 - progress * 4;
    const painValue = Math.max(
      1,
      Math.min(10, parseFloat((painBase + (Math.random() - 0.5) * 0.8).toFixed(1)))
    );
    // Sleep: starts 4, ends 7 (higher = better)
    const sleepBase = 4 + progress * 3;
    const sleepValue = Math.max(
      1,
      Math.min(10, parseFloat((sleepBase + (Math.random() - 0.5) * 0.8).toFixed(1)))
    );
    // Anxiety: 5 ± 1 (flat)
    const anxietyValue = parseFloat((4.5 + Math.random() * 1).toFixed(1));

    await prisma.outcomeLog.create({
      data: { patientId: maya.id, metric: "pain", value: painValue, loggedAt: daysAgo(day) },
    });
    await prisma.outcomeLog.create({
      data: { patientId: maya.id, metric: "sleep", value: sleepValue, loggedAt: daysAgo(day) },
    });
    await prisma.outcomeLog.create({
      data: { patientId: maya.id, metric: "anxiety", value: anxietyValue, loggedAt: daysAgo(day) },
    });
  }

  // Maya — 2 encounters: 1 completed 7 days ago, 1 scheduled 3 days from now
  const mayaCompletedEncounter = await prisma.encounter.create({
    data: {
      organizationId: org.id,
      patientId: maya.id,
      providerId: provider.id,
      status: EncounterStatus.complete,
      scheduledFor: daysAgo(7),
      startedAt: daysAgo(7),
      completedAt: daysAgo(7),
      modality: "video",
      reason: "Initial cannabis therapy consultation",
    },
  });

  await prisma.encounter.create({
    data: {
      organizationId: org.id,
      patientId: maya.id,
      providerId: provider.id,
      status: EncounterStatus.scheduled,
      scheduledFor: daysFromNow(3),
      modality: "video",
      reason: "Follow-up: dosage adjustment and sleep review",
    },
  });

  // Maya — Finalized note on the completed encounter
  await prisma.note.create({
    data: {
      encounterId: mayaCompletedEncounter.id,
      authorUserId: clinicianUser.id,
      status: NoteStatus.finalized,
      aiDrafted: true,
      aiConfidence: 0.92,
      finalizedAt: daysAgo(7),
      blocks: [
        {
          type: "summary",
          heading: "Summary",
          body: "38F with chronic neuropathic pain and sleep disturbance post-chemotherapy. Prior cannabis experience with tinctures and vape cartridges.",
        },
        {
          type: "findings",
          heading: "Relevant Findings",
          body: "Pain 7/10, sleep quality 4/10, anxiety 5/10. Currently using OTC ibuprofen PRN. No current prescription cannabis.",
        },
        {
          type: "assessment",
          heading: "Assessment",
          body: "Chronic neuropathic pain syndrome with secondary insomnia. Good candidate for cannabis-assisted therapy given prior positive response and minimal side effects.",
        },
        {
          type: "plan",
          heading: "Plan",
          body: "Start low-THC:high-CBD tincture (5mg THC / 20mg CBD) 1 hour before bedtime. Keep pain/sleep diary. Upload recent labs before next visit.",
        },
        {
          type: "followUp",
          heading: "Follow-up",
          body: "Video follow-up in 2 weeks to assess response and titrate if needed.",
        },
      ],
      narrative: null,
    },
  });

  // Maya — 3 documents
  await prisma.document.create({
    data: {
      organizationId: org.id,
      patientId: maya.id,
      kind: DocumentKind.lab,
      originalName: "Lab_Results_CBC.pdf",
      mimeType: "application/pdf",
      sizeBytes: 245_760,
      storageKey: `docs/${org.id}/${maya.id}/lab_results_cbc.pdf`,
      tags: ["lab", "CBC"],
      aiClassified: true,
      aiTags: ["complete blood count", "hematology"],
      aiConfidence: 0.95,
      needsReview: false,
      createdAt: daysAgo(14),
    },
  });
  await prisma.document.create({
    data: {
      organizationId: org.id,
      patientId: maya.id,
      kind: DocumentKind.letter,
      originalName: "Oncology_Referral_Letter.pdf",
      mimeType: "application/pdf",
      sizeBytes: 128_000,
      storageKey: `docs/${org.id}/${maya.id}/oncology_referral_letter.pdf`,
      tags: ["referral", "oncology"],
      aiClassified: true,
      aiTags: ["referral letter", "oncology", "integrative medicine"],
      aiConfidence: 0.88,
      needsReview: false,
      createdAt: daysAgo(21),
    },
  });
  await prisma.document.create({
    data: {
      organizationId: org.id,
      patientId: maya.id,
      kind: DocumentKind.image,
      originalName: "Sleep_Diary_Photo.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1_024_000,
      storageKey: `docs/${org.id}/${maya.id}/sleep_diary_photo.jpg`,
      tags: [],
      aiClassified: false,
      aiTags: [],
      aiConfidence: null,
      needsReview: true,
      createdAt: daysAgo(3),
    },
  });

  // Maya — 3 assessment responses (PHQ-9, GAD-7, Pain VAS)
  const phq9 = await prisma.assessment.upsert({
    where: { slug: "phq-9" },
    update: {},
    create: {
      slug: "phq-9",
      title: "PHQ-9",
      description: "Patient Health Questionnaire — depression screening.",
      schema: { items: 9, scale: "0-3" },
    },
  });
  const gad7 = await prisma.assessment.upsert({
    where: { slug: "gad-7" },
    update: {},
    create: {
      slug: "gad-7",
      title: "GAD-7",
      description: "Generalized Anxiety Disorder scale.",
      schema: { items: 7, scale: "0-3" },
    },
  });
  const painVas = await prisma.assessment.upsert({
    where: { slug: "pain-vas" },
    update: {},
    create: {
      slug: "pain-vas",
      title: "Pain VAS",
      description: "Visual analog pain scale (0-10).",
      schema: { items: 1, scale: "0-10" },
    },
  });
  const sleepQuality = await prisma.assessment.upsert({
    where: { slug: "sleep-quality" },
    update: {},
    create: {
      slug: "sleep-quality",
      title: "Sleep Quality",
      description:
        "Pittsburgh Sleep Quality Index — subjective sleep quality screening.",
      schema: { items: 7, scale: "0-3" },
    },
  });

  // EMR-066: validated assessment library expansion
  const expandedAssessments = [
    { slug: "isi", title: "ISI (Insomnia)", description: "Insomnia Severity Index — 7-item sleep difficulty screen.", schema: { items: 7, scale: "0-4" } },
    { slug: "pss-10", title: "PSS-10 (Stress)", description: "Perceived Stress Scale — 10 items, past month.", schema: { items: 10, scale: "0-4" } },
    { slug: "epworth", title: "Epworth Sleepiness Scale", description: "Daytime sleepiness across 8 daily situations.", schema: { items: 8, scale: "0-3" } },
    { slug: "audit-c", title: "AUDIT-C (Alcohol)", description: "3-item alcohol use screen.", schema: { items: 3, scale: "0-4" } },
    { slug: "cudit-r", title: "CUDIT-R (Cannabis Use)", description: "Cannabis Use Disorders Identification Test (revised).", schema: { items: 8, scale: "0-4" } },
    { slug: "promis-pain", title: "PROMIS Pain Interference", description: "6-item pain interference, past week.", schema: { items: 6, scale: "1-5" } },
    { slug: "phq-2", title: "PHQ-2 (Quick Depression Screen)", description: "Two-question rapid depression screen.", schema: { items: 2, scale: "0-3" } },
  ];
  for (const a of expandedAssessments) {
    await prisma.assessment.upsert({
      where: { slug: a.slug },
      update: {},
      create: a,
    });
  }

  await prisma.assessmentResponse.create({
    data: {
      assessmentId: phq9.id,
      patientId: maya.id,
      answers: [1, 1, 2, 1, 0, 1, 1, 0, 1],
      score: 8,
      interpretation: "Mild depression",
      submittedAt: daysAgo(7),
    },
  });
  await prisma.assessmentResponse.create({
    data: {
      assessmentId: gad7.id,
      patientId: maya.id,
      answers: [2, 2, 2, 2, 1, 2, 1],
      score: 12,
      interpretation: "Moderate anxiety",
      submittedAt: daysAgo(7),
    },
  });
  await prisma.assessmentResponse.create({
    data: {
      assessmentId: painVas.id,
      patientId: maya.id,
      answers: [6],
      score: 6,
      interpretation: "Moderate pain",
      submittedAt: daysAgo(7),
    },
  });

  // ────────────────────────────────────────────────────────────
  // Maya — 4 distinct message threads showcasing Correspondence Nurse
  // triage (dosing, side effect, gratitude, refill)
  // ────────────────────────────────────────────────────────────

  // Thread 1: Dosing question (resolved) — shows a classic back-and-forth
  const mayaThread = await prisma.messageThread.create({
    data: {
      patientId: maya.id,
      subject: "Dosing question — tincture + evening ibuprofen",
      lastMessageAt: daysAgo(2),
      triageUrgency: "routine",
      triageCategory: "dosing_question",
      triageSafetyFlags: [],
      triageSummary:
        "Maya asked about route of administration for her THC:CBD tincture and whether it's safe with her evening ibuprofen. Resolved.",
      triagedAt: daysAgo(3),
    },
  });
  await prisma.message.create({
    data: {
      threadId: mayaThread.id,
      senderUserId: clinicianUser.id,
      status: MessageStatus.read,
      body: "Hi Maya! Welcome to Leafjourney. I'm Dr. Okafor and I'll be your care provider. Feel free to reach out any time with questions about your treatment plan.",
      aiDrafted: false,
      sentAt: daysAgo(5),
      createdAt: daysAgo(5),
    },
  });
  await prisma.message.create({
    data: {
      threadId: mayaThread.id,
      senderUserId: mayaUser.id,
      status: MessageStatus.read,
      body: "Thank you Dr. Okafor! Quick question — for the tincture you recommended, should I take it sublingually or can I add it to tea? Also, is it okay to take it with my evening ibuprofen?",
      aiDrafted: false,
      sentAt: daysAgo(3),
      createdAt: daysAgo(3),
    },
  });
  await prisma.message.create({
    data: {
      threadId: mayaThread.id,
      senderUserId: clinicianUser.id,
      status: MessageStatus.sent,
      body: "Great questions! Sublingual is preferred — hold it under your tongue for 60-90 seconds before swallowing for the fastest absorption (15-20 min to onset). Adding it to tea works too but onset will be slower (45-60 min). Taking it alongside ibuprofen is fine at this dose. Let me know how your first week goes.",
      aiDrafted: false,
      sentAt: daysAgo(2),
      createdAt: daysAgo(2),
    },
  });

  // Thread 2: Side effect report — NEEDS PROVIDER REVIEW (AI draft ready)
  const mayaSideEffectThread = await prisma.messageThread.create({
    data: {
      patientId: maya.id,
      subject: "Feeling groggy in the mornings",
      lastMessageAt: daysAgo(0),
      triageUrgency: "high",
      triageCategory: "side_effect",
      triageSafetyFlags: [],
      triageSummary:
        "Maya reports morning grogginess on her current 5mg THC + 2.5mg CBN bedtime tincture. Pain is improving but she feels 'drugged' until 10am. May need dose reduction or earlier timing.",
      triagedAt: daysAgo(0),
    },
  });
  await prisma.message.create({
    data: {
      threadId: mayaSideEffectThread.id,
      senderUserId: mayaUser.id,
      status: MessageStatus.sent,
      body: "Hi Dr. Okafor, I wanted to check in. The tincture has been helping my pain a lot (down to about a 3 from a 6), and I'm sleeping better too — thank you! But I've been feeling pretty groggy in the mornings, like I can't shake it until 10am or so. Is this normal? Should I be worried?",
      aiDrafted: false,
      sentAt: daysAgo(0),
      createdAt: daysAgo(0),
    },
  });
  await prisma.message.create({
    data: {
      threadId: mayaSideEffectThread.id,
      status: MessageStatus.draft,
      body: "Hi Maya — really glad to hear your pain is down to a 3 and your sleep is improving. The morning grogginess you're describing is a common effect of the CBN in your bedtime tincture, especially in the first 1-2 weeks as your body adjusts. A few things we can try: (1) move your dose to 60-90 min before bed instead of right before sleep — this gives the CBN more time to peak and wear off by morning, (2) if it's still happening next week, we can drop the CBN component by half. Nothing to worry about, but I want to hear how it's going. Can you give it a few nights with the earlier timing and message me on Monday?",
      aiDrafted: true,
      senderAgent: "correspondenceNurse:1.0.0",
      createdAt: daysAgo(0),
    },
  });

  // Thread 3: Gratitude / positive update — LOW urgency
  const mayaGratitudeThread = await prisma.messageThread.create({
    data: {
      patientId: maya.id,
      subject: "First pain-free day!",
      lastMessageAt: daysAgo(6),
      triageUrgency: "low",
      triageCategory: "gratitude",
      triageSafetyFlags: [],
      triageSummary:
        "Maya reports her first pain-free day since starting cannabis therapy. Positive update — reinforce and encourage.",
      triagedAt: daysAgo(6),
    },
  });
  await prisma.message.create({
    data: {
      threadId: mayaGratitudeThread.id,
      senderUserId: mayaUser.id,
      status: MessageStatus.read,
      body: "I had to share — yesterday was my first pain-free day in 8 months. I took my daughter to the park and walked 3 miles without stopping. I literally cried in the car afterward. Thank you for everything.",
      aiDrafted: false,
      sentAt: daysAgo(7),
      createdAt: daysAgo(7),
    },
  });
  await prisma.message.create({
    data: {
      threadId: mayaGratitudeThread.id,
      senderUserId: clinicianUser.id,
      status: MessageStatus.sent,
      body: "Maya, this message made my whole week. Three miles with your daughter — that's exactly what this is all for. Keep logging your check-ins so we can see the pattern. So proud of you.",
      aiDrafted: false,
      sentAt: daysAgo(6),
      createdAt: daysAgo(6),
    },
  });

  // Thread 4: Refill request — ROUTINE
  const mayaRefillThread = await prisma.messageThread.create({
    data: {
      patientId: maya.id,
      subject: "Running low on my tincture",
      lastMessageAt: daysAgo(1),
      triageUrgency: "routine",
      triageCategory: "refill_request",
      triageSafetyFlags: [],
      triageSummary:
        "Maya has about 5 days of tincture left. Standard refill. Last 30-day adherence was 92% (good). Safe to refill.",
      triagedAt: daysAgo(1),
    },
  });
  await prisma.message.create({
    data: {
      threadId: mayaRefillThread.id,
      senderUserId: mayaUser.id,
      status: MessageStatus.sent,
      body: "Hi! I have about 5 days of tincture left and wanted to request a refill. Same pharmacy as last time. Thanks!",
      aiDrafted: false,
      sentAt: daysAgo(1),
      createdAt: daysAgo(1),
    },
  });
  await prisma.message.create({
    data: {
      threadId: mayaRefillThread.id,
      status: MessageStatus.draft,
      body: "Hi Maya, refill authorized and being sent to your usual pharmacy today — should be ready tomorrow afternoon. Your adherence has been excellent (92% the last 30 days, which is impressive) and your pain trend is moving in the right direction, so we'll keep the regimen exactly as-is. You'll get a text from the pharmacy when it's ready.",
      aiDrafted: true,
      senderAgent: "correspondenceNurse:1.0.0",
      createdAt: daysAgo(1),
    },
  });

  // Maya — 5 tasks (2 completed, 2 open, 1 snoozed)
  await prisma.task.create({
    data: {
      organizationId: org.id,
      patientId: maya.id,
      title: "Upload current medication list",
      description:
        "Patient needs to provide a list of all current medications including OTC supplements.",
      status: TaskStatus.open,
      assigneeRole: Role.patient,
      assigneeUserId: mayaUser.id,
      dueAt: daysFromNow(5),
    },
  });
  await prisma.task.create({
    data: {
      organizationId: org.id,
      patientId: maya.id,
      title: "Complete sleep quality assessment",
      description: "Complete the Pittsburgh Sleep Quality Index questionnaire.",
      status: TaskStatus.open,
      assigneeRole: Role.patient,
      assigneeUserId: mayaUser.id,
      dueAt: daysFromNow(7),
    },
  });
  await prisma.task.create({
    data: {
      organizationId: org.id,
      patientId: maya.id,
      title: "Review initial intake form",
      description: "Clinician to review Maya's completed intake answers.",
      status: TaskStatus.done,
      assigneeRole: Role.clinician,
      assigneeUserId: clinicianUser.id,
      completedAt: daysAgo(8),
      createdAt: daysAgo(14),
    },
  });
  await prisma.task.create({
    data: {
      organizationId: org.id,
      patientId: maya.id,
      title: "Classify uploaded sleep diary image",
      description: "AI document organizer should classify Sleep_Diary_Photo.jpg.",
      status: TaskStatus.done,
      assigneeRole: Role.system,
      completedAt: daysAgo(3),
      createdAt: daysAgo(3),
    },
  });
  await prisma.task.create({
    data: {
      organizationId: org.id,
      patientId: maya.id,
      title: "Follow up on lab results interpretation",
      description:
        "Waiting for oncology team to provide interpretation of CBC results before next visit.",
      status: TaskStatus.snoozed,
      assigneeRole: Role.clinician,
      assigneeUserId: clinicianUser.id,
      dueAt: daysFromNow(10),
      createdAt: daysAgo(10),
    },
  });

  // ------------------------------------------------------------------
  // Patient 2 — James Chen (active)
  // ------------------------------------------------------------------
  const jamesUser = await prisma.user.upsert({
    where: { email: "james.chen@demo.health" },
    update: { passwordHash },
    create: {
      email: "james.chen@demo.health",
      passwordHash,
      firstName: "James",
      lastName: "Chen",
      memberships: {
        create: { organizationId: org.id, role: Role.patient },
      },
    },
  });

  const james = await prisma.patient.upsert({
    where: { userId: jamesUser.id },
    update: {},
    create: {
      userId: jamesUser.id,
      organizationId: org.id,
      status: PatientStatus.active,
      firstName: "James",
      lastName: "Chen",
      dateOfBirth: new Date("1978-11-03"),
      email: "james.chen@demo.health",
      phone: "+1 510 555 0198",
      addressLine1: "88 Lakeshore Ave",
      city: "San Francisco",
      state: "CA",
      postalCode: "94110",
      presentingConcerns:
        "Chronic insomnia and anxiety post-surgery. Difficulty falling asleep and staying asleep; generalized anxiety that worsened after knee replacement surgery 6 months ago.",
      treatmentGoals:
        "Improve sleep onset and duration, reduce reliance on anxiety medications, explore cannabis-based alternatives.",
      cannabisHistory: {
        priorUse: true,
        formats: ["edibles", "tinctures"],
        reportedBenefits: ["relaxation", "sleep onset improvement"],
        reportedSideEffects: ["occasional grogginess next morning"],
      },
      intakeAnswers: {
        symptoms: { sleep: 3, anxiety: 7, pain: 2 },
        completedSteps: ["demographics", "history", "goals"],
      },
    },
  });

  // James — Chart summary at 62%
  await prisma.chartSummary.upsert({
    where: { patientId: james.id },
    update: {},
    create: {
      patientId: james.id,
      completenessScore: 62,
      missingFields: [
        "surgical history details",
        "current anxiety medication list",
        "recent sleep study results",
      ],
      generatedBy: "agent:intake@1.0.0",
      summaryMd: `## James Chen, 47M

**Presenting:** Chronic insomnia and generalized anxiety following knee replacement surgery 6 months ago.

**Goals:** Improve sleep, reduce anxiety medication reliance, explore cannabis alternatives.

**Cannabis history:** Prior edibles and tincture use; reports relaxation and better sleep onset. Occasional next-morning grogginess.

**Gaps:** Surgical history details missing. Anxiety medication list needed. No recent sleep study on file.
`,
    },
  });

  // James — 1 scheduled encounter
  await prisma.encounter.create({
    data: {
      organizationId: org.id,
      patientId: james.id,
      providerId: provider.id,
      status: EncounterStatus.scheduled,
      scheduledFor: daysFromNow(5),
      modality: "video",
      reason: "Initial consultation: insomnia and anxiety management",
    },
  });

  // James — Outcome logs for the last 7 days (sleep and anxiety)
  for (let day = 6; day >= 0; day--) {
    await prisma.outcomeLog.create({
      data: {
        patientId: james.id,
        metric: "sleep",
        value: parseFloat((2 + Math.random() * 3).toFixed(1)),
        loggedAt: daysAgo(day),
      },
    });
    await prisma.outcomeLog.create({
      data: {
        patientId: james.id,
        metric: "anxiety",
        value: parseFloat((5 + Math.random() * 3).toFixed(1)),
        loggedAt: daysAgo(day),
      },
    });
  }

  // ────────────────────────────────────────────────────────────
  // James — 3 threads showcasing the full triage spectrum including
  // an EMERGENCY flag (the single most important demonstration)
  // ────────────────────────────────────────────────────────────

  // Thread 1: Welcome / intake follow-up
  const jamesThread = await prisma.messageThread.create({
    data: {
      patientId: james.id,
      subject: "Welcome to Leafjourney",
      lastMessageAt: daysAgo(1),
      triageUrgency: "routine",
      triageCategory: "general_question",
      triageSafetyFlags: [],
      triageSummary: "New patient welcome thread. Intake in progress.",
      triagedAt: daysAgo(1),
    },
  });
  await prisma.message.create({
    data: {
      threadId: jamesThread.id,
      senderUserId: clinicianUser.id,
      status: MessageStatus.sent,
      body: "Hi James, welcome to Leafjourney! I'm Dr. Okafor. I've reviewed your intake so far and I'm looking forward to our consultation. In the meantime, please continue logging your sleep and anxiety levels daily so we have good baseline data.",
      aiDrafted: false,
      sentAt: daysAgo(1),
      createdAt: daysAgo(1),
    },
  });

  // Thread 2: EMERGENCY — the headline demonstration
  // Patient mentions chest pain + shortness of breath. The Correspondence
  // Nurse MUST catch this and force "emergency" urgency regardless of
  // anything else. The draft must instruct the patient to call 911.
  const jamesEmergencyThread = await prisma.messageThread.create({
    data: {
      patientId: james.id,
      subject: "Chest pain — should I be worried?",
      lastMessageAt: new Date(Date.now() - 15 * 60 * 1000), // 15 min ago
      triageUrgency: "emergency",
      triageCategory: "symptom_report",
      triageSafetyFlags: [
        '🚨 Emergency keyword: "chest pain"',
        '🚨 Emergency keyword: "difficulty breathing"',
      ],
      triageSummary:
        "🚨 EMERGENCY — James reports chest pain and difficulty catching his breath after his morning dose. Must instruct him to call 911 or go to the ER immediately. Do not attempt to manage this in messaging.",
      triagedAt: new Date(Date.now() - 15 * 60 * 1000),
    },
  });
  await prisma.message.create({
    data: {
      threadId: jamesEmergencyThread.id,
      senderUserId: jamesUser.id,
      status: MessageStatus.sent,
      body: "I'm feeling some chest pain and having a little difficulty catching my breath. It started about 20 minutes after I took my morning dose. Should I be worried? Should I stop the medication?",
      aiDrafted: false,
      sentAt: new Date(Date.now() - 20 * 60 * 1000),
      createdAt: new Date(Date.now() - 20 * 60 * 1000),
    },
  });
  await prisma.message.create({
    data: {
      threadId: jamesEmergencyThread.id,
      status: MessageStatus.draft,
      body:
        "James — I want you to stop what you're doing and call 911 or go to the nearest emergency room RIGHT NOW. Chest pain plus difficulty breathing can be a sign of a serious problem that I can't safely evaluate through a message. Don't drive yourself — call 911 or have someone drive you.\n\nOnce you're being seen, please have someone message me so I know you're safe. We'll figure out what happened and adjust your care together afterward, but the priority right now is getting you in front of an ER doctor.",
      aiDrafted: true,
      senderAgent: "correspondenceNurse:1.0.0",
      createdAt: new Date(Date.now() - 15 * 60 * 1000),
    },
  });

  // Thread 3: Billing question — routine
  const jamesBillingThread = await prisma.messageThread.create({
    data: {
      patientId: james.id,
      subject: "Question about my bill",
      lastMessageAt: daysAgo(4),
      triageUrgency: "routine",
      triageCategory: "billing_question",
      triageSafetyFlags: [],
      triageSummary:
        "James is confused about a $64 patient responsibility charge on his recent Aetna EOB. This is his plan's deductible share on a 99204 visit. Needs plain-language explanation.",
      triagedAt: daysAgo(4),
    },
  });
  await prisma.message.create({
    data: {
      threadId: jamesBillingThread.id,
      senderUserId: jamesUser.id,
      status: MessageStatus.read,
      body: "Hi, I got a bill for $64 from my visit a few weeks ago and I'm confused. I thought Aetna covered everything. Can someone explain what this is for?",
      aiDrafted: false,
      sentAt: daysAgo(5),
      createdAt: daysAgo(5),
    },
  });
  await prisma.message.create({
    data: {
      threadId: jamesBillingThread.id,
      senderUserId: clinicianUser.id,
      status: MessageStatus.sent,
      body: "Hi James, totally understandable question. Your plan with Aetna has a $3,000 annual deductible — that means you pay the first $3,000 before your plan starts fully covering things. The $64 goes toward that deductible, not to us beyond the network-allowed rate. Every dollar you pay counts toward meeting your deductible for the year. You can pay it directly through your patient portal billing tab. Let me know if you have other questions.",
      aiDrafted: false,
      sentAt: daysAgo(4),
      createdAt: daysAgo(4),
    },
  });

  // ------------------------------------------------------------------
  // Patient 3 — Sarah Thompson (prospect, intake just started)
  // ------------------------------------------------------------------
  const sarahUser = await prisma.user.upsert({
    where: { email: "sarah.thompson@demo.health" },
    update: { passwordHash },
    create: {
      email: "sarah.thompson@demo.health",
      passwordHash,
      firstName: "Sarah",
      lastName: "Thompson",
      memberships: {
        create: { organizationId: org.id, role: Role.patient },
      },
    },
  });

  const sarah = await prisma.patient.upsert({
    where: { userId: sarahUser.id },
    update: {},
    create: {
      userId: sarahUser.id,
      organizationId: org.id,
      status: PatientStatus.prospect,
      firstName: "Sarah",
      lastName: "Thompson",
      dateOfBirth: new Date("1992-07-22"),
      email: "sarah.thompson@demo.health",
      phone: "+1 408 555 0276",
      city: "San Jose",
      state: "CA",
      postalCode: "95112",
      // No clinical data yet — prospect with only demographics
      presentingConcerns: null,
      treatmentGoals: null,
      cannabisHistory: Prisma.DbNull,
      intakeAnswers: {
        completedSteps: ["demographics"],
      },
    },
  });

  // Sarah — No chart summary (prospect)
  // Sarah — No encounters

  // Sarah — 1 task: Complete your intake
  await prisma.task.create({
    data: {
      organizationId: org.id,
      patientId: sarah.id,
      title: "Complete your intake",
      description:
        "Please finish filling out your intake form so we can prepare for your first consultation.",
      status: TaskStatus.open,
      assigneeRole: Role.patient,
      assigneeUserId: sarahUser.id,
      dueAt: daysFromNow(14),
    },
  });

  // ------------------------------------------------------------------
  // Agent Jobs (various states)
  // ------------------------------------------------------------------

  // Succeeded: Intake agent for Maya
  await prisma.agentJob.create({
    data: {
      organizationId: org.id,
      workflowName: "patient.intake",
      agentName: "intake-agent",
      eventName: "patient.intake.completed",
      input: { patientId: maya.id },
      output: { chartSummaryId: "generated", completeness: 78 },
      status: AgentJobStatus.succeeded,
      attempts: 1,
      startedAt: daysAgo(10),
      completedAt: daysAgo(10),
      createdAt: daysAgo(10),
    },
  });

  // Succeeded: Document organizer for Maya
  await prisma.agentJob.create({
    data: {
      organizationId: org.id,
      workflowName: "document.classify",
      agentName: "document-organizer-agent",
      eventName: "document.uploaded",
      input: { patientId: maya.id, documentName: "Lab_Results_CBC.pdf" },
      output: { kind: "lab", confidence: 0.95, tags: ["CBC", "hematology"] },
      status: AgentJobStatus.succeeded,
      attempts: 1,
      startedAt: daysAgo(14),
      completedAt: daysAgo(14),
      createdAt: daysAgo(14),
    },
  });

  // Needs approval: Messaging assistant draft for James
  await prisma.agentJob.create({
    data: {
      organizationId: org.id,
      workflowName: "messaging.draft",
      agentName: "messaging-assistant-agent",
      eventName: "message.draft.requested",
      input: {
        patientId: james.id,
        threadSubject: "Pre-visit preparation checklist",
      },
      output: {
        draftBody:
          "Hi James, here are a few things to prepare before your upcoming visit: (1) List all current medications including dosages, (2) Note your average sleep/wake times over the past week, (3) Write down any questions you'd like to discuss.",
      },
      status: AgentJobStatus.needs_approval,
      requiresApproval: true,
      approvalRequiredAt: daysAgo(1),
      attempts: 1,
      startedAt: daysAgo(1),
      createdAt: daysAgo(1),
    },
  });

  // Failed: Research query with no results
  await prisma.agentJob.create({
    data: {
      organizationId: org.id,
      workflowName: "research.query",
      agentName: "research-agent",
      eventName: "research.query.submitted",
      input: {
        queryText:
          "Efficacy of THCV isolate for post-surgical anxiety in adults over 60",
      },
      output: Prisma.DbNull,
      status: AgentJobStatus.failed,
      attempts: 3,
      maxAttempts: 3,
      lastError:
        "No relevant research results found after 3 attempts. The query may be too specific — consider broadening the search terms.",
      startedAt: daysAgo(2),
      completedAt: daysAgo(2),
      createdAt: daysAgo(2),
    },
  });

  // Pending: Outcome tracker for Maya
  await prisma.agentJob.create({
    data: {
      organizationId: org.id,
      workflowName: "outcomes.weekly-summary",
      agentName: "outcome-tracker-agent",
      eventName: "outcomes.summary.scheduled",
      input: { patientId: maya.id, period: "weekly" },
      output: Prisma.DbNull,
      status: AgentJobStatus.pending,
      attempts: 0,
      runAfter: daysFromNow(1),
      createdAt: new Date(),
    },
  });

  // ------------------------------------------------------------------
  // Practice launch status
  // ------------------------------------------------------------------
  await prisma.practiceLaunchStatus.upsert({
    where: { organizationId: org.id },
    update: {},
    create: {
      organizationId: org.id,
      readinessScore: 72,
      blockers: ["Provider credentialing pending state verification"],
      nextSteps: [
        "Confirm first clinic hours",
        "Invite intake operator",
        "Review consent templates",
      ],
    },
  });

  // ------------------------------------------------------------------
  // Cannabis Products
  // ------------------------------------------------------------------
  console.log("Seeding cannabis products and dosing data...");

  const thcOil = await prisma.cannabisProduct.create({
    data: {
      organizationId: org.id,
      name: "THC Infused Oil 10mg/mL",
      productType: ProductType.oil,
      route: DeliveryRoute.sublingual,
      thcConcentration: 10,
      cbdConcentration: 0,
      thcCbdRatio: "10:0",
      concentrationUnit: "mg/mL",
    },
  });

  const balancedTincture = await prisma.cannabisProduct.create({
    data: {
      organizationId: org.id,
      name: "Balanced THC:CBD Tincture",
      productType: ProductType.tincture,
      route: DeliveryRoute.sublingual,
      thcConcentration: 5,
      cbdConcentration: 5,
      thcCbdRatio: "1:1",
      concentrationUnit: "mg/mL",
    },
  });

  const cbdCapsules = await prisma.cannabisProduct.create({
    data: {
      organizationId: org.id,
      name: "CBD Isolate Capsules 25mg",
      productType: ProductType.capsule,
      route: DeliveryRoute.oral,
      thcConcentration: 0,
      cbdConcentration: 25,
      thcCbdRatio: "0:1",
      concentrationUnit: "mg/unit",
    },
  });

  // ------------------------------------------------------------------
  // Dosing Regimen for Maya Reyes (balanced tincture)
  // ------------------------------------------------------------------
  const mayaRegimen = await prisma.dosingRegimen.create({
    data: {
      patientId: maya.id,
      productId: balancedTincture.id,
      prescribedById: clinicianUser.id,
      volumePerDose: 0.5,
      volumeUnit: "mL",
      frequencyPerDay: 2,
      timingInstructions: "Morning and 1 hour before bed",
      calculatedThcMgPerDose: 2.5,
      calculatedCbdMgPerDose: 2.5,
      calculatedThcMgPerDay: 5,
      calculatedCbdMgPerDay: 5,
      patientInstructions:
        "Take 0.5 mL (half a dropper) under the tongue twice daily — once in the morning and once before bed. Hold under tongue for 60 seconds before swallowing. This equals 2.5 mg THC + 2.5 mg CBD per dose (5 mg each per day).",
      clinicianNotes:
        "Starting low dose 1:1 for sleep and pain. Reassess in 2 weeks. May titrate up to 1 mL if tolerated.",
      startDate: daysAgo(3),
    },
  });

  // ------------------------------------------------------------------
  // Dose Logs for Maya (past 3 days)
  // ------------------------------------------------------------------
  // Day 3 ago — morning dose
  await prisma.doseLog.create({
    data: {
      patientId: maya.id,
      regimenId: mayaRegimen.id,
      actualVolume: 0.5,
      volumeUnit: "mL",
      estimatedThcMg: 2.5,
      estimatedCbdMg: 2.5,
      route: DeliveryRoute.sublingual,
      note: "First dose, no issues",
      loggedAt: daysAgo(3),
    },
  });
  // Day 2 ago — morning and evening doses
  await prisma.doseLog.create({
    data: {
      patientId: maya.id,
      regimenId: mayaRegimen.id,
      actualVolume: 0.5,
      volumeUnit: "mL",
      estimatedThcMg: 2.5,
      estimatedCbdMg: 2.5,
      route: DeliveryRoute.sublingual,
      note: "Morning dose, felt calm",
      loggedAt: daysAgo(2),
    },
  });
  await prisma.doseLog.create({
    data: {
      patientId: maya.id,
      regimenId: mayaRegimen.id,
      actualVolume: 0.5,
      volumeUnit: "mL",
      estimatedThcMg: 2.5,
      estimatedCbdMg: 2.5,
      route: DeliveryRoute.sublingual,
      note: "Evening dose, slept better",
      loggedAt: daysAgo(1),
    },
  });

  // ------------------------------------------------------------------
  // Maya — Conventional Medications
  // ------------------------------------------------------------------
  console.log("Seeding Maya's conventional medications...");

  await prisma.patientMedication.create({
    data: {
      patientId: maya.id,
      name: "Sertraline",
      genericName: "sertraline hydrochloride",
      type: MedicationType.prescription,
      dosage: "50mg daily",
      prescriber: "Dr. Patel (PCP)",
      active: true,
      startDate: daysAgo(90),
      notes: "For anxiety management. Stable dose for 3 months.",
    },
  });

  await prisma.patientMedication.create({
    data: {
      patientId: maya.id,
      name: "Melatonin",
      genericName: "melatonin",
      type: MedicationType.supplement,
      dosage: "3mg nightly",
      active: true,
      startDate: daysAgo(30),
      notes: "OTC supplement for sleep onset.",
    },
  });

  await prisma.patientMedication.create({
    data: {
      patientId: maya.id,
      name: "Acetaminophen",
      genericName: "acetaminophen",
      type: MedicationType.otc,
      dosage: "500mg as needed",
      active: true,
      startDate: daysAgo(60),
      notes: "PRN for breakthrough pain. Max 4g/day.",
    },
  });

  // ------------------------------------------------------------------
  // Practice Management — Fee Schedule, Appointments, Claims, Payments
  // ------------------------------------------------------------------

  // Fee schedule — common E&M and cannabis counseling codes
  const feeScheduleEntries = [
    { cptCode: "99203", description: "New patient visit, 30-44 min", defaultChargeCents: 28500, category: "E&M" },
    { cptCode: "99204", description: "New patient visit, 45-59 min", defaultChargeCents: 42500, category: "E&M" },
    { cptCode: "99205", description: "New patient visit, 60-74 min", defaultChargeCents: 56500, category: "E&M" },
    { cptCode: "99213", description: "Established patient visit, 20-29 min", defaultChargeCents: 15500, category: "E&M" },
    { cptCode: "99214", description: "Established patient visit, 30-39 min", defaultChargeCents: 22500, category: "E&M" },
    { cptCode: "99215", description: "Established patient visit, 40-54 min", defaultChargeCents: 32500, category: "E&M" },
    { cptCode: "99406", description: "Tobacco cessation counseling, 3-10 min", defaultChargeCents: 2500, category: "Counseling" },
    { cptCode: "99407", description: "Tobacco cessation counseling, >10 min", defaultChargeCents: 4500, category: "Counseling" },
    { cptCode: "G0447", description: "Behavioral counseling for obesity, 15 min", defaultChargeCents: 3500, category: "Counseling" },
    { cptCode: "96160", description: "Health risk assessment, patient-focused", defaultChargeCents: 1500, category: "Assessment" },
    { cptCode: "99401", description: "Preventive counseling, 15 min", defaultChargeCents: 5500, category: "Counseling" },
    { cptCode: "99402", description: "Preventive counseling, 30 min", defaultChargeCents: 10500, category: "Counseling" },
  ];

  for (const entry of feeScheduleEntries) {
    await prisma.feeScheduleEntry.upsert({
      where: {
        organizationId_cptCode: {
          organizationId: org.id,
          cptCode: entry.cptCode,
        },
      },
      update: {},
      create: {
        organizationId: org.id,
        ...entry,
      },
    });
  }

  // Idempotency: cleanIdempotent() at the top of main() wipes all of
  // the billing tables (payments, financial events, claims, statements,
  // payment plans, coverage, stored payment methods) so we can safely
  // recreate them with .create() on every deploy.

  // Upcoming appointments for today + this week (demo schedule)
  const appointmentSeeds = [
    // Today
    { patientId: maya.id, hoursFromNow: -2, durationMin: 30, modality: "in_person", status: AppointmentStatus.completed },
    { patientId: james.id, hoursFromNow: 1, durationMin: 45, modality: "video", status: AppointmentStatus.confirmed },
    { patientId: sarah.id, hoursFromNow: 3, durationMin: 30, modality: "in_person", status: AppointmentStatus.confirmed },
    // Tomorrow
    { patientId: maya.id, hoursFromNow: 26, durationMin: 30, modality: "video", status: AppointmentStatus.confirmed },
    { patientId: james.id, hoursFromNow: 28, durationMin: 30, modality: "in_person", status: AppointmentStatus.confirmed },
    // Day after
    { patientId: sarah.id, hoursFromNow: 50, durationMin: 45, modality: "in_person", status: AppointmentStatus.confirmed },
    { patientId: maya.id, hoursFromNow: 52, durationMin: 30, modality: "phone", status: AppointmentStatus.requested },
    // Next week
    { patientId: james.id, hoursFromNow: 170, durationMin: 30, modality: "video", status: AppointmentStatus.confirmed },
    { patientId: maya.id, hoursFromNow: 172, durationMin: 30, modality: "in_person", status: AppointmentStatus.confirmed },
  ];

  for (const appt of appointmentSeeds) {
    const start = new Date(Date.now() + appt.hoursFromNow * 60 * 60 * 1000);
    const end = new Date(start.getTime() + appt.durationMin * 60 * 1000);
    await prisma.appointment.create({
      data: {
        patientId: appt.patientId,
        providerId: provider.id,
        status: appt.status,
        startAt: start,
        endAt: end,
        modality: appt.modality,
      },
    });
  }

  // Claims — full lifecycle representation
  const claimSeeds = [
    // Paid claim (Maya, 30 days ago)
    {
      patient: maya,
      encounter: mayaCompletedEncounter,
      status: ClaimStatus.paid,
      cptCodes: [{ code: "99214", label: "Established patient, 30-39 min", units: 1, chargeAmount: 22500 }],
      icd10: [{ code: "G89.29", label: "Other chronic pain" }, { code: "F41.1", label: "Generalized anxiety disorder" }],
      billedAmount: 22500,
      allowedAmount: 18000,
      paidAmount: 14400,
      patientResp: 3600,
      payerName: "Blue Cross Blue Shield",
      serviceDaysAgo: 30,
      paidDaysAgo: 12,
    },
    // Pending claim (Maya, 10 days ago)
    {
      patient: maya,
      encounter: null as any,
      status: ClaimStatus.accepted,
      cptCodes: [{ code: "99213", label: "Established patient, 20-29 min", units: 1, chargeAmount: 15500 }],
      icd10: [{ code: "G47.00", label: "Insomnia, unspecified" }],
      billedAmount: 15500,
      allowedAmount: null,
      paidAmount: 0,
      patientResp: 0,
      payerName: "Blue Cross Blue Shield",
      serviceDaysAgo: 10,
      paidDaysAgo: null,
    },
    // Partially paid with patient balance
    {
      patient: james,
      encounter: null as any,
      status: ClaimStatus.partial,
      cptCodes: [{ code: "99204", label: "New patient visit, 45-59 min", units: 1, chargeAmount: 42500 }],
      icd10: [{ code: "F41.1", label: "Generalized anxiety disorder" }, { code: "F32.9", label: "Major depressive disorder" }],
      billedAmount: 42500,
      allowedAmount: 32000,
      paidAmount: 25600,
      patientResp: 6400,
      payerName: "Aetna",
      serviceDaysAgo: 20,
      paidDaysAgo: 5,
    },
    // Denied claim (needs action)
    {
      patient: sarah,
      encounter: null as any,
      status: ClaimStatus.denied,
      cptCodes: [{ code: "99215", label: "Established patient, 40-54 min", units: 1, chargeAmount: 32500 }],
      icd10: [{ code: "M54.5", label: "Low back pain" }],
      billedAmount: 32500,
      allowedAmount: null,
      paidAmount: 0,
      patientResp: 0,
      payerName: "UnitedHealthcare",
      serviceDaysAgo: 15,
      paidDaysAgo: null,
      denialReason: "Missing prior authorization for extended visit",
    },
    // Submitted, awaiting response
    {
      patient: james,
      encounter: null as any,
      status: ClaimStatus.submitted,
      cptCodes: [{ code: "99213", label: "Established patient, 20-29 min", units: 1, chargeAmount: 15500 }],
      icd10: [{ code: "F41.1", label: "Generalized anxiety disorder" }],
      billedAmount: 15500,
      allowedAmount: null,
      paidAmount: 0,
      patientResp: 0,
      payerName: "Aetna",
      serviceDaysAgo: 3,
      paidDaysAgo: null,
    },
    // Draft (ready to bill — note exists but claim not submitted)
    {
      patient: maya,
      encounter: null as any,
      status: ClaimStatus.draft,
      cptCodes: [{ code: "99214", label: "Established patient, 30-39 min", units: 1, chargeAmount: 22500 }],
      icd10: [{ code: "G89.29", label: "Other chronic pain" }],
      billedAmount: 22500,
      allowedAmount: null,
      paidAmount: 0,
      patientResp: 0,
      payerName: "Blue Cross Blue Shield",
      serviceDaysAgo: 1,
      paidDaysAgo: null,
    },
    // Draft with deliberate scrub issues (no diagnosis, high-level E&M)
    {
      patient: james,
      encounter: null as any,
      status: ClaimStatus.draft,
      cptCodes: [{ code: "99215", label: "Established patient, 40-54 min", units: 1, chargeAmount: 32500 }],
      icd10: [], // missing diagnosis — scrub will flag
      billedAmount: 32500,
      allowedAmount: null,
      paidAmount: 0,
      patientResp: 0,
      payerName: "Aetna",
      serviceDaysAgo: 2,
      paidDaysAgo: null,
    },
    // Draft with stale service date (timely filing risk)
    {
      patient: sarah,
      encounter: null as any,
      status: ClaimStatus.draft,
      cptCodes: [{ code: "99213", label: "Established patient, 20-29 min", units: 1, chargeAmount: 15500 }],
      icd10: [{ code: "G47.00", label: "Insomnia" }],
      billedAmount: 15500,
      allowedAmount: null,
      paidAmount: 0,
      patientResp: 0,
      payerName: "UnitedHealthcare",
      serviceDaysAgo: 95, // past 90-day mark
      paidDaysAgo: null,
    },
    // Aged 91-120 days denied (medical necessity)
    {
      patient: maya,
      encounter: null as any,
      status: ClaimStatus.denied,
      cptCodes: [{ code: "99215", label: "Established patient, 40-54 min", units: 1, chargeAmount: 32500 }],
      icd10: [{ code: "F41.1", label: "Generalized anxiety disorder" }],
      billedAmount: 32500,
      allowedAmount: null,
      paidAmount: 0,
      patientResp: 0,
      payerName: "Blue Cross Blue Shield",
      serviceDaysAgo: 105,
      paidDaysAgo: null,
      denialReason: "Service deemed not medically necessary based on plan policy. Records required for appeal.",
    },
    // Aged 120+ days denied (timely filing)
    {
      patient: james,
      encounter: null as any,
      status: ClaimStatus.denied,
      cptCodes: [{ code: "99213", label: "Established patient, 20-29 min", units: 1, chargeAmount: 15500 }],
      icd10: [{ code: "F32.9", label: "Major depressive disorder" }],
      billedAmount: 15500,
      allowedAmount: null,
      paidAmount: 0,
      patientResp: 0,
      payerName: "Aetna",
      serviceDaysAgo: 135,
      paidDaysAgo: null,
      denialReason: "Claim received past timely filing limit of 90 days.",
    },
    // Aged 61-90 days pending (insurance taking forever)
    {
      patient: sarah,
      encounter: null as any,
      status: ClaimStatus.accepted,
      cptCodes: [{ code: "99214", label: "Established patient, 30-39 min", units: 1, chargeAmount: 22500 }],
      icd10: [{ code: "M54.5", label: "Low back pain" }],
      billedAmount: 22500,
      allowedAmount: null,
      paidAmount: 0,
      patientResp: 0,
      payerName: "UnitedHealthcare",
      serviceDaysAgo: 75,
      paidDaysAgo: null,
    },
    // Denied — modifier issue
    {
      patient: maya,
      encounter: null as any,
      status: ClaimStatus.denied,
      cptCodes: [{ code: "99213", label: "Established patient, 20-29 min", units: 1, chargeAmount: 15500 }],
      icd10: [{ code: "G89.29", label: "Other chronic pain" }],
      billedAmount: 15500,
      allowedAmount: null,
      paidAmount: 0,
      patientResp: 0,
      payerName: "Blue Cross Blue Shield",
      serviceDaysAgo: 25,
      paidDaysAgo: null,
      denialReason: "Modifier 25 required for separate E&M on same day as procedure.",
    },
    // Denied — bundling
    {
      patient: james,
      encounter: null as any,
      status: ClaimStatus.denied,
      cptCodes: [{ code: "99214", label: "Established patient, 30-39 min", units: 1, chargeAmount: 22500 }],
      icd10: [{ code: "F41.1", label: "Generalized anxiety disorder" }],
      billedAmount: 22500,
      allowedAmount: null,
      paidAmount: 0,
      patientResp: 0,
      payerName: "Aetna",
      serviceDaysAgo: 18,
      paidDaysAgo: null,
      denialReason: "Service is bundled into another service performed on the same date per NCCI edits.",
    },
  ];

  for (const claimData of claimSeeds) {
    const serviceDate = new Date(Date.now() - claimData.serviceDaysAgo * 24 * 60 * 60 * 1000);
    const claim = await prisma.claim.create({
      data: {
        organizationId: org.id,
        patientId: claimData.patient.id,
        encounterId: claimData.encounter?.id ?? null,
        providerId: provider.id,
        status: claimData.status,
        cptCodes: claimData.cptCodes,
        icd10Codes: claimData.icd10,
        billedAmountCents: claimData.billedAmount,
        allowedAmountCents: claimData.allowedAmount,
        paidAmountCents: claimData.paidAmount,
        patientRespCents: claimData.patientResp,
        payerName: claimData.payerName,
        claimNumber: `CLM-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
        serviceDate,
        submittedAt: claimData.status !== ClaimStatus.draft ? new Date(serviceDate.getTime() + 24 * 60 * 60 * 1000) : null,
        paidAt: claimData.paidDaysAgo != null ? new Date(Date.now() - claimData.paidDaysAgo * 24 * 60 * 60 * 1000) : null,
        deniedAt: claimData.status === ClaimStatus.denied ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) : null,
        denialReason: claimData.denialReason ?? null,
      },
    });

    // Create payment records for paid/partial claims
    if (claimData.paidAmount > 0) {
      await prisma.payment.create({
        data: {
          claimId: claim.id,
          source: PaymentSource.insurance,
          amountCents: claimData.paidAmount,
          paymentDate: new Date(Date.now() - (claimData.paidDaysAgo ?? 10) * 24 * 60 * 60 * 1000),
          reference: `EFT${Math.random().toString(36).slice(2, 12).toUpperCase()}`,
        },
      });
    }
  }

  console.log("  Practice management: fee schedule + appointments + claims seeded.");

  // ------------------------------------------------------------------
  // Insurance coverage for each patient
  // ------------------------------------------------------------------

  await prisma.patientCoverage.create({
    data: {
      patientId: maya.id,
      type: CoverageType.primary,
      payerName: "Blue Cross Blue Shield",
      payerId: "BCBS-CA",
      memberId: "XJA749382105",
      groupNumber: "GRP-492",
      planName: "BlueShield PPO Gold",
      subscriberName: "Maya Reyes",
      relationshipToSubscriber: "self",
      effectiveDate: new Date("2026-01-01"),
      eligibilityStatus: EligibilityStatus.active,
      eligibilityLastCheckedAt: daysAgo(5),
      copayCents: 2500,
      deductibleCents: 150000,
      deductibleMetCents: 87000,
      outOfPocketMaxCents: 600000,
      outOfPocketMetCents: 142000,
      coinsurancePct: 20,
    },
  });

  await prisma.patientCoverage.create({
    data: {
      patientId: james.id,
      type: CoverageType.primary,
      payerName: "Aetna",
      payerId: "AETNA-COMM",
      memberId: "W293847561",
      groupNumber: "AET-118",
      planName: "Aetna Open Access Silver",
      subscriberName: "James Chen",
      relationshipToSubscriber: "self",
      effectiveDate: new Date("2026-01-01"),
      eligibilityStatus: EligibilityStatus.active,
      eligibilityLastCheckedAt: daysAgo(12),
      copayCents: 4000,
      deductibleCents: 300000,
      deductibleMetCents: 45000,
      outOfPocketMaxCents: 800000,
      outOfPocketMetCents: 76000,
      coinsurancePct: 30,
    },
  });

  await prisma.patientCoverage.create({
    data: {
      patientId: sarah.id,
      type: CoverageType.primary,
      payerName: "UnitedHealthcare",
      payerId: "UHC-CHOICE",
      memberId: "UHC78291045",
      planName: "UHC Choice Plus",
      subscriberName: "Sarah Thompson",
      relationshipToSubscriber: "self",
      effectiveDate: new Date("2026-01-01"),
      eligibilityStatus: EligibilityStatus.active,
      eligibilityLastCheckedAt: daysAgo(20),
      copayCents: 3500,
      deductibleCents: 250000,
      deductibleMetCents: 250000,
      outOfPocketMaxCents: 700000,
      outOfPocketMetCents: 310000,
      coinsurancePct: 20,
    },
  });

  // ------------------------------------------------------------------
  // Financial ledger events — generate from existing claims
  // ------------------------------------------------------------------
  const allClaims = await prisma.claim.findMany({
    where: { organizationId: org.id },
    include: { payments: true },
  });

  for (const claim of allClaims) {
    // 1. Charge created
    await prisma.financialEvent.create({
      data: {
        organizationId: org.id,
        patientId: claim.patientId,
        claimId: claim.id,
        encounterId: claim.encounterId,
        type: FinancialEventType.charge_created,
        amountCents: claim.billedAmountCents,
        description: `Charge created: ${(claim.cptCodes as any[])[0]?.code ?? "service"}`,
        occurredAt: claim.serviceDate,
      },
    });

    // 2. Claim submitted (if not draft)
    if (claim.submittedAt) {
      await prisma.financialEvent.create({
        data: {
          organizationId: org.id,
          patientId: claim.patientId,
          claimId: claim.id,
          type: FinancialEventType.claim_submitted,
          amountCents: 0,
          description: `Claim submitted to ${claim.payerName ?? "payer"}`,
          occurredAt: claim.submittedAt,
          metadata: { payer: claim.payerName, claimNumber: claim.claimNumber },
        },
      });
    }

    // 3. Insurance payments
    for (const payment of claim.payments) {
      if (payment.source === PaymentSource.insurance) {
        await prisma.financialEvent.create({
          data: {
            organizationId: org.id,
            patientId: claim.patientId,
            claimId: claim.id,
            paymentId: payment.id,
            type: FinancialEventType.insurance_paid,
            amountCents: payment.amountCents,
            description: `${claim.payerName} paid ${formatCents(payment.amountCents)}`,
            occurredAt: payment.paymentDate,
            metadata: { reference: payment.reference },
          },
        });
      }
    }

    // 4. Contractual adjustment
    if (claim.allowedAmountCents != null && claim.allowedAmountCents < claim.billedAmountCents) {
      const adjustment = claim.billedAmountCents - claim.allowedAmountCents;
      await prisma.financialEvent.create({
        data: {
          organizationId: org.id,
          patientId: claim.patientId,
          claimId: claim.id,
          type: FinancialEventType.contractual_adjustment,
          amountCents: -adjustment,
          description: `Contractual adjustment: ${formatCents(adjustment)}`,
          occurredAt: claim.paidAt ?? claim.submittedAt ?? claim.serviceDate,
        },
      });
    }

    // 5. Patient responsibility transfer
    if (claim.patientRespCents > 0) {
      await prisma.financialEvent.create({
        data: {
          organizationId: org.id,
          patientId: claim.patientId,
          claimId: claim.id,
          type: FinancialEventType.patient_responsibility_transferred,
          amountCents: claim.patientRespCents,
          description: `Patient responsibility: ${formatCents(claim.patientRespCents)}`,
          occurredAt: claim.paidAt ?? claim.submittedAt ?? claim.serviceDate,
        },
      });
    }

    // 6. Denial
    if (claim.status === ClaimStatus.denied && claim.deniedAt) {
      await prisma.financialEvent.create({
        data: {
          organizationId: org.id,
          patientId: claim.patientId,
          claimId: claim.id,
          type: FinancialEventType.claim_denied,
          amountCents: 0,
          description: `Claim denied: ${claim.denialReason ?? "reason not specified"}`,
          occurredAt: claim.deniedAt,
          metadata: { denialReason: claim.denialReason },
        },
      });
    }
  }

  // Copay collected at check-in for Maya (historical)
  await prisma.financialEvent.create({
    data: {
      organizationId: org.id,
      patientId: maya.id,
      type: FinancialEventType.copay_assessed,
      amountCents: 2500,
      description: "Copay assessed at check-in",
      occurredAt: daysAgo(30),
    },
  });
  await prisma.financialEvent.create({
    data: {
      organizationId: org.id,
      patientId: maya.id,
      type: FinancialEventType.copay_collected,
      amountCents: 2500,
      description: "Copay collected (card, Visa •4242)",
      occurredAt: daysAgo(30),
      metadata: { method: "card", last4: "4242", brand: "Visa" },
    },
  });

  // ------------------------------------------------------------------
  // Statements — one per patient who has outstanding balance
  // ------------------------------------------------------------------

  // Maya: $36.00 patient resp from paid claim
  await prisma.statement.create({
    data: {
      organizationId: org.id,
      patientId: maya.id,
      statementNumber: "STMT-2026-001",
      periodStart: daysAgo(30),
      periodEnd: daysAgo(1),
      dueDate: new Date(Date.now() + 20 * DAY_MS),
      totalChargesCents: 22500,
      insurancePaidCents: 14400,
      adjustmentsCents: 4500,
      priorBalanceCents: 0,
      amountDueCents: 3600,
      paidToDateCents: 0,
      status: StatementStatus.sent,
      deliveryMethod: "portal",
      sentAt: daysAgo(10),
      viewedAt: daysAgo(8),
      lineItems: [
        {
          description: "Office visit (99214)",
          amountCents: 22500,
          date: daysAgo(30).toISOString(),
          cptCode: "99214",
          insurancePaid: 14400,
          adjustment: 4500,
          patientResponsibility: 3600,
        },
      ],
      plainLanguageSummary:
        "This is for your visit with Dr. Okafor on " +
        daysAgo(30).toLocaleDateString("en-US", { month: "long", day: "numeric" }) +
        ". Your insurance (Blue Cross Blue Shield) paid most of it — $144.00. The remaining $36.00 is your portion, which is your copay and a small coinsurance amount. You can pay online or set up a payment plan.",
    },
  });

  // James: $64.00 patient resp from partial paid claim
  await prisma.statement.create({
    data: {
      organizationId: org.id,
      patientId: james.id,
      statementNumber: "STMT-2026-002",
      periodStart: daysAgo(20),
      periodEnd: daysAgo(1),
      dueDate: new Date(Date.now() + 15 * DAY_MS),
      totalChargesCents: 42500,
      insurancePaidCents: 25600,
      adjustmentsCents: 10500,
      priorBalanceCents: 0,
      amountDueCents: 6400,
      paidToDateCents: 0,
      status: StatementStatus.sent,
      deliveryMethod: "portal",
      sentAt: daysAgo(5),
      lineItems: [
        {
          description: "New patient visit (99204)",
          amountCents: 42500,
          date: daysAgo(20).toISOString(),
          cptCode: "99204",
          insurancePaid: 25600,
          adjustment: 10500,
          patientResponsibility: 6400,
        },
      ],
      plainLanguageSummary:
        "This is for your first visit on " +
        daysAgo(20).toLocaleDateString("en-US", { month: "long", day: "numeric" }) +
        ". Aetna covered most of it. Your share is $64.00, which goes toward your deductible. Paying this brings you closer to meeting your annual deductible.",
    },
  });

  // Maya: payment plan example
  await prisma.paymentPlan.create({
    data: {
      organizationId: org.id,
      patientId: maya.id,
      totalAmountCents: 3600,
      installmentAmountCents: 1200,
      frequency: "monthly",
      numberOfInstallments: 3,
      installmentsPaid: 0,
      startDate: new Date(),
      nextPaymentDate: new Date(Date.now() + 20 * DAY_MS),
      status: PaymentPlanStatus.active,
      autopayEnabled: false,
    },
  });

  // Stored payment method for Maya
  await prisma.storedPaymentMethod.create({
    data: {
      patientId: maya.id,
      type: "card",
      last4: "4242",
      brand: "Visa",
      expiryMonth: 11,
      expiryYear: 2029,
      isDefault: true,
      tokenReference: "tok_demo_" + Math.random().toString(36).slice(2, 12),
      consentedAt: daysAgo(30),
    },
  });

  console.log("  Billing: coverage + ledger + statements + payment plans seeded.");

  // ------------------------------------------------------------------
  // Agentic memory harness — seed longitudinal memory + observations
  // ------------------------------------------------------------------
  // This is what makes the Memory tab actually show something the
  // moment you open a patient chart in demo. Real production memories
  // are written by the agents themselves (correspondenceNurse,
  // preVisitIntelligence, etc.) over the course of care; the seed data
  // is just a believable starting point for the demo.
  //
  // Every entry is narrative prose, not structured fields. Read them
  // aloud and they should sound like a clinician's private note about
  // the patient, not a database row.
  //
  // Idempotent: deleteMany first so reseeding doesn't pile up.

  await prisma.patientMemory.deleteMany({
    where: { patientId: { in: [maya.id, james.id, sarah.id] } },
  });
  await prisma.clinicalObservation.deleteMany({
    where: { patientId: { in: [maya.id, james.id, sarah.id] } },
  });

  // ─── Maya Reyes — rich longitudinal memory ────────────────────
  await prisma.patientMemory.createMany({
    data: [
      {
        patientId: maya.id,
        kind: "working",
        content:
          "The THC:CBD 1:1 tincture with CBN at bedtime is clearly helping. Pain has trended from 7/10 at intake to a consistent 3-4/10 over the last three weeks, and she's reporting her first nights of real sleep in years.",
        confidence: 0.9,
        tags: ["pain", "sleep", "tincture", "CBN"],
        source: "correspondenceNurse",
        sourceKind: "agent",
        createdAt: daysAgo(14),
      },
      {
        patientId: maya.id,
        kind: "not_working",
        content:
          "Early morning grogginess from the CBN bedtime component was a problem in week one. Solved by moving the dose to 60-90 minutes before bed. Do not need to re-titrate the CBN.",
        confidence: 0.85,
        tags: ["CBN", "side-effect", "timing"],
        source: "correspondenceNurse",
        sourceKind: "agent",
        createdAt: daysAgo(10),
      },
      {
        patientId: maya.id,
        kind: "preference",
        content:
          "Prefers direct, specific responses over general reassurance. Asks concrete questions (timing, mg, interactions) and wants concrete answers back. Don't over-soften.",
        confidence: 0.8,
        tags: ["communication"],
        source: "correspondenceNurse",
        sourceKind: "agent",
        createdAt: daysAgo(12),
      },
      {
        patientId: maya.id,
        kind: "relationship",
        content:
          "Her adult daughter is a primary support — Maya mentions their walks together as a goal metric. When she improves, she wants to be able to walk 3 miles with her daughter.",
        confidence: 0.9,
        tags: ["support", "daughter", "goal"],
        source: "correspondenceNurse",
        sourceKind: "agent",
        createdAt: daysAgo(8),
      },
      {
        patientId: maya.id,
        kind: "trajectory",
        content:
          "Pain scores: 7 → 5 → 4 → 3 over the last 30 days. Sleep scores: 4 → 5 → 6 → 7. Anxiety stable around 3-4. The cannabis regimen is performing exactly as hoped; reinforce and hold.",
        confidence: 0.92,
        tags: ["pain", "sleep", "anxiety", "trend"],
        source: "preVisitIntelligence",
        sourceKind: "agent",
        createdAt: daysAgo(2),
      },
      {
        patientId: maya.id,
        kind: "milestone",
        content:
          "3/15/26 — first pain-free day since starting cannabis therapy. Walked 3 miles with her daughter. She messaged the clinic the same day; the note made Dr. Okafor's week.",
        confidence: 0.95,
        tags: ["milestone", "pain-free"],
        source: "correspondenceNurse",
        sourceKind: "agent",
        createdAt: daysAgo(5),
      },
      {
        patientId: maya.id,
        kind: "context",
        content:
          "Prior to starting here, Maya tried gabapentin (caused fog) and tramadol (made her anxious). Cannabis is the third attempt. She's open about the fact that she doesn't want to be 'stuck on pills forever' — the minimum-effective-dose framing resonates with her.",
        confidence: 0.85,
        tags: ["history", "gabapentin", "tramadol"],
        source: "intake",
        sourceKind: "agent",
        createdAt: daysAgo(30),
      },
      {
        patientId: maya.id,
        kind: "observation",
        content:
          "Adherence has been 92% over the last 30 days (measured by DoseLog entries against the regimen frequency). That's remarkably high for a patient this early in therapy. Whatever Dr. Okafor is doing with the onboarding, it's working.",
        confidence: 0.9,
        tags: ["adherence"],
        source: "preVisitIntelligence",
        sourceKind: "agent",
        createdAt: daysAgo(2),
      },
    ],
  });

  // ─── James Chen — newer patient, earlier memory ───────────────
  await prisma.patientMemory.createMany({
    data: [
      {
        patientId: james.id,
        kind: "concern",
        content:
          "James reported chest pressure while walking uphill on 4/8. The correspondence nurse triaged this as an emergency and routed him to the ER. Cardiology follow-up pending. Do not start any new cannabis dosing until cardiac workup is complete.",
        confidence: 0.98,
        tags: ["cardiac", "emergency", "hold"],
        source: "correspondenceNurse",
        sourceKind: "agent",
        createdAt: daysAgo(4),
      },
      {
        patientId: james.id,
        kind: "preference",
        content:
          "Prefers phone over messaging for anything clinical. Responds to texts but wants the real conversation by voice. His wife helps him manage his health — include her in care planning when he opts in.",
        confidence: 0.75,
        tags: ["communication", "wife"],
        source: "intake",
        sourceKind: "agent",
        createdAt: daysAgo(21),
      },
      {
        patientId: james.id,
        kind: "context",
        content:
          "Retired electrician, 47. Primary concern is sleep and anxiety related to a workplace accident three years ago. Has tried SSRIs (did not tolerate) and trazodone (worked but sedation was too heavy the next morning).",
        confidence: 0.88,
        tags: ["history", "sleep", "anxiety", "SSRI"],
        source: "intake",
        sourceKind: "agent",
        createdAt: daysAgo(21),
      },
      {
        patientId: james.id,
        kind: "trajectory",
        content:
          "Anxiety scores trending slightly downward (5 → 4 → 4 over two weeks), but sleep remains poor (3-4/10 most nights). The cannabis regimen hasn't been running long enough to evaluate — we're still in the titration window.",
        confidence: 0.7,
        tags: ["anxiety", "sleep", "titration"],
        source: "preVisitIntelligence",
        sourceKind: "agent",
        createdAt: daysAgo(3),
      },
    ],
  });

  // ─── Sarah Thompson — thin memory (newest patient) ────────────
  await prisma.patientMemory.createMany({
    data: [
      {
        patientId: sarah.id,
        kind: "context",
        content:
          "Brand new to the practice — intake submitted last week. Presenting concerns focus on chronic migraine. Has not started any cannabis therapy yet; we're still in assessment.",
        confidence: 0.85,
        tags: ["new", "migraine"],
        source: "intake",
        sourceKind: "agent",
        createdAt: daysAgo(7),
      },
      {
        patientId: sarah.id,
        kind: "preference",
        content:
          "Says in her intake answers that she wants 'the science, not the vibes.' Lead with the research corpus and mechanism when explaining recommendations; she'll push back on anything that sounds hand-wavy.",
        confidence: 0.8,
        tags: ["communication", "evidence"],
        source: "intake",
        sourceKind: "agent",
        createdAt: daysAgo(7),
      },
    ],
  });

  // ─── Clinical observations (visible in the Memory tab feed) ───
  await prisma.clinicalObservation.createMany({
    data: [
      {
        patientId: maya.id,
        observedBy: "correspondenceNurse",
        observedByKind: "agent",
        category: "positive_signal",
        severity: "info",
        summary:
          "Maya reported her first pain-free day since starting cannabis therapy. Positive update — reinforce and encourage.",
        evidence: { messageIds: [] } as any,
        createdAt: daysAgo(5),
      },
      {
        patientId: maya.id,
        observedBy: "preVisitIntelligence",
        observedByKind: "agent",
        category: "symptom_trend",
        severity: "notable",
        summary:
          "Pain and sleep scores are both improving steadily on the current regimen. 92% adherence. Considering a possible dose reduction at the next visit to test durability.",
        evidence: {} as any,
        actionSuggested:
          "At the next visit, discuss whether to hold or gently taper the bedtime CBN component.",
        createdAt: daysAgo(2),
      },
      {
        patientId: james.id,
        observedBy: "correspondenceNurse",
        observedByKind: "agent",
        category: "red_flag",
        severity: "urgent",
        summary:
          "Emergency keywords detected in James's message: 'chest pain', 'trouble breathing'. Routed to ER. Cardiac evaluation pending. Cannabis therapy on hold.",
        evidence: {} as any,
        actionSuggested:
          "Follow up on cardiology workup before resuming or advancing any cannabis dosing.",
        createdAt: daysAgo(4),
      },
      {
        patientId: james.id,
        observedBy: "preVisitIntelligence",
        observedByKind: "agent",
        category: "adherence",
        severity: "notable",
        summary:
          "James has not logged a single dose in 4 days, coinciding with the ER visit. Expected — we told him to hold. Will need to re-verify readiness before restarting.",
        evidence: {} as any,
        createdAt: daysAgo(1),
      },
      {
        patientId: sarah.id,
        observedBy: "intake",
        observedByKind: "agent",
        category: "engagement",
        severity: "info",
        summary:
          "Sarah completed her intake in one sitting and asked multiple follow-up questions about mechanism of action. High engagement — she's ready for a detailed first visit.",
        evidence: {} as any,
        createdAt: daysAgo(6),
      },
    ],
  });

  console.log("  Memory harness: patient memories + observations seeded.");

  // ------------------------------------------------------------------
  // RCM Fleet — billing demo data for Revenue Cockpit + Clinical Billing
  // ------------------------------------------------------------------
  // Seed realistic claims with charges, denials, and adjustments so the
  // billing surfaces actually show data on first load.

  // Clean up prior billing demo data (idempotent)
  await prisma.adjustment.deleteMany({ where: { claim: { organizationId: org.id } } });
  await prisma.denialEvent.deleteMany({ where: { claim: { organizationId: org.id } } });
  await prisma.charge.deleteMany({ where: { organizationId: org.id } });

  // Maya's completed encounter → Claim 1 (paid in full, clean path)
  const mayaClaim1 = await prisma.claim.upsert({
    where: { id: "demo-claim-maya-1" },
    update: {},
    create: {
      id: "demo-claim-maya-1",
      organizationId: org.id,
      patientId: maya.id,
      encounterId: mayaCompletedEncounter.id,
      providerId: provider.id,
      status: "paid",
      claimNumber: "CLM-20260405-0001",
      cptCodes: [
        { code: "99214", label: "Office visit, established, moderate MDM", units: 1, chargeAmount: 18500, modifiers: ["25"] },
        { code: "36415", label: "Venipuncture", units: 1, chargeAmount: 3600, modifiers: [] },
      ] as any,
      icd10Codes: [
        { code: "G89.29", label: "Other chronic pain", sequence: 1 },
        { code: "Z71.3", label: "Cannabis counseling", sequence: 2 },
      ] as any,
      billedAmountCents: 22100,
      allowedAmountCents: 19200,
      paidAmountCents: 19200,
      patientRespCents: 2500,
      payerName: "Aetna",
      payerId: "AETNA-001",
      billingNpi: "1234567890",
      renderingNpi: "1234567890",
      placeOfService: "11",
      frequencyCode: "1",
      serviceDate: daysAgo(7),
      submittedAt: daysAgo(6),
      paidAt: daysAgo(1),
      closedAt: daysAgo(1),
      closureType: "paid_in_full",
      humanTouches: 0,
    },
  });

  // Maya Claim 1 charges
  await prisma.charge.createMany({
    data: [
      {
        encounterId: mayaCompletedEncounter.id,
        patientId: maya.id,
        organizationId: org.id,
        cptCode: "99214",
        cptDescription: "Office visit, established patient, moderate MDM",
        modifiers: ["25"],
        units: 1,
        icd10Codes: ["G89.29", "Z71.3"],
        feeAmountCents: 18500,
        status: "claim_attached",
        claimId: mayaClaim1.id,
        confidence: 0.94,
        createdBy: "encounterIntelligence:1.0.0",
      },
      {
        encounterId: mayaCompletedEncounter.id,
        patientId: maya.id,
        organizationId: org.id,
        cptCode: "36415",
        cptDescription: "Venipuncture",
        modifiers: [],
        units: 1,
        icd10Codes: ["Z71.3"],
        feeAmountCents: 3600,
        status: "claim_attached",
        claimId: mayaClaim1.id,
        confidence: 0.98,
        createdBy: "encounterIntelligence:1.0.0",
      },
    ],
  });

  // Contractual adjustment on Maya's paid claim
  await prisma.adjustment.create({
    data: {
      claimId: mayaClaim1.id,
      type: "contractual",
      amountCents: 2900,
      reason: "Contractual adjustment per Aetna agreement",
      carcCode: "45",
      postedAt: daysAgo(1),
    },
  });

  // James — Claim 2 (denied for medical necessity, appeal pending)
  const jamesClaim = await prisma.claim.upsert({
    where: { id: "demo-claim-james-1" },
    update: {},
    create: {
      id: "demo-claim-james-1",
      organizationId: org.id,
      patientId: james.id,
      providerId: provider.id,
      status: "denied",
      claimNumber: "CLM-20260408-0002",
      cptCodes: [
        { code: "99213", label: "Office visit, established, low MDM", units: 1, chargeAmount: 12800, modifiers: [] },
      ] as any,
      icd10Codes: [
        { code: "F41.1", label: "Generalized anxiety disorder", sequence: 1 },
        { code: "G47.00", label: "Insomnia", sequence: 2 },
      ] as any,
      billedAmountCents: 12800,
      allowedAmountCents: 0,
      paidAmountCents: 0,
      patientRespCents: 0,
      payerName: "UnitedHealthcare",
      payerId: "UHC-001",
      placeOfService: "11",
      frequencyCode: "1",
      serviceDate: daysAgo(14),
      submittedAt: daysAgo(13),
      deniedAt: daysAgo(5),
      denialReason: "Service not medically necessary per plan guidelines",
      humanTouches: 0,
    },
  });

  // Denial event for James
  await prisma.denialEvent.create({
    data: {
      claimId: jamesClaim.id,
      carcCode: "50",
      rarcCode: "N386",
      groupCode: "CO",
      denialCategory: "medical_necessity",
      amountDeniedCents: 12800,
      recoverable: true,
      recoverableAmountCents: 12800,
      resolution: "pending",
    },
  });

  // Maya — Claim 3 (submitted, pending adjudication)
  await prisma.claim.upsert({
    where: { id: "demo-claim-maya-2" },
    update: {},
    create: {
      id: "demo-claim-maya-2",
      organizationId: org.id,
      patientId: maya.id,
      providerId: provider.id,
      status: "submitted",
      claimNumber: "CLM-20260410-0003",
      cptCodes: [
        { code: "99214", label: "Office visit, established, moderate MDM", units: 1, chargeAmount: 18500, modifiers: [] },
      ] as any,
      icd10Codes: [
        { code: "G89.29", label: "Other chronic pain", sequence: 1 },
      ] as any,
      billedAmountCents: 18500,
      paidAmountCents: 0,
      patientRespCents: 0,
      payerName: "Aetna",
      payerId: "AETNA-001",
      placeOfService: "02",
      frequencyCode: "1",
      serviceDate: daysAgo(2),
      submittedAt: daysAgo(1),
      humanTouches: 0,
    },
  });

  console.log("  RCM Fleet: billing demo data seeded (3 claims, charges, denials).");

  // ------------------------------------------------------------------
  // MALLIK-006 — Lab Review Queue demo data
  // ------------------------------------------------------------------
  // Each patient gets a current (pending review) lab plus one prior of
  // the same panel so the current-vs-prior comparison has something
  // meaningful to render. Abnormal flag is computed from refHigh/refLow.
  // ------------------------------------------------------------------

  type MarkerInput = { value: number; unit: string; refLow?: number; refHigh?: number };
  const mk = (markers: Record<string, MarkerInput>) => {
    const out: Record<string, MarkerInput & { abnormal: boolean }> = {};
    for (const [name, m] of Object.entries(markers)) {
      const high = m.refHigh !== undefined && m.value > m.refHigh;
      const low = m.refLow !== undefined && m.value < m.refLow;
      out[name] = { ...m, abnormal: high || low };
    }
    return out;
  };
  const isAbnormal = (results: Record<string, { abnormal: boolean }>) =>
    Object.values(results).some((r) => r.abnormal);

  // Maya — lipid panel (current: borderline; prior: mildly elevated → improving)
  const mayaLipidPrior = mk({
    LDL: { value: 132, unit: "mg/dL", refLow: 0, refHigh: 100 },
    HDL: { value: 48, unit: "mg/dL", refLow: 40 },
    TC: { value: 210, unit: "mg/dL", refLow: 125, refHigh: 200 },
    TG: { value: 165, unit: "mg/dL", refLow: 0, refHigh: 150 },
  });
  await prisma.labResult.create({
    data: {
      organizationId: org.id,
      patientId: maya.id,
      panelName: "Lipid panel",
      receivedAt: daysAgo(120),
      results: mayaLipidPrior,
      abnormalFlag: isAbnormal(mayaLipidPrior),
      signedById: clinicianUser.id,
      signedAt: daysAgo(118),
      reviewOutcome: "needs_followup",
    },
  });
  const mayaLipidCurrent = mk({
    LDL: { value: 108, unit: "mg/dL", refLow: 0, refHigh: 100 },
    HDL: { value: 52, unit: "mg/dL", refLow: 40 },
    TC: { value: 188, unit: "mg/dL", refLow: 125, refHigh: 200 },
    TG: { value: 128, unit: "mg/dL", refLow: 0, refHigh: 150 },
  });
  await prisma.labResult.create({
    data: {
      organizationId: org.id,
      patientId: maya.id,
      panelName: "Lipid panel",
      receivedAt: daysAgo(2),
      results: mayaLipidCurrent,
      abnormalFlag: isAbnormal(mayaLipidCurrent),
    },
  });

  // James — HbA1c + lipid (current diabetic pre-workup; prior from 6 months ago)
  const jamesA1cPrior = mk({ A1C: { value: 6.1, unit: "%", refLow: 4.0, refHigh: 5.6 } });
  await prisma.labResult.create({
    data: {
      organizationId: org.id,
      patientId: james.id,
      panelName: "HbA1c",
      receivedAt: daysAgo(180),
      results: jamesA1cPrior,
      abnormalFlag: isAbnormal(jamesA1cPrior),
      signedById: clinicianUser.id,
      signedAt: daysAgo(178),
      reviewOutcome: "looks_good",
    },
  });
  const jamesA1cCurrent = mk({ A1C: { value: 5.9, unit: "%", refLow: 4.0, refHigh: 5.6 } });
  await prisma.labResult.create({
    data: {
      organizationId: org.id,
      patientId: james.id,
      panelName: "HbA1c",
      receivedAt: daysAgo(1),
      results: jamesA1cCurrent,
      abnormalFlag: isAbnormal(jamesA1cCurrent),
    },
  });

  // James — CMP with LFTs (liver enzymes — current within normal, prior mildly elevated)
  const jamesCmpPrior = mk({
    ALT: { value: 62, unit: "U/L", refLow: 7, refHigh: 56 },
    AST: { value: 44, unit: "U/L", refLow: 10, refHigh: 40 },
    Cr: { value: 1.0, unit: "mg/dL", refLow: 0.6, refHigh: 1.2 },
    eGFR: { value: 88, unit: "mL/min", refLow: 60 },
    Na: { value: 140, unit: "mEq/L", refLow: 136, refHigh: 145 },
    K: { value: 4.2, unit: "mEq/L", refLow: 3.5, refHigh: 5.0 },
  });
  await prisma.labResult.create({
    data: {
      organizationId: org.id,
      patientId: james.id,
      panelName: "CMP",
      receivedAt: daysAgo(180),
      results: jamesCmpPrior,
      abnormalFlag: isAbnormal(jamesCmpPrior),
      signedById: clinicianUser.id,
      signedAt: daysAgo(177),
      reviewOutcome: "needs_followup",
    },
  });
  const jamesCmpCurrent = mk({
    ALT: { value: 48, unit: "U/L", refLow: 7, refHigh: 56 },
    AST: { value: 35, unit: "U/L", refLow: 10, refHigh: 40 },
    Cr: { value: 1.1, unit: "mg/dL", refLow: 0.6, refHigh: 1.2 },
    eGFR: { value: 82, unit: "mL/min", refLow: 60 },
    Na: { value: 141, unit: "mEq/L", refLow: 136, refHigh: 145 },
    K: { value: 4.3, unit: "mEq/L", refLow: 3.5, refHigh: 5.0 },
  });
  await prisma.labResult.create({
    data: {
      organizationId: org.id,
      patientId: james.id,
      panelName: "CMP",
      receivedAt: daysAgo(1),
      results: jamesCmpCurrent,
      abnormalFlag: isAbnormal(jamesCmpCurrent),
    },
  });

  // Sarah — TSH (abnormal — will be excluded from batch per MALLIK-006 rules)
  const sarahTshPrior = mk({ TSH: { value: 3.8, unit: "mIU/L", refLow: 0.4, refHigh: 4.0 } });
  await prisma.labResult.create({
    data: {
      organizationId: org.id,
      patientId: sarah.id,
      panelName: "Thyroid panel",
      receivedAt: daysAgo(200),
      results: sarahTshPrior,
      abnormalFlag: isAbnormal(sarahTshPrior),
      signedById: clinicianUser.id,
      signedAt: daysAgo(198),
      reviewOutcome: "looks_good",
    },
  });
  const sarahTshCurrent = mk({ TSH: { value: 6.2, unit: "mIU/L", refLow: 0.4, refHigh: 4.0 } });
  await prisma.labResult.create({
    data: {
      organizationId: org.id,
      patientId: sarah.id,
      panelName: "Thyroid panel",
      receivedAt: daysAgo(3),
      results: sarahTshCurrent,
      abnormalFlag: isAbnormal(sarahTshCurrent),
    },
  });

  console.log("  Lab queue: 4 pending reviews + 4 prior labs seeded (Maya, James x2, Sarah).");

  // ------------------------------------------------------------------
  // MALLIK-007 — Refill Queue demo data
  // ------------------------------------------------------------------
  // A handful of meds + pending refills with variety: a clean routine
  // approval, a controlled-substance flag, a stale-monitoring-lab flag,
  // and a missing-monitoring-lab flag. The Refill Copilot (called lazily
  // from the overlay) produces a suggestion + flag list; we leave those
  // fields unset at seed time so the physician sees a live evaluation.
  // ------------------------------------------------------------------

  // James — Metformin (A1C monitoring exists and is fresh → approve)
  const jamesMetformin = await prisma.patientMedication.create({
    data: {
      patientId: james.id,
      name: "Metformin",
      genericName: "metformin hydrochloride",
      type: MedicationType.prescription,
      dosage: "500mg twice daily",
      prescriber: "Dr. Okafor",
      active: true,
      startDate: daysAgo(200),
      notes: "Pre-diabetes management.",
    },
  });

  // James — Warfarin (INR monitoring — no INR on file → missing-lab flag)
  const jamesWarfarin = await prisma.patientMedication.create({
    data: {
      patientId: james.id,
      name: "Warfarin",
      genericName: "warfarin sodium",
      type: MedicationType.prescription,
      dosage: "5mg daily",
      prescriber: "Dr. Okafor",
      active: true,
      startDate: daysAgo(45),
      notes: "Anticoagulation — monitor INR.",
    },
  });

  // Sarah — Levothyroxine (TSH monitoring; her TSH is recent and abnormal)
  const sarahLevo = await prisma.patientMedication.create({
    data: {
      patientId: sarah.id,
      name: "Levothyroxine",
      genericName: "levothyroxine sodium",
      type: MedicationType.prescription,
      dosage: "50mcg daily",
      prescriber: "Dr. Okafor",
      active: true,
      startDate: daysAgo(60),
      notes: "Hypothyroidism.",
    },
  });

  // Maya — Clonazepam (controlled substance → always at least review)
  const mayaClonazepam = await prisma.patientMedication.create({
    data: {
      patientId: maya.id,
      name: "Clonazepam",
      genericName: "clonazepam",
      type: MedicationType.prescription,
      dosage: "0.5mg as needed",
      prescriber: "Dr. Okafor",
      active: true,
      startDate: daysAgo(30),
      notes: "PRN anxiety. DEA schedule IV.",
    },
  });

  const sharedPharmacy = {
    pharmacyName: "Green Leaf Pharmacy — Long Beach",
    pharmacyPhone: "(562) 555-0142",
    pharmacyAddress: "1250 E Ocean Blvd, Long Beach, CA 90802",
  };

  await prisma.refillRequest.create({
    data: {
      organizationId: org.id,
      patientId: james.id,
      medicationId: jamesMetformin.id,
      requestedQty: 180,
      requestedDays: 90,
      ...sharedPharmacy,
      receivedAt: daysAgo(1),
      status: "new",
    },
  });

  await prisma.refillRequest.create({
    data: {
      organizationId: org.id,
      patientId: james.id,
      medicationId: jamesWarfarin.id,
      requestedQty: 30,
      requestedDays: 30,
      ...sharedPharmacy,
      pharmacyName: "CVS Pharmacy — Belmont Shore",
      pharmacyPhone: "(562) 555-0198",
      pharmacyAddress: "5252 E 2nd St, Long Beach, CA 90803",
      receivedAt: daysAgo(2),
      status: "new",
    },
  });

  await prisma.refillRequest.create({
    data: {
      organizationId: org.id,
      patientId: sarah.id,
      medicationId: sarahLevo.id,
      requestedQty: 90,
      requestedDays: 90,
      ...sharedPharmacy,
      receivedAt: daysAgo(1),
      status: "new",
    },
  });

  await prisma.refillRequest.create({
    data: {
      organizationId: org.id,
      patientId: maya.id,
      medicationId: mayaClonazepam.id,
      requestedQty: 15,
      requestedDays: 30,
      ...sharedPharmacy,
      receivedAt: daysAgo(1),
      status: "new",
    },
  });

  console.log(
    "  Refill queue: 4 pending refills seeded (Metformin routine, Warfarin missing-INR, Levothyroxine, Clonazepam controlled)."
  );

  // ------------------------------------------------------------------
  // Command Center demo enrichment (Schedule peek "chart-at-a-glance")
  // ------------------------------------------------------------------
  // The Schedule tile on the Command Center renders a featured pre-visit
  // snapshot for whichever appointment is next upcoming — pulling
  // allergies, active meds, active cannabis regimens, last lab, recent
  // unacknowledged observations, a 30-day pain sparkline, and a snippet
  // from the last completed encounter's finalized note.
  //
  // In demo the featured patient rotates as appointments shift through
  // the day (initially James Chen @ +1h, then Sarah Thompson @ +3h,
  // then tomorrow's Maya visit). We make sure every candidate has a
  // richly populated chart so the peek never collapses to the empty
  // "— meds · No labs" state.
  //
  // All data added below is idempotent: allergies use patient.update,
  // and every child row that cleanIdempotent() wipes at the top of the
  // seed is re-created here.
  console.log("Seeding Command Center demo enrichment...");

  // ─── Allergies — patient.update so re-seeds re-apply the list ───
  await prisma.patient.update({
    where: { id: maya.id },
    data: { allergies: ["Ibuprofen", "Sulfa drugs", "Latex"] },
  });
  await prisma.patient.update({
    where: { id: james.id },
    data: { allergies: ["Penicillin", "Shellfish", "Contrast dye"] },
  });
  await prisma.patient.update({
    where: { id: sarah.id },
    data: { allergies: ["Peanuts", "NSAIDs", "Codeine"] },
  });

  // ─── James — 3 additional conventional medications ───────────────
  // (He already has Metformin + Warfarin seeded in the Refill Queue
  // section above, so this brings him to 5 active meds.)
  await prisma.patientMedication.createMany({
    data: [
      {
        patientId: james.id,
        name: "Lisinopril",
        genericName: "lisinopril",
        type: MedicationType.prescription,
        dosage: "10mg daily",
        prescriber: "Dr. Patel (PCP)",
        active: true,
        startDate: daysAgo(220),
        notes: "Hypertension. Stable on current dose.",
      },
      {
        patientId: james.id,
        name: "Atorvastatin",
        genericName: "atorvastatin calcium",
        type: MedicationType.prescription,
        dosage: "20mg nightly",
        prescriber: "Dr. Patel (PCP)",
        active: true,
        startDate: daysAgo(180),
        notes: "Hyperlipidemia. Monitor LFTs annually.",
      },
      {
        patientId: james.id,
        name: "Vitamin D3",
        genericName: "cholecalciferol",
        type: MedicationType.supplement,
        dosage: "2000 IU daily",
        active: true,
        startDate: daysAgo(90),
        notes: "Supplementation; last 25-OH vitamin D was 24 ng/mL.",
      },
    ],
  });

  // ─── Sarah — 3 additional conventional medications ──────────────
  // (She already has Levothyroxine from the Refill Queue section.)
  await prisma.patientMedication.createMany({
    data: [
      {
        patientId: sarah.id,
        name: "Sumatriptan",
        genericName: "sumatriptan succinate",
        type: MedicationType.prescription,
        dosage: "50mg at migraine onset",
        prescriber: "Dr. Okafor",
        active: true,
        startDate: daysAgo(60),
        notes: "Abortive therapy for migraine with aura. Max 2 doses in 24h.",
      },
      {
        patientId: sarah.id,
        name: "Propranolol",
        genericName: "propranolol hydrochloride",
        type: MedicationType.prescription,
        dosage: "40mg twice daily",
        prescriber: "Dr. Okafor",
        active: true,
        startDate: daysAgo(90),
        notes: "Migraine prophylaxis. Monitor BP and HR.",
      },
      {
        patientId: sarah.id,
        name: "Magnesium glycinate",
        genericName: "magnesium glycinate",
        type: MedicationType.supplement,
        dosage: "400mg nightly",
        active: true,
        startDate: daysAgo(45),
        notes: "Migraine prevention adjunct.",
      },
    ],
  });

  // ─── Additional cannabis products for James + Sarah regimens ────
  const highCbdTincture = await prisma.cannabisProduct.create({
    data: {
      organizationId: org.id,
      name: "High-CBD Tincture 20:1",
      productType: ProductType.tincture,
      route: DeliveryRoute.sublingual,
      thcConcentration: 1,
      cbdConcentration: 20,
      thcCbdRatio: "1:20",
      concentrationUnit: "mg/mL",
    },
  });

  const nightCapsule = await prisma.cannabisProduct.create({
    data: {
      organizationId: org.id,
      name: "THC:CBN Nighttime Capsule 5mg/2mg",
      productType: ProductType.capsule,
      route: DeliveryRoute.oral,
      thcConcentration: 5,
      cbdConcentration: 0,
      thcCbdRatio: "5:0",
      concentrationUnit: "mg/unit",
    },
  });

  // ─── James — active cannabis regimen (bedtime THC:CBN capsule) ──
  const jamesRegimen = await prisma.dosingRegimen.create({
    data: {
      patientId: james.id,
      productId: nightCapsule.id,
      prescribedById: clinicianUser.id,
      volumePerDose: 1,
      volumeUnit: "unit",
      frequencyPerDay: 1,
      timingInstructions: "60 minutes before bed",
      calculatedThcMgPerDose: 5,
      calculatedCbdMgPerDose: 0,
      calculatedThcMgPerDay: 5,
      calculatedCbdMgPerDay: 0,
      patientInstructions:
        "Swallow one capsule with water about 60 minutes before bedtime. Skip if driving in the morning is still required within 8 hours.",
      clinicianNotes:
        "Short trial to address sleep onset. Reassess in 2 weeks. HOLD starting until cardiology workup is cleared.",
      startDate: daysAgo(14),
      active: true,
    },
  });

  // A few dose logs so adherence is visible on the Schedule card chip
  for (let day = 6; day >= 0; day--) {
    // ~70% adherence — a believable miss rate for a new patient
    if (day === 3 || day === 5) continue;
    await prisma.doseLog.create({
      data: {
        patientId: james.id,
        regimenId: jamesRegimen.id,
        actualVolume: 1,
        volumeUnit: "unit",
        estimatedThcMg: 5,
        estimatedCbdMg: 0,
        route: DeliveryRoute.oral,
        note: day === 0 ? "Fell asleep in under 30 min" : null,
        loggedAt: daysAgo(day),
      },
    });
  }

  // ─── Sarah — active high-CBD regimen for migraine prophylaxis ──
  const sarahRegimen = await prisma.dosingRegimen.create({
    data: {
      patientId: sarah.id,
      productId: highCbdTincture.id,
      prescribedById: clinicianUser.id,
      volumePerDose: 1,
      volumeUnit: "mL",
      frequencyPerDay: 2,
      timingInstructions: "Morning and evening with food",
      calculatedThcMgPerDose: 1,
      calculatedCbdMgPerDose: 20,
      calculatedThcMgPerDay: 2,
      calculatedCbdMgPerDay: 40,
      patientInstructions:
        "Take 1 mL under the tongue twice daily — once in the morning with breakfast and once with dinner. Hold under the tongue for 60 seconds before swallowing.",
      clinicianNotes:
        "CBD-forward daily regimen for migraine prophylaxis. Re-evaluate frequency at 4 weeks against headache diary.",
      startDate: daysAgo(21),
      active: true,
    },
  });

  for (let day = 6; day >= 0; day--) {
    for (let dose = 0; dose < 2; dose++) {
      // ~85% adherence
      if (day === 4 && dose === 1) continue;
      await prisma.doseLog.create({
        data: {
          patientId: sarah.id,
          regimenId: sarahRegimen.id,
          actualVolume: 1,
          volumeUnit: "mL",
          estimatedThcMg: 1,
          estimatedCbdMg: 20,
          route: DeliveryRoute.sublingual,
          loggedAt: daysAgo(day),
        },
      });
    }
  }

  // ─── OutcomeLog — pain trend for James and Sarah (30-day window) ──
  // James: worsening trend (3 → 6) after post-surgical flare
  // Sarah: flat trend (~5) — migraine frequency stable
  for (let day = 29; day >= 0; day--) {
    const progress = (29 - day) / 29;
    const jamesPain = Math.max(
      1,
      Math.min(10, parseFloat((3 + progress * 3 + (Math.random() - 0.5) * 0.6).toFixed(1)))
    );
    const sarahPain = parseFloat((4.5 + Math.random() * 1).toFixed(1));
    await prisma.outcomeLog.create({
      data: { patientId: james.id, metric: "pain", value: jamesPain, loggedAt: daysAgo(day) },
    });
    await prisma.outcomeLog.create({
      data: { patientId: sarah.id, metric: "pain", value: sarahPain, loggedAt: daysAgo(day) },
    });
  }

  // ─── Additional clinical observations so every candidate patient
  // has at least one urgent + one concern for the Patient Impact tile
  // ranking and the Schedule peek "Fleet is noticing" list. ────────
  await prisma.clinicalObservation.createMany({
    data: [
      // Maya — add a concern + an urgent to complement her existing
      // positive_signal + symptom_trend notable observations.
      {
        patientId: maya.id,
        observedBy: "preVisitIntelligence",
        observedByKind: "agent",
        category: "side_effect",
        severity: "concern",
        summary:
          "Maya reports persistent morning dry mouth rated 4/10 on the last three check-ins. Consider recommending a hydration protocol or reducing the evening tincture volume by 0.1 mL.",
        evidence: {} as Prisma.InputJsonValue,
        actionSuggested:
          "At the upcoming visit, discuss hydration plan and whether to pull back the evening dose.",
        createdAt: daysAgo(3),
      },
      {
        patientId: maya.id,
        observedBy: "correspondenceNurse",
        observedByKind: "agent",
        category: "medication_response",
        severity: "urgent",
        summary:
          "Maya's last sertraline refill is 4 days overdue despite an open refill request. She has a known risk for SSRI discontinuation syndrome if she misses more than 3 days.",
        evidence: {} as Prisma.InputJsonValue,
        actionSuggested:
          "Confirm the pharmacy fill status today and message her to bridge until it's ready.",
        createdAt: daysAgo(1),
      },

      // James — add a concern (he already has an urgent red_flag).
      {
        patientId: james.id,
        observedBy: "preVisitIntelligence",
        observedByKind: "agent",
        category: "symptom_trend",
        severity: "concern",
        summary:
          "James's self-reported pain has trended from 3/10 to 6/10 over the last 3 weeks. Sleep remains poor (3-4/10). Correlates with the post-surgical flare flagged at intake.",
        evidence: {} as Prisma.InputJsonValue,
        actionSuggested:
          "Review pain diary at the visit and consider adding a daytime CBD-forward component once cardiology clears.",
        createdAt: daysAgo(2),
      },
      {
        patientId: james.id,
        observedBy: "preVisitIntelligence",
        observedByKind: "agent",
        category: "medication_response",
        severity: "notable",
        summary:
          "Warfarin INR has not been checked in 6 weeks despite a monthly target cadence. Refill request is pending clinical review.",
        evidence: {} as Prisma.InputJsonValue,
        actionSuggested:
          "Order an INR today or decline the refill until a current value is on file.",
        createdAt: daysAgo(1),
      },

      // Sarah — she only had one info engagement observation. Add a
      // concern and an urgent so the featured peek has signal.
      {
        patientId: sarah.id,
        observedBy: "preVisitIntelligence",
        observedByKind: "agent",
        category: "symptom_trend",
        severity: "concern",
        summary:
          "Sarah's TSH came back at 6.2 mIU/L (reference 0.4-4.0) — consistent with under-replaced hypothyroidism on her current 50 mcg levothyroxine dose.",
        evidence: {} as Prisma.InputJsonValue,
        actionSuggested:
          "Plan to titrate levothyroxine at today's visit and reorder TSH in 6 weeks.",
        createdAt: daysAgo(3),
      },
      {
        patientId: sarah.id,
        observedBy: "correspondenceNurse",
        observedByKind: "agent",
        category: "red_flag",
        severity: "urgent",
        summary:
          "Sarah reported two episodes of visual aura without headache in the last 7 days — new pattern for her. Could reflect migraine evolution or a transient neurologic event that needs same-day triage.",
        evidence: {} as Prisma.InputJsonValue,
        actionSuggested:
          "Triage neurology symptoms at today's visit; consider neurology referral if features persist.",
        createdAt: daysAgo(0),
      },
    ],
  });

  // ─── Completed encounter + finalized note for James ─────────────
  const jamesCompletedEncounter = await prisma.encounter.create({
    data: {
      organizationId: org.id,
      patientId: james.id,
      providerId: provider.id,
      status: EncounterStatus.complete,
      scheduledFor: daysAgo(21),
      startedAt: daysAgo(21),
      completedAt: daysAgo(21),
      modality: "video",
      reason: "Initial consultation: insomnia and post-surgical anxiety",
    },
  });

  await prisma.note.create({
    data: {
      encounterId: jamesCompletedEncounter.id,
      authorUserId: clinicianUser.id,
      status: NoteStatus.finalized,
      aiDrafted: true,
      aiConfidence: 0.88,
      finalizedAt: daysAgo(21),
      blocks: [
        {
          type: "summary",
          heading: "Summary",
          body: "47M, retired electrician, presenting with chronic insomnia (3/10 sleep quality) and generalized anxiety (7/10) that worsened after a knee replacement 6 months ago. Prior cannabis experience with edibles and tinctures; reports relaxation and sleep benefit.",
        },
        {
          type: "findings",
          heading: "Relevant Findings",
          body: "SSRIs poorly tolerated. Trazodone effective but over-sedating next day. HbA1c 5.9%, LFTs within normal limits on most recent CMP. On lisinopril, atorvastatin, metformin, warfarin.",
        },
        {
          type: "assessment",
          heading: "Assessment",
          body: "Chronic insomnia with comorbid generalized anxiety disorder, likely exacerbated by post-surgical deconditioning. Reasonable candidate for a low-THC bedtime cannabis regimen with careful monitoring given concurrent anticoagulation.",
        },
        {
          type: "plan",
          heading: "Plan",
          body: "Start THC:CBN 5mg bedtime capsule 60 min before sleep. Hold on daytime component until anxiety baseline is reassessed. Keep sleep diary. Reconfirm INR within 2 weeks given warfarin concurrency. Follow up in 3 weeks.",
        },
        {
          type: "followUp",
          heading: "Follow-up",
          body: "Video visit in 3 weeks to evaluate sleep response and discuss daytime anxiety adjunct.",
        },
      ],
      narrative: null,
    },
  });

  // ─── Completed encounter + finalized note for Sarah ─────────────
  const sarahCompletedEncounter = await prisma.encounter.create({
    data: {
      organizationId: org.id,
      patientId: sarah.id,
      providerId: provider.id,
      status: EncounterStatus.complete,
      scheduledFor: daysAgo(28),
      startedAt: daysAgo(28),
      completedAt: daysAgo(28),
      modality: "in_person",
      reason: "Initial consultation: chronic migraine prophylaxis",
    },
  });

  await prisma.note.create({
    data: {
      encounterId: sarahCompletedEncounter.id,
      authorUserId: clinicianUser.id,
      status: NoteStatus.finalized,
      aiDrafted: true,
      aiConfidence: 0.9,
      finalizedAt: daysAgo(28),
      blocks: [
        {
          type: "summary",
          heading: "Summary",
          body: "33F with chronic migraine with aura, 10-12 headache days per month. Propranolol prophylaxis effective but not sufficient; interested in evidence-based cannabis adjunct.",
        },
        {
          type: "findings",
          heading: "Relevant Findings",
          body: "Thyroid panel: TSH trending up (3.8 → 6.2). On levothyroxine 50 mcg. Reports NSAID and codeine allergies — sumatriptan is her current abortive. Headache diary shows aura episodes cluster midweek.",
        },
        {
          type: "assessment",
          heading: "Assessment",
          body: "Chronic migraine with aura, suboptimally controlled on propranolol alone, with newly abnormal TSH suggesting under-replaced hypothyroidism that may be contributing. Reasonable candidate for a daily CBD-forward tincture as a prophylactic adjunct.",
        },
        {
          type: "plan",
          heading: "Plan",
          body: "Start high-CBD 20:1 tincture, 1 mL sublingual BID. Increase levothyroxine dose pending today's TSH review. Reinforce headache diary. Expect 4 weeks to assess migraine frequency trend.",
        },
        {
          type: "followUp",
          heading: "Follow-up",
          body: "In-person follow-up in 4 weeks; earlier if aura pattern changes.",
        },
      ],
      narrative: null,
    },
  });

  console.log(
    "  Command Center: allergies + meds + regimens + pain logs + observations + finalized notes for Maya/James/Sarah."
  );

  // ------------------------------------------------------------------
  // Marketplace catalog
  // ------------------------------------------------------------------
  console.log("Seeding marketplace catalog...");
  await seedMarketplace(org.id);

  // ------------------------------------------------------------------
  // Phase 8 Track 3 — Pharmacology & Commerce
  // ------------------------------------------------------------------
  console.log("Seeding Track 8 pharmacology + commerce data...");
  await seedTrack8Data(org.id, [maya.id, james.id, sarah.id]);

  // ------------------------------------------------------------------
  // Super-admin bootstrap allowlist
  // ------------------------------------------------------------------
  // Promotes any user whose email is in SUPER_ADMIN_BOOTSTRAP_EMAILS to the
  // super_admin role on the synthetic "LeafJourney HQ" organization. Mirrors
  // the runtime path in src/lib/auth/super-admin-bootstrap.ts so seeds and
  // first-sign-in produce the same end state.
  console.log("Seeding super-admin bootstrap allowlist...");
  const allowlistRaw = process.env.SUPER_ADMIN_BOOTSTRAP_EMAILS ?? "";
  const allowlistEmails = allowlistRaw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);

  if (allowlistEmails.length > 0) {
    const hqOrg = await prisma.organization.upsert({
      where: { slug: "leafjourney-hq" },
      update: {},
      create: { slug: "leafjourney-hq", name: "LeafJourney HQ" },
    });

    for (const email of allowlistEmails) {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true },
      });
      if (!user) {
        console.log(`  - skipped: no user yet for ${email} (sign in once first)`);
        continue;
      }
      await prisma.membership.upsert({
        where: {
          userId_organizationId_role: {
            userId: user.id,
            organizationId: hqOrg.id,
            role: Role.super_admin,
          },
        },
        update: {},
        create: {
          userId: user.id,
          organizationId: hqOrg.id,
          role: Role.super_admin,
        },
      });
      console.log(`  - granted super_admin: ${email}`);
    }
  } else {
    console.log("  - SUPER_ADMIN_BOOTSTRAP_EMAILS not set; skipping.");
  }

  // ------------------------------------------------------------------
  // Done
  // ------------------------------------------------------------------
  console.log("Seeding Education compounds for the Combo Wheel...");
  await seedEducationCompounds();

  console.log("Seed complete.");
  console.log("  Owner:     owner@demo.health            / Longbeach2026!");
  console.log("  Clinician: clinician@demo.health        / Longbeach2026!");
  console.log("  Patient 1: patient@demo.health (Maya)   / Longbeach2026!");
  console.log("  Patient 2: james.chen@demo.health       / Longbeach2026!");
  console.log("  Patient 3: sarah.thompson@demo.health   / Longbeach2026!");
}

async function seedEducationCompounds() {
  const compounds: Omit<Prisma.EducationCompoundCreateInput, "createdAt" | "updatedAt">[] = [
    // Cannabinoids
    {
      id: "thc",
      name: "THC",
      type: "cannabinoid",
      color: "#2D8B5E",
      evidence: "strong",
      description: "The primary psychoactive compound in cannabis, known for potent pain relief and appetite stimulation.",
      symptoms: ["pain", "insomnia", "nausea", "appetite loss"],
      benefits: ["euphoria", "relaxation", "pain relief"],
      risks: ["anxiety", "paranoia", "dry mouth", "impaired memory"],
      sortOrder: 0,
      active: true,
    },
    {
      id: "cbd",
      name: "CBD",
      type: "cannabinoid",
      color: "#3A9F71",
      evidence: "strong",
      description: "Non-intoxicating compound widely used for anxiety, inflammation, and seizure reduction.",
      symptoms: ["anxiety", "inflammation", "seizures", "pain"],
      benefits: ["calmness", "neuroprotection", "anti-inflammatory"],
      risks: ["fatigue", "dry mouth", "appetite changes"],
      sortOrder: 1,
      active: true,
    },
    {
      id: "cbg",
      name: "CBG",
      type: "cannabinoid",
      color: "#46B384",
      evidence: "moderate",
      description: "The 'mother cannabinoid', showing promise for gut health, focus, and neuroprotection.",
      symptoms: ["IBS", "glaucoma", "fatigue"],
      benefits: ["focus", "antibacterial", "appetite stimulation"],
      risks: ["dry mouth", "mild anxiety"],
      sortOrder: 2,
      active: true,
    },
    {
      id: "cbn",
      name: "CBN",
      type: "cannabinoid",
      color: "#53C797",
      evidence: "moderate",
      description: "A degradation product of THC often marketed for sleep and nighttime sedation.",
      symptoms: ["insomnia", "pain", "inflammation"],
      benefits: ["sedation", "relaxation", "pain relief"],
      risks: ["grogginess", "dizziness"],
      sortOrder: 3,
      active: true,
    },
    {
      id: "cbc",
      name: "CBC",
      type: "cannabinoid",
      color: "#5FDBAA",
      evidence: "emerging",
      description: "A non-intoxicating minor cannabinoid believed to boost anandamide and reduce inflammation.",
      symptoms: ["depression", "pain", "acne"],
      benefits: ["mood elevation", "neurogenesis", "anti-inflammatory"],
      risks: ["dry mouth", "mild fatigue"],
      sortOrder: 4,
      active: true,
    },
    {
      id: "thcv",
      name: "THCV",
      type: "cannabinoid",
      color: "#6CEFBD",
      evidence: "emerging",
      description: "Known as 'diet weed', it provides clear-headed, energizing effects and may suppress appetite.",
      symptoms: ["fatigue", "diabetes", "obesity"],
      benefits: ["energy", "focus", "appetite suppression"],
      risks: ["anxiety", "jitteriness"],
      sortOrder: 5,
      active: true,
    },
    {
      id: "cbda",
      name: "CBDa",
      type: "cannabinoid",
      color: "#78FFD0",
      evidence: "emerging",
      description: "The raw, unheated form of CBD, showing high potential for nausea and targeted inflammation relief.",
      symptoms: ["nausea", "inflammation", "anxiety"],
      benefits: ["anti-nausea", "anti-inflammatory"],
      risks: ["fatigue", "dry mouth"],
      sortOrder: 6,
      active: true,
    },
    {
      id: "thca",
      name: "THCa",
      type: "cannabinoid",
      color: "#85FFE3",
      evidence: "emerging",
      description: "The non-intoxicating precursor to THC, valued for its potent anti-inflammatory and neuroprotective traits.",
      symptoms: ["pain", "muscle spasms", "arthritis"],
      benefits: ["anti-inflammatory", "neuroprotection", "anti-emetic"],
      risks: ["mild drowsiness"],
      sortOrder: 7,
      active: true,
    },

    // Terpenes
    {
      id: "myrcene",
      name: "Myrcene",
      type: "terpene",
      color: "#E8A838",
      evidence: "strong",
      description: "The most abundant terpene, delivering an earthy, musky aroma and deep physical sedation.",
      symptoms: ["insomnia", "pain", "muscle spasms"],
      benefits: ["relaxation", "sedation", "anti-inflammatory"],
      risks: ["grogginess", "lethargy"],
      sortOrder: 0,
      active: true,
    },
    {
      id: "limonene",
      name: "Limonene",
      type: "terpene",
      color: "#F2B84D",
      evidence: "strong",
      description: "Bright and citrusy, Limonene is prized for its mood-elevating and stress-relieving properties.",
      symptoms: ["depression", "anxiety", "stress", "nausea"],
      benefits: ["mood elevation", "stress relief", "anti-nausea"],
      risks: ["mild jitteriness", "dry mouth"],
      sortOrder: 1,
      active: true,
    },
    {
      id: "caryophyllene",
      name: "Caryophyllene",
      type: "terpene",
      color: "#FCC862",
      evidence: "strong",
      description: "A spicy, peppery terpene that uniquely acts as a cannabinoid, binding to CB2 receptors to fight inflammation.",
      symptoms: ["pain", "inflammation", "anxiety"],
      benefits: ["pain relief", "anti-inflammatory", "stress relief"],
      risks: ["dry mouth", "mild fatigue"],
      sortOrder: 2,
      active: true,
    },
    {
      id: "linalool",
      name: "Linalool",
      type: "terpene",
      color: "#FFD877",
      evidence: "moderate",
      description: "Recognizable by its floral, lavender scent, Linalool is a powerful calming agent for mind and body.",
      symptoms: ["anxiety", "insomnia", "pain", "seizures"],
      benefits: ["calmness", "sedation", "anti-anxiety"],
      risks: ["grogginess", "lethargy"],
      sortOrder: 3,
      active: true,
    },
    {
      id: "pinene",
      name: "Pinene",
      type: "terpene",
      color: "#FFE88C",
      evidence: "moderate",
      description: "Fresh and piney, Pinene promotes alertness, memory retention, and acts as a bronchodilator.",
      symptoms: ["asthma", "memory loss", "fatigue"],
      benefits: ["focus", "alertness", "bronchodilation"],
      risks: ["anxiety", "restlessness"],
      sortOrder: 4,
      active: true,
    },
    {
      id: "humulene",
      name: "Humulene",
      type: "terpene",
      color: "#FFF8A1",
      evidence: "emerging",
      description: "Woody and earthy (found in hops), Humulene is notable for its anti-inflammatory and appetite-suppressing effects.",
      symptoms: ["inflammation", "pain", "obesity"],
      benefits: ["anti-inflammatory", "appetite suppression", "antibacterial"],
      risks: ["dry mouth", "mild fatigue"],
      sortOrder: 5,
      active: true,
    },
    {
      id: "terpinolene",
      name: "Terpinolene",
      type: "terpene",
      color: "#FFFFB6",
      evidence: "emerging",
      description: "Complex and fruity, Terpinolene often acts as a mild central nervous system depressant and antioxidant.",
      symptoms: ["insomnia", "anxiety", "oxidative stress"],
      benefits: ["sedation", "antioxidant", "antibacterial"],
      risks: ["grogginess", "mild dizziness"],
      sortOrder: 6,
      active: true,
    },
    {
      id: "ocimene",
      name: "Ocimene",
      type: "terpene",
      color: "#FFFFCB",
      evidence: "emerging",
      description: "Sweet and herbaceous, Ocimene offers uplifting effects along with antiviral and decongestant benefits.",
      symptoms: ["congestion", "viruses", "fatigue"],
      benefits: ["uplifting", "decongestant", "antiviral"],
      risks: ["mild anxiety", "dry mouth"],
      sortOrder: 7,
      active: true,
    },
  ];

  let added = 0;
  for (const comp of compounds) {
    await prisma.educationCompound.upsert({
      where: { id: comp.id },
      update: comp,
      create: comp,
    });
    added++;
  }
  console.log(`  Education: Seeded ${added} Combo Wheel compounds.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
