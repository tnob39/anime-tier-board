import { test, expect } from "@playwright/test";

/** Unauthenticated gates — do not use global authenticated storageState. */
test.use({ storageState: { cookies: [], origins: [] } });

const PROTECTED_GATES = [
  { path: "/dashboard", returnTo: "/dashboard" },
  { path: "/watchlist", returnTo: "/watchlist" },
  { path: "/settings", returnTo: "/settings" },
  { path: "/voice-actors", returnTo: "/voice-actors" },
] as const;

const GUEST_NOTICE =
  "このページの利用にはログインが必要です。Googleでログインしてください。";

test.describe("post-auth return (unauthenticated protected gates)", () => {
  for (const { path, returnTo } of PROTECTED_GATES) {
    test(`gate ${path} → login=required + returnTo=${returnTo} + guest notice`, async ({
      page,
    }) => {
      await page.goto(path);

      await expect(page).toHaveURL((url) => {
        const u = new URL(url);
        return (
          u.pathname === "/" &&
          u.searchParams.get("login") === "required" &&
          u.searchParams.get("returnTo") === returnTo
        );
      });

      await expect(page.getByText(GUEST_NOTICE)).toBeVisible();
      await expect(
        page.getByRole("button", { name: "ログインして始める" })
      ).toBeVisible();
    });
  }

  test("disallowed returnTo is not passed to Auth.js sign-in", async ({ page }) => {
    await page.goto("/?login=required&returnTo=https://evil.example/phish");

    await expect(page.getByText(GUEST_NOTICE)).toBeVisible();

    const signInRequestPromise = page.waitForRequest(
      (req) =>
        req.url().includes("/api/auth/signin") ||
        req.url().includes("/api/auth/callback") ||
        req.url().includes("accounts.google.com"),
      { timeout: 15_000 }
    );

    await page.getByRole("button", { name: "ログインして始める" }).click();

    const signInRequest = await signInRequestPromise;
    const requestText = `${signInRequest.url()} ${signInRequest.postData() ?? ""}`;
    expect(requestText).not.toContain("evil.example");
    expect(requestText).not.toContain("phish");
  });

  test("allowlisted returnTo is supplied as redirectTo/callbackUrl", async ({ page }) => {
    await page.goto("/?login=required&returnTo=/watchlist");

    await expect(page.getByText(GUEST_NOTICE)).toBeVisible();

    const signInRequestPromise = page.waitForRequest(
      (req) =>
        req.url().includes("/api/auth/signin") ||
        req.url().includes("accounts.google.com"),
      { timeout: 15_000 }
    );

    await page.getByRole("button", { name: "ログインして始める" }).click();

    const signInRequest = await signInRequestPromise;
    const requestUrl = new URL(signInRequest.url());
    const requestForm = new URLSearchParams(signInRequest.postData() ?? "");
    const callbackUrl =
      requestForm.get("callbackUrl") ?? requestUrl.searchParams.get("callbackUrl");
    expect(["/watchlist", `${requestUrl.origin}/watchlist`]).toContain(callbackUrl);
  });
});
