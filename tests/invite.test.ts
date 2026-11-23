// Invitation token format checks used by the exchange route. The database checks are not run here.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { randomToken, sha256 } from "@/lib/crypto";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;

describe("invitation tokens", () => {
  test("generated tokens are URL-safe and match the exchange pattern", () => {
    for (let i = 0; i < 25; i++) {
      const t = randomToken(32);
      assert.match(t, TOKEN_PATTERN);
      assert.ok(!t.includes("+") && !t.includes("/") && !t.includes("="));
    }
  });
  test("tokens are unique", () => {
    const set = new Set(Array.from({ length: 200 }, () => randomToken(32)));
    assert.equal(set.size, 200);
  });
  test("only a hash is stored, and it differs from the token", () => {
    const t = randomToken(32);
    assert.notEqual(sha256(t), t);
    assert.match(sha256(t), /^[0-9a-f]{64}$/);
  });
  test("malformed tokens are rejected before any lookup", () => {
    assert.equal(TOKEN_PATTERN.test("short"), false);
    assert.equal(TOKEN_PATTERN.test("has spaces and symbols !!!!!!!!!!!!!!!!"), false);
  });
});
