import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "..");
const sheetCss = readFileSync(
  path.join(projectRoot, "components/ui/bottom-sheet.css"),
  "utf8"
);
const globalsCss = readFileSync(path.join(projectRoot, "app/globals.css"), "utf8");

function themeBlock(selector: string) {
  const match = globalsCss.match(
    new RegExp(`${escapeRegExp(selector)}\\s*\\{([\\s\\S]*?)\\n\\}`)
  );
  assert.ok(match, `Missing ${selector} theme block`);
  return match[1];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strip transparent / currentColor so only real color literals remain for checks. */
function stripAllowedColorKeywords(css: string) {
  return css
    .replace(/\btransparent\b/gi, "")
    .replace(/\bcurrentColor\b/gi, "");
}

/** CSS named colors (Level 3/4 keywords). transparent/currentColor are allowed elsewhere. */
const CSS_NAMED_COLORS = new Set(
  [
    "aliceblue",
    "antiquewhite",
    "aqua",
    "aquamarine",
    "azure",
    "beige",
    "bisque",
    "black",
    "blanchedalmond",
    "blue",
    "blueviolet",
    "brown",
    "burlywood",
    "cadetblue",
    "chartreuse",
    "chocolate",
    "coral",
    "cornflowerblue",
    "cornsilk",
    "crimson",
    "cyan",
    "darkblue",
    "darkcyan",
    "darkgoldenrod",
    "darkgray",
    "darkgreen",
    "darkgrey",
    "darkkhaki",
    "darkmagenta",
    "darkolivegreen",
    "darkorange",
    "darkorchid",
    "darkred",
    "darksalmon",
    "darkseagreen",
    "darkslateblue",
    "darkslategray",
    "darkslategrey",
    "darkturquoise",
    "darkviolet",
    "deeppink",
    "deepskyblue",
    "dimgray",
    "dimgrey",
    "dodgerblue",
    "firebrick",
    "floralwhite",
    "forestgreen",
    "fuchsia",
    "gainsboro",
    "ghostwhite",
    "gold",
    "goldenrod",
    "gray",
    "green",
    "greenyellow",
    "grey",
    "honeydew",
    "hotpink",
    "indianred",
    "indigo",
    "ivory",
    "khaki",
    "lavender",
    "lavenderblush",
    "lawngreen",
    "lemonchiffon",
    "lightblue",
    "lightcoral",
    "lightcyan",
    "lightgoldenrodyellow",
    "lightgray",
    "lightgreen",
    "lightgrey",
    "lightpink",
    "lightsalmon",
    "lightseagreen",
    "lightskyblue",
    "lightslategray",
    "lightslategrey",
    "lightsteelblue",
    "lightyellow",
    "lime",
    "limegreen",
    "linen",
    "magenta",
    "maroon",
    "mediumaquamarine",
    "mediumblue",
    "mediumorchid",
    "mediumpurple",
    "mediumseagreen",
    "mediumslateblue",
    "mediumspringgreen",
    "mediumturquoise",
    "mediumvioletred",
    "midnightblue",
    "mintcream",
    "mistyrose",
    "moccasin",
    "navajowhite",
    "navy",
    "oldlace",
    "olive",
    "olivedrab",
    "orange",
    "orangered",
    "orchid",
    "palegoldenrod",
    "palegreen",
    "paleturquoise",
    "palevioletred",
    "papayawhip",
    "peachpuff",
    "peru",
    "pink",
    "plum",
    "powderblue",
    "purple",
    "rebeccapurple",
    "red",
    "rosybrown",
    "royalblue",
    "saddlebrown",
    "salmon",
    "sandybrown",
    "seagreen",
    "seashell",
    "sienna",
    "silver",
    "skyblue",
    "slateblue",
    "slategray",
    "slategrey",
    "snow",
    "springgreen",
    "steelblue",
    "tan",
    "teal",
    "thistle",
    "tomato",
    "turquoise",
    "violet",
    "wheat",
    "white",
    "whitesmoke",
    "yellow",
    "yellowgreen",
  ].map((name) => name.toLowerCase())
);

/** Color-bearing declarations where named colors must not appear (except allowed keywords). */
const COLOR_BEARING_DECL =
  /(?:^|[;{\n])\s*(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?|box-shadow|text-shadow|fill|stroke|caret-color|text-decoration-color|column-rule(?:-color)?)\s*:\s*([^;{}]+)/gi;

/**
 * Returns disallowed CSS named-color keywords found in color-bearing declarations.
 * Only transparent and currentColor are permitted named keywords.
 */
function findDisallowedNamedColors(css: string): string[] {
  const found: string[] = [];
  for (const match of css.matchAll(COLOR_BEARING_DECL)) {
    const value = stripAllowedColorKeywords(match[1]);
    for (const wordMatch of value.matchAll(/\b([a-z]+)\b/gi)) {
      const word = wordMatch[1].toLowerCase();
      if (CSS_NAMED_COLORS.has(word)) {
        found.push(word);
      }
    }
  }
  return found;
}

function assertNoDisallowedNamedColors(css: string, label = "CSS") {
  const found = findDisallowedNamedColors(css);
  assert.equal(
    found.length,
    0,
    `${label} must not use CSS named colors other than transparent/currentColor; found: ${found.join(", ")}`
  );
}

test("bottom sheet uses semantic variables for all colors", () => {
  const colorScan = stripAllowedColorKeywords(sheetCss);

  assert.doesNotMatch(
    colorScan,
    /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\bcolor\(|\bcolor-mix\(/i,
    "bottom sheet CSS must not contain direct hex, rgb/rgba, hsl/hsla, color(), or color-mix() colors"
  );

  // Color-valued var() fallbacks: second arg is hex / rgb(a) / hsl(a) / named color keywords
  assert.doesNotMatch(
    sheetCss,
    /var\([^)]+,\s*(?:#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|color\([^)]*\)|color-mix\([^)]*\)|[a-z]+)\)/i,
    "bottom sheet CSS must not use color-valued var() fallbacks"
  );

  assertNoDisallowedNamedColors(
    sheetCss,
    "bottom sheet CSS color-bearing declarations"
  );

  const referencedTokens = [
    ...new Set(
      [...sheetCss.matchAll(/var\((--[\w-]+)\)/g)].map(([, token]) => token)
    ),
  ];
  assert.ok(
    referencedTokens.length > 0,
    "Expected at least one semantic color token reference"
  );

  const darkTheme = themeBlock(":root");
  const lightTheme = themeBlock(':root[data-theme="light"]');

  for (const token of referencedTokens) {
    const declaration = new RegExp(`${escapeRegExp(token)}\\s*:`);
    assert.match(
      darkTheme,
      declaration,
      `${token} must be defined in dark theme (:root)`
    );
  }

  const bottomSheetTokens = referencedTokens.filter((token) =>
    token.startsWith("--bottom-sheet-")
  );
  assert.ok(
    bottomSheetTokens.length > 0,
    "Expected at least one --bottom-sheet-* token reference"
  );

  for (const token of bottomSheetTokens) {
    const declaration = new RegExp(`${escapeRegExp(token)}\\s*:`);
    assert.match(
      lightTheme,
      declaration,
      `${token} must be defined in light theme`
    );
    assert.match(
      darkTheme,
      declaration,
      `${token} must be defined in dark theme`
    );
  }
});

test("named-color detector rejects red/black and allows transparent/currentColor", () => {
  // Synthetic proof: detector must fail on arbitrary named colors.
  assert.deepEqual(
    findDisallowedNamedColors(".probe { color: red; background: black; }"),
    ["red", "black"],
    "detector must report red and black in color-bearing declarations"
  );

  assert.throws(
    () =>
      assertNoDisallowedNamedColors(
        ".probe { color: red; }",
        "synthetic red probe"
      ),
    /named colors other than transparent\/currentColor; found: red/
  );

  assert.throws(
    () =>
      assertNoDisallowedNamedColors(
        ".probe { background: black; }",
        "synthetic black probe"
      ),
    /named colors other than transparent\/currentColor; found: black/
  );

  // Allowed keywords must not be reported.
  assert.deepEqual(
    findDisallowedNamedColors(
      ".probe { color: currentColor; border: 1px solid transparent; background: transparent; }"
    ),
    [],
    "transparent and currentColor must remain allowed"
  );

  assertNoDisallowedNamedColors(
    ".probe { color: currentColor; background: transparent; }",
    "allowed named keywords probe"
  );
});
