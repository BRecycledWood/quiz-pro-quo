import { useMemo, useState } from "react";
import { ImagePlus, Lock, RotateCcw, Upload } from "lucide-react";
import type { PackBranding } from "@shared/pack";
import type { FeatureEntitlements } from "@shared/entitlements";
import type { Workspace } from "@shared/schema";
import { resolvePackBranding } from "@shared/branding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const inputClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

async function fileToDataUrl(file: File): Promise<string> {
  if (!(["image/png", "image/jpeg"].includes(file.type))) throw new Error("Choose a PNG or JPEG logo file.");
  if (file.size <= 0 || file.size > 512 * 1024) throw new Error("Logo files must be 512 KB or smaller.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const png = file.type === "image/png" && bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte);
  const jpeg = file.type === "image/jpeg" && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!png && !jpeg) throw new Error("The file content does not match a valid PNG or JPEG image.");
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Unable to read this logo file."));
    reader.onerror = () => reject(new Error("Unable to read this logo file."));
    reader.readAsDataURL(file);
  });
}

function rgbaColorContrast(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const raw = hex.replace(/^#/, "");
    const full = raw.length === 3 ? raw.split("").map((char) => char + char).join("") : raw;
    if (!/^[\da-f]{6}$/i.test(full)) return null;
    const components = [0, 2, 4].map((index) => Number.parseInt(full.slice(index, index + 2), 16) / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * components[0]! + 0.7152 * components[1]! + 0.0722 * components[2]!;
  };
  const a = luminance(foreground);
  const b = luminance(background);
  if (a === null || b === null) return 21;
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

export default function BrandingEditor({
  value,
  workspace,
  scope,
  entitlements,
  onChange,
}: {
  value: PackBranding;
  workspace: Workspace;
  scope: "assessment" | "workspace";
  entitlements: FeatureEntitlements;
  onChange: (next: PackBranding) => void;
}) {
  const [fileError, setFileError] = useState("");
  const resolved = useMemo(() => scope === "assessment"
    ? resolvePackBranding(workspace, value)
    : resolvePackBranding({ ...workspace, brandSettings: value }, undefined), [workspace, value, scope]);
  const asset = resolved.logoDataUrl ?? resolved.logoUrl;
  const setField = <K extends keyof PackBranding>(field: K, next: PackBranding[K] | undefined) => {
    const updated = { ...value };
    if (next === undefined) delete updated[field];
    else updated[field] = next;
    onChange(updated);
  };
  const overrideAction = (field: keyof PackBranding) => scope === "assessment" && value[field] !== undefined ? (
    <button type="button" onClick={() => setField(field, undefined)} className="text-[10px] font-medium text-primary hover:underline">Use workspace default</button>
  ) : scope === "assessment" ? <span className="text-[10px] text-muted-foreground">Inherited by default</span> : null;
  const fullPaletteLocked = !entitlements.fullPalette;
  const logoLocked = !entitlements.customLogo;
  const fontLocked = !entitlements.expandedTypography;

  const contrastWarnings = resolved.textColor && resolved.backgroundColor && rgbaColorContrast(resolved.textColor, resolved.backgroundColor) < 4.5
    ? ["Body text on the page background must reach 4.5:1 contrast. Button foreground contrast is selected automatically."]
    : [];

  const colorField = (field: "primaryColor" | "secondaryColor" | "backgroundColor" | "textColor", label: string, gated: boolean) => {
    const effective = resolved[field] ?? "#4f46e5";
    const locked = gated && fullPaletteLocked;
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2"><Label htmlFor={`brand-${field}`} className="text-xs">{label}</Label>{overrideAction(field)}</div>
        <div className="flex items-center gap-2"><input id={`brand-${field}`} type="color" value={/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(effective) ? effective : "#4f46e5"} disabled={locked} onChange={(event) => setField(field, event.target.value)} className="h-9 w-11 cursor-pointer rounded-md border bg-background p-1 disabled:cursor-not-allowed disabled:opacity-50" /><Input value={value[field] ?? effective} disabled={locked} aria-label={`${label} hex code`} onChange={(event) => setField(field, event.target.value)} className="h-9 font-mono text-xs" />{locked ? <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Branding entitlement required" /> : null}</div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900 dark:bg-indigo-950/20">
        <div><p className="text-sm font-semibold">{scope === "assessment" ? "Assessment overrides" : "Workspace brand defaults"}</p><p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{scope === "assessment" ? "Unset fields inherit from this workspace. Choose a theme, then override only the details that should be unique to this assessment." : "These settings are inherited by assessments in this workspace unless an assessment explicitly overrides them."}</p></div>
        <span className="rounded-full border bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide dark:bg-card">Workspace tier · {workspace.brandPlan ?? "free"}</span>
      </div>

      <div className="grid gap-4 rounded-2xl border bg-card p-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2"><div className="flex items-center justify-between gap-2"><Label htmlFor="brand-name" className="text-xs">Brand name</Label>{overrideAction("brandName")}</div><div className="flex gap-2"><Input id="brand-name" value={value.brandName ?? resolved.brandName ?? workspace.name} disabled={logoLocked} onChange={(event) => setField("brandName", event.target.value)} placeholder={workspace.name} />{logoLocked ? <Lock className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" aria-label="Branding entitlement required" /> : null}</div><p className="text-[10px] text-muted-foreground">Used in the assessment header and PDF. The assessment title remains separate.</p></div>

        <div className="space-y-1.5 sm:col-span-2"><div className="flex items-center justify-between gap-2"><Label className="text-xs">Logo asset</Label>{overrideAction("logoDataUrl")}</div><div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-3"><div className="grid h-14 w-20 place-items-center overflow-hidden rounded-lg bg-muted/60">{asset ? <img src={asset} alt="Brand logo preview" className="max-h-12 max-w-[4.5rem] object-contain" /> : <ImagePlus className="h-5 w-5 text-muted-foreground" />}</div><div className="min-w-[160px] flex-1"><Label htmlFor="brand-logo-file" className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-xs font-medium ${logoLocked ? "pointer-events-none opacity-50" : "hover:bg-muted"}`}><Upload className="h-3.5 w-3.5" />Upload PNG or JPEG <span className="text-muted-foreground">≤ 512 KB</span></Label><input id="brand-logo-file" type="file" accept="image/png,image/jpeg" className="sr-only" disabled={logoLocked} onChange={async (event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; setFileError(""); try { const dataUrl = await fileToDataUrl(file); onChange({ ...value, logoDataUrl: dataUrl, logoUrl: undefined }); } catch (error) { setFileError(error instanceof Error ? error.message : "Invalid logo file."); } }} /><p className="mt-1 text-[10px] text-muted-foreground">The file is signature-checked in your browser and again by the server.</p></div>{logoLocked ? <Lock className="h-4 w-4 text-muted-foreground" aria-label="Branding entitlement required" /> : null}</div>{fileError ? <p role="alert" className="text-xs text-destructive">{fileError}</p> : null}<div className="space-y-1.5"><Label htmlFor="brand-logo-url" className="text-[11px] text-muted-foreground">Or use a hosted HTTPS logo</Label><div className="flex gap-2"><Input id="brand-logo-url" value={value.logoUrl ?? resolved.logoUrl ?? ""} disabled={logoLocked} onChange={(event) => onChange({ ...value, logoUrl: event.target.value || undefined, logoDataUrl: undefined })} placeholder="https://example.com/logo.png" /><button type="button" onClick={() => { const next = { ...value }; delete next.logoUrl; delete next.logoDataUrl; onChange(next); }} className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground">Clear</button></div></div></div>

        <div className="space-y-1.5 sm:col-span-2"><div className="flex items-center justify-between gap-2"><Label htmlFor="brand-theme" className="text-xs">Theme preset</Label>{overrideAction("themePreset")}</div><select id="brand-theme" className={inputClass} value={value.themePreset ?? resolved.themePreset ?? "studio"} onChange={(event) => setField("themePreset", event.target.value as PackBranding["themePreset"])}><option value="studio">Studio · polished indigo</option><option value="ocean">Ocean · calm teal</option><option value="grove">Grove · grounded green</option><option value="sunrise">Sunrise · warm terracotta</option><option value="ink">Ink · understated slate</option></select></div>

        {colorField("primaryColor", "Primary accent", false)}
        {colorField("secondaryColor", "Secondary accent", true)}
        {colorField("backgroundColor", "Page background", true)}
        {colorField("textColor", "Body text", true)}
        {contrastWarnings.length ? <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 sm:col-span-2 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">{contrastWarnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : null}

        <div className="space-y-1.5"><div className="flex items-center justify-between gap-2"><Label htmlFor="brand-font" className="text-xs">Typography</Label>{overrideAction("fontPreset")}</div><select id="brand-font" className={inputClass} value={value.fontPreset ?? resolved.fontPreset ?? "system"} onChange={(event) => setField("fontPreset", event.target.value as PackBranding["fontPreset"])}><option value="system">System sans</option><option value="modern">Modern sans</option><option value="friendly" disabled={fontLocked}>Friendly rounded {!entitlements.expandedTypography ? "· locked" : ""}</option><option value="editorial" disabled={fontLocked}>Editorial {!entitlements.expandedTypography ? "· locked" : ""}</option><option value="rounded" disabled={fontLocked}>Rounded {!entitlements.expandedTypography ? "· locked" : ""}</option><option value="serif" disabled={fontLocked}>Serif {!entitlements.expandedTypography ? "· locked" : ""}</option></select></div>
        <div className="space-y-1.5"><div className="flex items-center justify-between gap-2"><Label htmlFor="custom-font" className="text-xs">Custom font family</Label>{overrideAction("customFontFamily")}</div><div className="flex items-center gap-2"><Input id="custom-font" value={value.customFontFamily ?? resolved.customFontFamily ?? ""} disabled={fontLocked || logoLocked} onChange={(event) => setField("customFontFamily", event.target.value || undefined)} placeholder="e.g. Georgia" />{fontLocked || logoLocked ? <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Branding entitlement required" /> : null}</div></div>

        <div className="space-y-1.5"><div className="flex items-center justify-between gap-2"><Label htmlFor="brand-button" className="text-xs">Button shape</Label>{overrideAction("buttonStyle")}</div><select id="brand-button" className={inputClass} value={value.buttonStyle ?? resolved.buttonStyle ?? "rounded"} onChange={(event) => setField("buttonStyle", event.target.value as PackBranding["buttonStyle"])}><option value="rounded">Rounded</option><option value="pill">Pill</option><option value="square" disabled={!entitlements.expandedTypography}>Square {!entitlements.expandedTypography ? "· locked" : ""}</option></select></div>
        <div className="space-y-1.5"><div className="flex items-center justify-between gap-2"><Label htmlFor="brand-progress" className="text-xs">Progress indicator</Label>{overrideAction("progressStyle")}</div><select id="brand-progress" className={inputClass} value={value.progressStyle ?? resolved.progressStyle ?? "bar"} onChange={(event) => setField("progressStyle", event.target.value as PackBranding["progressStyle"])}><option value="bar">Progress bar</option><option value="steps">Question steps</option><option value="minimal">Minimal percentage</option></select></div>
        <div className="flex items-center justify-between gap-3 rounded-xl border p-3 sm:col-span-2"><div><p className="text-xs font-medium">Show Quiz Pro Quo attribution</p><p className="mt-0.5 text-[10px] text-muted-foreground">Attribution is kept on free workspaces.</p></div><div className="flex items-center gap-2">{overrideAction("showAttribution")}<input aria-label="Show Quiz Pro Quo attribution" type="checkbox" checked={value.showAttribution ?? resolved.showAttribution !== false} disabled={!entitlements.removeAttribution && value.showAttribution !== false} onChange={(event) => setField("showAttribution", event.target.checked)} className="h-4 w-4 accent-primary" />{!entitlements.removeAttribution ? <Lock className="h-3.5 w-3.5 text-muted-foreground" /> : null}</div></div>
      </div>

      {scope === "assessment" ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-slate-50 p-3 text-[11px] text-muted-foreground dark:bg-muted/20"><span>Unchanged settings inherit from workspace defaults, and the preview updates immediately.</span><Button type="button" variant="ghost" size="sm" onClick={() => onChange({})} className="h-7 gap-1.5 text-xs"><RotateCcw className="h-3.5 w-3.5" />Clear all overrides</Button></div> : null}
      {!entitlements.customLogo || !entitlements.fullPalette ? <p className="text-[10px] leading-5 text-muted-foreground">Custom logo, full palette, expanded typography, and attribution controls are checked against server-side workspace entitlements when you save. No billing or prices are configured in this builder.</p> : null}
    </div>
  );
}
