import { createContext, useContext, useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";

type Theme = "dark" | "light";

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  );
  const [loaded, setLoaded] = useState(false);

  // On mount, fetch the persisted theme from the backend
  useEffect(() => {
    apiRequest("GET", "/api/settings")
      .then((data: Record<string, string>) => {
        if (data && (data.theme === "dark" || data.theme === "light")) {
          setTheme(data.theme);
        }
      })
      .catch(() => {
        // Silently fall back to system preference already set in useState initialiser
      })
      .finally(() => {
        setLoaded(true);
      });
  }, []);

  // Apply theme to DOM whenever it changes
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  const toggle = () => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      // Persist to backend (fire-and-forget)
      apiRequest("POST", "/api/settings", { theme: next }).catch(() => {});
      return next;
    });
  };

  return (
    <ThemeCtx.Provider value={{ theme, toggle }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
