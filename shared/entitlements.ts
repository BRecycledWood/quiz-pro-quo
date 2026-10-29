import type { BrandPlan } from "./pack";

export interface FeatureEntitlements {
  /** Logic, routing, formulas, categories, preview and debugging are available on every plan. */
  advancedLogic: true;
  livePreview: true;
  logicDebugger: true;
  themePresets: true;
  accentColor: true;
  basicTypography: true;
  customLogo: boolean;
  fullPalette: boolean;
  expandedTypography: boolean;
  brandedPdf: boolean;
  removeAttribution: boolean;
}

const FREE_ENTITLEMENTS: FeatureEntitlements = {
  advancedLogic: true,
  livePreview: true,
  logicDebugger: true,
  themePresets: true,
  accentColor: true,
  basicTypography: true,
  customLogo: false,
  fullPalette: false,
  expandedTypography: false,
  brandedPdf: false,
  removeAttribution: false,
};

const FULL_BRANDING: FeatureEntitlements = {
  ...FREE_ENTITLEMENTS,
  customLogo: true,
  fullPalette: true,
  expandedTypography: true,
  brandedPdf: true,
  removeAttribution: true,
};

/** Entitlements are resolved server-side from workspace state; there is no billing here. */
export function getFeatureEntitlements(plan: BrandPlan | string | null | undefined): FeatureEntitlements {
  switch (plan) {
    case "pro":
    case "agency":
    case "legacy":
      return { ...FULL_BRANDING };
    case "free":
    default:
      return { ...FREE_ENTITLEMENTS };
  }
}

export function getBrandEntitlementIssues(
  branding: unknown,
  entitlements: FeatureEntitlements,
): string[] {
  if (!branding || typeof branding !== "object" || Array.isArray(branding)) return [];
  const value = branding as Record<string, unknown>;
  const issues: string[] = [];
  if ((value.logoDataUrl || value.logoUrl || value.brandName) && !entitlements.customLogo) {
    issues.push("A custom logo or brand name requires a branding entitlement.");
  }
  if (value.customFontFamily && !entitlements.expandedTypography) {
    issues.push("A custom font family requires a branding entitlement.");
  }
  if ((value.secondaryColor || value.backgroundColor || value.textColor) && !entitlements.fullPalette) {
    issues.push("A full brand palette requires a branding entitlement; the accent color and theme presets remain free.");
  }
  if (value.fontPreset && !["system", "modern"].includes(String(value.fontPreset)) && !entitlements.expandedTypography) {
    issues.push("This font preset requires a branding entitlement.");
  }
  if (value.showAttribution === false && !entitlements.removeAttribution) {
    issues.push("Removing Quiz Pro Quo attribution requires a branding entitlement.");
  }
  if (value.buttonStyle === "square" && !entitlements.expandedTypography) {
    issues.push("This button style requires a branding entitlement.");
  }
  return issues;
}
