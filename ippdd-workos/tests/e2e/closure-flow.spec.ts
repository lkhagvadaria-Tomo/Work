import { test, expect } from "@playwright/test";
import { loginAs, openWorkByCode } from "./helpers";

/**
 * Core governed lifecycle (§45 E2E):
 *   login → view OKR → open work → attach deliverables + evidence → self QC →
 *   submit for review → reviewer PASS → request approval → approver APPROVE →
 *   closure request → gate PASS → director sign-off → CLOSED.
 * Plus the negative path: incomplete work → gate FAIL → work must NOT close.
 *
 * Uses seeded pilot work items (scripts/db/local-setup.sh resets the database):
 *   W002 (STANDARD, 3 requirements) — driven to CLOSED.
 *   W001 (PROCESS, 5 requirements, incomplete) — gate FAIL.
 */
const W = "IPPDD-2026Q3-W002";

test.describe.configure({ mode: "serial" });

test("view OKR hierarchy", async ({ page }) => {
  await loginAs(page, "LA_EMPLOYEE");
  await page.goto("/okr");
  await expect(page.locator("h1")).toContainText("2026-Q3");
  await expect(page.getByText("O1 ·")).toBeVisible();
  await expect(page.getByText("O2 ·")).toBeVisible();
  await expect(page.getByText("O3 ·")).toBeVisible();
});

test("incomplete work → gate FAIL → work must NOT close", async ({ page }) => {
  await loginAs(page, "LA_EMPLOYEE");
  // W005 (KPI, simplified profile) may request closure from IN_PROGRESS, but its
  // metric validation is PENDING → deterministic gate FAILs, status stays open.
  await openWorkByCode(page, "IPPDD-2026Q3-W005");
  await page.getByRole("button", { name: "SUBMIT FOR CLOSURE" }).click();
  await expect(page.getByText("FAIL").first()).toBeVisible();
  await expect(page.getByText("Хийгдэж байна").first()).toBeVisible(); // still IN_PROGRESS
  await expect(page.getByText("Хаагдсан")).toHaveCount(0);

  // W001 in SUBMITTED state exposes no closure action at all
  await openWorkByCode(page, "IPPDD-2026Q3-W001");
  await page.getByRole("button", { name: "SUBMIT FOR REVIEW" }).click();
  await openWorkByCode(page, "IPPDD-2026Q3-W001");
  await expect(page.getByRole("button", { name: "SUBMIT FOR CLOSURE" })).toHaveCount(0);
  await expect(page.getByText("Илгээсэн").first()).toBeVisible();
});

test("owner attaches deliverables, evidence, self QC and submits", async ({ page }) => {
  await loginAs(page, "LA_EMPLOYEE");
  await openWorkByCode(page, W);

  for (const [req, name] of [
    ["Checklist", "Бэлгийн зарцуулалтын checklist"],
    ["Стандарт", "Бэлгийн зарцуулалтын стандарт"],
    ["Журам", "Бэлгийн зарцуулалтын журам"],
  ] as const) {
    await openWorkByCode(page, W);
    const details = page.locator("details", { hasText: "Deliverable хавсаргах" }).first();
    await details.locator("summary").click();
    await details.locator("select[name=requirement_id]").selectOption({ label: req });
    await details.locator("input[name=name]").first().fill(name);
    await details.locator("input[name=version]").fill("v1.0");
    await details.locator("input[name=final_version]").check();
    await details.locator("button:has-text('Хавсаргах')").first().click();
    await expect(page.getByText(name).first()).toBeVisible();
  }

  await openWorkByCode(page, W);
  const evDetails = page.locator("details", { hasText: "Нотолгоо хавсаргах" }).first();
  await evDetails.locator("summary").click();
  await evDetails.locator("input[name=title]").fill("Захирлын хурлын шийдвэр — тэмдэглэл");
  await evDetails.locator("select[name=evidence_type]").selectOption("MEETING_DECISION");
  await evDetails.locator("textarea[name=description]").fill("2026-09-05 хурлын тэмдэглэл, бэлгийн 3 баримт хэлэлцсэн");
  await evDetails.locator("button:has-text('Хавсаргах')").click();
  await expect(page.getByText("Захирлын хурлын шийдвэр — тэмдэглэл").first()).toBeVisible();

  await page.click("text=Self QC PASS бүртгэх");
  await page.click("text=SUBMIT FOR REVIEW");
  await expect(page.getByText("Илгээсэн").first()).toBeVisible();
});

test("reviewer PASS", async ({ page }) => {
  await loginAs(page, "REVIEWER_USER");
  await page.goto("/reviews");
  await expect(page.getByText(W)).toBeVisible();
  const card = page.locator("section", { hasText: W }).first();
  await card.locator("button:has-text('PASS')").click();
  await page.waitForLoadState("networkidle");
});

test("owner requests approval; director approves", async ({ page }) => {
  await loginAs(page, "LA_EMPLOYEE");
  await openWorkByCode(page, W);
  await page.click("text=REQUEST APPROVAL");
  await expect(page.getByText("Батлал хүлээж байна").first()).toBeVisible();

  await loginAs(page, "DIRECTOR_USER");
  await page.goto("/approvals");
  const card = page.locator("section", { hasText: W }).first();
  await card.locator("button[value=APPROVE]").click();
  await page.waitForLoadState("networkidle");
});

test("closure: gate PASS → director sign-off → CLOSED", async ({ page }) => {
  await loginAs(page, "LA_EMPLOYEE");
  await openWorkByCode(page, W);
  await page.click("text=SUBMIT FOR CLOSURE");
  await expect(page.getByText("PASS").first()).toBeVisible();

  await loginAs(page, "DIRECTOR_USER");
  await page.goto("/approvals");
  const signoff = page.locator("section", { hasText: W }).first();
  await signoff.locator("button:has-text('SIGN OFF')").click();
  await page.waitForLoadState("networkidle");

  await loginAs(page, "LA_EMPLOYEE");
  await openWorkByCode(page, W);
  await expect(page.getByText("Хаагдсан").first()).toBeVisible();
});

test("unauthorized user sees nothing via direct navigation", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/work");
  await page.waitForURL("**/login**");
  await expect(page.locator("h1")).toContainText("IPPDD WorkOS");
});
