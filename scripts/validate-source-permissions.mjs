#!/usr/bin/env node
/**
 * Offline source-permissions ledger validator (Node built-ins only).
 * Fail-closed lookup: only decision === "allowed" is permitted.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CONTRACT_VERSION = "1.0";
export const DECISIONS = Object.freeze([
  "allowed",
  "permission-required",
  "unknown",
]);
export const ENTRY_KEYS = Object.freeze([
  "domain",
  "decision",
  "reviewed_on",
  "evidence_refs",
  "rationale_ja",
]);
export const ROOT_KEYS = Object.freeze(["contract_version", "entries"]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(obj, expectedKeys, label) {
  const keys = Object.keys(obj);
  const expected = [...expectedKeys];
  if (keys.length !== expected.length) {
    throw new ValidationError(
      `${label}: unexpected keys (got [${keys.join(", ")}], expected [${expected.join(", ")}])`,
    );
  }
  for (const key of expected) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      throw new ValidationError(`${label}: missing key "${key}"`);
    }
  }
  for (const key of keys) {
    if (!expected.includes(key)) {
      throw new ValidationError(`${label}: unknown key "${key}"`);
    }
  }
}

export function assertValidDomain(domain, label = "domain") {
  if (typeof domain !== "string" || domain.length === 0) {
    throw new ValidationError(`${label}: must be a non-empty string`);
  }
  if (domain !== domain.toLowerCase()) {
    throw new ValidationError(`${label}: must be lowercase: ${domain}`);
  }
  if (domain.includes("://") || domain.includes("/") || domain.includes("?")) {
    throw new ValidationError(`${label}: must not be a URL: ${domain}`);
  }
  if (domain.startsWith("www.")) {
    throw new ValidationError(`${label}: must not start with www.: ${domain}`);
  }
  if (!DOMAIN_RE.test(domain)) {
    throw new ValidationError(`${label}: invalid domain form: ${domain}`);
  }
}

export function assertValidDate(date, label = "reviewed_on") {
  if (typeof date !== "string" || !DATE_RE.test(date)) {
    throw new ValidationError(`${label}: must be YYYY-MM-DD: ${date}`);
  }
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new ValidationError(`${label}: invalid calendar date: ${date}`);
  }
}

export function parseLedgerJson(text, { allowBom = false } = {}) {
  if (typeof text !== "string") {
    throw new ValidationError("input must be a string");
  }
  if (text.charCodeAt(0) === 0xfeff) {
    if (!allowBom) {
      throw new ValidationError("BOM is not allowed");
    }
    text = text.slice(1);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new ValidationError(`invalid JSON: ${err.message}`);
  }
  return data;
}

export function validateLedger(data) {
  if (!isPlainObject(data)) {
    throw new ValidationError("root must be an object");
  }
  assertExactKeys(data, ROOT_KEYS, "root");

  if (data.contract_version !== CONTRACT_VERSION) {
    throw new ValidationError(
      `contract_version must be "${CONTRACT_VERSION}", got ${JSON.stringify(data.contract_version)}`,
    );
  }
  if (!Array.isArray(data.entries)) {
    throw new ValidationError("entries must be an array");
  }

  const seen = new Set();
  let prevDomain = null;
  let allowed = 0;
  let permissionRequired = 0;
  let unknown = 0;

  data.entries.forEach((entry, index) => {
    const label = `entries[${index}]`;
    if (!isPlainObject(entry)) {
      throw new ValidationError(`${label}: must be an object`);
    }
    assertExactKeys(entry, ENTRY_KEYS, label);

    assertValidDomain(entry.domain, `${label}.domain`);
    if (seen.has(entry.domain)) {
      throw new ValidationError(`${label}: duplicate domain: ${entry.domain}`);
    }
    seen.add(entry.domain);

    if (prevDomain !== null && entry.domain.localeCompare(prevDomain) <= 0) {
      throw new ValidationError(
        `${label}: domains must be sorted in ascending dictionary order (saw "${entry.domain}" after "${prevDomain}")`,
      );
    }
    prevDomain = entry.domain;

    if (typeof entry.decision !== "string" || !DECISIONS.includes(entry.decision)) {
      throw new ValidationError(
        `${label}.decision: must be one of ${DECISIONS.join("|")}, got ${JSON.stringify(entry.decision)}`,
      );
    }
    if (entry.decision === "allowed") allowed += 1;
    else if (entry.decision === "permission-required") permissionRequired += 1;
    else unknown += 1;

    assertValidDate(entry.reviewed_on, `${label}.reviewed_on`);

    if (!Array.isArray(entry.evidence_refs) || entry.evidence_refs.length === 0) {
      throw new ValidationError(`${label}.evidence_refs: must be a non-empty array`);
    }
    entry.evidence_refs.forEach((ref, refIndex) => {
      if (typeof ref !== "string" || ref.trim().length === 0) {
        throw new ValidationError(
          `${label}.evidence_refs[${refIndex}]: must be a non-empty string`,
        );
      }
    });

    if (typeof entry.rationale_ja !== "string" || entry.rationale_ja.trim().length === 0) {
      throw new ValidationError(`${label}.rationale_ja: must be a non-empty string`);
    }
  });

  return {
    contract_version: CONTRACT_VERSION,
    total: data.entries.length,
    allowed,
    permissionRequired,
    unknown,
    entries: data.entries,
  };
}

export function loadAndValidateLedgerFile(filePath) {
  const abs = path.resolve(filePath);
  const buf = fs.readFileSync(abs);
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    throw new ValidationError("BOM is not allowed");
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch (err) {
    throw new ValidationError(`invalid UTF-8: ${err.message}`);
  }
  const data = parseLedgerJson(text, { allowBom: false });
  return validateLedger(data);
}

/**
 * Fail-closed permission lookup.
 * Fully validates the ledger via validateLedger before any domain match.
 * Validation failure => { allowed: false, reason: "invalid-ledger", entry: null }.
 * Returns { allowed: true, entry } only when a valid entry has decision === "allowed".
 * unknown / permission-required / absent => allowed: false.
 */
export function lookupPermission(ledger, domain) {
  let validated;
  try {
    validated = validateLedger(ledger);
  } catch {
    return { allowed: false, reason: "invalid-ledger", entry: null };
  }
  try {
    assertValidDomain(domain, "lookup.domain");
  } catch {
    return { allowed: false, reason: "invalid-domain", entry: null };
  }
  const entry = validated.entries.find((e) => e.domain === domain) ?? null;
  if (!entry) {
    return { allowed: false, reason: "absent", entry: null };
  }
  if (entry.decision === "allowed") {
    return { allowed: true, reason: "allowed", entry };
  }
  if (entry.decision === "permission-required") {
    return { allowed: false, reason: "permission-required", entry };
  }
  return { allowed: false, reason: "unknown", entry };
}

export function formatSuccessMessage(summary) {
  return `検証成功: contract_version=${summary.contract_version} total=${summary.total} allowed=${summary.allowed} permission-required=${summary.permissionRequired} unknown=${summary.unknown}`;
}

function defaultLedgerPath() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "data", "source-permissions.v1.json");
}

function main(argv = process.argv.slice(2)) {
  const filePath = argv[0] ? path.resolve(argv[0]) : defaultLedgerPath();
  try {
    const summary = loadAndValidateLedgerFile(filePath);
    const message = formatSuccessMessage(summary);
    process.stdout.write(`${message}\n`);
    process.exitCode = 0;
    return 0;
  } catch (err) {
    const message = err instanceof ValidationError ? err.message : String(err);
    process.stderr.write(`検証失敗: ${message}\n`);
    process.exitCode = 1;
    return 1;
  }
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectRun) {
  main();
}
