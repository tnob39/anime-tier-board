import React from "react";
import { createRoot } from "react-dom/client";

// Only framework routing/auth are mocked. Feature components and CSS are real.
window.__impressionAuth = {
  useSession: () => window.fixture.session,
  signIn: async (_provider, options) => { window.fixture.redirectTo = options.redirectTo; }
};
window.__impressionNavigation = {
  usePathname: () => window.fixture.path,
  useSearchParams: () => new URLSearchParams(location.search),
  useRouter: () => ({ push: (url) => {
    const parsed = new URL(url, location.origin);
    window.fixture.path = parsed.pathname;
    window.fixture.seasonKey = { year: Number(parsed.searchParams.get("year")), season: parsed.searchParams.get("season") };
    window.renderImpressions();
  } })
};
window.__impressionLink = ({ children, prefetch: _prefetch, ...props }) => <a {...props}>{children}</a>;
window.__impressionImage = ({ unoptimized: _unoptimized, ...props }) => <img {...props} />;
const { ImpressionsClient } = require("../app/tier/impressions/impressions-client");
const { TierAreaNav } = require("../components/TierAreaNav");
const { DisplayModeProvider } = require("../components/display-mode/DisplayModeProvider");
const { ImpressionSnapshotView } = require("../components/ImpressionSnapshotView");
const root = createRoot(document.getElementById("root"));
for (const method of ["pushState", "replaceState"] as const) {
  const original = history[method].bind(history);
  history[method] = (...args) => { original(...args); window.renderImpressions(); };
}
window.addEventListener("popstate", () => window.renderImpressions());
window.renderImpressions = () => root.render(<DisplayModeProvider>
  {window.fixture.publicSnapshot ? <div className="impressions-page"><ImpressionSnapshotView snapshot={window.fixture.publicSnapshot} /></div> : <>
    <TierAreaNav /><ImpressionsClient key={window.fixture.mount}
      seasonKey={window.fixture.seasonKey} resumeToken={window.fixture.resumeToken ?? null} />
  </>}
</DisplayModeProvider>);
window.renderImpressions();
