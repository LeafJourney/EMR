// DB-backed marketplace query layer. Mirrors the function signatures from
// `./data.ts` (the in-memory mock) so portal shop routes can swap the import
// and become async. Scoped to the current user's organization.

import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { ProductStatus } from "@prisma/client";
import type {
  MarketplaceProduct,
  MarketplaceCategory,
  ProductVariant,
  ProductReview,
  ProductFormat,
} from "./types";
import { deriveEffectTags } from "./effects";

const productInclude = {
  variants: { orderBy: { sortOrder: "asc" } },
  reviews: { orderBy: { createdAt: "desc" } },
  categoryMappings: { include: { category: true } },
} as const;

type ProductRow = Awaited<
  ReturnType<typeof prisma.product.findFirstOrThrow<{ include: typeof productInclude }>>
>;

function mapVariant(v: ProductRow["variants"][number]): ProductVariant {
  return {
    id: v.id,
    name: v.name,
    upc: v.upc ?? undefined,
    price: v.price,
    compareAtPrice: v.compareAtPrice ?? undefined,
    inStock: v.inStock,
  };
}

function mapReview(r: ProductRow["reviews"][number]): ProductReview {
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

function mapProduct(p: ProductRow): MarketplaceProduct {
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
    dosageGuidance: p.dosageGuidance ?? undefined,
    beginnerFriendly: p.beginnerFriendly,
    labVerified: p.labVerified,
    coaUrl: p.coaUrl ?? undefined,
    clinicianPick: p.clinicianPick,
    clinicianNote: p.clinicianNote ?? undefined,
    requires21Plus: p.requires21Plus,
    inStock: p.inStock,
    averageRating: p.averageRating,
    reviewCount: p.reviewCount,
    featured: p.featured,
    categoryIds: p.categoryMappings.map((m) => m.categoryId),
    variants: p.variants.map(mapVariant),
    reviews: p.reviews.map(mapReview),
  };
}

// Resolve the caller's org. Requests without a session or membership yield
// null — callers treat that as an empty catalog.
const resolveOrgId = cache(async (): Promise<string | null> => {
  const user = await getCurrentUser();
  return user?.organizationId ?? null;
});

// ---------------------------------------------------------------------------
// Queries (mirror data.ts signatures, async)
// ---------------------------------------------------------------------------

export async function getProductBySlug(
  slug: string,
): Promise<MarketplaceProduct | undefined> {
  const orgId = await resolveOrgId();
  if (!orgId) return undefined;
  const row = await prisma.product.findFirst({
    where: { slug, organizationId: orgId, deletedAt: null },
    include: productInclude,
  });
  return row ? mapProduct(row) : undefined;
}

export async function getProductsByCategory(
  categorySlug: string,
): Promise<MarketplaceProduct[]> {
  const orgId = await resolveOrgId();
  if (!orgId) return [];
  const rows = await prisma.product.findMany({
    where: {
      organizationId: orgId,
      deletedAt: null,
      categoryMappings: { some: { category: { slug: categorySlug } } },
    },
    include: productInclude,
    orderBy: [{ featured: "desc" }, { averageRating: "desc" }],
  });
  return rows.map(mapProduct);
}

export async function getFeaturedProducts(): Promise<MarketplaceProduct[]> {
  const orgId = await resolveOrgId();
  if (!orgId) return [];
  const rows = await prisma.product.findMany({
    where: {
      organizationId: orgId,
      deletedAt: null,
      featured: true,
      status: ProductStatus.active,
    },
    include: productInclude,
    orderBy: [{ sortOrder: "asc" }, { averageRating: "desc" }],
  });
  return rows.map(mapProduct);
}

export async function getClinicianPicks(): Promise<MarketplaceProduct[]> {
  const orgId = await resolveOrgId();
  if (!orgId) return [];
  const rows = await prisma.product.findMany({
    where: {
      organizationId: orgId,
      deletedAt: null,
      clinicianPick: true,
      status: ProductStatus.active,
    },
    include: productInclude,
    orderBy: { averageRating: "desc" },
  });
  return rows.map(mapProduct);
}

export async function getAllProducts(): Promise<MarketplaceProduct[]> {
  const orgId = await resolveOrgId();
  if (!orgId) return [];
  const rows = await prisma.product.findMany({
    where: { organizationId: orgId, deletedAt: null },
    include: productInclude,
    orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(mapProduct);
}

export async function searchProducts(
  query: string,
): Promise<MarketplaceProduct[]> {
  const orgId = await resolveOrgId();
  if (!orgId) return [];
  const q = query.trim();
  const rows = await prisma.product.findMany({
    where: {
      organizationId: orgId,
      deletedAt: null,
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
    include: productInclude,
    orderBy: [{ featured: "desc" }, { averageRating: "desc" }],
  });
  return rows.map(mapProduct);
}

export async function getRelatedProducts(
  productId: string,
  limit = 4,
): Promise<MarketplaceProduct[]> {
  const orgId = await resolveOrgId();
  if (!orgId) return [];
  const source = await prisma.product.findFirst({
    where: { id: productId, organizationId: orgId, deletedAt: null },
    select: { symptoms: true, goals: true },
  });
  if (!source) return [];
  const pool = await prisma.product.findMany({
    where: {
      organizationId: orgId,
      deletedAt: null,
      id: { not: productId },
      OR: [
        { symptoms: { hasSome: source.symptoms } },
        { goals: { hasSome: source.goals } },
      ],
    },
    include: productInclude,
    take: limit * 4,
  });
  const targets = new Set<string>([...source.symptoms, ...source.goals]);
  return pool
    .map((p) => ({
      product: mapProduct(p),
      score: [...p.symptoms, ...p.goals].filter((t) => targets.has(t)).length,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.product);
}

export async function getCategoryBySlug(
  slug: string,
): Promise<MarketplaceCategory | undefined> {
  const orgId = await resolveOrgId();
  const row = await prisma.marketplaceCategory.findUnique({
    where: { slug },
    include: {
      _count: {
        select: {
          products: orgId
            ? { where: { product: { organizationId: orgId, deletedAt: null } } }
            : true,
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

export async function getCategories(
  type?: string,
): Promise<MarketplaceCategory[]> {
  const orgId = await resolveOrgId();
  const rows = await prisma.marketplaceCategory.findMany({
    where: type ? { type } : {},
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: {
          products: orgId
            ? { where: { product: { organizationId: orgId, deletedAt: null } } }
            : true,
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
