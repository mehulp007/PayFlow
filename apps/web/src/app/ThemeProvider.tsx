import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';
const STORAGE_KEY = 'payflow-theme';

interface ThemeContextValue {
  theme: Theme;
  toggle(): void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** The theme index.html applied before the first paint (saved choice, else the system preference). */
function initialTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/** Light and dark themes swap design tokens only; layouts and components are the same. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#0f1626' : '#f5f7fb');
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme(current => {
      const next = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Storage can be unavailable (private windows); the choice then lasts for this visit.
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}

/** Chart colours read from the current theme's tokens, so charts follow light and dark mode. */
export function useChartColors() {
  const { theme } = useTheme();
  return useMemo(() => {
    const style = getComputedStyle(document.documentElement);
    const token = (name: string) => style.getPropertyValue(name).trim();
    return {
      theme,
      primary: token('--color-accent'),
      mint: token('--color-success'),
      rose: token('--color-danger'),
      violet: token('--color-violet'),
      amber: token('--color-warning'),
      sky: token('--chart-sky'),
      grid: token('--color-border'),
      text: token('--color-text-muted'),
      surface: token('--color-surface'),
      series: [
        token('--color-accent'),
        token('--color-success'),
        token('--color-violet'),
        token('--color-warning'),
        token('--chart-sky'),
        token('--color-danger'),
      ],
    };
  }, [theme]);
}
