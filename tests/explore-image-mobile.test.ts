import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(root, "app/explore/explore-client.tsx"), "utf8");
const css = readFileSync(path.join(root, "app/globals.css"), "utf8");
const proxy = readFileSync(path.join(root, "app/api/image-proxy/route.ts"), "utf8");

test("explore images reserve space and use bounded priority loading", () => {
  assert.match(source, /const PRIORITY_IMAGE_COUNT = 4/);
  assert.match(source, /width=\{96\}[\s\S]*height=\{136\}/);
  assert.match(source, /loading=\{priority \? "eager" : "lazy"\}/);
  assert.match(source, /fetchPriority=\{priority \? "high" : "auto"\}/);
  assert.match(source, /srcSet=\{`\$\{standardSrc\} 1x, \$\{retinaSrc\} 2x`\}/);
  assert.match(source, /sizes="\(max-width: 640px\) 82px, 96px"/);
  assert.match(source, /decoding="async"/);
  assert.match(source, /onError=\{\(\) => setState\("error"\)\}/);
  assert.match(css, /\.explore-card-image\s*\{[\s\S]*?aspect-ratio:\s*12\s*\/\s*17/);
  assert.match(source, /<div aria-hidden="true">[\s\S]*?<AnimeCardPlaceholder/);
  assert.match(proxy, /resize\(\{ width, withoutEnlargement: true \}\)/);
  assert.match(proxy, /webp\(\{ quality: 78 \}\)/);
  assert.match(proxy, /"Content-Length": String\(output\.byteLength\)/);
});

test("simple mode gates image DOM until the persisted mode is known", () => {
  assert.match(source, /displayModeHydrated && displayMode === "visual"/);
  assert.match(css, /\[data-display-mode="simple"\] \.explore-card\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test("mobile explore controls wrap and retain target sizes", () => {
  assert.match(css, /\.explore-controls \.filter-chip-group\s*\{[\s\S]*?flex-wrap:\s*wrap/);
  assert.match(css, /\.explore-controls \.filter-chip\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(css, /\.explore-controls > \.command-button\s*\{[\s\S]*?min-height:\s*48px/);
  assert.match(css, /\.explore-card h2,[\s\S]*?overflow-wrap:\s*anywhere/);
});
