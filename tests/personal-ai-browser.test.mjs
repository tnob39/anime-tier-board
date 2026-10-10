import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
const require = createRequire(import.meta.url);
const { webpack } = require("next/dist/compiled/webpack/webpack");
const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "test-results", "personal-ai-offline");
let browser, bundle;
const styles = ["app/globals.css", "components/ui/bottom-sheet.css", "components/personal-ai-handoff.css"].map((p) => readFileSync(path.join(root, p), "utf8")).join("\n");
before(async () => {
  mkdirSync(output, { recursive: true });
  await new Promise((resolve, reject) => {
    const compiler = webpack({ mode: "development", devtool: false, target: "web", context: root,
      entry: path.join(root, "tests/personal-ai-browser-entry.tsx"), output: { path: output, filename: "feature.js" },
      resolve: { extensions: [".tsx", ".ts", ".js"], alias: { "@": root } },
      module: { rules: [{ test: /\.(tsx?|css)$/, exclude: /node_modules/, use: path.join(root, "tests/impressions-tsx-loader.cjs") }] }
    });
    compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error ?? new Error(stats.toString({ all: false, errors: true }))) : resolve()));
  });
  bundle = readFileSync(path.join(output, "feature.js"), "utf8");
  browser = await chromium.launch({ headless: true, args: ["--disable-background-networking"] });
});
after(async () => { await browser?.close(); });
async function harness() {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, serviceWorkers: "block" });
  const page = await context.newPage(), requests = [], errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.route("**/*", (route) => {
    if (route.request().url() === "https://personal-ai.test/") return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="ja"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div></body></html>' });
    requests.push(route.request().url()); return route.abort();
  });
  await page.goto("https://personal-ai.test/");
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
    window.storageWrites = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(...args) { window.storageWrites++; return original.apply(this, args); };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { window.copiedPrompt = text; } } });
  });
  await page.addStyleTag({ content: styles }); await page.addScriptTag({ content: bundle });
  return { page, close: async () => {
    assert.deepEqual(requests, []); assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => window.storageWrites), 0);
    assert.equal(await page.locator("img").count(), 0);
    await context.close();
  } };
}
for (const [purpose, label] of [["know", "作品を知る"], ["similar", "似た作品を探す"], ["taste", "好きそうな作品を探す"], ["reaction", "今期の反応を調べる"]]) {
  test(`${purpose}: actual shared sheet exact copy, privacy, no requests/storage/images and 375px/200% text`, async () => {
    const h = await harness(), { page } = h;
    try {
      await page.getByRole("button", { name: label, exact: true }).click();
      const sheet = page.getByRole("dialog"), preview = sheet.getByLabel("プロンプト全文（この文字列をコピー）");
      await expect(sheet).toBeVisible();
      if (purpose === "taste") {
        await expect(sheet.getByRole("button", { name: "プロンプトをコピー" })).toBeDisabled();
        await sheet.getByLabel(/日本語作品.*を根拠にする/).check();
      }
      if (purpose === "reaction") {
        await expect(sheet.getByRole("button", { name: "プロンプトをコピー" })).toBeDisabled();
        await sheet.getByLabel("開始日（JST）").fill("2026-10-01");
        await sheet.getByLabel("終了日（JST）").fill("2026-10-10");
        await sheet.getByLabel("プラットフォーム").selectOption({ label: "Xの公開投稿" });
      } else {
        await expect(sheet.getByLabel("保存済み評価を含める")).not.toBeChecked();
        await expect(sheet.getByLabel("保存済みネタバレなしメモを含める")).not.toBeChecked();
      }
      const text = await preview.inputValue();
      assert.ok(text.length > 0); assert.ok(!text.includes("PRIVATE_OWNER")); assert.ok(!text.includes("sentinel.test"));
      assert.ok(!text.includes("保存済みの好きな会話")); assert.ok(!text.includes('"rating"'));
      await sheet.getByRole("button", { name: "プロンプトをコピー" }).click();
      await expect(sheet.getByText("コピーしました。まだAIには送信していません。")).toBeVisible();
      assert.equal(await page.evaluate(() => window.copiedPrompt), text);
      await page.addStyleTag({ content: "html { font-size: 200%; }" });
      await page.setViewportSize({ width: 375, height: 380 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.ok(await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth));
      await page.screenshot({ path: path.join(output, `${purpose}-375-200.png`) });
      await sheet.getByRole("button", { name: "閉じる", exact: true }).click();
      await expect(sheet).toHaveCount(0);
    } finally { await h.close(); }
  });
}
test("individual opt-ins reset on deselection, reopen and owner change; rejected clipboard selects full exact text", async () => {
  const h = await harness(), { page } = h;
  try {
    await page.getByRole("button", { name: "好きそうな作品を探す", exact: true }).click();
    const sheet = page.getByRole("dialog"), selected = sheet.getByLabel(/日本語作品.*を根拠にする/), note = sheet.getByLabel("保存済みネタバレなしメモを含める"), rating = sheet.getByLabel("保存済み評価を含める"), preview = sheet.getByLabel("プロンプト全文（この文字列をコピー）");
    await selected.check(); await note.check();
    assert.ok((await preview.inputValue()).includes("保存済みの好きな会話")); assert.ok(!(await preview.inputValue()).includes('"rating"'));
    await rating.check(); assert.ok((await preview.inputValue()).includes('"rating": "liked"'));
    await selected.uncheck(); await selected.check(); await expect(note).not.toBeChecked(); await expect(rating).not.toBeChecked();
    await note.check(); await page.evaluate(() => window.changeOwner());
    await expect(selected).not.toBeChecked(); await selected.check(); await expect(note).not.toBeChecked();
    await note.check(); await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "好きそうな作品を探す", exact: true }).click();
    await expect(selected).not.toBeChecked(); await selected.check(); await expect(note).not.toBeChecked();
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } }));
    const text = await preview.inputValue();
    await sheet.getByRole("button", { name: "プロンプトをコピー" }).click();
    await expect(sheet.getByText(/コピーできませんでした/)).toBeVisible();
    assert.deepEqual(await preview.evaluate((el) => [el.selectionStart, el.selectionEnd, document.activeElement === el]), [0, text.length, true]);
  } finally { await h.close(); }
});
test("late clipboard completion cannot announce success after context reset", async () => {
  const h = await harness(), { page } = h;
  try {
    await page.getByRole("button", { name: "作品を知る", exact: true }).click();
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => new Promise((resolve) => { window.finishCopy = resolve; }) } }));
    await page.getByRole("button", { name: "プロンプトをコピー" }).click();
    await expect(page.getByText("コピー中…", { exact: true })).toBeVisible();
    await page.evaluate(() => window.changeOwner());
    await expect(page.getByText("コピー中…", { exact: true })).toHaveCount(0);
    await page.evaluate(() => window.finishCopy());
    await expect(page.getByText("コピーしました。まだAIには送信していません。", { exact: true })).toHaveCount(0);
  } finally { await h.close(); }
});
