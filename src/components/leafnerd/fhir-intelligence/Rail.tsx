"use client";
/* LEAFNERD — left navigation rail */
import { useState, useEffect, useRef } from "react";
import { useClerk } from "@clerk/nextjs";
import { Icon } from "./primitives";
import type { NavGroup } from "@/lib/leafnerd/types";

export function getInitials(userName?: string): string {
  return userName
    ? userName.startsWith("Dr. ")
      ? "D" + (userName.split(" ")[1]?.[0] || "").toUpperCase()
      : userName
          .split(/\s+/)
          .map((part) => part[0])
          .join("")
          .toUpperCase()
          .slice(0, 2)
    : "DR";
}

function ClerkSignOutButton() {
  const clerk = useClerk();

  const handleSignOut = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!clerk.session) {
      window.location.href = "/sign-in";
      return;
    }
    try {
      await clerk.signOut({ redirectUrl: "/sign-in" });
    } catch {
      window.location.href = "/sign-in";
    }
  };

  return (
    <button className="dropdown-item logout" role="menuitem" onClick={handleSignOut}>
      <Icon name="logout" size={15} />
      <span>Sign out</span>
    </button>
  );
}

export function Rail({
  nav,
  active,
  setActive,
  userName,
  userRole,
}: {
  nav: NavGroup[];
  active: string;
  setActive: (id: string) => void;
  userName?: string;
  userRole?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Compute initials for the avatar bubble (e.g. Dr. Patel -> DP, Dr. Reyes -> DR, Neal -> N)
  const initials = getInitials(userName);
  return (
    <nav className="rail">
      <div className="rail-head">
        <span className="brand-mark">
          <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
            <rect width="30" height="30" rx="8" fill="#1B3025"/>
            <path d="M15 7c-4 0-7 3-7 7 0 4.5 3.5 8 9 8.5C16.5 18 13 15.5 11 14c3 .5 6 2.5 7 6 1.2-1.4 2-3.3 2-5.5C20 10 18 7 15 7z" fill="#6FA52A"/>
            <path d="M15 22.5C15 18 13 15 11 14" stroke="#1B3025" strokeWidth="1.1" strokeLinecap="round"/>
          </svg>
        </span>
        <div>
          <div className="brand-name">Leaf<b>nerd</b></div>
          <div className="rail-sub">FHIR Intelligence</div>
        </div>
      </div>
      <div className="rail-scroll">
        {nav.map((grp, gi) => (
          <div key={gi} className="nav-group">
            {grp.group && <div className="nav-group-label">{grp.group}</div>}
            {grp.items.map(it => (
              <div key={it.id} className={`nav-item ${active === it.id ? "active" : ""}`} onClick={() => setActive(it.id)}>
                <span className="ic"><Icon name={it.icon} size={17} /></span>
                {it.label}
                {it.badge && <span className={`nav-badge ${it.badgeTone === "amber" ? "amber" : ""}`}>{it.badge}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="rail-foot" ref={containerRef}>
        {open && (
          <div className="rail-user-dropdown" role="menu">
            <div className="dropdown-header">
              <span className="avatar">{initials}</span>
              <div className="user-info">
                <div className="nm">{userName || "Dr. Reyes"}</div>
                <div className="rl">{userRole || "Population Health Lead"}</div>
              </div>
            </div>
            <div className="dropdown-divider" />
            {typeof window !== "undefined" && !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
              <ClerkSignOutButton />
            ) : (
              <a 
                href={process.env.NODE_ENV !== "production" ? "/api/dev/logout?redirect=/sign-in" : "/sign-in"} 
                className="dropdown-item logout" 
                role="menuitem"
              >
                <Icon name="logout" size={15} />
                <span>Sign out</span>
              </a>
            )}
          </div>
        )}
        <div className="rail-user" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true">
          <span className="avatar">{initials}</span>
          <div>
            <div className="nm">{userName || "Dr. Reyes"}</div>
            <div className="rl">{userRole || "Population Health Lead"}</div>
          </div>
        </div>
      </div>
    </nav>
  );
}
