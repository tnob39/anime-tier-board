import React from "react";
import { createRoot } from "react-dom/client";

// Only auth/routing are fixtures; the dashboard, inbox, nav, React and CSS are real.
window.__inboxAuth = { useSession: () => window.fixture.session };
window.__inboxNavigation = {
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ refresh() {} })
};
window.__inboxLink = ({ children, prefetch: _prefetch, ...props }) => <a {...props}>{children}</a>;
const { DashboardClient } = require("../app/dashboard/dashboard-client");
const { MobileNav } = require("../components/MobileNav");
const root = createRoot(document.getElementById("root"));
window.renderInbox = () => root.render(<>
  <DashboardClient
    dashboard={{ totalStatuses: 0, statusCounts: { planned: 0, watching: 0, completed: 0, paused: 0, dropped: 0 }, topGenres: [], topVoiceActors: [], recent: [] }}
    subscriptionDiagnosis={{ watchlistCount: 0 }} hasSubscriptions={false}
    initialSubscriptionServiceIds={[]} isOwner={false}
  />
  <MobileNav />
</>);
window.renderInbox();
