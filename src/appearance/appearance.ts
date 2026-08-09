import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { createStore } from "zustand/vanilla";

// export const DEFAULT_ACCENT_COLOR = "#fdca42";
export const DEFAULT_ACCENT_COLOR = "#DF800F";
export const DEFAULT_THEME_MODE = "system";

export const accentColorOptions = [
  "#5D5FEF",
  "#007AFF",
  "#00875A",
  DEFAULT_ACCENT_COLOR,
  "#C026D3",
  "#DC2626",
] as const;

const PREVIOUS_DEFAULT_ACCENT_COLOR = "#5D5FEF";

export type ThemeMode = "system" | "light" | "dark";

export interface AppearanceState {
  readonly accentColor: string;
  readonly themeMode: ThemeMode;
  readonly setAccentColor: (color: string) => void;
  readonly setThemeMode: (mode: ThemeMode) => void;
  readonly restoreDefaults: () => void;
}

/** Device-preference module. Callers never learn serialization or persistence details. */
export function createAppearanceStore(storage: StateStorage) {
  return createStore<AppearanceState>()(
    persist(
      (set) => ({
        accentColor: DEFAULT_ACCENT_COLOR,
        themeMode: DEFAULT_THEME_MODE,
        setAccentColor: (color) => {
          const normalized = normalizeHexColor(color);
          if (!normalized) throw new Error("Accent color must be a six-digit hex color.");
          set({ accentColor: normalized });
        },
        setThemeMode: (themeMode) => set({ themeMode }),
        restoreDefaults: () =>
          set({ accentColor: DEFAULT_ACCENT_COLOR, themeMode: DEFAULT_THEME_MODE }),
      }),
      {
        name: "appearance",
        version: 2,
        storage: createJSONStorage(() => storage),
        migrate: (persistedState, version) => {
          const previous = persistedState as Partial<AppearanceState>;
          if (
            version < 2 &&
            previous.accentColor?.toUpperCase() === PREVIOUS_DEFAULT_ACCENT_COLOR
          ) {
            return { ...previous, accentColor: DEFAULT_ACCENT_COLOR } as AppearanceState;
          }
          return previous as AppearanceState;
        },
        partialize: ({ accentColor, themeMode }) => ({ accentColor, themeMode }),
      },
    ),
  );
}

export function accentForeground(hex: string): "#000000" | "#FFFFFF" {
  const normalized = normalizeHexColor(hex);
  if (!normalized) throw new Error("Accent color must be a six-digit hex color.");
  const [red, green, blue] = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(normalized.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  const whiteContrast = 1.05 / (luminance + 0.05);
  const blackContrast = (luminance + 0.05) / 0.05;
  return blackContrast >= whiteContrast ? "#000000" : "#FFFFFF";
}

function normalizeHexColor(color: string): string | null {
  const value = color.trim();
  return /^#[\dA-Fa-f]{6}$/.test(value) ? value.toUpperCase() : null;
}
