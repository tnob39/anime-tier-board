import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "../..");
const tierBoardApp = readFileSync(
  path.join(projectRoot, "components/TierBoardApp.tsx"),
  "utf8"
);
const globalsCss = readFileSync(path.join(projectRoot, "app/globals.css"), "utf8");

test("SortableAnimeCard keeps detail open off Enter/Space drag activation", () => {
  assert.match(
    tierBoardApp,
    /dndKeyDown\?\.\(event\)/,
    "must forward keydown to dnd-kit KeyboardSensor instead of opening details"
  );
  assert.match(
    tierBoardApp,
    /Enter\/Space:\s*forward to dnd-kit only/,
    "must document that Enter/Space stay reserved for drag activation"
  );
  assert.match(
    tierBoardApp,
    /className="sortable-card-detail"/,
    "must expose a sibling detail control outside the drag activator"
  );
  assert.match(
    tierBoardApp,
    /const detailLabel = `\$\{item\.title\}の詳細を開く`/,
    "detail control accessible name must be explicit"
  );
  assert.match(
    tierBoardApp,
    /const dragLabel = `\$\{item\.title\}をドラッグして並べ替え`/,
    "drag activator accessible name must be explicit"
  );
  assert.match(
    tierBoardApp,
    /onPointerDown: dndPointerDown/,
    "must compose pointer listeners so drag activation is not overwritten"
  );
});

test("SortableAnimeCard does not nest a detail button inside the drag activator", () => {
  const sortableStart = tierBoardApp.indexOf("function SortableAnimeCard");
  const sortableEnd = tierBoardApp.indexOf("function AnimeCard({");
  assert.ok(sortableStart >= 0 && sortableEnd > sortableStart);
  const block = tierBoardApp.slice(sortableStart, sortableEnd);
  const dragOpen = block.indexOf('className="sortable-card-drag"');
  const dragClose = block.indexOf("</div>", block.indexOf("<AnimeCard"));
  const detailBtn = block.indexOf('className="sortable-card-detail"');
  assert.ok(
    dragOpen >= 0 && dragClose > dragOpen && detailBtn > dragClose,
    "detail button must be a sibling after the drag activator closes"
  );
  const dragInner = block.slice(dragOpen, dragClose);
  assert.doesNotMatch(
    dragInner,
    /<button[\s\S]*sortable-card-detail/,
    "detail button must not be nested inside drag activator"
  );
});

test("post-drag open uses sticky suppress guard, not only momentary isDragging", () => {
  assert.match(tierBoardApp, /suppressOpenRef/, "sticky suppress ref required");
  assert.match(
    tierBoardApp,
    /suppressTimerRef|setTimeout/,
    "suppression must outlive isDragging=false for trailing click/tap"
  );
  assert.match(
    tierBoardApp,
    /armSuppressOpen/,
    "pointer movement and drag must arm the same suppress path"
  );
});

test("card chrome stays title-only dense in CSS", () => {
  assert.match(
    globalsCss,
    /\.anime-card \.anime-title[\s\S]*?min-height:\s*0/,
    "title block should not reserve tall empty meta height"
  );
  assert.match(
    globalsCss,
    /-webkit-line-clamp:\s*2/,
    "title must clamp to max 2 lines"
  );
  assert.match(
    globalsCss,
    /\.sortable-card-detail\s*\{/,
    "keyboard detail control styling must exist"
  );
});

test("MoveItemSheet keeps format/external/ratings/airing/streaming/status reachable", () => {
  const start = tierBoardApp.indexOf("function MoveItemSheet");
  const end = tierBoardApp.indexOf("function TierLane");
  assert.ok(start >= 0 && end > start);
  const sheet = tierBoardApp.slice(start, end);
  assert.match(sheet, /move-sheet-subline/, "format/external subline required");
  assert.match(sheet, /ExternalLink/, "external link control required");
  assert.match(sheet, /<ReputationBadges\s+item=\{item\}\s*\/>/, "ratings/popularity path");
  assert.match(sheet, /<AiringBadges\s+item=\{item\}\s*\/>/, "airing path");
  assert.match(sheet, /<StreamingPlatformLinks\s+item=\{item\}\s*\/>/, "streaming path");
  assert.match(sheet, /視聴ステータス/, "status section label");
  assert.match(sheet, /<StatusChips[\s\S]*?onChange=/, "status chips reachable");
  assert.doesNotMatch(
    tierBoardApp.slice(
      tierBoardApp.indexOf("function AnimeCard"),
      tierBoardApp.indexOf("function StatusChips")
    ),
    /ReputationBadges|AiringBadges|StreamingPlatformLinks|StatusChips/,
    "dense AnimeCard must not keep always-on meta controls"
  );
});
