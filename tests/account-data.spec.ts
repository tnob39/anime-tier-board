import { expect, test, type Page } from "@playwright/test";

/** Block SW so page.route fixtures are not bypassed by public/sw.js. */
test.use({ serviceWorkers: "block" });

const EXPORT_JSON = `${JSON.stringify(
  {
    schemaVersion: 1,
    exportedAt: "2026-08-29T00:00:00.000Z",
    userId: "playwright-test-user",
    data: {
      userAnimeStatuses: [],
      tierBoards: [],
      userSubscriptions: [],
      userPreferences: [],
      pushSubscriptions: [],
      nativePushTokens: [],
      nativeSessions: [],
      evangelistCards: [],
      seasonShares: [],
      boardShares: [],
      shareComments: [],
      shareReactions: []
    }
  },
  null,
  2
)}\n`;

function exportNotice(page: Page) {
  return page.locator("#account-data-export-heading").locator("..").locator(".notice");
}

function deleteNotice(page: Page) {
  return page.locator("#account-data-deletion-heading").locator("..").locator(".notice");
}

async function mockAccountExportSuccess(page: Page) {
  await page.route("**/api/account", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": 'attachment; filename="numanie-account-export.json"'
      },
      body: EXPORT_JSON
    });
  });
}

async function mockAccountExportFailure(page: Page) {
  await page.route("**/api/account", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "エクスポートに失敗しました（テスト）" })
    });
  });
}

async function mockAccountDeleteFailure(page: Page) {
  await page.route("**/api/account", async (route) => {
    if (route.request().method() !== "DELETE") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "削除に失敗しました（テスト）" })
    });
  });
}

test.describe("ATB-757 account export/delete settings UX", () => {
  test("desktop: export success announces and downloads without signing out", async ({
    page
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockAccountExportSuccess(page);
    await page.goto("/settings");

    await expect(
      page.getByRole("heading", { name: "アカウントデータのエクスポート" })
    ).toBeVisible();

    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/account") &&
        response.request().method() === "GET"
    );
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "データをエクスポート" }).click();
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("numanie-account-export.json");

    await expect(exportNotice(page)).toContainText("エクスポートが完了しました");
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.getByRole("button", { name: "ログアウト" })).toBeVisible();
  });

  test("desktop: export failure shows retry and does not open delete confirm", async ({
    page
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockAccountExportFailure(page);
    await page.goto("/settings");

    await page.getByRole("button", { name: "データをエクスポート" }).click();
    await expect(exportNotice(page)).toContainText("エクスポートに失敗しました");
    await expect(page.getByRole("button", { name: "再試行" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "削除を実行する" })
    ).toHaveCount(0);
    await expect(page).toHaveURL(/\/settings/);
  });

  test("desktop: export retry recovers after failure", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    let attempt = 0;
    await page.route("**/api/account", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      attempt += 1;
      if (attempt === 1) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "一時失敗" })
        });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": 'attachment; filename="numanie-account-export.json"'
        },
        body: EXPORT_JSON
      });
    });

    await page.goto("/settings");
    await page.getByRole("button", { name: "データをエクスポート" }).click();
    await expect(exportNotice(page)).toContainText("一時失敗");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "再試行" }).click();
    await downloadPromise;
    await expect(exportNotice(page)).toContainText("エクスポートが完了しました");
  });

  test("desktop: delete two-step requires exact 削除する and retries on failure", async ({
    page
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    let signOutRequests = 0;
    await page.route("**/api/auth/signout", async (route) => {
      signOutRequests += 1;
      await route.abort();
    });
    await mockAccountDeleteFailure(page);
    await page.goto("/settings");

    await page.getByRole("button", { name: "アカウントデータを削除する" }).click();
    await expect(page.getByText("バックアップ")).toBeVisible();

    const confirmInput = page.getByLabel("確認入力");
    await confirmInput.fill("削除します");
    await expect(page.getByRole("button", { name: "削除を実行する" })).toBeDisabled();

    await confirmInput.fill("削除する");
    await page.getByRole("button", { name: "削除を実行する" }).click();
    await expect(deleteNotice(page)).toContainText("削除に失敗しました");
    await expect(page.getByRole("button", { name: "削除を再試行する" })).toBeVisible();
    await expect(page).toHaveURL(/\/settings/);
    expect(signOutRequests).toBe(0);
  });

  test("desktop: delete retry succeeds, announces completion, then signs out", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    let deleteAttempts = 0;
    let signOutRequests = 0;
    await page.route("**/api/account", async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.fallback();
        return;
      }
      deleteAttempts += 1;
      await route.fulfill({
        status: deleteAttempts === 1 ? 500 : 200,
        contentType: "application/json",
        body: JSON.stringify(
          deleteAttempts === 1 ? { error: "一時的な削除失敗" } : { ok: true }
        )
      });
    });
    await page.route("**/api/auth/csrf", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ csrfToken: "e2e-csrf-token" })
      });
    });
    await page.route("**/api/auth/signout", async (route) => {
      signOutRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "/" })
      });
    });
    await page.goto("/settings");
    await page.getByRole("button", { name: "アカウントデータを削除する" }).click();
    await page.getByLabel("確認入力").fill("削除する");
    await page.getByRole("button", { name: "削除を実行する" }).click();
    await expect(deleteNotice(page)).toContainText("一時的な削除失敗");

    await page.getByRole("button", { name: "削除を再試行する" }).click();
    await expect(deleteNotice(page)).toContainText("削除が完了しました");
    await expect(page).toHaveURL(/\/$/);
    expect(deleteAttempts).toBe(2);
    expect(signOutRequests).toBe(1);
  });

  test("desktop: sign-out failure stays distinct after successful deletion", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    let deleteRequests = 0;
    await page.route("**/api/account", async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.fallback();
        return;
      }
      deleteRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true })
      });
    });
    await page.route("**/api/auth/signout", async (route) => {
      await route.abort("failed");
    });
    await page.goto("/settings");
    await page.getByRole("button", { name: "アカウントデータを削除する" }).click();
    await page.getByLabel("確認入力").fill("削除する");
    await page.getByRole("button", { name: "削除を実行する" }).click();

    await expect(deleteNotice(page)).toContainText(
      "削除は完了しましたが、ログアウトに失敗しました"
    );
    await expect(page.getByRole("button", { name: "ログアウトを再試行する" })).toBeVisible();
    await expect(page).toHaveURL(/\/settings/);
    expect(deleteRequests).toBe(1);
  });

  test("desktop: authenticated user menu reaches /settings", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    await page.getByRole("button", { name: "ユーザーメニュー" }).click();
    const settingsItem = page.getByRole("menuitem", { name: "設定" });
    await expect(settingsItem).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/settings$/),
      settingsItem.click()
    ]);
    await expect(page.getByRole("heading", { level: 1, name: "設定" })).toBeVisible();
  });

  test("mobile: settings export/delete controls remain usable at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockAccountExportFailure(page);
    await page.goto("/settings");

    const exportButton = page.getByRole("button", { name: "データをエクスポート" });
    await exportButton.scrollIntoViewIfNeeded();
    const exportBox = await exportButton.boundingBox();
    expect(exportBox).not.toBeNull();
    if (exportBox) {
      expect(exportBox.height).toBeGreaterThanOrEqual(40);
      expect(exportBox.width).toBeLessThanOrEqual(375);
    }

    await exportButton.click();
    await expect(exportNotice(page)).toContainText("エクスポートに失敗しました");
    await expect(page.getByRole("button", { name: "再試行" })).toBeVisible();

    await page.getByRole("button", { name: "アカウントデータを削除する" }).click();
    await expect(page.getByLabel("確認入力")).toBeVisible();
    await expect(page.getByRole("button", { name: "キャンセル" })).toBeVisible();
  });

  test("mobile drawer still reaches /settings", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.route("**/api/image-proxy**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nGQAAAAASUVORK5CYII=",
          "base64"
        )
      });
    });
    // Ensure legacy drawer (nav v5 off) before first paint.
    await page.addInitScript(() => {
      window.localStorage.removeItem("anime-tier-board:navV5");
    });
    await page.goto("/");

    await page.getByRole("button", { name: "メニューを開く" }).click();
    const drawer = page.getByRole("dialog");
    const settingsLink = drawer.getByRole("link", { name: "設定", exact: true });
    await expect(settingsLink).toHaveAttribute("href", "/settings");
    await page.goto("/settings");
    await expect(page.getByRole("heading", { level: 1, name: "設定" })).toBeVisible();
  });

  test("keyboard: export button is focusable and activatable", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockAccountExportSuccess(page);
    await page.goto("/settings");

    const exportButton = page.getByRole("button", { name: "データをエクスポート" });
    await exportButton.focus();
    await expect(exportButton).toBeFocused();

    const downloadPromise = page.waitForEvent("download");
    await page.keyboard.press("Enter");
    await downloadPromise;
    await expect(exportNotice(page)).toContainText("エクスポートが完了しました");
  });

  test("unauthenticated GET /api/account returns 401", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      serviceWorkers: "block"
    });
    const page = await context.newPage();
    const response = await page.request.get("http://localhost:3000/api/account");
    expect(response.status()).toBe(401);
    await context.close();
  });

  test("authenticated GET /api/account returns attachment schema for current user", async ({
    page
  }) => {
    const response = await page.request.get("/api/account");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-disposition"] ?? "").toMatch(
      /attachment;\s*filename="numanie-account-export\.json"/
    );
    expect(response.headers()["content-type"] ?? "").toMatch(/application\/json/);

    const payload = (await response.json()) as {
      schemaVersion: number;
      userId: string;
      data: Record<string, unknown>;
    };
    expect(payload.schemaVersion).toBe(1);
    expect(payload.userId).toBe("playwright-test-user");
    expect(payload.data).toHaveProperty("userAnimeStatuses");
    expect(payload.data).toHaveProperty("pushSubscriptions");
    expect(payload.data).toHaveProperty("nativeSessions");

    const raw = JSON.stringify(payload);
    expect(raw).not.toMatch(/p256dh|"auth"|expo_push_token|session_id/i);
  });

  test("query userId cannot select another user on export", async ({ page }) => {
    const response = await page.request.get("/api/account?userId=someone-else");
    expect(response.status()).toBe(200);
    const payload = (await response.json()) as { userId: string };
    expect(payload.userId).toBe("playwright-test-user");
    expect(payload.userId).not.toBe("someone-else");
  });
});
