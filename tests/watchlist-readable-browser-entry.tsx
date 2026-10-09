import React from "react";
import { createRoot } from "react-dom/client";

// Only framework auth/routing/Image are adapted; feature React, state and CSS are real.
window.__watchlistAuth = { useSession: () => ({ status: "authenticated", data: { user: { id: "fixture-owner" } } }) };
window.__watchlistNavigation = {
  usePathname: () => "/watchlist",
  useSearchParams: () => new URLSearchParams(location.search),
  useRouter: () => ({ push: (url) => history.pushState(null, "", url), refresh: () => {} }),
};
window.__watchlistLink = ({ children, prefetch: _prefetch, ...props }) => <a {...props}>{children}</a>;
window.__watchlistImage = ({ unoptimized: _unoptimized, ...props }) => <img loading="lazy" decoding="async" {...props} />;
const { WatchlistClientV2Grok } = require("../app/watchlist/watchlist-client-v2-grok");
const { DisplayModeProvider } = require("../components/display-mode/DisplayModeProvider");
createRoot(document.getElementById("root")).render(<DisplayModeProvider>
  <WatchlistClientV2Grok initialItems={window.fixture.items} recommendedAnime={window.fixture.recommended} />
</DisplayModeProvider>);
