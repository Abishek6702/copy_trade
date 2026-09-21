// tests/xtsAdapter.test.js
import { describe, it } from "node:test";
import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { normalizeOrderEvent, normalizeTradeEvent } from "../src/brokers/xtsUtils.js";
import { XTSAdapter } from "../src/brokers/XTSAdapter.js";

function loadFixture(name) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const fixturePath = path.resolve(__dirname, "fixtures", name);
  const data = fs.readFileSync(fixturePath, "utf8");
  return JSON.parse(data);
}

describe('XTS normalization utilities', () => {
  it('should normalize a valid order event', () => {
    const raw = loadFixture('xts-order-sample.json');
    const normalized = normalizeOrderEvent(raw);
    assert.ok(normalized, 'Normalization should succeed');
    assert.strictEqual(normalized.eventId, raw.orderId);
    assert.strictEqual(normalized.symbol, raw.symbol);
    assert.strictEqual(normalized.side, raw.side);
  });

  it('should return null for order event missing required fields', () => {
    const raw = { ...loadFixture('xts-order-sample.json') };
    delete raw.symbol;
    const normalized = normalizeOrderEvent(raw);
    assert.strictEqual(normalized, null);
  });

  it('should normalize a valid trade event', () => {
    const raw = loadFixture('xts-trade-sample.json');
    const normalized = normalizeTradeEvent(raw);
    assert.ok(normalized);
    assert.strictEqual(normalized.eventId, raw.tradeId);
  });
});

describe('XTSAdapter detection-only mode', () => {
  it('placeOrder should reject when detection-only is enabled', async () => {
    process.env.XTS_DETECTION_ONLY = "true";
    process.env.XTS_API_KEY = "key";
    process.env.XTS_API_SECRET = "secret";
    process.env.XTS_API_BASE_URL = "https://example.com";
    const adapter = new XTSAdapter();
    await adapter.connect();
    await assert.rejects(
      () => adapter.placeOrder({ brokerAccountId: "client1" }, { symbol: "NIFTY" }),
      /detection-only mode enabled/,
      'Expected placeOrder to reject in detection-only mode'
    );
  });
});
