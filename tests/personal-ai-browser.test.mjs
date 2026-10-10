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
    if (route.request().url().startsWith("https://chatgpt.com/")) return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Local handoff transport only</title>" });
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
        for (const opt of await sheet.getByLabel(/保存済み.*を含める/).all()) await expect(opt).not.toBeChecked();
      }
      const text = await preview.inputValue();
      assert.ok(text.length > 0); assert.ok(!text.includes("PRIVATE_OWNER")); assert.ok(!text.includes("sentinel.test"));
      assert.ok(!text.includes("保存済みの好きな会話")); assert.ok(!text.includes('"rating"'));
      await sheet.getByRole("button", { name: "プロンプトをコピー" }).click();
      await expect(sheet.getByText("全文をコピーしました。このコピー操作ではAIに送信しません。", { exact: true })).toBeVisible();
      assert.equal(await page.evaluate(() => window.copiedPrompt), text);
      const expectedUrl = "https://chatgpt.com/?q=" + encodeURIComponent(text);
      assert.ok(expectedUrl.length > 2000 && expectedUrl.length <= 12000);
      console.log(`${purpose}: generated encoded URL ${expectedUrl.length}`);
      assert.equal(page.context().pages().length, 1);
      const popupEvent = page.context().waitForEvent("page");
      await sheet.getByRole("button", { name: "ChatGPTで開く", exact: true }).click();
      const popup = await popupEvent;
      await popup.waitForURL(expectedUrl);
      await popup.waitForLoadState("domcontentloaded");
      assert.equal(popup.url(), expectedUrl);
      assert.equal(new URL(popup.url()).searchParams.get("q"), text);
      assert.equal(await popup.evaluate(() => window.opener), null);
      await expect(sheet.getByText(/新しいタブが開いたかは確認できません/)).toBeVisible();
      await popup.close();
      await sheet.getByRole("button", { name: "プロンプトをコピー", exact: true }).click();
      await expect(sheet.getByText("全文をコピーしました。このコピー操作ではAIに送信しません。", { exact: true })).toBeVisible();
      await expect(sheet).not.toContainText("まだAIには送信していません");
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
test("primary long-prompt action opens plain ChatGPT synchronously and copies exact full preview; no automatic opens", async () => {
  const h = await harness(), { page } = h;
  try {
    await page.evaluate(() => { window.location.hash = "long"; window.openCalls = []; window.open = (...args) => { window.openCalls.push(args); return null; }; });
    await page.getByRole("button", { name: "好きそうな作品を探す", exact: true }).click();
    const sheet = page.getByRole("dialog"), preview = sheet.getByLabel("プロンプト全文（この文字列をコピー）");
    for (const selected of await sheet.getByLabel(/を根拠にする/).all()) await selected.check();
    for (const rating of await sheet.getByLabel("保存済み評価を含める").all()) await rating.check();
    for (const note of await sheet.getByLabel("保存済みネタバレなしメモを含める").all()) await note.check();
    assert.deepEqual(await page.evaluate(() => window.openCalls), []);
    const text = await preview.inputValue();
    assert.ok(("https://chatgpt.com/?q=" + encodeURIComponent(text)).length > 12000);
    await sheet.getByRole("button", { name: "全文をコピーしてChatGPTを開く", exact: true }).click();
    await expect(sheet.getByText(/全文をコピーしました/)).toBeVisible();
    assert.equal(await page.evaluate(() => window.copiedPrompt), text);
    assert.deepEqual(await page.evaluate(() => window.openCalls), [["https://chatgpt.com/", "_blank", "noopener,noreferrer"]]);
    await sheet.getByRole("button", { name: "閉じる", exact: true }).click();
    await page.getByRole("button", { name: "作品を知る", exact: true }).click();
    for (const opt of await sheet.getByLabel(/保存済み.*を含める/).all()) await expect(opt).not.toBeChecked();
    assert.equal(await page.evaluate(() => window.openCalls.length), 1);
  } finally { await h.close(); }
});
for (const failure of ["unconfirmed", "throws"]) test(`primary ${failure} open and denied clipboard: truthful manual full-text recovery`, async () => {
  const h = await harness(), { page } = h;
  try {
    await page.evaluate((failure) => {
      window.location.hash = "long";
      window.openCalls = [];
      window.open = (...args) => { window.openCalls.push(args); if (failure === "throws") throw new Error("blocked"); return null; };
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } });
    }, failure);
    await page.getByRole("button", { name: "好きそうな作品を探す", exact: true }).click();
    const sheet = page.getByRole("dialog"), preview = sheet.getByLabel("プロンプト全文（この文字列をコピー）");
    for (const selected of await sheet.getByLabel(/を根拠にする/).all()) await selected.check();
    for (const note of await sheet.getByLabel("保存済みネタバレなしメモを含める").all()) await note.check();
    const text = await preview.inputValue();
    assert.ok(("https://chatgpt.com/?q=" + encodeURIComponent(text)).length > 12000);
    await sheet.getByRole("button", { name: "全文をコピーしてChatGPTを開く", exact: true }).click();
    await expect(sheet.getByText(failure === "throws" ? /コピーできませんでした.*操作でエラー/ : /コピーできませんでした.*新しいタブが開いたかは確認できません/)).toBeVisible();
    assert.deepEqual(await preview.evaluate((el) => [el.selectionStart, el.selectionEnd, document.activeElement === el]), [0, text.length, true]);
    const recovery = sheet.getByRole("link", { name: /通常のChatGPTを開く/ });
    await expect(recovery).toHaveAttribute("href", "https://chatgpt.com/");
    await expect(recovery).toHaveAttribute("rel", "noopener noreferrer");
    assert.equal(await page.evaluate(() => window.copiedPrompt), undefined);
    assert.equal(await page.evaluate(() => window.openCalls.length), 1);
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
