/**
 * GET / POST / DELETE /api/leafmart/cart
 *
 * Server-side persistence for the Leafmart shopping cart, scoped to a
 * Patient row that auto-resolves from the Clerk/iron-session user.
 *
 * Anonymous shoppers stay on localStorage only — every handler returns
 * 401 when there's no session. The client cart store merges localStorage
 * with the server response on login, then POSTs the union back so both
 * stay in sync from there on.
 *
 *   GET    → { items: [{ product: LeafmartProduct, quantity }] }
 *   POST   → { items: [{ slug, quantity }] }   (replaces whole cart)
 *   DELETE → clears the cart
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { ensureLeafmartOrganization, ensurePatientForUser } from "@/lib/leafmart/sync";
import { mapProductToLeafmart } from "@/lib/leafmart/products";
import { logger } from "@/lib/observability/log";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PostBody = z.object({
  items: z
    .array(
      z.object({
        slug: z.string().min(1),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .max(50),
});

const PRODUCT_INCLUDE = {
  categoryMappings: {
    include: { category: { select: { slug: true, name: true } } },
  },
} as const;

async function loadCartItems(cartId: string) {
  const items = await prisma.cartItem.findMany({
    where: { cartId },
    include: { product: { include: PRODUCT_INCLUDE } },
    orderBy: { createdAt: "asc" },
  });
  return items
    .filter((it) => it.product && it.product.deletedAt === null)
    .map((it) => ({
      product: mapProductToLeafmart(it.product),
      quantity: it.quantity,
    }));
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  try {
    const org = await ensureLeafmartOrganization();
    const patient = await ensurePatientForUser(user, org.id);
    const cart = await prisma.cart.findUnique({ where: { patientId: patient.id } });
    if (!cart) return NextResponse.json({ items: [] });
    return NextResponse.json({ items: await loadCartItems(cart.id) });
  } catch (err) {
    logger.error({ event: "leafmart.cart.get_failed", err });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: z.infer<typeof PostBody>;
  try {
    body = PostBody.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "invalid body", detail: (err as Error).message },
      { status: 400 },
    );
  }

  // De-dupe by slug, summing quantities. Clients shouldn't send dupes but
  // the server is the source of truth — collapse defensively.
  const collapsed = new Map<string, number>();
  for (const it of body.items) {
    collapsed.set(it.slug, (collapsed.get(it.slug) ?? 0) + it.quantity);
  }
  const slugs = [...collapsed.keys()];

  try {
    const org = await ensureLeafmartOrganization();
    const patient = await ensurePatientForUser(user, org.id);

    // Resolve each slug to a Product row. Unknown slugs are dropped silently
    // — the storefront could have removed an item between sessions.
    const products = slugs.length
      ? await prisma.product.findMany({
          where: { slug: { in: slugs }, deletedAt: null },
          select: { id: true, slug: true },
        })
      : [];
    const productIdBySlug = new Map(products.map((p) => [p.slug, p.id]));

    const cart = await prisma.cart.upsert({
      where: { patientId: patient.id },
      update: {},
      create: { patientId: patient.id },
      select: { id: true },
    });

    // Replace-the-whole-cart semantics. A transaction keeps GETs that
    // race with this POST from seeing a half-cleared cart.
    await prisma.$transaction([
      prisma.cartItem.deleteMany({ where: { cartId: cart.id } }),
      ...(slugs.length
        ? [
            prisma.cartItem.createMany({
              data: slugs
                .filter((s) => productIdBySlug.has(s))
                .map((slug) => ({
                  cartId: cart.id,
                  productId: productIdBySlug.get(slug)!,
                  variantId: null,
                  quantity: Math.min(99, collapsed.get(slug) ?? 1),
                })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);

    return NextResponse.json({ items: await loadCartItems(cart.id) });
  } catch (err) {
    logger.error({ event: "leafmart.cart.post_failed", err });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  try {
    const org = await ensureLeafmartOrganization();
    const patient = await ensurePatientForUser(user, org.id);
    const cart = await prisma.cart.findUnique({
      where: { patientId: patient.id },
      select: { id: true },
    });
    if (cart) {
      await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    }
    return NextResponse.json({ items: [] });
  } catch (err) {
    logger.error({ event: "leafmart.cart.delete_failed", err });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
