"use client";

import { useEffect, useState } from "react";
import { defaultLayout, normalizeLayout, PORTAL_STORAGE_KEY, type PortalLayout } from "@/lib/portal/customization";

function readLayout(patientId: string): PortalLayout {
  if (typeof window === "undefined") return defaultLayout();
  try {
    const raw = window.localStorage.getItem(PORTAL_STORAGE_KEY(patientId));
    if (!raw) return defaultLayout();
    return normalizeLayout(JSON.parse(raw));
  } catch {
    return defaultLayout();
  }
}

export function PortalCustomizationProvider({ patientId, children }: { patientId: string, children: React.ReactNode }) {
  const [layout, setLayout] = useState<PortalLayout | null>(null);

  useEffect(() => {
    setLayout(readLayout(patientId));
    
    // Listen for storage changes in case they edit preferences in another tab
    const handleStorage = (e: StorageEvent) => {
      if (e.key === PORTAL_STORAGE_KEY(patientId)) {
        setLayout(readLayout(patientId));
      }
    };
    
    // Also listen for a custom event from the editor to avoid needing a React Context
    // just to pass the updated layout up.
    const handleLocalChange = () => setLayout(readLayout(patientId));

    window.addEventListener("storage", handleStorage);
    window.addEventListener("portal-layout-changed", handleLocalChange);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("portal-layout-changed", handleLocalChange);
    };
  }, [patientId]);

  useEffect(() => {
    if (!layout) return;
    
    const root = document.documentElement;
    
    // Theme
    if (layout.theme === "dark") {
      root.classList.add("dark");
      root.dataset.theme = "dark";
    } else if (layout.theme === "light") {
      root.classList.remove("dark");
      root.dataset.theme = "light";
    } else {
      root.classList.remove("dark");
      delete root.dataset.theme;
    }
    
    // Reduce Motion
    if (layout.reduceMotion) {
      root.classList.add("reduce-motion");
    } else {
      root.classList.remove("reduce-motion");
    }

    // Text Scale
    if (layout.textScale === "large") {
      root.classList.add("text-lg-base");
    } else {
      root.classList.remove("text-lg-base");
    }
    
  }, [layout]);

  return <>{children}</>;
}
