import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import { bootstrapSuperAdminIfAllowlisted } from "@/lib/auth/super-admin-bootstrap";

export const dynamic = "force-dynamic";

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    const user = await requireUser();
    await bootstrapSuperAdminIfAllowlisted(user);
    await requireSuperAdmin();
  } catch (err) {
    const code = err instanceof Error ? err.message : "FORBIDDEN";
    if (code === "UNAUTHORIZED") redirect("/sign-in");
    redirect("/");
  }
  return <>{children}</>;
}
