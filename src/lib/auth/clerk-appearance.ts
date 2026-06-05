import type { Appearance } from "@clerk/types";

/**
 * Brand the Clerk UI to the Leafmart design system.
 *
 * Styling is driven through `elements` Tailwind classes that reference theme
 * tokens (bg-*, surface-*, text-*, accent-*, border). Those tokens are backed
 * by CSS variables that flip with `data-theme`, so this appearance is
 * automatically light/dark correct WITHOUT pulling in @clerk/themes. The
 * `variables` block only carries what Tailwind classes can't reach (the spinner
 * / primary tint Clerk computes shades from, the corner radius, and the brand
 * font), so the embedded widgets and the account popovers all match the rest of
 * the app instead of rendering as a default-Clerk island.
 *
 * Two exports:
 *  - `clerkBaseAppearance` — applied globally on <ClerkProvider> so UserButton,
 *    UserProfile and any Clerk form across the app inherit the brand.
 *  - `clerkAuthAppearance` — the embedded <SignIn>/<SignUp> cards, which sit
 *    inside our own framed auth card, so they additionally strip Clerk's card
 *    chrome (shadow/border/padding) and hide its header (the page renders the
 *    "Welcome back" heading itself).
 */

const variables: NonNullable<Appearance["variables"]> = {
  colorPrimary: "#2E5A44",
  colorDanger: "#B3261E",
  colorSuccess: "#2E5A44",
  borderRadius: "0.625rem",
  fontFamily: "var(--font-sans), Inter, system-ui, sans-serif",
  fontFamilyButtons: "var(--font-sans), Inter, system-ui, sans-serif",
  fontSize: "0.9375rem",
};

// Shared element styling — buttons, inputs, links, dividers, and the account
// popovers. Every class resolves through the theme tokens, so it tracks dark
// mode automatically.
const sharedElements: NonNullable<Appearance["elements"]> = {
  socialButtonsBlockButton:
    "border border-border bg-surface hover:bg-bg text-text rounded-lg h-11 font-medium normal-case transition-colors",
  socialButtonsBlockButtonText: "text-text font-medium",

  dividerLine: "bg-border",
  dividerText: "text-text-subtle text-xs uppercase tracking-wide",

  formFieldLabel: "text-text-muted text-sm font-medium",
  formFieldInput:
    "bg-bg border border-border text-text rounded-lg h-11 px-3 placeholder:text-text-subtle focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition-colors",
  formFieldInputShowPasswordButton: "text-text-muted hover:text-text",
  formFieldErrorText: "text-danger text-sm",
  formFieldSuccessText: "text-success text-sm",

  formButtonPrimary:
    "bg-accent hover:bg-accent-hover text-accent-ink rounded-lg h-11 font-semibold normal-case text-sm shadow-sm transition-colors",
  formButtonReset: "text-text-muted hover:text-text normal-case",

  otpCodeFieldInput: "border-border text-text rounded-lg",
  formResendCodeLink: "text-accent hover:text-accent-hover font-medium",

  identityPreview: "bg-surface border border-border rounded-lg",
  identityPreviewText: "text-text",
  identityPreviewEditButton: "text-accent hover:text-accent-hover",

  footerActionText: "text-text-muted text-sm",
  footerActionLink: "text-accent hover:text-accent-hover font-semibold",

  alertText: "text-text",
  spinner: "text-accent",

  // Account widgets (UserButton / UserProfile) inherit the same palette.
  userButtonAvatarBox: "ring-1 ring-border",
  userButtonPopoverCard:
    "bg-surface-raised border border-border shadow-lg rounded-xl",
  userButtonPopoverActionButton: "text-text hover:bg-bg",
  avatarBox: "rounded-full",
  badge: "bg-accent-soft text-accent-strong",
};

export const clerkBaseAppearance: Appearance = {
  variables,
  elements: sharedElements,
  layout: {
    // Hide the "Development mode" Clerk ribbon — it reads as unfinished in demos.
    unsafe_disableDevelopmentModeWarnings: true,
  },
};

export const clerkAuthAppearance: Appearance = {
  variables,
  elements: {
    ...sharedElements,
    rootBox: "w-full",
    cardBox: "w-full bg-transparent shadow-none border-none",
    card: "bg-transparent shadow-none border-none p-0 gap-5",
    // The page supplies its own "Welcome back" / "Create your account" heading.
    header: "hidden",
    headerTitle: "hidden",
    headerSubtitle: "hidden",
  },
  layout: {
    socialButtonsPlacement: "top",
    socialButtonsVariant: "blockButton",
    logoPlacement: "none",
    unsafe_disableDevelopmentModeWarnings: true,
  },
};
