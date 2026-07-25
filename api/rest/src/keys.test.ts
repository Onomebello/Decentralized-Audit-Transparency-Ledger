import { describe, it, expect, beforeEach } from "vitest";
import { generateKey, validateKey, rotateKey, revokeKey, listKeys } from "./keys";

describe("API Key Management", () => {
  it("generates a key with alg_ prefix", () => {
    const record = generateKey("test-app");
    expect(record.key).toMatch(/^alg_/);
    expect(record.name).toBe("test-app");
    expect(record.active).toBe(true);
    expect(record.createdAt).toBeGreaterThan(0);
  });

  it("validates an active key", () => {
    const record = generateKey("test-app");
    const validated = validateKey(record.key);
    expect(validated).not.toBeNull();
    expect(validated!.key).toBe(record.key);
  });

  it("rejects an invalid key", () => {
    expect(validateKey("nonexistent")).toBeNull();
  });

  it("rejects a revoked key", () => {
    const record = generateKey("test-app");
    revokeKey(record.key);
    expect(validateKey(record.key)).toBeNull();
  });

  it("rotates a key", () => {
    const old = generateKey("test-app");
    const newRecord = rotateKey(old.key);
    expect(newRecord).not.toBeNull();
    expect(newRecord!.key).not.toBe(old.key);
    expect(newRecord!.name).toContain("test-app");
    expect(validateKey(old.key)).toBeNull();
    expect(validateKey(newRecord!.key)).not.toBeNull();
  });

  it("fails to rotate a nonexistent key", () => {
    expect(rotateKey("nonexistent")).toBeNull();
  });

  it("lists all keys", () => {
    const before = listKeys().length;
    generateKey("list-test-1");
    generateKey("list-test-2");
    expect(listKeys().length).toBeGreaterThanOrEqual(before + 2);
  });
});
