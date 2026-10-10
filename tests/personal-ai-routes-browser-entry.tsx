import React, { useState } from "react";
import { createRoot } from "react-dom/client";

window.__aiLink = ({ children, prefetch: _prefetch, ...props }) => <a {...props}>{children}</a>;
// Next supplies router context and compile-time flags; the standalone bundle
// fixtures only the framework navigation transport, not production components.
window.__aiNavigation = {
  useRouter: () => ({ replace: (url) => window.history.replaceState(null, "", url) }),
};
const { StatusBottomSheet } = { StatusBottomSheet: require("../components/StatusBottomSheet").default };
const { ExploreClient } = require("../app/explore/explore-client");
const { DisplayModeProvider } = require("../components/display-mode/DisplayModeProvider");
function Harness() {
  const [open, setOpen] = useState(false);
  return <DisplayModeProvider>{window.fixture.route === "detail" ? <>
    <button onClick={() => setOpen(true)}>作品詳細を開く</button>
    <StatusBottomSheet open={open} record={window.fixture.records[0]} onClose={() => setOpen(false)} />
  </> : <ExploreClient initialStatuses={window.fixture.records} initialSubscriptions={[]} initialYear={2026} initialSeason="FALL" initialYearScope={false} />}</DisplayModeProvider>;
}
createRoot(document.getElementById("root")).render(<Harness />);
