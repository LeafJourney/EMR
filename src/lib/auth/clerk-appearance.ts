export type Appearance = {
  variables?: Record<string, string | number>;
  elements?: Record<string, string>;
  layout?: {
    socialButtonsPlacement?: "top" | "bottom";
    socialButtonsVariant?: "blockButton" | "iconButton";
    logoPlacement?: "inside" | "outside" | "none";
    unsafe_disableDevelopmentModeWarnings?: boolean;
  };
};

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
  // Literal hex values, NOT var() references: Clerk parses these to compute
  // derived shades (button gradients, hover states). A var() string is
  // unparseable, and the garbage gradient it produced painted OVER our
  // Tailwind bg-accent — the invisible "Continue" button on /sign-in.
  // Light-theme values; the auth card renders on the light surface.
  colorPrimary: "#1F4D37",
  colorDanger: "#B83B2E",
  colorSuccess: "#2A6E4C",
  borderRadius: "0.75rem",
  fontFamily: "var(--font-sans), Inter, system-ui, sans-serif",
  fontFamilyButtons: "var(--font-sans), Inter, system-ui, sans-serif",
  fontSize: "0.9375rem",
};

// Shared element styling — buttons, inputs, links, dividers, and the account
// popovers. Every class resolves through the theme tokens, so it tracks dark
// mode automatically.
const sharedElements: NonNullable<Appearance["elements"]> = {
  socialButtonsBlockButton:
    "border border-border bg-surface/60 hover:bg-bg-deep text-text rounded-xl h-11 font-medium normal-case transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm",
  socialButtonsBlockButtonText: "text-text font-medium",

  dividerLine: "bg-border",
  dividerText: "text-text-subtle text-xs uppercase tracking-wide font-medium",

  formFieldLabel: "text-text-muted text-xs font-semibold uppercase tracking-wider mb-1.5",
  formFieldInput:
    "bg-bg/40 border border-border text-text rounded-xl h-11 px-3.5 placeholder:text-text-subtle focus:border-accent focus:ring-1 focus:ring-accent/20 focus:bg-surface focus:outline-none transition-all duration-200",
  formFieldInputShowPasswordButton: "text-text-muted hover:text-text",
  formFieldErrorText: "text-danger text-sm mt-1",
  formFieldSuccessText: "text-success text-sm mt-1",

  // !bg-none kills Clerk's injected gradient (background-image) which
  // otherwise paints over background-color; !bg-accent wins the cascade tie
  // against Clerk's runtime-injected stylesheet, which loads after ours.
  formButtonPrimary:
    "!bg-none !bg-accent hover:!bg-accent-hover !text-accent-ink rounded-xl h-11 font-semibold normal-case text-sm shadow-sm hover:shadow transition-all duration-200 active:scale-[0.98]",
  formButtonReset: "text-text-muted hover:text-text normal-case transition-colors",

  otpCodeFieldInput: "border-border text-text rounded-xl focus:border-accent focus:ring-1 focus:ring-accent/20",
  formResendCodeLink: "text-accent hover:text-accent-hover font-semibold transition-colors",

  identityPreview: "bg-surface border border-border rounded-xl px-3 py-2",
  identityPreviewText: "text-text font-medium text-xs",
  identityPreviewEditButton: "text-accent hover:text-accent-hover font-semibold transition-colors",

  footerActionText: "text-text-muted text-xs",
  footerActionLink: "text-accent hover:text-accent-hover font-semibold transition-colors",

  alertText: "text-text",
  spinner: "text-accent",

  // Account widgets (UserButton / UserProfile) inherit the same palette.
  userButtonAvatarBox: "ring-1 ring-border shadow-sm hover:ring-accent transition-all duration-200",
  userButtonPopoverCard:
    "bg-surface-raised border border-border shadow-xl rounded-2xl p-2",
  userButtonPopoverActionButton: "text-text hover:bg-bg-deep rounded-lg transition-colors py-2 px-3",
  avatarBox: "rounded-full",
  badge: "bg-accent-soft text-accent border border-accent/15",
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
