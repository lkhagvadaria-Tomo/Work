import { type Page, expect } from "@playwright/test";

export type Persona = "LA_EMPLOYEE" | "REVIEWER_USER" | "DIRECTOR_USER" | "ADMIN_USER";

/** Sign in via the gated dev impersonation login (DEV_AUTH=1, non-production). */
export async function loginAs(page: Page, persona: Persona): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.selectOption("select[name=persona]", persona);
  await page.click("text=Persona-аар нэвтрэх");
  await page.waitForURL("**/dashboard");
}

export async function openWorkByCode(page: Page, code: string): Promise<void> {
  await page.goto("/work?f=all&q=" + encodeURIComponent(code));
  await page.click(`a:has-text("${code}")`);
  await expect(page.locator("h1")).toContainText(code);
}
