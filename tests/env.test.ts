// Environment parsing. parseEnv is pure, so these tests do not depend on process state.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseEnv } from "@/lib/env";

const base = { DATABASE_URL: "postgresql://u:p@localhost:5432/db" };

describe("environment validation", () => {
  test("accepts a minimal development configuration with safe defaults", () => {
    const env = parseEnv({ ...base });
    assert.equal(env.ALLOW_LIVE_SMS, false);
    assert.equal(env.JOB_RUNNER, "on");
    assert.equal(env.APP_URL, "http://localhost:3000");
    assert.equal(env.NISHCHIT_API_BASE_URL, "https://api.nishchit.tech");
  });

  test("requires DATABASE_URL and names it without echoing any value", () => {
    assert.throws(() => parseEnv({}), /DATABASE_URL/);
  });

  test("rejects an invalid switch value and names the variable", () => {
    assert.throws(() => parseEnv({ ...base, ALLOW_LIVE_SMS: "yes please" }), /ALLOW_LIVE_SMS/);
    assert.throws(() => parseEnv({ ...base, JOB_RUNNER: "maybe" }), /JOB_RUNNER/);
  });

  test("production requires an https APP_URL", () => {
    assert.throws(() => parseEnv({ ...base, NODE_ENV: "production", APP_URL: "http://tutera.example" }), /https/);
    assert.equal(parseEnv({ ...base, NODE_ENV: "production", APP_URL: "https://tutera.example" }).APP_URL, "https://tutera.example");
  });

  test("validates the initial teacher phone and password length", () => {
    assert.throws(() => parseEnv({ ...base, INITIAL_TEACHER_PHONE: "12345" }), /INITIAL_TEACHER_PHONE/);
    assert.throws(() => parseEnv({ ...base, INITIAL_TEACHER_PASSWORD: "short" }), /INITIAL_TEACHER_PASSWORD/);
  });

  test("treats empty strings as unset", () => {
    const env = parseEnv({ ...base, INITIAL_TEACHER_PHONE: "", NISHCHIT_API_KEY: "" });
    assert.equal(env.INITIAL_TEACHER_PHONE, undefined);
    assert.equal(env.NISHCHIT_API_KEY, undefined);
  });
});
