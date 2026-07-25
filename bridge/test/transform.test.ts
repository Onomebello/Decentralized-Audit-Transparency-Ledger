/**
 * Tests for EventTransformer (#259)
 *
 * Covers format conversion, field mapping, validation,
 * and transformation rules for cross-chain bridge events.
 */

import { expect } from "chai";
import {
  EventTransformer,
  StellarEvent,
  transformForEvm,
  validateStellarEvent,
  createTransformer,
} from "../relayer/transform";

function makeStellarEvent(overrides?: Partial<StellarEvent>): StellarEvent {
  return {
    index: 1,
    timestamp: 1700000000,
    event_type: "payment",
    submitter: "GABC123...",
    metadata: '{"amount":100}',
    event_hash: "a".repeat(64),
    ledger_seq: 500,
    tx_hash: "b".repeat(64),
    ...overrides,
  };
}

describe("EventTransformer", function () {
  describe("validation", function () {
    it("passes for valid events", function () {
      const transformer = new EventTransformer();
      const event = makeStellarEvent();
      const errors = transformer.validateEvent(event);
      expect(errors).to.be.empty;
    });

    it("fails when required fields are missing", function () {
      const transformer = new EventTransformer();
      const event = makeStellarEvent({ event_type: "" });
      const errors = transformer.validateEvent(event);
      expect(errors).to.include.something.that.contains("event_type");
    });

    it("fails with invalid event_hash format", function () {
      const transformer = new EventTransformer();
      const event = makeStellarEvent({ event_hash: "not-hex" });
      const errors = transformer.validateEvent(event);
      expect(errors).to.include.something.that.contains("event_hash");
    });

    it("fails with negative index", function () {
      const transformer = new EventTransformer();
      const event = makeStellarEvent({ index: -1 });
      const errors = transformer.validateEvent(event);
      expect(errors).to.include.something.that.contains("index");
    });
  });

  describe("transformation", function () {
    it("transforms a valid event successfully", function () {
      const transformer = new EventTransformer();
      const event = makeStellarEvent();
      const result = transformer.transformEvent(event);

      expect(result.success).to.be.true;
      expect(result.data).to.not.be.null;
      expect(result.data!.eventType).to.equal("payment");
      expect(result.data!.sourceChain).to.equal("stellar");
      expect(result.data!.chainId).to.equal("stellar-testnet");
    });

    it("normalizes event_type to lowercase", function () {
      const transformer = new EventTransformer();
      const event = makeStellarEvent({ event_type: "Payment" });
      const result = transformer.transformEvent(event);

      expect(result.success).to.be.true;
      expect(result.data!.eventType).to.equal("payment");
    });

    it("prefixes submitter with 0x", function () {
      const transformer = new EventTransformer();
      const event = makeStellarEvent({ submitter: "GABC123" });
      const result = transformer.transformEvent(event);

      expect(result.success).to.be.true;
      expect(result.data!.submitter).to.match(/^0x/);
    });

    it("preserves 0x-prefixed submitter", function () {
      const transformer = new EventTransformer();
      const event = makeStellarEvent({ submitter: "0xGABC123" });
      const result = transformer.transformEvent(event);

      expect(result.success).to.be.true;
      expect(result.data!.submitter).to.equal("0xGABC123");
    });

    it("includes chain metadata", function () {
      const transformer = new EventTransformer({ chainId: "evm-mainnet", sourceChain: "stellar" });
      const event = makeStellarEvent();
      const result = transformer.transformEvent(event);

      expect(result.data!.chainId).to.equal("evm-mainnet");
      expect(result.data!.sourceChain).to.equal("stellar");
      expect(result.data!.blockNumber).to.equal(500);
      expect(result.data!.logIndex).to.equal(1);
    });

    it("fails in strict mode when validation errors occur", function () {
      const transformer = new EventTransformer({ strictValidation: true });
      const event = makeStellarEvent({ event_type: "" });
      const result = transformer.transformEvent(event);

      expect(result.success).to.be.false;
      expect(result.data).to.be.null;
      expect(result.errors.length).to.be.greaterThan(0);
    });

    it("succeeds in non-strict mode with warnings", function () {
      const transformer = new EventTransformer({ strictValidation: false });
      const event = makeStellarEvent({ index: -1 });
      const result = transformer.transformEvent(event);

      expect(result.success).to.be.true;
      expect(result.warnings.length).to.be.greaterThan(0);
    });
  });

  describe("batch transformation", function () {
    it("transforms multiple events", function () {
      const transformer = new EventTransformer();
      const events = [
        makeStellarEvent({ index: 0 }),
        makeStellarEvent({ index: 1 }),
        makeStellarEvent({ index: 2 }),
      ];

      const results = transformer.transformBatch(events);
      expect(results).to.have.length(3);
      expect(results.every((r) => r.success)).to.be.true;
    });
  });

  describe("custom rules", function () {
    it("applies custom transformer", function () {
      const transformer = new EventTransformer({
        rules: [
          {
            sourceField: "event_type",
            targetField: "eventType",
            transformer: (v) => `custom_${v}`,
          },
        ],
      });

      const event = makeStellarEvent();
      const result = transformer.transformEvent(event);
      expect(result.data!.eventType).to.equal("custom_payment");
    });

    it("applies custom validator", function () {
      const transformer = new EventTransformer({
        strictValidation: true,
        rules: [
          {
            sourceField: "index",
            targetField: "index",
            validator: (v) => typeof v === "number" && v < 100,
            required: true,
          },
        ],
      });

      const event = makeStellarEvent({ index: 200 });
      const result = transformer.transformEvent(event);
      expect(result.success).to.be.false;
    });

    it("adds and removes rules dynamically", function () {
      const transformer = new EventTransformer();
      transformer.addRule({
        sourceField: "custom",
        targetField: "customField",
        defaultValue: "default",
      });

      transformer.removeRule("custom");
      const config = transformer.getConfig();
      expect(config.rules.find((r) => r.sourceField === "custom")).to.be.undefined;
    });
  });
});

describe("Utility functions", function () {
  it("createTransformer creates a configured transformer", function () {
    const t = createTransformer("evm-mainnet", "stellar");
    const config = t.getConfig();
    expect(config.chainId).to.equal("evm-mainnet");
    expect(config.sourceChain).to.equal("stellar");
  });

  it("transformForEvm transforms a single event", function () {
    const event = makeStellarEvent();
    const result = transformForEvm(event, "evm-mainnet");
    expect(result.success).to.be.true;
    expect(result.data!.chainId).to.equal("evm-mainnet");
  });

  it("validateStellarEvent checks required fields", function () {
    const errors = validateStellarEvent({});
    expect(errors).to.have.length.greaterThan(0);
  });

  it("validateStellarEvent passes for complete event", function () {
    const event = makeStellarEvent();
    const errors = validateStellarEvent(event);
    expect(errors).to.be.empty;
  });
});
