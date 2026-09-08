import type { Config } from "tailwindcss";

// Each token pairs with a `rgb(<var> / <alpha>)` CSS var in globals.css, so
// opacity modifiers (e.g. bg-accent/20) blend correctly instead of silently
// no-op'ing (which falls back to currentColor — a real bug seen with
// border-line/60 rendering as a bright line in dark mode).
function withOpacity(variable: string) {
  return `rgb(var(${variable}) / <alpha-value>)`;
}

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: withOpacity("--bg"),
        panel: withOpacity("--panel"),
        "panel-muted": withOpacity("--panel-muted"),
        line: withOpacity("--line"),
        "line-strong": withOpacity("--line-strong"),
        ink: withOpacity("--ink"),
        "ink-muted": withOpacity("--ink-muted"),
        "ink-faint": withOpacity("--ink-faint"),
        accent: withOpacity("--accent"),
      },
    },
  },
  plugins: [],
};

export default config;
