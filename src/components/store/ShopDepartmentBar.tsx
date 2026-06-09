"use client";

// Department bar for the /shop surface. Derives the active department from
// the current path so the Amazon-style nav highlights where you are.

import { usePathname } from "next/navigation";
import { DepartmentNav, type Department } from "./DepartmentNav";

const DEPARTMENTS: Department[] = [
  { key: "all", label: "All", href: "/shop" },
  { key: "supply", label: "Supply & wellness", href: "/shop/supply" },
  { key: "rest", label: "Rest & sleep", href: "/shop?category=rest" },
  { key: "pain-support", label: "Pain support", href: "/shop?category=pain-support" },
  { key: "calm", label: "Calm", href: "/shop?category=calm" },
  { key: "clinician-picks", label: "Clinician picks", href: "/shop?category=clinician-picks" },
  // EMR-339 / EMR-374 / EMR-328 / EMR-371 — non-shelf surfaces
  { key: "wellness", label: "Wellness", href: "/shop/wellness" },
  { key: "research", label: "Research", href: "/shop/research" },
  { key: "advocacy", label: "Advocacy", href: "/shop/advocacy" },
  { key: "dosing-guide", label: "Dosing guide", href: "/shop/dosing-guide" },
  { key: "distributors", label: "Our distributors", href: "/shop/distributors" },
];

export function ShopDepartmentBar() {
  const pathname = usePathname();
  let activeKey = "all";
  if (pathname?.startsWith("/shop/supply")) activeKey = "supply";
  else if (pathname?.startsWith("/shop/wellness")) activeKey = "wellness";
  else if (pathname?.startsWith("/shop/research")) activeKey = "research";
  else if (pathname?.startsWith("/shop/advocacy")) activeKey = "advocacy";
  else if (pathname?.startsWith("/shop/dosing-guide")) activeKey = "dosing-guide";
  else if (pathname?.startsWith("/shop/distributors")) activeKey = "distributors";
  return <DepartmentNav departments={DEPARTMENTS} activeKey={activeKey} />;
}
