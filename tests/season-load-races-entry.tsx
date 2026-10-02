import React, { act } from "react";
import { createRoot } from "react-dom/client";

// Use real components, hooks, cache and DOM. Only Next routing/auth and transport
// are fixtures; act drains React work after each explicitly controlled response.
window.IS_REACT_ACT_ENVIRONMENT = true;
const session = { data: null, status: "unauthenticated" };
const router = { prefetch() {}, push(url) { history.pushState(null, "", url); } };
window.__raceAuth = { useSession: () => session, signIn: async () => {} };
window.__raceNavigation = {
  useRouter: () => router,
  usePathname: () => location.pathname,
  useSearchParams: () => new URLSearchParams(location.search)
};
window.__raceLink = ({ children, prefetch: _prefetch, ...props }) => <a {...props}>{children}</a>;
window.__raceImage = ({ unoptimized: _unoptimized, ...props }) => <img {...props} />;
const { TierBoardApp } = require("../components/TierBoardApp");
const { ExploreClient } = require("../app/explore/explore-client");
const { HomeClient } = require("../app/home-client");
const { DisplayModeProvider } = require("../components/display-mode/DisplayModeProvider");
const { getCurrentAnimeSeason } = require("../lib/season");

const requests = [];
const writes = [];
const unexpected = [];
const originalSetItem = Storage.prototype.setItem;
Storage.prototype.setItem = function (key, value) {
  if (this === localStorage && key.startsWith("anime-tier-board:v1")) writes.push({ key, board: JSON.parse(value) });
  originalSetItem.call(this, key, value);
};
window.fetch = (input, options = {}) => {
  const url = new URL(String(input), location.origin);
  if (url.pathname === "/api/anime/seasonal" || (url.pathname === "/api/boards" && (!options.method || options.method === "GET"))) {
    return new Promise((resolve, reject) => requests.push({
      path: url.pathname, year: Number(url.searchParams.get("year")), season: url.searchParams.get("season"), resolve, reject, settled: false
    }));
  }
  if (url.pathname === "/api/statuses") return Promise.resolve(Response.json({ statuses: [] }));
  if (url.pathname === "/api/home") return Promise.resolve(Response.json({ nextActions: [] }));
  if (url.pathname === "/api/boards" && options.method === "PUT") return Promise.resolve(Response.json({ ok: true }));
  unexpected.push(`${options.method ?? "GET"} ${url.pathname}`);
  return Promise.reject(new Error(`Unexpected request: ${url.pathname}`));
};

const root = createRoot(document.getElementById("root"));
window.race = {
  async mount(kind, authenticated = false) {
    if (authenticated) Object.assign(session, { status: "authenticated", data: { user: { id: "race-user", email: "race@example.invalid" } } });
    localStorage.setItem("numanie-display-mode", "simple");
    localStorage.setItem("anime-tier-board:onboarding:n2-dismissed", "1");
    const current = getCurrentAnimeSeason();
    await act(async () => root.render(<DisplayModeProvider>
      {kind === "tier" ? <TierBoardApp initialYear={2025} initialSeason="WINTER" />
        : kind === "explore" ? <ExploreClient initialYear={2025} initialSeason="WINTER" initialYearScope={false} initialStatuses={[]} initialSubscriptions={[]} />
          : <HomeClient initialItems={[]} initialSeasonRef={{ year: 2025, season: "WINTER" }} initialSeasonalAnime={[{ id: "current", title: "現在の作品", source: "anilist", seasonYear: current.year, season: current.season }]} />}
    </DisplayModeProvider>));
  },
  async select(season, year) {
    await act(async () => {
      for (const [label, value] of [["年", year], ["クール", season]]) {
        if (value == null) continue;
        const select = document.querySelector(`.season-context-control select[aria-label="${label}"]`);
        if (select.disabled) throw new Error("Season control is disabled");
        select.value = String(value);
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  },
  async history(direction) {
    await act(async () => {
      await new Promise((resolve) => {
        window.addEventListener("popstate", resolve, { once: true });
        history[direction]();
      });
    });
  },
  async rapid(seasons) {
    await act(async () => {
      const select = document.querySelector('.season-context-control select[aria-label="クール"]');
      for (const season of seasons) {
        select.value = season;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  },
  async settle(index, outcome, payload) {
    await act(async () => {
      const request = requests[index];
      if (!request || request.settled) throw new Error(`Missing pending request ${index}`);
      request.settled = true;
      if (outcome === "reject") request.reject(new Error("旧シーズンの通信失敗"));
      else request.resolve(outcome === "malformed" ? new Response("{", { status: 200 }) : Response.json(payload, { status: outcome === "error" ? 503 : 200 }));
    });
  },
  async headers(index) {
    await act(async () => {
      const request = requests[index];
      if (!request || request.settled) throw new Error(`Missing pending request ${index}`);
      request.settled = true;
      const response = Response.json({});
      const body = new Promise((resolve, reject) => Object.assign(request, { resolveBody: resolve, rejectBody: reject }));
      response.json = () => body;
      request.resolve(response);
    });
  },
  async body(index, outcome, payload) {
    await act(async () => {
      const request = requests[index];
      if (outcome === "reject") request.rejectBody(new SyntaxError("旧シーズンのJSON失敗"));
      else request.resolveBody(payload);
    });
  },
  snapshot() {
    const control = document.querySelector(".season-context-control");
    const button = [...document.querySelectorAll("button")].find((button) => ["さがす", "再取得"].includes(button.textContent.trim()));
    return {
      requests: requests.map(({ path, year, season, settled }) => ({ path, year, season, settled })),
      season: control?.getAttribute("data-season-context-season"),
      year: control?.getAttribute("data-season-context-year"),
      titles: [...document.querySelectorAll(".anime-title, .explore-card h2, .home-add-card-title")].map((node) => node.textContent),
      alerts: [...document.querySelectorAll('[role="alert"]')].map((node) => node.textContent),
      loading: button ? button.disabled : Boolean(document.querySelector(".home-add-status-note .spin")),
      warning: document.querySelector(".notice.warning")?.textContent ?? null,
      writes: [...writes],
      storage: Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith("anime-tier-board:v1"))),
      unexpected: [...unexpected]
    };
  },
  async unmount() { await act(async () => root.unmount()); }
};
