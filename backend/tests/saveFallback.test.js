// Detection of "this MongoDB has no transactions" errors used by the save fallback.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isTransactionUnsupportedError } from "../services/rosterGenerationService.js";

describe("isTransactionUnsupportedError", () => {
  it("matches the raw standalone-server error", () => {
    const error = Object.assign(new Error("Transaction numbers are only allowed on a replica set member or mongos"), { code: 20, codeName: "IllegalOperation" });
    assert.equal(isTransactionUnsupportedError(error), true);
  });

  it("matches the driver's wrapped 'retryable writes' error (seen on a real standalone server)", () => {
    const original = Object.assign(new Error("Transaction numbers are only allowed on a replica set member or mongos"), { code: 20 });
    const wrapped = Object.assign(new Error("This MongoDB deployment does not support retryable writes. Please add retryWrites=false to your connection string."), {
      code: 20,
      originalError: original,
      errorResponse: { originalError: original },
    });
    assert.equal(isTransactionUnsupportedError(wrapped), true);
  });

  it("does not match unrelated errors", () => {
    assert.equal(isTransactionUnsupportedError(Object.assign(new Error("E11000 duplicate key error"), { code: 11000 })), false);
    assert.equal(isTransactionUnsupportedError(new Error("connection refused")), false);
    assert.equal(isTransactionUnsupportedError(null), false);
  });
});
