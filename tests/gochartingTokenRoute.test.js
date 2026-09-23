// tests/gochartingTokenRoute.test.js
// Tests for POST /webhooks/gocharting/:token – URL-token authentication.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';

// ── Environment setup (must happen before server import) ───────────────────
const TEST_TOKEN   = 'test-token-abc123';
const TEST_PORT    = 3098;

process.env.WEBHOOK_ENABLED          = 'true';
process.env.WEBHOOK_PORT             = String(TEST_PORT);
process.env.GOCHARTING_WEBHOOK_TOKEN = TEST_TOKEN;
// Provide a dummy secret for the existing header route so validateEnv is quiet
process.env.GOCHARTING_WEBHOOK_SECRET  = 'dummy-secret-for-test';
process.env.TRADINGVIEW_WEBHOOK_SECRET = 'dummy-tv-secret-for-test';
process.env.SIMULATED_CLIENTS = '5'; // minimal clients to keep tests fast

import { startServer } from '../src/webhook/WebhookServer.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function post(path, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const opts = {
      hostname: 'localhost',
      port: TEST_PORT,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        let json;
        try { json = JSON.parse(body); } catch (_) { json = null; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

const basePayload = () => ({
  signalId: `test-${Date.now()}-${Math.random()}`,
  sourceTimestamp: Date.now(),
  symbol: 'NIFTY',
  exchange: 'NFO',
  side: 'BUY',
  quantity: 10,
  orderType: 'MARKET',
});

// ── Server lifecycle ────────────────────────────────────────────────────────

let server;

before(async () => {
  server = startServer();
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GoCharting URL-token route', () => {

  test('valid token returns HTTP 200 and accepted:true', async () => {
    const res = await post(`/webhooks/gocharting/${TEST_TOKEN}`, basePayload());
    assert.equal(res.status, 200, `expected 200, got ${res.status}`);
    assert.equal(res.json.accepted, true, 'expected accepted:true');
    assert.ok(res.json.signalId, 'response must include signalId');
  });

  test('invalid token returns HTTP 401', async () => {
    const res = await post('/webhooks/gocharting/wrong-token', basePayload());
    assert.equal(res.status, 401);
    assert.ok(!res.json.accepted, 'must not be accepted');
    // Must not expose expected token
    assert.ok(!JSON.stringify(res.json).includes(TEST_TOKEN), 'response must not leak the expected token');
  });

  test('missing token segment returns HTTP 401', async () => {
    // No token in path – hits the plain /webhooks/gocharting route which
    // requires X-Webhook-Secret header (not provided), so also 401.
    const res = await post('/webhooks/gocharting', basePayload());
    assert.equal(res.status, 401);
  });

  test('valid payload reaches CopyEngine (signalId echoed back)', async () => {
    const payload = basePayload();
    const res = await post(`/webhooks/gocharting/${TEST_TOKEN}`, payload);
    assert.equal(res.status, 200);
    // The server echoes the eventId from the normalized signal.
    // GoChartingWebhook uses signalId as eventId when provided.
    assert.equal(res.json.signalId, payload.signalId);
  });

  test('duplicate signal is idempotent – both return 200 accepted', async () => {
    // CopyEngine deduplicates internally but the HTTP layer still accepts both.
    // First response: duplicate:false  (first time seen)
    // Second response: duplicate:true  (already processed)
    const payload = { ...basePayload(), signalId: 'fixed-dedup-id' };
    const res1 = await post(`/webhooks/gocharting/${TEST_TOKEN}`, payload);
    const res2 = await post(`/webhooks/gocharting/${TEST_TOKEN}`, payload);
    assert.equal(res1.status, 200, 'first call must be 200');
    assert.equal(res2.status, 200, 'second call must also be 200');
    assert.equal(res1.json.signalId, payload.signalId);
    assert.equal(res2.json.signalId, payload.signalId);
    assert.equal(res1.json.duplicate, false, 'first call must not be a duplicate');
    assert.equal(res2.json.duplicate, true,  'second call must be flagged as duplicate');
  });

  test('response body does not leak the token', async () => {
    const res = await post('/webhooks/gocharting/any-wrong-token', basePayload());
    assert.equal(res.status, 401);
    assert.ok(!JSON.stringify(res.json).includes(TEST_TOKEN));
  });

});
