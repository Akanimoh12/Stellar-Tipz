export const THEME_COLORS: Record<string, { bg: string; accent: string; label: string }> = {
  default:  { bg: "bg-white",           accent: "bg-yellow-100", label: "Default"  },
  ocean:    { bg: "bg-blue-50",          accent: "bg-blue-200",   label: "Ocean"    },
  forest:   { bg: "bg-green-50",         accent: "bg-green-200",  label: "Forest"   },
  sunset:   { bg: "bg-orange-50",        accent: "bg-orange-200", label: "Sunset"   },
  midnight: { bg: "bg-gray-900 text-white", accent: "bg-gray-700", label: "Midnight" },
};

export type ThemeKey = keyof typeof THEME_COLORS;
