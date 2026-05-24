"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      !window.location.host.includes("localhost") && // avoid SW caching in local development unless desired
      process.env.NODE_ENV === "production"
    ) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("[ServiceWorker] Registered successfully with scope:", reg.scope);
        })
        .catch((err) => {
          console.error("[ServiceWorker] Registration failed:", err);
        });
    }
  }, []);

  return null;
}
