import type { Config } from "tailwindcss";

/**
 * AVIR Mind design system — extracted from the Claude Design reference.
 * Every value maps to a CSS variable defined in src/app/globals.css so that
 * light/dark themes swap by re-binding variables, not by duplicating classes.
 *
 * Locked invariants:
 *  - border radius is 0 everywhere (severity dots are the only circle, via a util)
 *  - hairline borders are 0.5px
 *  - severity palette is fixed and identical across the whole product
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/app/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        // Structural surfaces
        page: "hsl(var(--page))",
        background: "hsl(var(--page))", // alias so shadcn's bg-background resolves
        surface: "hsl(var(--surface))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Borders / lines
        border: "hsl(var(--border))",
        "border-strong": "hsl(var(--border-strong))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        // Text
        foreground: "hsl(var(--foreground))",
        body: "hsl(var(--body))",
        subtext: "hsl(var(--subtext))",
        label: "hsl(var(--label))",
        hint: "hsl(var(--hint))",
        // Brand
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        // Severity — fixed brand values (not theme-swapped)
        severity: {
          critical: "#DC2626",
          high: "#EA580C",
          medium: "#CA8A04",
          low: "#16A34A",
          info: "#2563EB",
        },
        // Brand blue as a literal for accents that must never drift
        avir: {
          blue: "#1019EC",
        },
      },
      fontFamily: {
        serif: ["var(--font-instrument-serif)", "Georgia", "serif"],
        display: ["var(--font-instrument-serif)", "Georgia", "serif"],
        sans: ["var(--font-satoshi)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        // Dense, technical scale from the reference
        eyebrow: ["11px", { lineHeight: "1.25", letterSpacing: "0.14em" }],
        xs: ["12px", { lineHeight: "1.5" }],
        sm: ["14px", { lineHeight: "1.5" }],
        base: ["16px", { lineHeight: "1.55" }],
        md: ["16px", { lineHeight: "1.55" }],
        lg: ["20px", { lineHeight: "1.35" }],
        xl: ["24px", { lineHeight: "1.25" }],
        "2xl": ["30px", { lineHeight: "1.15" }],
        "3xl": ["40px", { lineHeight: "1.05" }],
        "4xl": ["56px", { lineHeight: "1.02" }],
      },
      // NOTE: we intentionally do NOT override the numeric `spacing` scale.
      // Doing so remaps every h-*/w-*/p-*/gap-* utility (e.g. h-9 would become
      // 96px instead of 36px). The AVIR density comes from the specific padding
      // values chosen in components, using Tailwind's default 4px-step scale.
      borderWidth: {
        DEFAULT: "0.5px",
        hairline: "0.5px",
        1: "1px",
      },
      borderRadius: {
        // Zero radius across the board. Aliased so shadcn's radius refs resolve to 0.
        none: "0",
        sm: "0",
        DEFAULT: "0",
        md: "0",
        lg: "0",
        xl: "0",
        full: "9999px", // reserved strictly for severity dots
      },
      transitionTimingFunction: {
        avir: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      transitionDuration: {
        micro: "150ms",
        panel: "250ms",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 250ms cubic-bezier(0.4,0,0.2,1)",
        "accordion-up": "accordion-up 250ms cubic-bezier(0.4,0,0.2,1)",
        "fade-in": "fade-in 150ms cubic-bezier(0.4,0,0.2,1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
