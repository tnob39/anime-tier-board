import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  CONTRACT_VERSION,
  ValidationError,
  formatSuccessMessage,
  loadAndValidateLedgerFile,
  lookupPermission,
  parseLedgerJson,
  validateLedger,
} from "../scripts/validate-source-permissions.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER_PATH = path.join(ROOT, "data", "source-permissions.v1.json");
const VALIDATOR_PATH = path.join(ROOT, "scripts", "validate-source-permissions.mjs");
const EVIDENCE =
  "https://github.com/tnob39/anime-tier-board/issues/725#issuecomment-5378981550";

function baseEntry(overrides = {}) {
  return {
    domain: "example.com",
    decision: "unknown",
    reviewed_on: "2026-08-18",
    evidence_refs: [EVIDENCE],
    rationale_ja:
      "運用上の状態記録（operational state）であり、法的許諾を示すものではない。",
    ...overrides,
  };
}

function ledgerWith(entries) {
  return {
    contract_version: CONTRACT_VERSION,
    entries,
  };
}

function writeTempLedger(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atb734-"));
  const filePath = path.join(dir, "ledger.json");
  if (Buffer.isBuffer(contents)) {
    fs.writeFileSync(filePath, contents);
  } else {
    fs.writeFileSync(filePath, contents, "utf8");
  }
  return { dir, filePath };
}

test("success: committed ledger validates with expected counts", () => {
  const summary = loadAndValidateLedgerFile(LEDGER_PATH);
  assert.equal(summary.contract_version, "1.0");
  assert.equal(summary.total, 10);
  assert.equal(summary.allowed, 0);
  assert.equal(summary.permissionRequired, 1);
  assert.equal(summary.unknown, 9);
  assert.equal(
    formatSuccessMessage(summary),
    "検証成功: contract_version=1.0 total=10 allowed=0 permission-required=1 unknown=9",
  );

  // Committed-file path: vap.co.jp is the sole permission-required entry.
  const permissionRequiredEntries = summary.entries.filter(
    (e) => e.decision === "permission-required",
  );
  assert.equal(permissionRequiredEntries.length, 1);
  assert.equal(permissionRequiredEntries[0].domain, "vap.co.jp");
  const vapLookup = lookupPermission(
    {
      contract_version: summary.contract_version,
      entries: summary.entries,
    },
    "vap.co.jp",
  );
  assert.equal(vapLookup.allowed, false);
  assert.equal(vapLookup.reason, "permission-required");
  assert.equal(vapLookup.entry?.domain, "vap.co.jp");

  const cli = spawnSync(process.execPath, [VALIDATOR_PATH, LEDGER_PATH], {
    encoding: "utf8",
  });
  assert.equal(cli.status, 0);
  assert.equal(
    cli.stdout.trim(),
    "検証成功: contract_version=1.0 total=10 allowed=0 permission-required=1 unknown=9",
  );
});

test("bad version is rejected", () => {
  assert.throws(
    () =>
      validateLedger(
        ledgerWith([baseEntry({ domain: "a.example.com" })]).entries && {
          contract_version: "0.9",
          entries: [baseEntry({ domain: "a.example.com" })],
        },
      ),
    (err) => err instanceof ValidationError && /contract_version/.test(err.message),
  );
});

test("bad decision is rejected", () => {
  assert.throws(
    () =>
      validateLedger(
        ledgerWith([baseEntry({ domain: "a.example.com", decision: "deny" })]),
      ),
    (err) => err instanceof ValidationError && /decision/.test(err.message),
  );
});

test("duplicate domain is rejected", () => {
  assert.throws(
    () =>
      validateLedger(
        ledgerWith([
          baseEntry({ domain: "a.example.com" }),
          baseEntry({ domain: "a.example.com" }),
        ]),
      ),
    (err) => err instanceof ValidationError && /duplicate/.test(err.message),
  );
});

test("unsorted domains are rejected", () => {
  assert.throws(
    () =>
      validateLedger(
        ledgerWith([
          baseEntry({ domain: "b.example.com" }),
          baseEntry({ domain: "a.example.com" }),
        ]),
      ),
    (err) => err instanceof ValidationError && /sorted|dictionary order/.test(err.message),
  );
});

test("www prefix and URL-shaped domains are rejected", () => {
  assert.throws(
    () =>
      validateLedger(
        ledgerWith([baseEntry({ domain: "www.example.com" })]),
      ),
    (err) => err instanceof ValidationError && /www\./.test(err.message),
  );
  assert.throws(
    () =>
      validateLedger(
        ledgerWith([baseEntry({ domain: "https://example.com" })]),
      ),
    (err) => err instanceof ValidationError && /URL/.test(err.message),
  );
  assert.throws(
    () =>
      validateLedger(
        ledgerWith([baseEntry({ domain: "example.com/path" })]),
      ),
    (err) => err instanceof ValidationError && /URL/.test(err.message),
  );
});

test("missing evidence_refs is rejected", () => {
  const entry = baseEntry({ domain: "a.example.com" });
  entry.evidence_refs = [];
  assert.throws(
    () => validateLedger(ledgerWith([entry])),
    (err) => err instanceof ValidationError && /evidence_refs/.test(err.message),
  );
});

test("bad date is rejected", () => {
  assert.throws(
    () =>
      validateLedger(
        ledgerWith([
          baseEntry({ domain: "a.example.com", reviewed_on: "2026-13-40" }),
        ]),
      ),
    (err) => err instanceof ValidationError && /reviewed_on|date/.test(err.message),
  );
  assert.throws(
    () =>
      validateLedger(
        ledgerWith([
          baseEntry({ domain: "a.example.com", reviewed_on: "08/18/2026" }),
        ]),
      ),
    (err) => err instanceof ValidationError && /reviewed_on|YYYY-MM-DD/.test(err.message),
  );
});

test("BOM is rejected", () => {
  const body = JSON.stringify(
    ledgerWith([baseEntry({ domain: "a.example.com" })]),
    null,
    2,
  );
  const bomBuf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body, "utf8")]);
  const { filePath, dir } = writeTempLedger(bomBuf);
  try {
    assert.throws(
      () => loadAndValidateLedgerFile(filePath),
      (err) => err instanceof ValidationError && /BOM/.test(err.message),
    );
    assert.throws(
      () => parseLedgerJson(bomBuf.toString("utf8"), { allowBom: false }),
      (err) => err instanceof ValidationError && /BOM/.test(err.message),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("invalid UTF-8 byte inside JSON string is rejected (API + CLI)", () => {
  // Buffer.toString("utf8") would replace 0xFF with U+FFFD and accept;
  // TextDecoder fatal:true must reject before JSON.parse.
  const body = JSON.stringify(
    ledgerWith([baseEntry({ domain: "a.example.com" })]),
    null,
    2,
  );
  const marker = '"rationale_ja": "';
  const insertAt = body.indexOf(marker);
  assert.ok(insertAt >= 0, "rationale_ja marker must exist");
  const valueStart = insertAt + marker.length;
  const badBuf = Buffer.concat([
    Buffer.from(body.slice(0, valueStart), "utf8"),
    Buffer.from([0xff]),
    Buffer.from(body.slice(valueStart), "utf8"),
  ]);
  const { filePath, dir } = writeTempLedger(badBuf);
  try {
    assert.throws(
      () => loadAndValidateLedgerFile(filePath),
      (err) =>
        err instanceof ValidationError && /invalid UTF-8/i.test(err.message),
    );

    const cli = spawnSync(process.execPath, [VALIDATOR_PATH, filePath], {
      encoding: "utf8",
    });
    assert.notEqual(cli.status, 0);
    assert.match(cli.stderr, /^検証失敗: /);
    assert.match(cli.stderr, /invalid UTF-8/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("bad JSON is rejected", () => {
  assert.throws(
    () => parseLedgerJson("{not-json"),
    (err) => err instanceof ValidationError && /invalid JSON/.test(err.message),
  );
});

test("fail-closed: unknown / permission-required / absent", () => {
  const data = ledgerWith([
    baseEntry({ domain: "alpha.example.com", decision: "unknown" }),
    baseEntry({
      domain: "beta.example.com",
      decision: "permission-required",
    }),
  ]);
  validateLedger(data);

  const unknownHit = lookupPermission(data, "alpha.example.com");
  assert.equal(unknownHit.allowed, false);
  assert.equal(unknownHit.reason, "unknown");

  const requiredHit = lookupPermission(data, "beta.example.com");
  assert.equal(requiredHit.allowed, false);
  assert.equal(requiredHit.reason, "permission-required");

  const absentHit = lookupPermission(data, "gamma.example.com");
  assert.equal(absentHit.allowed, false);
  assert.equal(absentHit.reason, "absent");
});

test("fail-closed lookup: malformed / invalid ledgers never allow", () => {
  const cases = [
    {
      name: "hermes-probe-malformed-allowed-entry",
      ledger: {
        entries: [{ domain: "evil.example.com", decision: "allowed" }],
      },
      domain: "evil.example.com",
    },
    {
      name: "unsupported-version",
      ledger: {
        contract_version: "0.9",
        entries: [baseEntry({ domain: "evil.example.com", decision: "allowed" })],
      },
      domain: "evil.example.com",
    },
    {
      name: "unsorted-domains",
      ledger: ledgerWith([
        baseEntry({ domain: "b.example.com", decision: "allowed" }),
        baseEntry({ domain: "a.example.com", decision: "allowed" }),
      ]),
      domain: "a.example.com",
    },
    {
      name: "duplicate-domains",
      ledger: ledgerWith([
        baseEntry({ domain: "dup.example.com", decision: "allowed" }),
        baseEntry({ domain: "dup.example.com", decision: "allowed" }),
      ]),
      domain: "dup.example.com",
    },
    {
      name: "missing-entry-keys",
      ledger: ledgerWith([
        {
          domain: "evil.example.com",
          decision: "allowed",
        },
      ]),
      domain: "evil.example.com",
    },
    {
      name: "null-ledger",
      ledger: null,
      domain: "evil.example.com",
    },
    {
      name: "entries-not-array",
      ledger: { contract_version: CONTRACT_VERSION, entries: null },
      domain: "evil.example.com",
    },
  ];

  for (const { name, ledger, domain } of cases) {
    const hit = lookupPermission(ledger, domain);
    assert.equal(hit.allowed, false, `${name}: allowed must be false`);
    assert.equal(hit.reason, "invalid-ledger", `${name}: reason must be invalid-ledger`);
    assert.equal(hit.entry, null, `${name}: entry must be null`);
  }
});

test("isolated allowed positive lookup", () => {
  const data = ledgerWith([
    baseEntry({ domain: "allowed.example.com", decision: "allowed" }),
  ]);
  const summary = validateLedger(data);
  assert.equal(summary.allowed, 1);
  const hit = lookupPermission(data, "allowed.example.com");
  assert.equal(hit.allowed, true);
  assert.equal(hit.reason, "allowed");
  assert.equal(hit.entry.domain, "allowed.example.com");
});

test("repeatability: identical results across repeated runs", () => {
  const first = loadAndValidateLedgerFile(LEDGER_PATH);
  const second = loadAndValidateLedgerFile(LEDGER_PATH);
  assert.deepEqual(
    {
      contract_version: first.contract_version,
      total: first.total,
      allowed: first.allowed,
      permissionRequired: first.permissionRequired,
      unknown: first.unknown,
      domains: first.entries.map((e) => e.domain),
    },
    {
      contract_version: second.contract_version,
      total: second.total,
      allowed: second.allowed,
      permissionRequired: second.permissionRequired,
      unknown: second.unknown,
      domains: second.entries.map((e) => e.domain),
    },
  );

  const cli1 = spawnSync(process.execPath, [VALIDATOR_PATH], { encoding: "utf8" });
  const cli2 = spawnSync(process.execPath, [VALIDATOR_PATH], { encoding: "utf8" });
  assert.equal(cli1.status, 0);
  assert.equal(cli2.status, 0);
  assert.equal(cli1.stdout, cli2.stdout);
  assert.equal(
    cli1.stdout.trim(),
    "検証成功: contract_version=1.0 total=10 allowed=0 permission-required=1 unknown=9",
  );
});
