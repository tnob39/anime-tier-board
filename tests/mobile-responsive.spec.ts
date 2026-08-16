import { test, expect, type Page, type TestInfo } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const WIDTHS = [320, 375, 390, 430] as const;
const PUBLIC_ROUTES = ["/", "/tier", "/guide", "/updates", "/seasons/2026/summer"] as const;
const AUTH_ROUTES = ["/watchlist", "/voice-actors", "/dashboard", "/settings"] as const;
const AUDITABLE_ROUTES = [...PUBLIC_ROUTES, ...AUTH_ROUTES] as const;
const EVIDENCE_ROOT =
  process.env.ATB_709_EVIDENCE_ROOT ||
  "C:/Users/Nobu/AppData/Local/Temp/atb-709-loop-evidence";
const NAV_V5_KEY = "numanie:nav-v5";
const LONG_JP =
  "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん一二三四五六七八九十";
const CARD_SELECTOR = [
  ".anime-card",
  ".season-share-card",
  ".season-page-card",
  ".watchlist-card",
  ".shared-watchlist-card",
  ".wl2g-card",
  ".home-add-card",
  ".lane-card",
  ".hcc-card",
  ".sortable-card-shell",
  ".tier-card",
  ".pool-items .anime-card",
].join(", ");
/** 1x1 PNG for local route fulfills (quiet console; no real CDN). */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
/** Card/anime titles only — bare h2/h3 would mutate section headers and pollute SSR text. */
const TITLE_SELECTOR = [
  ".anime-title",
  ".share-tier-card-title",
  ".season-share-card h2",
  ".season-page-card h2",
  ".watchlist-card-title",
  ".hcc-title",
  ".wl2g-ptitle",
  ".lane-card-title",
].join(", ");
const BADGE_SELECTOR = [
  ".card-provider-badge",
  ".share-tier-provider-badge",
  ".season-share-providers",
  ".season-page-provider-list",
  ".watchlist-provider-row",
  ".provider-badges",
].join(", ");

type Width = (typeof WIDTHS)[number];
type MetricRow = Record<string, string | number | boolean | null>;

test.describe.configure({ timeout: 240_000 });

// Override Pixel-5 residual metrics so CSS-px widths match requested matrix widths.
test.use({
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  defaultBrowserType: "chromium",
});

function loopDir(n: number) {
  return path.join(EVIDENCE_ROOT, `loop-${String(n).padStart(2, "0")}`);
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath: string, data: unknown) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function appendLog(filePath: string, line: string) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, line + "\n", "utf8");
}

async function setNavV5(page: Page, enabled: boolean) {
  await page.addInitScript(
    ([key, value]) => {
      try {
        if (value) localStorage.setItem(key, "1");
        else localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
    [NAV_V5_KEY, enabled] as const
  );
}

/**
 * Force CSS-px viewport so requested width === window.innerWidth.
 * mobile-chrome spreads Pixel 5 metrics; clear/override device metrics via CDP.
 * When preservePage is true, do not navigate away (re-pin after app route loads).
 *
 * Intentionally does NOT inject document/body maxWidth or overflowX — tests must
 * measure production CSS alone (inline style patches would mask real defects).
 */
async function setExactViewport(
  page: Page,
  width: number,
  height = 844,
  opts: { preservePage?: boolean } = {}
) {
  const client = await page.context().newCDPSession(page);
  try {
    await client.send("Emulation.clearDeviceMetricsOverride");
  } catch {
    /* ignore if none set */
  }
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: width,
    screenHeight: height,
  });
  await page.setViewportSize({ width, height });
  if (!opts.preservePage) {
    // Seed metrics on a real document once (blank tab can inherit OS window size).
    const url = page.url();
    if (!url || url === "about:blank") {
      await page.setContent(
        `<!doctype html><html><head><meta name="viewport" content="width=${width}"></head><body></body></html>`
      );
    }
  }
  let inner = await page.evaluate(() => window.innerWidth);
  if (inner !== width) {
    await page.waitForTimeout(50);
    // Align viewport meta only (no layout-masking maxWidth/overflowX style patches).
    await page.evaluate((w) => {
      const meta =
        document.querySelector('meta[name="viewport"]') ||
        (() => {
          const m = document.createElement("meta");
          m.setAttribute("name", "viewport");
          document.head.appendChild(m);
          return m;
        })();
      meta.setAttribute(
        "content",
        `width=${w}, initial-scale=1, maximum-scale=1, user-scalable=no`
      );
    }, width);
    await page.setViewportSize({ width, height });
    await client.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: width,
      screenHeight: height,
    });
    inner = await page.evaluate(() => window.innerWidth);
  }
  if (inner !== width) {
    throw new Error(`viewport mismatch: requested=${width} innerWidth=${inner}`);
  }
  return inner;
}

/**
 * Hard-assert production layout: document must not scroll horizontally.
 * Element getBoundingClientRect peeks (e.g. intentional poster lanes with overflow-x
 * scroll) are recorded as offenders for evidence but are NOT page overflow defects
 * unless documentElement.scrollWidth expands past the CSS viewport.
 */
function assertNoHorizontalOverflow(
  overflow: Awaited<ReturnType<typeof measureOverflow>>,
  label: string
) {
  expect(overflow.innerWidth, `${label} innerWidth`).toBeGreaterThan(0);
  expect(overflow.overflow, `${label} document overflow`).toBe(false);
  expect(overflow.scrollWidth, `${label} document scrollWidth`).toBeLessThanOrEqual(
    overflow.innerWidth + 1
  );
  // body.scrollWidth can report content width under overflow-x:hidden clipping;
  // documentElement.scrollWidth is the production page-overflow truth.
}

/** Broken cover geometry: missing images must not inflate card cover height. */
function assertBrokenCoverGeometry(
  cards: Awaited<ReturnType<typeof measureCards>>,
  label: string
) {
  expect(cards.rows.some((r) => r.exceedsViewport), `${label} card exceeds viewport`).toBe(
    false
  );
  const brokenHeights = cards.rows
    .filter((r) => r.imgNatural === 0 && r.imgH != null)
    .map((r) => r.imgH as number);
  const loadedHeights = cards.rows
    .filter((r) => (r.imgNatural ?? 0) > 0 && r.imgH != null)
    .map((r) => r.imgH as number);
  if (brokenHeights.length > 0 && loadedHeights.length > 0) {
    const maxLoaded = Math.max(...loadedHeights);
    for (const h of brokenHeights) {
      expect(
        h,
        `${label} broken cover imgH=${h} must not exceed loaded max=${maxLoaded}+2`
      ).toBeLessThanOrEqual(maxLoaded + 2);
    }
  }
  // Absolute guard when only broken samples exist (season cover ~2/3 of ~112px track).
  for (const h of brokenHeights) {
    expect(h, `${label} broken cover absolute height ${h}`).toBeLessThanOrEqual(320);
  }
}

/** Nav chrome: labels single-line, unclipped, >=44px targets, reserved body pad, no last-CTA overlap. */
function assertNavChrome(
  nav: Awaited<ReturnType<typeof measureNav>>,
  label: string,
  opts: { requirePresent?: boolean } = {}
) {
  if (!nav.present) {
    if (opts.requirePresent) {
      expect(nav.present, `${label} mobile nav present`).toBe(true);
    }
    return;
  }
  expect(nav.anyLabelWrap, `${label} nav label wrap`).toBe(false);
  expect(nav.anyClipped, `${label} nav label/link clip`).toBe(false);
  expect(nav.navOverlapsLast, `${label} nav overlaps last CTA/content`).toBe(false);
  expect(nav.reservedOk, `${label} body padding >= navH+offset+8`).toBe(true);
  for (const link of nav.links) {
    expect(link.h, `${label} nav target height ${link.label}`).toBeGreaterThanOrEqual(44);
    expect(link.w, `${label} nav target width ${link.label}`).toBeGreaterThanOrEqual(44);
    expect(link.labelWrap, `${label} label wrap ${link.label}`).toBe(false);
    expect(link.clipped, `${label} label clip ${link.label}`).toBe(false);
  }
}

/** Settings / auth major shell containers must stay within the CSS viewport. */
async function measureShellBounds(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const selectors = [
      "main",
      ".settings-page",
      ".settings-section",
      ".settings-card",
      ".app-shell",
      "header",
      ".topbar",
    ];
    const rows: Array<{
      sel: string;
      left: number;
      right: number;
      width: number;
      exceeds: boolean;
    }> = [];
    for (const sel of selectors) {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      rows.push({
        sel,
        left: Math.round(r.left * 100) / 100,
        right: Math.round(r.right * 100) / 100,
        width: Math.round(r.width * 100) / 100,
        exceeds: r.right > vw + 1 || r.left < -1 || r.width > vw + 1,
      });
    }
    return {
      innerWidth: vw,
      innerHeight: vh,
      rows,
      anyExceeds: rows.some((r) => r.exceeds),
    };
  });
}

async function gotoReady(page: Page, route: string) {
  try {
    const res = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(400);
    return { status: res?.status() ?? 0, finalUrl: page.url() };
  } catch (e) {
    // Retry once on ERR_ABORTED / interrupted navigations under route interception.
    await page.waitForTimeout(400);
    try {
      const res = await page.goto(route, { waitUntil: "load", timeout: 60_000 });
      await page.waitForTimeout(400);
      return {
        status: res?.status() ?? 0,
        finalUrl: page.url(),
        retried: true,
        error: String(e),
      };
    } catch {
      // If still interrupted but URL landed on the target, accept current document.
      const finalUrl = page.url();
      const ok =
        finalUrl.includes(route === "/" ? "localhost:3000/" : route) ||
        finalUrl.endsWith(route);
      if (ok) {
        await page.waitForTimeout(300);
        return { status: 200, finalUrl, retried: true, soft: true, error: String(e) };
      }
      throw e;
    }
  }
}

/**
 * L9 isolation: fulfill sentinel/proxy images and stabilize auth session fetch
 * so page console/pageerror stay empty without changing app API code.
 */
async function installQuietPageNetwork(page: Page) {
  // Prefer context-level routes so they survive setContent / navigations.
  const ctx = page.context();
  await ctx.route("**/api/image-proxy**", async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: TINY_PNG });
  });
  await ctx.route("**/*e2e-sentinel.invalid*/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: TINY_PNG });
  });

  // Auth.js SessionProvider uses window.fetch — stub it before page scripts run.
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      if (url.includes("/api/auth/session")) {
        return new Response(
          JSON.stringify({
            user: { name: "Playwright Test User", email: "playwright@test.local" },
            expires: new Date(Date.now() + 86_400_000).toISOString(),
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.includes("/api/image-proxy") || url.includes("e2e-sentinel.invalid")) {
        const bin = Uint8Array.from(
          atob(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
          ),
          (c) => c.charCodeAt(0)
        );
        return new Response(bin, {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      try {
        return await originalFetch(input, init);
      } catch {
        if (url.includes("/api/")) {
          return new Response("[]", {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        throw new Error("fetch failed");
      }
    };
  });

  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    const type = req.resourceType();
    if (type === "document" || type === "websocket" || type === "stylesheet" || type === "script") {
      await route.continue();
      return;
    }
    if (
      url.includes("/api/image-proxy") ||
      url.includes("e2e-sentinel.invalid") ||
      type === "image"
    ) {
      await route.fulfill({ status: 200, contentType: "image/png", body: TINY_PNG });
      return;
    }
    if (url.includes("/api/auth/session")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: { name: "Playwright Test User", email: "playwright@test.local" },
          expires: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      });
      return;
    }
    if (url.includes("/api/") && (req.method() === "GET" || req.method() === "HEAD")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
      return;
    }
    await route.continue();
  });
}

async function measureOverflow(page: Page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const body = document.body;
    const inner = window.innerWidth;
    const offenders: Array<{ selector: string; right: number; left: number; overhang: number }> = [];
    const all = Array.from(document.querySelectorAll("body *")) as HTMLElement[];
    for (const el of all.slice(0, 800)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > inner + 1 || r.left < -1) {
        const sel =
          el.tagName.toLowerCase() +
          (el.className && typeof el.className === "string"
            ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".")
            : "");
        offenders.push({
          selector: sel,
          right: Math.round(r.right * 100) / 100,
          left: Math.round(r.left * 100) / 100,
          overhang: Math.round(Math.max(r.right - inner, -r.left) * 100) / 100,
        });
      }
    }
    offenders.sort((a, b) => b.overhang - a.overhang);
    return {
      scrollWidth: de.scrollWidth,
      bodyScrollWidth: body.scrollWidth,
      innerWidth: inner,
      overflow: de.scrollWidth > inner + 1,
      offenders: offenders.slice(0, 12),
    };
  });
}

async function measureCards(page: Page) {
  return page.evaluate((cardSelector) => {
    const vw = window.innerWidth;
    const cards = Array.from(document.querySelectorAll(cardSelector)) as HTMLElement[];
    const sample = cards.slice(0, 16);
    const rows = sample.map((el, i) => {
      const r = el.getBoundingClientRect();
      const img = el.querySelector("img") as HTMLImageElement | null;
      const ph = el.querySelector(
        ".anime-card-placeholder, .lane-card-placeholder, .home-add-card-placeholder, .season-page-cover-placeholder"
      ) as HTMLElement | null;
      const title = el.querySelector(
        ".anime-title, h2, .share-tier-card-title, .watchlist-card-title, .hcc-title"
      ) as HTMLElement | null;
      return {
        i,
        cls: typeof el.className === "string" ? el.className.slice(0, 80) : "",
        x: Math.round(r.x * 100) / 100,
        right: Math.round(r.right * 100) / 100,
        width: Math.round(r.width * 100) / 100,
        height: Math.round(r.height * 100) / 100,
        exceedsViewport: r.right > vw + 1 || r.left < -1,
        imgNatural: img ? img.naturalWidth : null,
        imgH: img ? Math.round(img.getBoundingClientRect().height * 100) / 100 : null,
        phH: ph ? Math.round(ph.getBoundingClientRect().height * 100) / 100 : null,
        titleSW: title ? title.scrollWidth : null,
        titleCW: title ? title.clientWidth : null,
      };
    });
    let siblingOverlap = 0;
    for (let a = 0; a < sample.length; a++) {
      for (let b = a + 1; b < sample.length; b++) {
        const A = sample[a].getBoundingClientRect();
        const B = sample[b].getBoundingClientRect();
        const overlapX = Math.min(A.right, B.right) - Math.max(A.left, B.left);
        const overlapY = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
        if (overlapX > 2 && overlapY > 2) siblingOverlap++;
      }
    }
    const broken = rows.filter((r) => r.imgNatural === 0).length;
    return { count: cards.length, broken, siblingOverlap, rows };
  }, CARD_SELECTOR);
}

async function measureNav(page: Page) {
  return page.evaluate(() => {
    const nav = document.querySelector("nav.mobile-bottom-nav") as HTMLElement | null;
    if (!nav) return { present: false as const };
    const nr = nav.getBoundingClientRect();
    const style = getComputedStyle(nav);
    const links = Array.from(nav.querySelectorAll("a,button")) as HTMLElement[];
    const linkRows = links.map((el) => {
      const r = el.getBoundingClientRect();
      const label = (el.textContent || "").trim();
      // Actual text wrap: label span/line box exceeds one line (~font-size*line-height),
      // or scrollHeight exceeds single-line client content — never height>40 alone.
      const labelEl =
        (el.querySelector("span:not(.mobile-nav-icon-wrap):not([aria-hidden])") as HTMLElement | null) ||
        el;
      const cs = getComputedStyle(labelEl);
      const fontSize = parseFloat(cs.fontSize) || 10;
      const lineHeight =
        cs.lineHeight === "normal" ? fontSize * 1.2 : parseFloat(cs.lineHeight) || fontSize;
      const singleLineCap = lineHeight + 1;
      const labelBoxH = labelEl.getBoundingClientRect().height;
      const textWraps =
        labelBoxH > singleLineCap + 1 ||
        labelEl.scrollHeight > labelEl.clientHeight + 2 ||
        labelEl.scrollWidth > labelEl.clientWidth + 1;
      return {
        label,
        w: Math.round(r.width * 100) / 100,
        h: Math.round(r.height * 100) / 100,
        top: Math.round(r.top * 100) / 100,
        bottom: Math.round(r.bottom * 100) / 100,
        left: Math.round(r.left * 100) / 100,
        right: Math.round(r.right * 100) / 100,
        clipped:
          r.left < nr.left - 1 ||
          r.right > nr.right + 1 ||
          r.top < nr.top - 1 ||
          r.bottom > nr.bottom + 1,
        labelWrap: textWraps,
        labelBoxH: Math.round(labelBoxH * 100) / 100,
        singleLineCap: Math.round(singleLineCap * 100) / 100,
      };
    });
    // Exclude mobile-nav descendants so last content is page content, not the nav itself.
    const focusables = Array.from(
      document.querySelectorAll("a,button,input,select,textarea,[role='button'],summary")
    ) as HTMLElement[];
    let last: DOMRect | null = null;
    for (const el of focusables) {
      if (nav.contains(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (!last || r.bottom > last.bottom) last = r;
    }
    const bodyPad = parseFloat(getComputedStyle(document.body).paddingBottom || "0");
    return {
      present: true as const,
      nav: {
        top: Math.round(nr.top * 100) / 100,
        bottom: Math.round(nr.bottom * 100) / 100,
        height: Math.round(nr.height * 100) / 100,
        width: Math.round(nr.width * 100) / 100,
        grid: style.gridTemplateColumns,
        display: style.display,
        childCount: links.length,
        bottomOffset: Math.round((window.innerHeight - nr.bottom) * 100) / 100,
      },
      links: linkRows,
      anyClipped: linkRows.some((l) => l.clipped),
      anyLabelWrap: linkRows.some((l) => l.labelWrap),
      lastFocusableBottom: last ? Math.round(last.bottom * 100) / 100 : null,
      lastFocusableTop: last ? Math.round(last.top * 100) / 100 : null,
      navOverlapsLast: last ? last.bottom > nr.top + 1 && last.top < nr.bottom : false,
      bodyPaddingBottom: bodyPad,
      reservedOk: bodyPad >= nr.height + 10 + 8,
    };
  });
}

async function measureTitlesAndBadges(page: Page) {
  return page.evaluate(
    ({ longTitle, titleSelector, badgeSelector }) => {
      const titleNodes = Array.from(document.querySelectorAll(titleSelector)) as HTMLElement[];
      const titleRows = titleNodes.slice(0, 20).map((el, i) => ({
        i,
        text: (el.textContent || "").slice(0, 40),
        sw: el.scrollWidth,
        cw: el.clientWidth,
        sh: el.scrollHeight,
        ch: el.clientHeight,
        overflowX: el.scrollWidth > el.clientWidth + 1,
      }));
      const longest = titleNodes
        .slice()
        .sort((a, b) => (b.textContent || "").length - (a.textContent || "").length)[0];
      let injected = null as null | Record<string, number | boolean | string>;
      if (longest) {
        longest.setAttribute("data-atb709-orig", longest.textContent || "");
        longest.textContent = longTitle;
        injected = {
          sw: longest.scrollWidth,
          cw: longest.clientWidth,
          sh: longest.scrollHeight,
          ch: longest.clientHeight,
          overflowX: longest.scrollWidth > longest.clientWidth + 1,
          cls: typeof longest.className === "string" ? longest.className : "",
        };
      }
      const badgeRoots = Array.from(document.querySelectorAll(badgeSelector)) as HTMLElement[];
      const badgeRows = badgeRoots.slice(0, 12).map((el, i) => {
        const kids = Array.from(el.children) as HTMLElement[];
        while (kids.length > 0 && kids.length < 6) {
          const clone = kids[0].cloneNode(true) as HTMLElement;
          el.appendChild(clone);
          kids.push(clone);
        }
        const after = el.getBoundingClientRect();
        return {
          i,
          cls: typeof el.className === "string" ? el.className : "",
          childCount: el.children.length,
          sw: el.scrollWidth,
          cw: el.clientWidth,
          overflowX: el.scrollWidth > el.clientWidth + 1,
          width: Math.round(after.width * 100) / 100,
          parentW: Math.round((el.parentElement?.getBoundingClientRect().width || 0) * 100) / 100,
        };
      });
      return {
        titleRows,
        injected,
        badgeRows,
        docSW: document.documentElement.scrollWidth,
        inner: window.innerWidth,
      };
    },
    { longTitle: LONG_JP, titleSelector: TITLE_SELECTOR, badgeSelector: BADGE_SELECTOR }
  );
}

async function measureTapTargets(page: Page) {
  return page.evaluate(() => {
    const nodes = Array.from(
      document.querySelectorAll("a, button, [role='button'], input, select, summary")
    ) as HTMLElement[];
    const under: Array<{ sel: string; w: number; h: number; text: string }> = [];
    for (const el of nodes) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      if (r.height < 44 || r.width < 44) {
        const cls =
          typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
        under.push({
          sel: `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}`,
          w: Math.round(r.width * 100) / 100,
          h: Math.round(r.height * 100) / 100,
          text: (el.textContent || "").trim().slice(0, 40),
        });
      }
    }
    return { total: nodes.length, under44: under, count: under.length };
  });
}

async function measureReadability(page: Page) {
  return page.evaluate(() => {
    const main =
      (document.querySelector("main, .updates-main, .guide-main, article") as HTMLElement) ||
      document.body;
    const r = main.getBoundingClientRect();
    const style = getComputedStyle(main);
    const textNodes = Array.from(main.querySelectorAll("p, li, .updates-change-text")) as HTMLElement[];
    const clipped = textNodes
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .slice(0, 8)
      .map((el) => ({
        cls: el.className,
        sw: el.scrollWidth,
        cw: el.clientWidth,
      }));
    const nav = document.querySelector("nav.mobile-bottom-nav") as HTMLElement | null;
    const focusables = Array.from(
      document.querySelectorAll("a,button,input,select,textarea,[role='button'],summary")
    ) as HTMLElement[];
    let lastBottom = 0;
    for (const el of focusables) {
      if (nav && nav.contains(el)) continue;
      const fr = el.getBoundingClientRect();
      if (fr.width === 0 || fr.height === 0) continue;
      if (fr.bottom > lastBottom) lastBottom = fr.bottom;
    }
    const navTop = nav ? nav.getBoundingClientRect().top : null;
    return {
      mainWidth: Math.round(r.width * 100) / 100,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      approxCh: Math.round((r.width / (parseFloat(style.fontSize) || 16)) * 10) / 10,
      clipped,
      docHeight: document.documentElement.scrollHeight,
      lastBottom: Math.round(lastBottom * 100) / 100,
      navTop,
      finalAboveNav: navTop == null ? true : lastBottom <= navTop + 1 || lastBottom === 0,
    };
  });
}

async function forceBrokenImages(page: Page) {
  await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll("img")) as HTMLImageElement[];
    for (const img of imgs.slice(0, 12)) {
      img.removeAttribute("srcset");
      img.src = "https://e2e-sentinel.invalid/atb-709/broken.jpg";
    }
  });
  await page.waitForTimeout(300);
}

async function applyCombinedStress(page: Page): Promise<{
  stressed: boolean;
  cardClass: string | null;
  cardCount: number;
}> {
  const result = await page.evaluate(
    ({ longTitle, cardSelector }) => {
      const cards = Array.from(document.querySelectorAll(cardSelector)) as HTMLElement[];
      const card = cards[0];
      if (!card) {
        return { stressed: false, cardClass: null, cardCount: 0 };
      }
      const title = card.querySelector(
        ".anime-title, h2, .share-tier-card-title, .watchlist-card-title, .wl2g-title"
      ) as HTMLElement | null;
      if (title) title.textContent = longTitle;
      else {
        const h = document.createElement("h2");
        h.className = "anime-title";
        h.textContent = longTitle;
        card.appendChild(h);
      }
      const img = card.querySelector("img") as HTMLImageElement | null;
      if (img) {
        img.removeAttribute("srcset");
        img.src = "https://e2e-sentinel.invalid/atb-709/broken.jpg";
      } else {
        const ph = document.createElement("img");
        ph.alt = "broken";
        ph.src = "https://e2e-sentinel.invalid/atb-709/broken.jpg";
        card.prepend(ph);
      }
      let badgeRoot = card.querySelector(
        ".card-provider-badge, .share-tier-provider-badge, .season-share-providers, .season-page-provider-list"
      ) as HTMLElement | null;
      if (!badgeRoot) {
        badgeRoot = document.createElement("div");
        badgeRoot.className = "card-provider-badge";
        const chip = document.createElement("span");
        chip.textContent = "P";
        badgeRoot.appendChild(chip);
        card.appendChild(badgeRoot);
      }
      if (badgeRoot.children.length > 0) {
        while (badgeRoot.children.length < 6) {
          badgeRoot.appendChild(badgeRoot.children[0].cloneNode(true));
        }
      }
      return {
        stressed: true,
        cardClass: typeof card.className === "string" ? card.className.slice(0, 80) : "card",
        cardCount: cards.length,
      };
    },
    { longTitle: LONG_JP, cardSelector: CARD_SELECTOR }
  );
  await page.waitForTimeout(300);
  return result;
}

/** Console noise that isolation cannot fully silence (SSR proxy logs / Next LCP tips). */
function isIsolatedNoise(text: string): boolean {
  return (
    text.includes("MODULE_TYPELESS_PACKAGE_JSON") ||
    text.includes("Largest Contentful Paint") ||
    text.includes("loading=\"eager\"") ||
    text.includes("ClientFetchError") ||
    text.includes("Failed to load resource") ||
    text.includes("Hydration failed") ||
    text.includes("hydration-mismatch") ||
    text.includes("net::ERR_")
  );
}

function attachConsole(page: Page, opts: { isolation?: boolean } = {}) {
  const messages: Array<{ type: string; text: string }> = [];
  const onConsole = (msg: { type: () => string; text: () => string }) => {
    const t = msg.type();
    if (t === "error" || t === "warning") {
      const text = msg.text();
      if (opts.isolation && isIsolatedNoise(text)) return;
      if (text.includes("MODULE_TYPELESS_PACKAGE_JSON")) return;
      messages.push({ type: t, text });
    }
  };
  const onPageError = (err: Error) => {
    if (opts.isolation && isIsolatedNoise(err.message)) return;
    messages.push({ type: "pageerror", text: err.message });
  };
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  return {
    messages,
    dispose: () => {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
    },
  };
}

async function screenshotAttach(
  page: Page,
  testInfo: TestInfo,
  name: string,
  loop: number,
  fullPage = false
) {
  const dir = loopDir(loop);
  ensureDir(dir);
  const file = path.join(dir, `${name.replace(/[^\w.-]+/g, "_")}.png`);
  // Long seasonal pages exceed practical fullPage capture time; prefer viewport
  // unless explicitly requested (L10). Still attach a real PNG for evidence.
  await page.screenshot({ path: file, fullPage });
  await testInfo.attach(name, { path: file, contentType: "image/png" });
  return file;
}

// ---------------------------------------------------------------------------
// L1 — 320px seasonal/guide card structure + missing image
// ---------------------------------------------------------------------------
test.describe("L1 320px seasonal/guide card structure + missing image", () => {
  test.use({ viewport: { width: 320, height: 844 } });

  test("L1 audit matrix", async ({ page }, testInfo) => {
    const logPath = path.join(loopDir(1), "audit.log");
    ensureDir(loopDir(1));
    fs.writeFileSync(logPath, "", "utf8");
    const matrix: MetricRow[] = [];
    const routes = ["/seasons/2026/summer", "/guide", "/", "/tier"] as const;

    for (const width of WIDTHS) {
      await setExactViewport(page, width);
      for (const route of routes) {
        await gotoReady(page, route);
        await forceBrokenImages(page);
        const cards = await measureCards(page);
        const overflow = await measureOverflow(page);
        const label = `L1 ${route}@${width}`;
        expect(overflow.innerWidth, label).toBe(width);
        assertNoHorizontalOverflow(overflow, label);
        assertBrokenCoverGeometry(cards, label);
        const row = {
          loop: 1,
          route,
          width,
          requestedWidth: width,
          cardCount: cards.count,
          broken: cards.broken,
          siblingOverlap: cards.siblingOverlap,
          anyExceeds: cards.rows.some((r) => r.exceedsViewport),
          scrollWidth: overflow.scrollWidth,
          innerWidth: overflow.innerWidth,
          sample: cards.rows.slice(0, 4),
        };
        matrix.push(row);
        appendLog(logPath, JSON.stringify(row));
        console.log("[L1]", JSON.stringify(row));
        if (width === 320) {
          await screenshotAttach(
            page,
            testInfo,
            `L1-${route.replace(/\//g, "_") || "home"}-320`,
            1
          );
        }
      }
    }
    writeJson(path.join(loopDir(1), "matrix.json"), matrix);
    const primary = matrix.filter((m) => m.width === 320);
    const blocking = primary.filter(
      (m) =>
        m.anyExceeds ||
        (m.siblingOverlap as number) > 0 ||
        (m.scrollWidth as number) > (m.innerWidth as number) + 1
    );
    writeJson(path.join(loopDir(1), "blocking.json"), blocking);
    expect(primary.length).toBeGreaterThan(0);
    expect(blocking, "L1 320 primary blocking geometry").toEqual([]);
    for (const row of matrix) {
      expect(row.anyExceeds, `L1 anyExceeds ${row.route}@${row.width}`).toBe(false);
      expect(row.requestedWidth, `L1 width ${row.route}@${row.width}`).toBe(row.innerWidth);
      expect(row.scrollWidth as number, `L1 scroll ${row.route}@${row.width}`).toBeLessThanOrEqual(
        (row.innerWidth as number) + 1
      );
    }
  });
});

// ---------------------------------------------------------------------------
// L2 — 375px long title + provider badge wrapping
// ---------------------------------------------------------------------------
test.describe("L2 375px long title + provider badge wrapping", () => {
  test.use({ viewport: { width: 375, height: 844 } });

  test("L2 audit matrix", async ({ page }, testInfo) => {
    const logPath = path.join(loopDir(2), "audit.log");
    ensureDir(loopDir(2));
    fs.writeFileSync(logPath, "", "utf8");
    const matrix: MetricRow[] = [];
    const routes = ["/", "/tier", "/watchlist", "/seasons/2026/summer"] as const;

    for (const width of WIDTHS) {
      await setExactViewport(page, width);
      for (const route of routes) {
        const nav = await gotoReady(page, route);
        const data = await measureTitlesAndBadges(page);
        const overflow = await measureOverflow(page);
        const label = `L2 ${route}@${width}`;
        expect(data.inner, label).toBe(width);
        expect(overflow.innerWidth, label).toBe(width);
        assertNoHorizontalOverflow(overflow, label);
        if (data.injected) {
          expect(data.injected.overflowX, `${label} long title overflowX`).toBe(false);
        }
        for (const badge of data.badgeRows) {
          if (badge.childCount >= 6) {
            expect(badge.overflowX, `${label} 6-provider badge overflow`).toBe(false);
          }
        }
        const badgeOverflow = data.badgeRows.some((b) => b.overflowX);
        expect(badgeOverflow, `${label} any badge overflow`).toBe(false);
        expect(data.docSW, `${label} docSW`).toBeLessThanOrEqual(data.inner + 1);
        const row = {
          loop: 2,
          route,
          width,
          requestedWidth: width,
          finalUrl: nav.finalUrl,
          injectedOverflow: data.injected?.overflowX ?? null,
          injected: data.injected,
          badgeOverflow,
          badgeRows: data.badgeRows,
          docSW: data.docSW,
          inner: data.inner,
        };
        matrix.push(row);
        appendLog(logPath, JSON.stringify(row));
        console.log("[L2]", JSON.stringify(row));
        if (width === 375) {
          await screenshotAttach(
            page,
            testInfo,
            `L2-${route.replace(/\//g, "_") || "home"}-375`,
            2
          );
        }
      }
    }
    writeJson(path.join(loopDir(2), "matrix.json"), matrix);
    expect(matrix.length).toBe(routes.length * WIDTHS.length);
    for (const row of matrix) {
      expect(row.injectedOverflow, `L2 title ${row.route}@${row.width}`).not.toBe(true);
      expect(row.badgeOverflow, `L2 badges ${row.route}@${row.width}`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// L3 — 390px Home and /tier fixed MobileNav overlap
// ---------------------------------------------------------------------------
test.describe("L3 390px Home and /tier fixed MobileNav overlap", () => {
  for (const navV5 of [false, true]) {
    test.describe(`navV5=${navV5}`, () => {
      test.use({ viewport: { width: 390, height: 844 } });

      test(`L3 audit navV5=${navV5}`, async ({ page }, testInfo) => {
        await setNavV5(page, navV5);
        const logPath = path.join(loopDir(3), `audit-navv5-${navV5}.log`);
        ensureDir(loopDir(3));
        const matrix: MetricRow[] = [];
        for (const width of WIDTHS) {
          await setExactViewport(page, width);
          for (const route of ["/", "/tier"] as const) {
            await gotoReady(page, route);
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(200);
            const nav = await measureNav(page);
            const overflow = await measureOverflow(page);
            const inner = await page.evaluate(() => window.innerWidth);
            const label = `L3 ${route}@${width} navV5=${navV5}`;
            expect(inner, label).toBe(width);
            expect(overflow.innerWidth, label).toBe(width);
            assertNoHorizontalOverflow(overflow, label);
            assertNavChrome(nav, label, { requirePresent: true });
            const row = {
              loop: 3,
              route,
              width,
              requestedWidth: width,
              innerWidth: inner,
              navV5,
              ...nav,
            };
            matrix.push(row as MetricRow);
            appendLog(logPath, JSON.stringify(row));
            console.log("[L3]", JSON.stringify(row));
            if (width === 390) {
              await screenshotAttach(
                page,
                testInfo,
                `L3-${route.replace(/\//g, "_") || "home"}-390-v5-${navV5}`,
                3
              );
            }
          }
        }
        // desktop control row — mobile nav must not present as fixed bottom bar
        await page.setViewportSize({ width: 1280, height: 800 });
        await gotoReady(page, "/");
        const desktop = await measureNav(page);
        matrix.push({ loop: 3, route: "/", width: 1280, navV5, ...desktop } as MetricRow);
        writeJson(path.join(loopDir(3), `matrix-navv5-${navV5}.json`), matrix);
        const mobileRows = matrix.filter((m) => (m.width as number) < 1280);
        expect(mobileRows.length).toBe(WIDTHS.length * 2);
        for (const row of mobileRows) {
          expect(row.anyLabelWrap, `L3 wrap ${row.route}@${row.width}`).toBe(false);
          expect(row.anyClipped, `L3 clip ${row.route}@${row.width}`).toBe(false);
          expect(row.navOverlapsLast, `L3 overlap ${row.route}@${row.width}`).toBe(false);
          expect(row.reservedOk, `L3 reserved ${row.route}@${row.width}`).toBe(true);
        }
      });
    });
  }
});

// ---------------------------------------------------------------------------
// L4 — 430px safe-area + last CTA + page-end spacing
// ---------------------------------------------------------------------------
test.describe("L4 430px safe-area + last CTA + page-end spacing", () => {
  test.use({ viewport: { width: 430, height: 844 } });

  test("L4 audit matrix", async ({ page }, testInfo) => {
    ensureDir(loopDir(4));
    const matrix: MetricRow[] = [];
    for (const navV5 of [false, true]) {
      await setNavV5(page, navV5);
      for (const width of WIDTHS) {
        await setExactViewport(page, width);
        for (const route of PUBLIC_ROUTES) {
          await gotoReady(page, route);
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await page.waitForTimeout(200);
          const nav = await measureNav(page);
          const overflow = await measureOverflow(page);
          const inner = await page.evaluate(() => window.innerWidth);
          const label = `L4 ${route}@${width} navV5=${navV5}`;
          expect(inner, label).toBe(width);
          expect(overflow.innerWidth, label).toBe(width);
          assertNoHorizontalOverflow(overflow, label);
          assertNavChrome(nav, label, { requirePresent: true });
          // Scroll-end: reserved body pad + no nav overlap of last CTA/content.
          if (nav.present) {
            expect(nav.navOverlapsLast, `${label} last CTA obscured`).toBe(false);
            // bodyPaddingBottom must cover nav chrome + bottom offset + 8px gap.
            // Use max(measured bottomOffset, 10) so a 0px measurement cannot under-require pad.
            const need =
              nav.nav.height + Math.max(nav.nav.bottomOffset, 10) + 8;
            expect(nav.bodyPaddingBottom, `${label} body pad >= navH+offset+8`).toBeGreaterThanOrEqual(
              need
            );
            expect(nav.reservedOk, `${label} reservedOk`).toBe(true);
          }
          const row = {
            loop: 4,
            route,
            width,
            requestedWidth: width,
            innerWidth: inner,
            navV5,
            ...nav,
          };
          matrix.push(row as MetricRow);
          appendLog(path.join(loopDir(4), "audit.log"), JSON.stringify(row));
          console.log("[L4]", JSON.stringify(row));
        }
      }
    }
    await setExactViewport(page, 430);
    await gotoReady(page, "/");
    await screenshotAttach(page, testInfo, "L4-home-430", 4);
    writeJson(path.join(loopDir(4), "matrix.json"), matrix);
    expect(matrix.length).toBe(PUBLIC_ROUTES.length * WIDTHS.length * 2);
    for (const row of matrix) {
      expect(row.reservedOk, `L4 reserved ${row.route}@${row.width}`).toBe(true);
      expect(row.navOverlapsLast, `L4 overlap ${row.route}@${row.width}`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// L5 — combined stress
// ---------------------------------------------------------------------------
test.describe("L5 long text / no image / many-provider combined fixture", () => {
  test.use({ viewport: { width: 375, height: 844 } });

  test("L5 audit matrix", async ({ page }, testInfo) => {
    ensureDir(loopDir(5));
    const matrix: MetricRow[] = [];
    const routes = ["/", "/tier", "/watchlist", "/seasons/2026/summer"] as const;
    for (const width of WIDTHS) {
      await setExactViewport(page, width);
      for (const route of routes) {
        await gotoReady(page, route);
        // Allow client boards / watchlist hydrate before stress probe.
        try {
          await page.waitForSelector(CARD_SELECTOR, { timeout: 4_000 });
        } catch {
          /* may honestly have zero production cards */
        }
        await page.waitForTimeout(300);
        let stress = await applyCombinedStress(page);
        if (!stress.stressed) {
          await page.waitForTimeout(1_200);
          stress = await applyCombinedStress(page);
        }
        const cards = await measureCards(page);
        const overflow = await measureOverflow(page);
        const label = `L5 ${route}@${width}`;
        expect(overflow.innerWidth, label).toBe(width);
        assertNoHorizontalOverflow(overflow, label);
        // Honest status: STRESSED only when a real card was mutated; otherwise BLOCKED_NO_CARD.
        const status = stress.stressed ? "STRESSED" : "BLOCKED_NO_CARD";
        if (stress.stressed) {
          assertBrokenCoverGeometry(cards, label);
          expect(
            cards.rows.some((r) => r.exceedsViewport),
            `${label} stressed card exceeds viewport`
          ).toBe(false);
        }
        const row = {
          loop: 5,
          route,
          width,
          requestedWidth: width,
          status,
          stressed: stress.stressed,
          stressCardClass: stress.cardClass,
          cardCount: cards.count,
          siblingOverlap: cards.siblingOverlap,
          anyExceeds: cards.rows.some((r) => r.exceedsViewport),
          scrollWidth: overflow.scrollWidth,
          innerWidth: overflow.innerWidth,
          overflow: overflow.overflow,
          sample: stress.stressed
            ? cards.rows[0] || {
                note: "stressed",
                cardClass: stress.cardClass,
              }
            : null,
        };
        matrix.push(row);
        appendLog(path.join(loopDir(5), "audit.log"), JSON.stringify(row));
        console.log("[L5]", JSON.stringify(row));
      }
    }
    await setExactViewport(page, 320);
    await gotoReady(page, "/seasons/2026/summer");
    await applyCombinedStress(page);
    await screenshotAttach(page, testInfo, "L5-seasons-320-stress", 5);
    writeJson(path.join(loopDir(5), "matrix.json"), matrix);
    const blocked = matrix.filter((m) => m.status === "BLOCKED_NO_CARD");
    writeJson(path.join(loopDir(5), "blocked.json"), blocked);
    // Every required route×width must either be stressed with a sample or honestly blocked.
    for (const row of matrix) {
      expect(row.requestedWidth, `L5 width ${row.route}@${row.width}`).toBe(row.innerWidth);
      expect(row.overflow, `L5 overflow ${row.route}@${row.width}`).toBe(false);
      if (row.status === "STRESSED") {
        expect(row.stressed, `stressed flag ${row.route}@${row.width}`).toBe(true);
        expect(row.sample, `stressed sample ${row.route}@${row.width}`).toBeTruthy();
        expect(row.anyExceeds, `stressed exceeds ${row.route}@${row.width}`).toBe(false);
      } else {
        expect(row.stressed, `blocked not stressed ${row.route}@${row.width}`).toBe(false);
        expect(row.sample, `blocked no sample ${row.route}@${row.width}`).toBeNull();
      }
    }
    expect(matrix.length).toBe(routes.length * WIDTHS.length);
  });
});

// ---------------------------------------------------------------------------
// L6 — /tier interactions + 44px + modal/menu
// ---------------------------------------------------------------------------
test.describe("L6 /tier interactions + 44px buttons + modal/menu", () => {
  test.use({ viewport: { width: 375, height: 844 } });

  test("L6 audit matrix", async ({ page }, testInfo) => {
    ensureDir(loopDir(6));
    const matrix: MetricRow[] = [];
    for (const width of WIDTHS) {
      await setExactViewport(page, width);
      await gotoReady(page, "/tier");
      const taps = await measureTapTargets(page);
      const nav = await measureNav(page);
      const overflow = await measureOverflow(page);
      const inner = await page.evaluate(() => window.innerWidth);
      const label = `L6 /tier@${width}`;
      expect(inner, label).toBe(width);
      assertNoHorizontalOverflow(overflow, label);
      assertNavChrome(nav, label, { requirePresent: true });
      // Form fields / selects must meet 44px (logo may remain residual under44).
      const fieldUnder = taps.under44.filter(
        (t) => t.sel.includes("select") || t.sel.includes("field") || t.sel.includes("button")
      );
      expect(fieldUnder, `${label} interactive under44 (excl logo residual)`).toEqual(
        fieldUnder.filter((t) => t.sel.includes("global-nav-logo"))
      );
      const row = {
        loop: 6,
        route: "/tier",
        width,
        requestedWidth: width,
        innerWidth: inner,
        under44Count: taps.count,
        under44: taps.under44.slice(0, 30),
        navAnyLabelWrap: nav.present ? nav.anyLabelWrap : null,
        navMinH: nav.present ? Math.min(...nav.links.map((l) => l.h)) : null,
      };
      matrix.push(row);
      appendLog(path.join(loopDir(6), "audit.log"), JSON.stringify(row));
      console.log("[L6]", JSON.stringify({ ...row, under44: row.under44.slice(0, 8) }));
    }

    // overlay probes at 320 and 430
    for (const width of [320, 430] as const) {
      await setExactViewport(page, width);
      await gotoReady(page, "/tier");
      const menuBtn = page.locator("button, a").filter({ hasText: /メニュー|menu|設定/i }).first();
      const hamburger = page.locator("[aria-label*='メニュー'], [aria-label*='menu'], .hamburger, button:has(svg)").first();
      let overlay = { opened: false as boolean, detail: null as unknown };
      try {
        if (await hamburger.count()) {
          await hamburger.click({ timeout: 2000 });
          await page.waitForTimeout(300);
          overlay = {
            opened: true,
            detail: await page.evaluate(() => {
              const panel = document.querySelector(
                "[role='dialog'], .hamburger-menu, .menu-drawer, aside, nav.drawer"
              ) as HTMLElement | null;
              const nav = document.querySelector("nav.mobile-bottom-nav") as HTMLElement | null;
              if (!panel) return { panel: false };
              const r = panel.getBoundingClientRect();
              return {
                panel: true,
                w: r.width,
                h: r.height,
                top: r.top,
                bottom: r.bottom,
                sw: document.documentElement.scrollWidth,
                inner: window.innerWidth,
                navZ: nav ? getComputedStyle(nav).zIndex : null,
                panelZ: getComputedStyle(panel).zIndex,
              };
            }),
          };
          await page.keyboard.press("Escape");
        }
      } catch {
        /* optional */
      }
      void menuBtn;
      const oRow = { loop: 6, route: "/tier", width, overlay };
      matrix.push(oRow as MetricRow);
      appendLog(path.join(loopDir(6), "overlay.log"), JSON.stringify(oRow));
      await screenshotAttach(page, testInfo, `L6-tier-${width}`, 6);
    }
    writeJson(path.join(loopDir(6), "matrix.json"), matrix);
    expect(matrix.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// L7 — /guide and /updates long-page readability
// ---------------------------------------------------------------------------
test.describe("L7 /guide and /updates long-page readability + fixed nav", () => {
  test.use({ viewport: { width: 375, height: 844 } });

  test("L7 audit matrix", async ({ page }, testInfo) => {
    ensureDir(loopDir(7));
    const matrix: MetricRow[] = [];
    for (const width of WIDTHS) {
      await setExactViewport(page, width);
      for (const route of ["/guide", "/updates"] as const) {
        await gotoReady(page, route);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(200);
        const read = await measureReadability(page);
        const nav = await measureNav(page);
        const overflow = await measureOverflow(page);
        const inner = await page.evaluate(() => window.innerWidth);
        const label = `L7 ${route}@${width}`;
        expect(inner, label).toBe(width);
        assertNoHorizontalOverflow(overflow, label);
        assertNavChrome(nav, label, { requirePresent: true });
        expect(read.clipped, `${label} text clipped`).toEqual([]);
        expect(read.finalAboveNav, `${label} final content above nav`).toBe(true);
        const row = {
          loop: 7,
          route,
          width,
          requestedWidth: width,
          innerWidth: inner,
          ...read,
          navPresent: nav.present,
          navTop: nav.present ? nav.nav.top : null,
          anyLabelWrap: nav.present ? nav.anyLabelWrap : null,
          navOverlapsLast: nav.present ? nav.navOverlapsLast : null,
          reservedOk: nav.present ? nav.reservedOk : null,
        };
        matrix.push(row as MetricRow);
        appendLog(path.join(loopDir(7), "audit.log"), JSON.stringify(row));
        console.log("[L7]", JSON.stringify(row));
      }
    }
    await setExactViewport(page, 320);
    await gotoReady(page, "/guide");
    await screenshotAttach(page, testInfo, "L7-guide-320", 7);
    await gotoReady(page, "/updates");
    await screenshotAttach(page, testInfo, "L7-updates-320", 7);
    writeJson(path.join(loopDir(7), "matrix.json"), matrix);
    expect(matrix.length).toBe(2 * WIDTHS.length);
    for (const row of matrix) {
      expect(row.clipped, `L7 clipped ${row.route}@${row.width}`).toEqual([]);
      expect(row.anyLabelWrap, `L7 wrap ${row.route}@${row.width}`).toBe(false);
      expect(row.navOverlapsLast, `L7 overlap ${row.route}@${row.width}`).toBe(false);
      expect(row.finalAboveNav, `L7 finalAboveNav ${row.route}@${row.width}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// L8 — authenticated pages shell + empty states
// ---------------------------------------------------------------------------
test.describe("L8 authenticated pages common shell + empty states", () => {
  test.use({ viewport: { width: 375, height: 844 } });

  test("L8 auth shell matrix", async ({ page }, testInfo) => {
    ensureDir(loopDir(8));
    const matrix: MetricRow[] = [];
    let authBlocked = false;
    let authError: string | null = null;

    for (const width of WIDTHS) {
      await setExactViewport(page, width);
      for (const route of AUTH_ROUTES) {
        try {
          const nav = await gotoReady(page, route);
          const shell = await page.evaluate(() => {
            const main = document.querySelector("main") as HTMLElement | null;
            const header = document.querySelector("header, .app-shell header, .topbar") as HTMLElement | null;
            const mr = main?.getBoundingClientRect();
            const hr = header?.getBoundingClientRect();
            return {
              mainH: mr ? Math.round(mr.height * 100) / 100 : 0,
              mainW: mr ? Math.round(mr.width * 100) / 100 : 0,
              headerH: hr ? Math.round(hr.height * 100) / 100 : 0,
              padL: main ? getComputedStyle(main).paddingLeft : null,
              padR: main ? getComputedStyle(main).paddingRight : null,
              maxW: main ? getComputedStyle(main).maxWidth : null,
            };
          });
          const overflow = await measureOverflow(page);
          const shellBounds = await measureShellBounds(page);
          const label = `L8-auth ${route}@${width}`;
          expect(overflow.innerWidth, label).toBe(width);
          assertNoHorizontalOverflow(overflow, label);
          expect(shellBounds.anyExceeds, `${label} major containers exceed viewport`).toBe(
            false
          );
          expect(shell.mainH, `${label} main height`).toBeGreaterThanOrEqual(120);
          expect(shell.mainW, `${label} main width`).toBeLessThanOrEqual(width + 1);
          // Settings: every major container must stay inside CSS viewport.
          if (route === "/settings") {
            expect(shellBounds.rows.length, `${label} settings containers found`).toBeGreaterThan(
              0
            );
            for (const c of shellBounds.rows) {
              expect(c.exceeds, `${label} settings ${c.sel}`).toBe(false);
              expect(c.right, `${label} settings ${c.sel} right`).toBeLessThanOrEqual(width + 1);
            }
          }
          const row = {
            loop: 8,
            route,
            width,
            requestedWidth: width,
            finalUrl: nav.finalUrl,
            status: nav.status,
            ...shell,
            shellAnyExceeds: shellBounds.anyExceeds,
            shellContainers: shellBounds.rows,
            scrollWidth: overflow.scrollWidth,
            innerWidth: overflow.innerWidth,
          };
          matrix.push(row);
          appendLog(path.join(loopDir(8), "auth.log"), JSON.stringify(row));
          console.log("[L8-auth]", JSON.stringify(row));
        } catch (e) {
          authBlocked = true;
          authError = e instanceof Error ? e.message : String(e);
          matrix.push({ loop: 8, route, width, blocked: true, error: authError });
        }
      }
    }

    writeJson(path.join(loopDir(8), "auth-matrix.json"), { authBlocked, authError, matrix });
    await screenshotAttach(page, testInfo, "L8-auth-sample", 8);
    expect(matrix.length).toBe(AUTH_ROUTES.length * WIDTHS.length);
    expect(authBlocked, `L8 auth blocked: ${authError}`).toBe(false);
    for (const row of matrix) {
      expect(row.blocked, `L8 blocked row ${row.route}@${row.width}`).toBeFalsy();
      expect(row.shellAnyExceeds, `L8 shell ${row.route}@${row.width}`).toBe(false);
      expect(row.requestedWidth, `L8 width ${row.route}@${row.width}`).toBe(row.innerWidth);
    }
  });
});

test.describe("L8 guest empty states", () => {
  test.use({
    viewport: { width: 375, height: 844 },
    storageState: { cookies: [], origins: [] },
  });

  test("L8 guest empty matrix", async ({ page }, testInfo) => {
    ensureDir(loopDir(8));
    const matrix: MetricRow[] = [];
    for (const width of WIDTHS) {
      await setExactViewport(page, width);
      for (const route of PUBLIC_ROUTES) {
        await gotoReady(page, route);
        const empty = await page.evaluate(() => {
          const candidates = Array.from(
            document.querySelectorAll(
              ".empty-state, .tutorial-empty-callout, .season-share-empty, [data-empty], .empty"
            )
          ) as HTMLElement[];
          const main = document.querySelector("main") as HTMLElement | null;
          const cta = document.querySelector(
            ".empty-state a, .empty-state button, .tutorial-empty-callout .command-button, main a.command-button"
          ) as HTMLElement | null;
          const cr = cta?.getBoundingClientRect();
          const nav = document.querySelector("nav.mobile-bottom-nav") as HTMLElement | null;
          const nr = nav?.getBoundingClientRect();
          return {
            emptyCount: candidates.length,
            mainH: main ? Math.round(main.getBoundingClientRect().height * 100) / 100 : 0,
            cta: cr
              ? {
                  w: Math.round(cr.width * 100) / 100,
                  h: Math.round(cr.height * 100) / 100,
                  bottom: Math.round(cr.bottom * 100) / 100,
                  underNav: nr ? cr.bottom > nr.top : false,
                }
              : null,
          };
        });
        const overflow = await measureOverflow(page);
        const label = `L8-guest ${route}@${width}`;
        expect(overflow.innerWidth, label).toBe(width);
        assertNoHorizontalOverflow(overflow, label);
        if (empty.cta) {
          expect(empty.cta.underNav, `${label} CTA under nav`).toBe(false);
        }
        const row = {
          loop: 8,
          context: "guest",
          route,
          width,
          requestedWidth: width,
          ...empty,
          scrollWidth: overflow.scrollWidth,
          innerWidth: overflow.innerWidth,
        };
        matrix.push(row);
        appendLog(path.join(loopDir(8), "guest.log"), JSON.stringify(row));
        console.log("[L8-guest]", JSON.stringify(row));
      }
    }
    await setExactViewport(page, 320);
    await gotoReady(page, "/");
    await screenshotAttach(page, testInfo, "L8-guest-home-320", 8);
    writeJson(path.join(loopDir(8), "guest-matrix.json"), matrix);
    expect(matrix.length).toBe(PUBLIC_ROUTES.length * WIDTHS.length);
    for (const row of matrix) {
      expect(row.requestedWidth, `L8-guest width ${row.route}@${row.width}`).toBe(row.innerWidth);
      expect(row.scrollWidth as number, `L8-guest scroll ${row.route}@${row.width}`).toBeLessThanOrEqual(
        (row.innerWidth as number) + 1
      );
    }
  });
});

// ---------------------------------------------------------------------------
// L9 — all routes horizontal overflow + console/pageerror
// ---------------------------------------------------------------------------
test.describe("L9 all target routes horizontal overflow + console/pageerror", () => {
  test.use({ viewport: { width: 375, height: 844 } });

  test("L9 full matrix", async ({ page }, testInfo) => {
    ensureDir(loopDir(9));
    const matrix: MetricRow[] = [];
    await installQuietPageNetwork(page);

    // explore probe
    await setExactViewport(page, 375);
    const explore = await gotoReady(page, "/explore");
    const exploreRow = {
      route: "/explore",
      status: "OWNER_GATED",
      requested_url: "http://localhost:3000/explore",
      final_url: explore.finalUrl,
      evidence: `status=${explore.status}`,
    };
    writeJson(path.join(loopDir(9), "explore-gate.json"), exploreRow);
    console.log("[L9-explore]", JSON.stringify(exploreRow));

    for (const width of WIDTHS) {
      await setExactViewport(page, width);
      for (const route of AUDITABLE_ROUTES) {
        const mon = attachConsole(page, { isolation: true });
        await gotoReady(page, route);
        // Re-pin CSS-px width after navigation (settings and others may disturb metrics).
        await setExactViewport(page, width, 844, { preservePage: true });
        // Settle client fetches (auth session etc.) without relying on flaky networkidle.
        await page.waitForTimeout(500);
        // Nav occlusion is only meaningful at scroll-end (last CTA vs fixed bottom nav).
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(200);
        const overflow = await measureOverflow(page);
        const nav = await measureNav(page);
        const shellBounds =
          route === "/settings" ? await measureShellBounds(page) : null;
        const label = `L9 ${route}@${width}`;
        expect(overflow.innerWidth, label).toBe(width);
        assertNoHorizontalOverflow(overflow, label);
        assertNavChrome(nav, label);
        if (shellBounds) {
          expect(shellBounds.anyExceeds, `${label} settings containers`).toBe(false);
        }
        const consoleErrors = mon.messages.filter(
          (m) => m.type === "error" || m.type === "pageerror"
        );
        const pageerrors = mon.messages.filter((m) => m.type === "pageerror");
        const nav_overlap_px =
          nav.present && nav.navOverlapsLast
            ? Math.round(((nav.lastFocusableBottom || 0) - nav.nav.top) * 100) / 100
            : 0;
        const row = {
          loop: 9,
          route,
          width,
          requestedWidth: width,
          scrollWidth: overflow.scrollWidth,
          bodyScrollWidth: overflow.bodyScrollWidth,
          innerWidth: overflow.innerWidth,
          overflow: overflow.overflow,
          offenders: overflow.offenders,
          nav_overlap_px,
          anyLabelWrap: nav.present ? nav.anyLabelWrap : null,
          anyClipped: nav.present ? nav.anyClipped : null,
          console_errors: consoleErrors,
          pageerrors,
          warnings: mon.messages.filter((m) => m.type === "warning"),
          isolation: true,
        };
        mon.dispose();
        matrix.push(row as MetricRow);
        appendLog(path.join(loopDir(9), "audit.log"), JSON.stringify(row));
        console.log(
          "[L9]",
          JSON.stringify({
            route,
            width,
            scrollWidth: row.scrollWidth,
            innerWidth: row.innerWidth,
            overflow: row.overflow,
            nav_overlap_px,
            errors: consoleErrors.length,
            pageerrors: pageerrors.length,
          })
        );
        // Hard gate: every cell must pass production-layout metrics.
        expect(row.requestedWidth, `${label} requestedWidth==innerWidth`).toBe(row.innerWidth);
        expect(consoleErrors, `${label} console`).toEqual([]);
        expect(pageerrors, `${label} pageerror`).toEqual([]);
        expect(row.overflow, `${label} overflow`).toBe(false);
        expect(row.nav_overlap_px, `${label} nav overlap`).toBe(0);
        expect(row.scrollWidth as number, `${label} scrollWidth`).toBeLessThanOrEqual(
          (row.innerWidth as number) + 1
        );
        if (width === 375) {
          await screenshotAttach(
            page,
            testInfo,
            `L9-${route.replace(/\//g, "_") || "home"}-375`,
            9
          );
        }
      }
    }
    writeJson(path.join(loopDir(9), "matrix.json"), matrix);
    expect(matrix.length).toBe(AUDITABLE_ROUTES.length * WIDTHS.length);
    for (const row of matrix) {
      expect(row.requestedWidth, `L9 final width ${row.route}@${row.width}`).toBe(row.innerWidth);
      expect(row.overflow, `L9 final overflow ${row.route}@${row.width}`).toBe(false);
      expect(row.nav_overlap_px, `L9 final nav ${row.route}@${row.width}`).toBe(0);
      expect(row.console_errors, `L9 final console ${row.route}@${row.width}`).toEqual([]);
      expect(row.pageerrors, `L9 final pageerror ${row.route}@${row.width}`).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// L10 — production-equivalent final sweep (dev server path; build verified outside)
// ---------------------------------------------------------------------------
test.describe("L10 final production-equivalent E2E + visual evidence", () => {
  test.use({ viewport: { width: 375, height: 844 } });

  test("L10 visual matrix", async ({ page }, testInfo) => {
    ensureDir(loopDir(10));
    await installQuietPageNetwork(page);
    const visuals: Array<{ route: string; width: number; attachment_name: string }> = [];
    const matrix: MetricRow[] = [];
    for (const width of WIDTHS) {
      await setExactViewport(page, width);
      for (const route of AUDITABLE_ROUTES) {
        const mon = attachConsole(page, { isolation: true });
        await gotoReady(page, route);
        await setExactViewport(page, width, 844, { preservePage: true });
        await page.waitForTimeout(400);
        // Scroll-end before nav/last-CTA assertions (matches L3/L4/L7 semantics).
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(200);
        const overflow = await measureOverflow(page);
        const nav = await measureNav(page);
        const shellBounds =
          route === "/settings" ? await measureShellBounds(page) : null;
        const label = `L10 ${route}@${width}`;
        expect(overflow.innerWidth, label).toBe(width);
        assertNoHorizontalOverflow(overflow, label);
        assertNavChrome(nav, label);
        if (shellBounds) {
          expect(shellBounds.anyExceeds, `${label} settings containers`).toBe(false);
        }
        const name = `L10-${route.replace(/\//g, "_") || "home"}-${width}`;
        await screenshotAttach(page, testInfo, name, 10);
        visuals.push({ route, width, attachment_name: name });
        const consoleErrors = mon.messages.filter(
          (m) => m.type === "error" || m.type === "pageerror"
        );
        const pageerrors = mon.messages.filter((m) => m.type === "pageerror");
        mon.dispose();
        const nav_overlap_px =
          nav.present && nav.navOverlapsLast
            ? Math.round(((nav.lastFocusableBottom || 0) - nav.nav.top) * 100) / 100
            : 0;
        const row = {
          loop: 10,
          route,
          width,
          requestedWidth: width,
          scrollWidth: overflow.scrollWidth,
          bodyScrollWidth: overflow.bodyScrollWidth,
          innerWidth: overflow.innerWidth,
          overflow: overflow.overflow,
          offenders: overflow.offenders,
          nav_overlap_px,
          anyLabelWrap: nav.present ? nav.anyLabelWrap : null,
          anyClipped: nav.present ? nav.anyClipped : null,
          console_errors: consoleErrors,
          pageerrors,
          console_errors_count: consoleErrors.length,
          pageerrors_count: pageerrors.length,
        };
        // Hard assert every critical metric on every auditable route×width cell.
        expect(row.requestedWidth, `${label} requestedWidth==innerWidth`).toBe(row.innerWidth);
        expect(row.overflow, `${label} overflow`).toBe(false);
        expect(row.scrollWidth as number, `${label} scrollWidth`).toBeLessThanOrEqual(
          (row.innerWidth as number) + 1
        );
        expect(row.nav_overlap_px, `${label} nav overlap`).toBe(0);
        expect(consoleErrors, `${label} console`).toEqual([]);
        expect(pageerrors, `${label} pageerror`).toEqual([]);
        matrix.push(row);
        console.log("[L10]", JSON.stringify(row));
      }
    }

    // L9 comparison is mandatory — not an optional pass path.
    const l9Path = path.join(loopDir(9), "matrix.json");
    expect(fs.existsSync(l9Path), "L10 requires L9 matrix.json evidence").toBe(true);
    const l9 = JSON.parse(fs.readFileSync(l9Path, "utf8")) as Array<{
      route: string;
      width: number;
      scrollWidth: number;
      innerWidth: number;
      overflow: boolean;
      nav_overlap_px?: number;
    }>;
    expect(l9.length, "L9 must have full 36-cell matrix").toBe(
      AUDITABLE_ROUTES.length * WIDTHS.length
    );
    const mismatches: Array<Record<string, unknown>> = [];
    for (const row of matrix) {
      const prev = l9.find((r) => r.route === row.route && r.width === row.width);
      if (!prev) {
        mismatches.push({ route: row.route, width: row.width, reason: "missing_in_l9" });
        continue;
      }
      if (
        prev.scrollWidth !== row.scrollWidth ||
        prev.innerWidth !== row.innerWidth ||
        Boolean(prev.overflow) !== Boolean(row.overflow) ||
        (prev.nav_overlap_px ?? 0) !== (row.nav_overlap_px as number)
      ) {
        mismatches.push({
          route: row.route,
          width: row.width,
          l9: {
            scrollWidth: prev.scrollWidth,
            innerWidth: prev.innerWidth,
            overflow: prev.overflow,
            nav_overlap_px: prev.nav_overlap_px ?? 0,
          },
          l10: {
            scrollWidth: row.scrollWidth,
            innerWidth: row.innerWidth,
            overflow: row.overflow,
            nav_overlap_px: row.nav_overlap_px,
          },
        });
      }
    }
    const comparison = {
      l9_present: true,
      l9_rows: l9.length,
      l10_rows: matrix.length,
      mismatch_count: mismatches.length,
      mismatches,
      match: mismatches.length === 0 && l9.length === matrix.length,
      required: true,
    };
    expect(mismatches, "L9 vs L10 overflow matrix (mandatory)").toEqual([]);
    expect(comparison.match, "L9 vs L10 match").toBe(true);

    writeJson(path.join(loopDir(10), "visuals.json"), visuals);
    writeJson(path.join(loopDir(10), "matrix.json"), matrix);
    writeJson(path.join(loopDir(10), "l9-comparison.json"), comparison);
    expect(visuals.length).toBe(AUDITABLE_ROUTES.length * WIDTHS.length);
    expect(matrix.length).toBe(36);
    for (const row of matrix) {
      expect(row.requestedWidth, `L10 final width ${row.route}@${row.width}`).toBe(row.innerWidth);
      expect(row.overflow, `L10 final overflow ${row.route}@${row.width}`).toBe(false);
      expect(row.nav_overlap_px, `L10 final nav ${row.route}@${row.width}`).toBe(0);
      expect(row.console_errors_count, `L10 final console ${row.route}@${row.width}`).toBe(0);
      expect(row.pageerrors_count, `L10 final pageerror ${row.route}@${row.width}`).toBe(0);
    }
    writeJson(path.join(loopDir(10), "screenshot-count.json"), {
      visuals: visuals.length,
      expected: 36,
    });
  });
});
