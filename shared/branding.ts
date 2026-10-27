import type { PackBranding } from "./pack";

export interface WorkspaceBrandSource {
  name?: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  brandSettings?: PackBranding | null;
}

export const BRAND_THEME_PRESETS: Record<NonNullable<PackBranding["themePreset"]>, Required<Pick<PackBranding, "primaryColor" | "secondaryColor" | "backgroundColor" | "textColor">>> = {
  studio: { primaryColor: "#4f46e5", secondaryColor: "#818cf8", backgroundColor: "#f8f9fc", textColor: "#172033" },
  ocean: { primaryColor: "#087e8b", secondaryColor: "#35a7a0", backgroundColor: "#f1fbfb", textColor: "#153339" },
  grove: { primaryColor: "#347a55", secondaryColor: "#7aaa72", backgroundColor: "#f5faf5", textColor: "#1f3328" },
  sunrise: { primaryColor: "#c45b32", secondaryColor: "#ed9b59", backgroundColor: "#fff8f1", textColor: "#42271d" },
  ink: { primaryColor: "#343846", secondaryColor: "#71798c", backgroundColor: "#f7f7f8", textColor: "#20212a" },
};

const FONT_PRESETS: Record<NonNullable<PackBranding["fontPreset"]>, string> = {
  system: "Inter, ui-sans-serif, system-ui, sans-serif",
  modern: "Inter, ui-sans-serif, system-ui, sans-serif",
  friendly: "Nunito, Inter, ui-sans-serif, system-ui, sans-serif",
  editorial: "Georgia, 'Times New Roman', serif",
  rounded: "Nunito, ui-sans-serif, system-ui, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
};

export function resolvePackBranding(
  workspace: WorkspaceBrandSource | null | undefined,
  override?: PackBranding | null,
): PackBranding {
  const workspaceSettings = workspace?.brandSettings ?? {};
  const base: PackBranding = {
    brandName: workspaceSettings.brandName ?? workspace?.name,
    logoUrl: workspaceSettings.logoUrl ?? workspace?.logoUrl ?? undefined,
    primaryColor: workspaceSettings.primaryColor ?? workspace?.primaryColor ?? undefined,
    secondaryColor: workspaceSettings.secondaryColor ?? workspace?.secondaryColor ?? undefined,
    themePreset: workspaceSettings.themePreset ?? "studio",
    fontPreset: workspaceSettings.fontPreset ?? "system",
    buttonStyle: workspaceSettings.buttonStyle ?? "rounded",
    progressStyle: workspaceSettings.progressStyle ?? "bar",
    showAttribution: workspaceSettings.showAttribution ?? true,
    ...workspaceSettings,
  };
  const merged: PackBranding = { ...base, ...(override ?? {}) };
  const preset = BRAND_THEME_PRESETS[merged.themePreset ?? "studio"] ?? BRAND_THEME_PRESETS.studio;
  return {
    ...merged,
    primaryColor: merged.primaryColor ?? preset.primaryColor,
    secondaryColor: merged.secondaryColor ?? preset.secondaryColor,
    backgroundColor: merged.backgroundColor ?? preset.backgroundColor,
    textColor: merged.textColor ?? preset.textColor,
    fontPreset: merged.fontPreset ?? "system",
    buttonStyle: merged.buttonStyle ?? "rounded",
    progressStyle: merged.progressStyle ?? "bar",
    showAttribution: merged.showAttribution ?? true,
  };
}

export function getBrandFontFamily(branding: PackBranding): string {
  const custom = branding.customFontFamily?.trim();
  if (custom && custom.length <= 100 && /^[\w\s,'"()-]+$/.test(custom)) return custom;
  return FONT_PRESETS[branding.fontPreset ?? "system"] ?? FONT_PRESETS.system;
}

export function hexToHsl(value: string | undefined, fallback: string): string {
  const hex = (value ?? fallback).replace(/^#/, "");
  const expanded = hex.length === 3 ? hex.split("").map((part) => part + part).join("") : hex;
  if (!/^[\da-f]{6}$/i.test(expanded)) return "0 0% 100%";
  const channels = [0, 2, 4].map((index) => Number.parseInt(expanded.slice(index, index + 2), 16) / 255);
  const [red, green, blue] = channels;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta !== 0) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
  }
  hue = Math.round((hue * 60 + 360) % 360);
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return `${hue} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%`;
}

function relativeLuminance(color: string): number {
  const raw = color.replace(/^#/, "");
  const expanded = raw.length === 3 ? raw.split("").map((part) => part + part).join("") : raw;
  if (!/^[\da-f]{6}$/i.test(expanded)) return 0.22;
  const channels = [0, 2, 4].map((index) => Number.parseInt(expanded.slice(index, index + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function getPrimaryForeground(color: string): string {
  const luminance = relativeLuminance(color);
  const contrastWithWhite = 1.05 / (luminance + 0.05);
  const contrastWithInk = (luminance + 0.05) / (relativeLuminance("#172033") + 0.05);
  return contrastWithWhite >= contrastWithInk ? "#ffffff" : "#172033";
}

export function getBrandCssVariables(branding: PackBranding): Record<string, string> {
  const primary = branding.primaryColor ?? BRAND_THEME_PRESETS.studio.primaryColor;
  const secondary = branding.secondaryColor ?? BRAND_THEME_PRESETS.studio.secondaryColor;
  const background = branding.backgroundColor ?? BRAND_THEME_PRESETS.studio.backgroundColor;
  const text = branding.textColor ?? BRAND_THEME_PRESETS.studio.textColor;
  return {
    "--primary": hexToHsl(primary, "#4f46e5"),
    "--ring": hexToHsl(primary, "#4f46e5"),
    "--primary-foreground": hexToHsl(getPrimaryForeground(primary), "#ffffff"),
    "--background": hexToHsl(background, "#f8f9fc"),
    "--foreground": hexToHsl(text, "#172033"),
    "--brand-secondary": secondary,
    "--brand-font": getBrandFontFamily(branding),
    "--brand-radius": branding.buttonStyle === "pill" ? "9999px" : branding.buttonStyle === "square" ? "0.35rem" : "0.9rem",
  };
}
