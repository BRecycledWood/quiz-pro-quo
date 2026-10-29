import { expect, test } from "@playwright/test";

const ADMIN_KEY = "e2e-admin-key-with-at-least-32-characters";

interface WorkspaceResponse {
  workspace: { id: string; name: string; slug: string };
}

interface PackResponse {
  pack: { id: string; name: string; slug: string; publishedVersionId: string | null };
}

test("Builder Studio authors, previews, brands, saves, and publishes without creating a submission", async ({ page, request }) => {
  const suffix = Date.now().toString(36);
  const workspaceName = `Studio E2E ${suffix}`;
  const workspaceSlug = `studio-e2e-${suffix}`;
  const packName = `Branching Assessment ${suffix}`;
  const packSlug = `branching-${suffix}`;
  const headers = { "x-admin-key": ADMIN_KEY };

  const workspaceResponse = await request.post("/api/admin/workspaces", {
    headers,
    data: { name: workspaceName, slug: workspaceSlug },
  });
  expect(workspaceResponse.status()).toBe(201);
  const { workspace } = await workspaceResponse.json() as WorkspaceResponse;

  let submitRequests = 0;
  page.on("request", (browserRequest) => {
    if (browserRequest.method() === "POST" && new URL(browserRequest.url()).pathname.endsWith("/submit")) {
      submitRequests += 1;
    }
  });
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "confirm") await dialog.accept();
    else await dialog.dismiss();
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/studio");

  await page.getByLabel("Admin key").fill(ADMIN_KEY);
  await page.getByRole("button", { name: /Continue to builder/ }).click();
  const workspaceSelect = page.getByLabel("Workspace", { exact: true });
  await expect(workspaceSelect.locator("option", { hasText: workspaceName })).toHaveCount(1);
  await workspaceSelect.selectOption({ label: workspaceName });
  await expect(workspaceSelect).toHaveValue(workspace.id);
  const assessmentSelect = page.getByLabel("Assessment", { exact: true });
  await expect(assessmentSelect.locator("option")).toHaveCount(0);

  await page.getByRole("button", { name: "Create assessment" }).click();
  const createDialog = page.getByRole("dialog");
  await createDialog.getByLabel("Assessment name").fill(packName);
  await createDialog.getByLabel("Public URL slug").fill(packSlug);
  await createDialog.getByRole("button", { name: "Create assessment" }).click();
  await expect(assessmentSelect.locator("option", { hasText: packName })).toHaveCount(1);

  await expect(page.getByLabel("Question prompt")).toBeVisible();
  await expect(page.getByText("This question is used by scoring rules.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove", exact: true })).toBeDisabled();
  await page.getByLabel("Question prompt").fill("Would you like to continue?");
  await page.getByRole("button", { name: "Add question", exact: true }).click();
  await page.getByLabel("Question prompt").fill("What would you like to work on?");

  await page.getByRole("button", { name: /Would you like to continue\?/ }).click();
  await page.getByRole("tab", { name: "Logic", exact: true }).click();
  await expect(page.getByText("Advanced logic is available on every plan.")).toBeVisible();
  const routingSection = page.locator("details").filter({ hasText: "Route after this answer" });
  await routingSection.getByRole("button", { name: "Add route" }).click();
  await routingSection.getByLabel("Next step").selectOption("finish");
  await routingSection.getByLabel("Comparison").selectOption("equals");
  await routingSection.getByLabel("Match value").selectOption("false");

  await page.getByRole("tab", { name: "Branding" }).click();
  await expect(page.getByLabel("Secondary accent hex code")).toBeDisabled();
  await page.getByLabel("Theme preset").selectOption("ocean");

  await page.getByRole("button", { name: "Mobile preview" }).click();
  await expect(page.locator('[class*="max-w-[390px]"]')).toBeVisible();
  await page.getByRole("button", { name: "Enter focus mode" }).click();
  await expect(page.getByRole("button", { name: "Exit focus mode" })).toBeVisible();
  await page.getByRole("button", { name: "Exit focus mode" }).click();

  await page.getByRole("button", { name: "Begin assessment" }).click();
  await page.getByRole("button", { name: "Yes", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What would you like to work on?" })).toBeVisible();
  await page.getByPlaceholder("Type your answer…").fill("Planning");
  await page.getByRole("button", { name: "See result", exact: true }).click();
  await expect(page.getByRole("heading", { name: "You are on the right track" })).toBeVisible();

  await page.getByRole("button", { name: "Reset preview" }).click();
  await page.getByRole("button", { name: "Begin assessment" }).click();
  await page.getByRole("button", { name: "No", exact: true }).click();
  await page.getByRole("button", { name: "See result", exact: true }).click();
  await expect(page.getByRole("heading", { name: "A good place to start" })).toBeVisible();
  expect(submitRequests).toBe(0);

  await page.getByRole("button", { name: "Save version" }).click();
  await expect(page.getByRole("status")).toContainText("Saved version 1");
  const publishResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname.includes("/publish/"),
  );
  await page.getByRole("button", { name: "Publish", exact: false }).click();
  const publishResponse = await publishResponsePromise;
  expect(publishResponse.status()).toBe(200);
  await expect(page.getByRole("status")).toContainText("Published successfully");

  const publicResponse = await request.get(`/api/public/w/${workspaceSlug}/${packSlug}`);
  expect(publicResponse.ok()).toBeTruthy();
  const publicAssessment = await publicResponse.json() as {
    pack: { publishedVersionId: string | null };
    definition: { branding?: { themePreset?: string }; routing?: unknown[] };
  };
  expect(publicAssessment.pack.publishedVersionId).toBeTruthy();
  expect(publicAssessment.definition.branding?.themePreset).toBe("ocean");
  expect(publicAssessment.definition.routing).toHaveLength(1);

  const submissionsResponse = await request.get(`/api/admin/workspaces/${workspace.id}/submissions?limit=20`, { headers });
  expect(submissionsResponse.ok()).toBeTruthy();
  const submissions = await submissionsResponse.json() as { submissions: unknown[] };
  expect(submissions.submissions).toHaveLength(0);
});
