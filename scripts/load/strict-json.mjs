/**
 * Strict JSON parser: rejects duplicate object keys after JSON-string decode.
 * Nested objects, escaped quotes, and \\uXXXX that collide with literal keys fail closed.
 * This is the parse used before canonicalization so last-wins JSON.parse cannot hide keys.
 */
export class StrictJsonError extends Error {
  constructor(message, code = "invalidJson") {
    super(message);
    this.name = "StrictJsonError";
    this.code = code;
  }
}

export const PROTOTYPE_POLLUTION_KEYS = Object.freeze(["__proto__", "constructor", "prototype"]);

function isWs(c) {
  return c === " " || c === "\t" || c === "\n" || c === "\r";
}

export function defineOwnData(obj, key, value) {
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
  return obj;
}

function isPlainPrototype(value, expected) {
  let proto;
  try {
    proto = Object.getPrototypeOf(value);
  } catch {
    return false;
  }
  return proto === expected || proto === null;
}

function isPlainOwnDataValue(value, seen) {
  if (value === null) return true;
  if (typeof value !== "object") {
    return typeof value !== "function" && typeof value !== "symbol" && typeof value !== "bigint";
  }
  if (seen.has(value)) return false;
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (!isPlainPrototype(value, Array.prototype)) return false;
      for (const key of Reflect.ownKeys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !Object.hasOwn(descriptor, "value")) return false;
        if (key !== "length" && !isPlainOwnDataValue(descriptor.value, seen)) return false;
      }
      return true;
    }
    if (!isPlainPrototype(value, Object.prototype)) return false;
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, "value")) return false;
      if (!isPlainOwnDataValue(descriptor.value, seen)) return false;
    }
    return true;
  } catch {
    return false;
  } finally {
    seen.delete(value);
  }
}

/**
 * Validate imported JSON-shaped data without consulting inherited fields.
 * Object.prototype and null-prototype records are accepted; class instances,
 * accessors, proxies that throw, cycles, and custom prototypes are rejected.
 */
export function isPlainOwnDataTree(value) {
  return isPlainOwnDataValue(value, new Set());
}

export function isPlainOwnDataObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && isPlainOwnDataTree(value);
}

export function ownDataValue(value, key) {
  return isPlainOwnDataObject(value) && Object.hasOwn(value, key) ? value[key] : undefined;
}

export function hasPrototypePollutionKey(value) {
  if (Array.isArray(value)) return value.some(hasPrototypePollutionKey);
  if (value === null || typeof value !== "object") return false;
  for (const key of Object.keys(value)) {
    if (PROTOTYPE_POLLUTION_KEYS.includes(key)) return true;
    if (hasPrototypePollutionKey(value[key])) return true;
  }
  return false;
}

export class StrictJsonParser {
  constructor(text, label = "json") {
    if (typeof text !== "string") {
      throw new StrictJsonError(`${label}: must be a string`);
    }
    if (text.length > 0 && text.charCodeAt(0) === 0xfeff) {
      throw new StrictJsonError(`${label}: BOM is not allowed`);
    }
    this.text = text;
    this.label = label;
    this.i = 0;
    this.n = text.length;
  }

  peek() {
    return this.i < this.n ? this.text[this.i] : "";
  }

  skipWs() {
    while (this.i < this.n && isWs(this.text[this.i])) this.i += 1;
  }

  fail(rule = "invalid JSON", code = "invalidJson") {
    throw new StrictJsonError(`${this.label}: ${rule}`, code);
  }

  parse() {
    this.skipWs();
    const value = this.parseValue();
    this.skipWs();
    if (this.i !== this.n) this.fail("trailing data after JSON value");
    return value;
  }

  parseValue() {
    this.skipWs();
    const c = this.peek();
    if (c === "{") return this.parseObject();
    if (c === "[") return this.parseArray();
    if (c === '"') return this.parseString();
    if (c === "t") return this.parseLiteral("true", true);
    if (c === "f") return this.parseLiteral("false", false);
    if (c === "n") return this.parseLiteral("null", null);
    if (c === "-" || (c >= "0" && c <= "9")) return this.parseNumber();
    this.fail("unexpected token");
  }

  parseLiteral(word, value) {
    if (this.text.slice(this.i, this.i + word.length) !== word) this.fail("unexpected token");
    const next = this.text[this.i + word.length];
    if (next && /[A-Za-z0-9_]/u.test(next)) this.fail("unexpected token");
    this.i += word.length;
    return value;
  }

  parseString() {
    if (this.peek() !== '"') this.fail("expected string");
    const start = this.i;
    this.i += 1;
    while (this.i < this.n) {
      const c = this.text[this.i];
      if (c === '"') {
        this.i += 1;
        const raw = this.text.slice(start, this.i);
        try {
          return JSON.parse(raw);
        } catch {
          this.fail("invalid string escape");
        }
      }
      if (c === "\\") {
        const esc = this.text[this.i + 1];
        if (esc == null) this.fail("unterminated string escape");
        if (esc === "u") {
          const hex = this.text.slice(this.i + 2, this.i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail("invalid unicode escape");
          this.i += 6;
          continue;
        }
        if (!'"\\/bfnrt'.includes(esc)) this.fail("invalid string escape");
        this.i += 2;
        continue;
      }
      const code = c.charCodeAt(0);
      if (code < 0x20) this.fail("unescaped control in string");
      this.i += 1;
    }
    this.fail("unterminated string");
  }

  parseNumber() {
    const start = this.i;
    if (this.peek() === "-") this.i += 1;
    if (this.peek() === "0") {
      this.i += 1;
      if (this.peek() >= "0" && this.peek() <= "9") this.fail("leading zeros are not allowed");
    } else if (this.peek() >= "1" && this.peek() <= "9") {
      this.i += 1;
      while (this.peek() >= "0" && this.peek() <= "9") this.i += 1;
    } else {
      this.fail("invalid number");
    }
    if (this.peek() === ".") {
      this.i += 1;
      if (!(this.peek() >= "0" && this.peek() <= "9")) this.fail("invalid number");
      while (this.peek() >= "0" && this.peek() <= "9") this.i += 1;
    }
    const exp = this.peek();
    if (exp === "e" || exp === "E") {
      this.i += 1;
      if (this.peek() === "+" || this.peek() === "-") this.i += 1;
      if (!(this.peek() >= "0" && this.peek() <= "9")) this.fail("invalid number");
      while (this.peek() >= "0" && this.peek() <= "9") this.i += 1;
    }
    const raw = this.text.slice(start, this.i);
    const n = Number(raw);
    if (!Number.isFinite(n)) this.fail("invalid number");
    return n;
  }

  parseArray() {
    if (this.peek() !== "[") this.fail("expected array");
    this.i += 1;
    this.skipWs();
    const out = [];
    if (this.peek() === "]") {
      this.i += 1;
      return out;
    }
    while (this.i < this.n) {
      out.push(this.parseValue());
      this.skipWs();
      if (this.peek() === ",") {
        this.i += 1;
        this.skipWs();
        if (this.peek() === "]") this.fail("trailing comma");
        continue;
      }
      if (this.peek() === "]") {
        this.i += 1;
        return out;
      }
      this.fail("expected comma or array end");
    }
    this.fail("unterminated array");
  }

  parseObject() {
    if (this.peek() !== "{") this.fail("expected object");
    this.i += 1;
    this.skipWs();
    // Use a normal object for compatibility with callers that compare parsed
    // JSON structurally, but never assign through the __proto__ setter.
    const out = {};
    const keys = new Set();
    if (this.peek() === "}") {
      this.i += 1;
      return out;
    }
    while (this.i < this.n) {
      this.skipWs();
      if (this.peek() !== '"') this.fail("object key must be a string");
      const key = this.parseString();
      if (keys.has(key)) {
        this.fail("duplicate object key", "duplicateKey");
      }
      keys.add(key);
      this.skipWs();
      if (this.peek() !== ":") this.fail("expected colon after key");
      this.i += 1;
      defineOwnData(out, key, this.parseValue());
      this.skipWs();
      if (this.peek() === ",") {
        this.i += 1;
        this.skipWs();
        if (this.peek() === "}") this.fail("trailing comma");
        continue;
      }
      if (this.peek() === "}") {
        this.i += 1;
        return out;
      }
      this.fail("expected comma or object end");
    }
    this.fail("unterminated object");
  }
}

export function parseJsonStrict(text, label = "json") {
  return new StrictJsonParser(text, label).parse();
}

export function parseJsonBytesStrict(bytes, label = "json") {
  let text;
  try {
    text = Buffer.isBuffer(bytes) || bytes instanceof Uint8Array
      ? new TextDecoder("utf-8", { fatal: true }).decode(bytes)
      : String(bytes);
  } catch {
    throw new StrictJsonError(`${label}: invalid UTF-8`);
  }
  return parseJsonStrict(text, label);
}
