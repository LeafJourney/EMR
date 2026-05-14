// EMR-273 — Public-facing marketplace query layer for Leafmart.com.
//
// Unlike `./queries.ts` (which scopes to the authenticated patient's org),
// this module is platform-wide and session-less. It's the source of truth
// for the public Leafmart storefront and any unauthenticated crawler /
// preview.
//
// Safety rules for this module:
//   1. NEVER reference `getCurrentUser` or any session primitive.
//   2. NEVER return `clinicianNote` — that's clinician-internal context.
//   3. Only `status=active` + `deletedAt=null` products.
//   4. No patient / order / cart references in the returned shape.

import { ProductStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type {
  MarketplaceProduct,
  MarketplaceCategory,
  ProductFormat,
  ProductVariant,
  ProductReview,
} from "./types";
import { deriveEffectTags } from "./effects";

const publicProductInclude = {
  variants: { orderBy: { sortOrder: "asc" } },
  reviews: { orderBy: { createdAt: "desc" } },
  categoryMappings: { include: { category: true } },
} as const;

type PublicProductRow = Awaited<
  ReturnType<
    typeof prisma.product.findFirstOrThrow<{
      include: typeof publicProductInclude;
    }>
  >
>;

function mapPublicVariant(v: PublicProductRow["variants"][number]): ProductVariant {
  return {
    id: v.id,
    name: v.name,
    upc: v.upc ?? undefined,
    price: v.price,
    compareAtPrice: v.compareAtPrice ?? undefined,
    inStock: v.inStock,
  };
}

function mapPublicReview(r: PublicProductRow["reviews"][number]): ProductReview {
  return {
    id: r.id,
    authorName: r.authorName,
    rating: r.rating,
    title: r.title ?? undefined,
    body: r.body ?? undefined,
    verified: r.verified,
    createdAt: r.createdAt.toISOString().slice(0, 10),
  };
}

/**
 * Public product mapper. Identical to the authenticated mapper EXCEPT:
 *  - `clinicianNote` is stripped (internal clinician context)
 *  - `dosageGuidance` is stripped (requires clinical consultation framing
 *     the public storefront doesn't provide)
 */
function mapPublicProduct(p: PublicProductRow): MarketplaceProduct {
  const terpene = (p.terpeneProfile ?? {}) as Record<string, number>;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    description: p.description,
    shortDescription: p.shortDescription ?? "",
    price: p.price,
    compareAtPrice: p.compareAtPrice ?? undefined,
    status: p.status,
    format: p.format as ProductFormat,
    imageUrl: p.imageUrl ?? undefined,
    images: p.images,
    thcContent: p.thcContent ?? undefined,
    cbdContent: p.cbdContent ?? undefined,
    cbnContent: p.cbnContent ?? undefined,
    terpeneProfile: terpene,
    strainType: (p.strainType ?? undefined) as MarketplaceProduct["strainType"],
    symptoms: p.symptoms,
    goals: p.goals,
    useCases: p.useCases,
    onsetTime: p.onsetTime ?? undefined,
    duration: p.duration ?? undefined,
    effectTags: deriveEffectTags({
      strainType: (p.strainType ?? undefined) as MarketplaceProduct["strainType"],
      thcContent: p.thcContent ?? undefined,
      cbdContent: p.cbdContent ?? undefined,
      cbnContent: p.cbnContent ?? undefined,
      terpeneProfile: terpene,
      symptoms: p.symptoms,
      useCases: p.useCases,
    }),
    // Dosage guidance intentionally stripped on the public surface —
    // surface it only in authenticated portal contexts.
    dosageGuidance: undefined,
    beginnerFriendly: p.beginnerFriendly,
    labVerified: p.labVerified,
    coaUrl: p.coaUrl ?? undefined,
    clinicianPick: p.clinicianPick,
    // Clinician note stripped on the public surface — clinician-internal.
    clinicianNote: undefined,
    requires21Plus: p.requires21Plus,
    inStock: p.inStock,
    averageRating: p.averageRating,
    reviewCount: p.reviewCount,
    featured: p.featured,
    categoryIds: p.categoryMappings.map((m) => m.categoryId),
    variants: p.variants.map(mapPublicVariant),
    reviews: p.reviews.map(mapPublicReview),
  };
}

const PUBLIC_PRODUCT_WHERE = {
  status: ProductStatus.active,
  deletedAt: null,
  // EMR-245: age-gated products (>0.3% delta-9 THC) are hidden from the
  // unauthenticated public surface entirely. Visitors see them only after
  // sign-in where the age-gate flow (src/server/marketplace/age-gate.ts)
  // runs and verifies DOB.
  requires21Plus: false,
} as const;

export async function getPublicFeaturedProducts(
  limit = 4,
): Promise<MarketplaceProduct[]> {
  const rows = await prisma.product.findMany({
    where: { ...PUBLIC_PRODUCT_WHERE, featured: true },
    include: publicProductInclude,
    orderBy: [{ sortOrder: "asc" }, { averageRating: "desc" }],
    take: limit,
  });
  return rows.map(mapPublicProduct);
}

export async function getPublicClinicianPicks(
  limit = 6,
): Promise<MarketplaceProduct[]> {
  const rows = await prisma.product.findMany({
    where: { ...PUBLIC_PRODUCT_WHERE, clinicianPick: true },
    include: publicProductInclude,
    orderBy: { averageRating: "desc" },
    take: limit,
  });
  return rows.map(mapPublicProduct);
}

export async function getPublicProductBySlug(
  slug: string,
): Promise<MarketplaceProduct | undefined> {
  const row = await prisma.product.findFirst({
    where: { ...PUBLIC_PRODUCT_WHERE, slug },
    include: publicProductInclude,
  });
  return row ? mapPublicProduct(row) : undefined;
}

export async function getAllPublicProducts(): Promise<MarketplaceProduct[]> {
  const rows = await prisma.product.findMany({
    where: PUBLIC_PRODUCT_WHERE,
    include: publicProductInclude,
    orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(mapPublicProduct);
}

export async function getPublicProductsByCategory(
  categorySlug: string,
): Promise<MarketplaceProduct[]> {
  const rows = await prisma.product.findMany({
    where: {
      ...PUBLIC_PRODUCT_WHERE,
      categoryMappings: { some: { category: { slug: categorySlug } } },
    },
    include: publicProductInclude,
    orderBy: [{ featured: "desc" }, { averageRating: "desc" }],
  });
  return rows.map(mapPublicProduct);
}

export async function getPublicCategoryBySlug(
  slug: string,
): Promise<MarketplaceCategory | undefined> {
  const row = await prisma.marketplaceCategory.findUnique({
    where: { slug },
    include: {
      _count: {
        select: {
          products: {
            where: {
              product: { status: ProductStatus.active, deletedAt: null },
            },
          },
        },
      },
    },
  });
  if (!row) return undefined;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? undefined,
    type: row.type as MarketplaceCategory["type"],
    icon: row.icon ?? undefined,
    productCount: row._count.products,
  };
}

export async function getPublicCategories(
  type?: string,
): Promise<MarketplaceCategory[]> {
  const rows = await prisma.marketplaceCategory.findMany({
    where: type ? { type } : {},
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: {
          products: {
            where: {
              product: { status: ProductStatus.active, deletedAt: null },
            },
          },
        },
      },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? undefined,
    type: row.type as MarketplaceCategory["type"],
    icon: row.icon ?? undefined,
    productCount: row._count.products,
  }));
}

export async function searchPublicProducts(
  query: string,
): Promise<MarketplaceProduct[]> {
  const q = query.trim();
  const rows = await prisma.product.findMany({
    where: {
      ...PUBLIC_PRODUCT_WHERE,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { brand: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              { symptoms: { has: q } },
              { goals: { has: q } },
              { format: { equals: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: publicProductInclude,
    orderBy: [{ featured: "desc" }, { averageRating: "desc" }],
  });
  return rows.map(mapPublicProduct);
}
