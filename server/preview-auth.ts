/**
 * Vercel SSO is the user authentication boundary for the dedicated staging
 * preview. Keep this opt-in limited to the exact Vercel Preview deployment
 * configured for this project; every other environment uses ADMIN_KEY.
 */
export function isVercelStudioPreviewAuthEnabled() {
  const projectId = process.env.VERCEL_PROJECT_ID;
  const previewTarget =
    process.env.VERCEL_ENV === "preview" &&
    (!process.env.VERCEL_TARGET_ENV || process.env.VERCEL_TARGET_ENV === "preview");
  const stagingTarget = process.env.VERCEL_TARGET_ENV === "staging";
  return Boolean(
    process.env.VERCEL === "1" &&
    (previewTarget || stagingTarget) &&
    process.env.STUDIO_PREVIEW_SSO === "true" &&
    projectId &&
    process.env.STUDIO_PREVIEW_PROJECT_ID === projectId,
  );
}
