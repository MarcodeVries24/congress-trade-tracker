"use client";

import { useEffect, useState } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";

// Hand-mapping every Clerk color token to our CSS variables (colorBackground,
// colorText, etc.) worked for the sign-in modal but not for Clerk's larger
// components, which don't consistently pick up all of those tokens: forced
// light text landed on a background that stayed light too. Clerk's own
// maintained light/dark presets (@clerk/themes) are robust across all of
// them, and we only nudge colorPrimary to the site's accent on top.
const LIGHT_ACCENT = "#0284c7";
const DARK_ACCENT = "#38bdf8";

export function ClerkThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setIsDark(root.classList.contains("dark"));
    sync();
    // Picks up the toggle from ThemeToggle.tsx (which just flips the class),
    // not just the initial page-load theme.
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <ClerkProvider
      appearance={{
        baseTheme: isDark ? dark : undefined,
        variables: { colorPrimary: isDark ? DARK_ACCENT : LIGHT_ACCENT, borderRadius: "0.375rem" },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
