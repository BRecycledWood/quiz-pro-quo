import { expect, test } from "@playwright/test";

const ADMIN_KEY = "e2e-admin-key-with-at-least-32-characters";
const packPath = "/w/demo/insurance-eligibility";

test("visitor completes a public assessment, saves a lead, sees server results, and downloads a PDF", async ({ page, request }) => {
  const packResponse = await request.get("/api/public/w/demo/insurance-eligibility");
  expect(packResponse.ok()).toBeTruthy();
  const publicPack = await packResponse.json() as { workspace: { id: string } };

  // Keep this integration test fully offline and avoid sending email. The public
  // demo record uses a remote placeholder logo; remove it before PDF generation.
  const customize = await request.put(`/api/admin/workspaces/${publicPack.workspace.id}`, {
    headers: { "x-admin-key": ADMIN_KEY },
    data: { logoUrl: null },
  });
  expect(customize.ok()).toBeTruthy();

  await page.goto(packPath);
  await page.getByRole("button", { name: "Start assessment" }).click();

  await expect(page.getByRole("heading", { name: "What is the applicant's age?" })).toBeVisible();
  await page.getByRole("spinbutton").fill("30");
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByRole("heading", { name: "Do you currently have active coverage?" })).toBeVisible();
  await page.getByRole("button", { name: "Yes" }).click();

  await expect(page.getByRole("heading", { name: "Primary region of residence" })).toBeVisible();
  await page.getByRole("button", { name: "West" }).click();
  await page.getByRole("button", { name: "See Results" }).click();

  await expect(page.getByRole("heading", { name: "Unlock your results" })).toBeVisible();
  await page.getByLabel("Email address").fill("browser-test@example.com");
  await page.getByLabel("First name").fill("Browser");
  await page.getByRole("button", { name: "Get My Results" }).click();

  await expect(page.getByRole("heading", { name: "Eligible" })).toBeVisible();
  await expect(page.getByText("Your results were saved for")).toBeVisible();

  const adminSubmissions = await request.get(
    `/api/admin/workspaces/${publicPack.workspace.id}/submissions?limit=100`,
    { headers: { "x-admin-key": ADMIN_KEY } },
  );
  expect(adminSubmissions.ok()).toBeTruthy();
  const submissions = await adminSubmissions.json() as {
    submissions: Array<{ email: string; score: number; outcomeLabel: string; paid: boolean }>;
  };
  const savedLead = submissions.submissions.find((submission) => submission.email === "browser-test@example.com");
  expect(savedLead).toMatchObject({ score: 3, outcomeLabel: "Eligible", paid: false });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download PDF Report" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^qproquo-demo-insurance-eligibility-.*\.pdf$/);
});
