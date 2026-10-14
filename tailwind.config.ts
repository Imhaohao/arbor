import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/** A color backed by an oklch channel token in app/globals.css. */
const token = (name: string) => `oklch(var(--${name}) / <alpha-value>)`;

const RAMP_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
const ramp = (name: string) =>
  Object.fromEntries(RAMP_STEPS.map((step) => [step, token(`${name}-${step}`)]));

const canopy = {
  50: token("surface-subtle"),
  100: token("surface-muted"),
  200: token("line"),
  300: token("line-strong"),
  400: token("ink-faint"),
  500: token("ink-subtle"),
  600: token("ink-muted"),
  700: token("ink-soft"),
  800: token("ink"),
  900: token("ink"),
  950: token("ink"),
};

const config: Config = {
  darkMode: "media",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    // The type system never adjusts letter-spacing; width and weight carry
    // display character instead (see .type-* in globals.css).
    letterSpacing: {
      tighter: "0",
      tight: "0",
      normal: "0",
      wide: "0",
      wider: "0",
      widest: "0",
    },
    extend: {
      colors: {
        brand: ramp("brand"),
        moss: ramp("moss"),
        ember: ramp("ember"),
        glow: token("glow"),
        success: { DEFAULT: token("moss-600"), ...ramp("moss") },
        warning: { DEFAULT: token("warn-600"), ...ramp("warn") },
        danger: { DEFAULT: token("danger-600"), ...ramp("danger") },
        info: { DEFAULT: token("brand-600"), ...ramp("brand") },
        // Raw Tailwind hue names still present in older components resolve
        // to the semantic ramps so they theme correctly in both modes.
        emerald: ramp("moss"),
        green: ramp("moss"),
        teal: ramp("brand"),
        amber: ramp("warn"),
        yellow: ramp("warn"),
        orange: ramp("ember"),
        rose: ramp("danger"),
        red: ramp("danger"),
        sky: ramp("brand"),
        blue: ramp("brand"),
        indigo: ramp("brand"),
        violet: ramp("brand"),
        purple: ramp("brand"),
        slate: canopy,
        gray: canopy,
        zinc: canopy,
        neutral: canopy,
        surface: {
          DEFAULT: token("surface"),
          subtle: token("surface-subtle"),
          muted: token("surface-muted"),
          sunken: token("surface-sunken"),
        },
        ink: {
          DEFAULT: token("ink"),
          soft: token("ink-soft"),
          muted: token("ink-muted"),
          subtle: token("ink-subtle"),
          faint: token("ink-faint"),
        },
        paper: token("paper"),
        line: {
          DEFAULT: token("line"),
          strong: token("line-strong"),
          control: token("line-control"),
        },
        // shadcn semantic names used by the sidebar primitives.
        border: token("line"),
        input: token("line-control"),
        ring: token("brand-500"),
        background: token("surface-subtle"),
        foreground: token("ink"),
        primary: { DEFAULT: token("ink"), foreground: token("paper") },
        secondary: { DEFAULT: token("surface-muted"), foreground: token("ink") },
        destructive: { DEFAULT: token("danger-600"), foreground: token("paper") },
        muted: { DEFAULT: token("surface-muted"), foreground: token("ink-muted") },
        accent: { DEFAULT: token("surface-muted"), foreground: token("ink") },
        popover: { DEFAULT: token("surface"), foreground: token("ink") },
        card: { DEFAULT: token("surface"), foreground: token("ink") },
        sidebar: {
          DEFAULT: token("surface"),
          foreground: token("ink"),
          primary: token("ink"),
          "primary-foreground": token("paper"),
          accent: token("surface-muted"),
          "accent-foreground": token("ink"),
          border: token("line"),
          ring: token("brand-500"),
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        control: "var(--radius-control)",
        card: "var(--radius-card)",
      },
      transitionDuration: {
        DEFAULT: "150ms",
      },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.2, 0, 0, 1)",
        out: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      boxShadow: {
        // Ring + tinted lift. The 0 0 0 1px ring replaces a border on rounded
        // surfaces so corners anti-alias cleanly.
        card: "0 0 0 1px oklch(var(--ink) / 0.07), 0 1px 2px oklch(var(--ink) / 0.05)",
        "card-hover":
          "0 0 0 1px oklch(var(--ink) / 0.1), 0 12px 32px -12px oklch(var(--leaf-1) / 0.35), 0 2px 4px oklch(var(--ink) / 0.05)",
        hairline: "0 0 0 1px oklch(var(--ink) / 0.09)",
        "hairline-strong": "0 0 0 1px oklch(var(--ink) / 0.18)",
        control: "0 0 0 1px oklch(var(--line-control))",
        ring: "0 0 0 4px oklch(var(--brand-500) / 0.25)",
        lantern: "0 0 24px 2px oklch(var(--glow) / 0.45)",
        float:
          "0 0 0 1px oklch(var(--ink) / 0.06), 0 24px 48px -20px oklch(var(--leaf-1) / 0.45)",
      },
      keyframes: {
        "fade-in": { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-down": {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "soft-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        "value-pop": {
          "0%": { transform: "scale(0.94)", opacity: "0.5" },
          "60%": { transform: "scale(1.03)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "caret-blink": {
          "0%, 60%": { opacity: "1" },
          "61%, 100%": { opacity: "0" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-up": "fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-down": "fade-down 0.4s cubic-bezier(0.16, 1, 0.3, 1) both",
        "scale-in": "scale-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both",
        "soft-pulse": "soft-pulse 1.6s ease-in-out infinite",
        "value-pop": "value-pop 0.4s cubic-bezier(0.16, 1, 0.3, 1) both",
        "caret-blink": "caret-blink 1s step-end infinite",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [animate],
};

export default config;
