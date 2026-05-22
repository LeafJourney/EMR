import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-deep": "var(--bg-deep)",
        surface: "var(--surface)",
        "surface-raised": "var(--surface-raised)",
        "surface-muted": "var(--surface-muted)",
        ink: "var(--ink)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        text: "var(--text)",
        "text-muted": "var(--text-muted)",
        "text-subtle": "var(--text-subtle)",
        "text-soft": "var(--text-soft)",
        muted: "var(--muted)",
        leaf: "var(--leaf)",
        "leaf-soft": "var(--leaf-soft)",
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        "accent-strong": "var(--accent-strong)",
        "accent-soft": "var(--accent-soft)",
        "accent-ink": "var(--accent-ink)",
        highlight: "var(--highlight)",
        "highlight-hover": "var(--highlight-hover)",
        "highlight-soft": "var(--highlight-soft)",
        // Pastel shelves
        sage: "var(--sage)",
        "sage-deep": "var(--sage-deep)",
        peach: "var(--peach)",
        "peach-deep": "var(--peach-deep)",
        butter: "var(--butter)",
        "butter-deep": "var(--butter-deep)",
        rose: "var(--rose)",
        "rose-deep": "var(--rose-deep)",
        lilac: "var(--lilac)",
        "lilac-deep": "var(--lilac-deep)",
        mint: "var(--mint)",
        // Semantic
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        info: "var(--info)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        display: ["var(--font-display)"],
        accent: ["var(--font-accent)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["14px", { lineHeight: "20px" }],
        base: ["15px", { lineHeight: "24px" }],
        lg: ["17px", { lineHeight: "26px" }],
        xl: ["20px", { lineHeight: "28px" }],
        "2xl": ["24px", { lineHeight: "32px" }],
        "3xl": ["30px", { lineHeight: "38px" }],
        "4xl": ["36px", { lineHeight: "44px" }],
        "5xl": ["48px", { lineHeight: "52px" }],
        "6xl": ["60px", { lineHeight: "64px" }],
        "7xl": ["72px", { lineHeight: "76px" }],
      },
      boxShadow: {
        sm: "0 1px 0 0 rgba(28, 26, 21, 0.03), 0 0 0 1px rgba(28, 26, 21, 0.05)",
        md: "0 4px 12px -2px rgba(28, 26, 21, 0.08), 0 0 0 1px rgba(28, 26, 21, 0.04)",
        lg: "0 24px 48px -16px rgba(28, 26, 21, 0.16), 0 0 0 1px rgba(212, 194, 143, 0.5)",
        seal: "inset 0 0 0 1px rgba(255, 255, 255, 0.12), 0 2px 4px rgba(14, 50, 37, 0.25)",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.2, 0, 0, 1)",
      },
    },
  },
  plugins: [
    function ({ addUtilities }: any) {
      addUtilities({
        ".liquid-glass": {
          background: "rgba(255, 255, 255, 0.4)",
          "backdrop-filter": "blur(24px) saturate(1.8)",
          "-webkit-backdrop-filter": "blur(24px) saturate(1.8)",
          "border-top": "1px solid rgba(255,255,255,0.8)",
          "border-left": "1px solid rgba(255,255,255,0.5)",
          "box-shadow": "0 8px 32px rgba(0,0,0,0.05)",
        },
        ".liquid-glass-strong": {
          background: "rgba(255, 255, 255, 0.75)",
          "backdrop-filter": "blur(32px) saturate(2)",
          "-webkit-backdrop-filter": "blur(32px) saturate(2)",
          "border-top": "1px solid rgba(255,255,255,0.9)",
          "border-left": "1px solid rgba(255,255,255,0.7)",
          "box-shadow": "0 12px 48px rgba(0,0,0,0.08)",
        },
        ".perspective-1000": {
          perspective: "1000px",
        },
      });
    },
  ],
};

export default config;
