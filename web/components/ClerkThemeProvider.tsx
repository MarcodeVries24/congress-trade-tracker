"use client";

import { useEffect, useState } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";

// Hand-mapping every Clerk color token to our CSS variables (colorBackground,
// colorText, etc.) worked for the sign-in modal but left <PricingTable />
// cards unreadable — its cards don't consistently pick up all of those
// tokens, so forced light text landed on a background that stayed light too.
// Using Clerk's own maintained light/dark presets (@clerk/themes) is more
// robust across every Clerk component, including Billing — we only nudge
// colorPrimary to match the site's own accent color on top of that.
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
