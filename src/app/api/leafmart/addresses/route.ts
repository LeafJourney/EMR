import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import {
  listAddressesForUser,
  createAddressForUser,
} from "@/lib/leafmart/addresses";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  label: z.string().max(40).optional(),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  address1: z.string().min(1).max(160),
  address2: z.string().max(160).optional(),
  city: z.string().min(1).max(80),
  state: z.string().length(2),
  postalCode: z.string().regex(/^\d{5}(-\d{4})?$/),
  phone: z.string().max(20).optional(),
  isDefault: z.boolean().optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const addresses = await listAddressesForUser(user);
  return NextResponse.json({ addresses });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let parsed: z.infer<typeof CreateSchema>;
  try {
    parsed = CreateSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "Invalid address", detail: (err as Error).message },
      { status: 400 },
    );
  }

  const address = await createAddressForUser(user, parsed);
  return NextResponse.json({ address }, { status: 201 });
}
