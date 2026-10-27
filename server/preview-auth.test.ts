import assert from "node:assert/strict";
import test from "node:test";
import { isVercelStudioPreviewAuthEnabled } from "./preview-auth";

const keys = [
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_TARGET_ENV",
  "VERCEL_PROJECT_ID",
  "STUDIO_PREVIEW_SSO",
  "STUDIO_PREVIEW_PROJECT_ID",
] as const;

test("Vercel SSO admin bypass is limited to the configured preview project", () => {
  const original = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    keys.forEach((key) => delete process.env[key]);
    assert.equal(isVercelStudioPreviewAuthEnabled(), false);

    Object.assign(process.env, {
      VERCEL: "1",
      VERCEL_ENV: "preview",
      VERCEL_PROJECT_ID: "project-preview",
      STUDIO_PREVIEW_SSO: "true",
      STUDIO_PREVIEW_PROJECT_ID: "project-preview",
    });
    assert.equal(isVercelStudioPreviewAuthEnabled(), true);

    process.env.VERCEL_ENV = "production";
    assert.equal(isVercelStudioPreviewAuthEnabled(), false);

    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_TARGET_ENV = "staging";
    assert.equal(isVercelStudioPreviewAuthEnabled(), true);

    process.env.VERCEL_TARGET_ENV = "production";
    assert.equal(isVercelStudioPreviewAuthEnabled(), false);

    process.env.VERCEL_TARGET_ENV = "preview";
    process.env.VERCEL_PROJECT_ID = "different-project";
    assert.equal(isVercelStudioPreviewAuthEnabled(), false);
  } finally {
    for (const key of keys) {
      const value = original.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
