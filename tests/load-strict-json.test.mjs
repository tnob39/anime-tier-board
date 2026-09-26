import assert from "node:assert/strict";
import test from "node:test";
import { isPlainOwnDataObject, isPlainOwnDataTree, parseJsonStrict, StrictJsonError } from "../scripts/load/strict-json.mjs";

test("duplicate object keys are rejected at every nesting level", () => {
  assert.throws(() => parseJsonStrict('{"a":1,"a":2}'), StrictJsonError);
  assert.throws(() => parseJsonStrict('{"a":{"b":1,"b":2}}'), StrictJsonError);
  assert.throws(() => parseJsonStrict('{"arr":[{"k":1,"k":2}]}'), StrictJsonError);
  assert.throws(() => parseJsonStrict('{"x":1,"y":{"z":true,"z":false},"x":3}'), StrictJsonError);
});

test("unicode and escaped keys that decode to the same name are duplicates", () => {
  assert.throws(() => parseJsonStrict('{"\\u0061":1,"a":2}'), StrictJsonError);
  assert.throws(() => parseJsonStrict('{"hello":1,"hel\\u006co":2}'), StrictJsonError);
  assert.throws(() => parseJsonStrict('{"a\\nb":1,"a\\nb":2}'), StrictJsonError);
  assert.throws(() => parseJsonStrict('{"\\"":1,"\\u0022":2}'), StrictJsonError);
});

test("escaped quote keys remain distinct from unescaped neighbors", () => {
  const v = parseJsonStrict('{"a\\"b":1,"ab":2,"a\\\\b":3}');
  assert.equal(v['a"b'], 1);
  assert.equal(v.ab, 2);
  assert.equal(v["a\\b"], 3);
});

test("own __proto__ keys stay own data and do not pollute the prototype", () => {
  const value = parseJsonStrict('{"__proto__":{"polluted":true},"safe":1}');
  assert.deepEqual(Object.keys(value), ["__proto__", "safe"]);
  assert.equal(Object.prototype.hasOwnProperty.call(value, "__proto__"), true);
  assert.deepEqual(value.__proto__, { polluted: true });
  assert.equal({}.polluted, undefined);
});

test("valid nested objects and arrays parse without canonicalization ambiguity", () => {
  const v = parseJsonStrict('{"a":{"b":1},"c":[1,{"d":2},true,null]}');
  assert.deepEqual(v, { a: { b: 1 }, c: [1, { d: 2 }, true, null] });
});

test("recursive own-data validation rejects inherited and custom-prototype fields", () => {
  assert.equal(isPlainOwnDataObject(Object.create({ required: true })), false);
  assert.equal(isPlainOwnDataTree({ nested: Object.create({ inherited: true }) }), false);
  assert.equal(isPlainOwnDataObject(Object.assign(Object.create(null), { required: true })), true);
  const accessor = {};
  Object.defineProperty(accessor, "required", { get: () => true, enumerable: true });
  assert.equal(isPlainOwnDataObject(accessor), false);
});

test("BOM, trailing comma, and trailing data fail closed", () => {
  assert.throws(() => parseJsonStrict("\uFEFF{}"), StrictJsonError);
  assert.throws(() => parseJsonStrict('{"a":1,}'), StrictJsonError);
  assert.throws(() => parseJsonStrict('{"a":1} true'), StrictJsonError);
});
