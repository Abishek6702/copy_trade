// benchmarks/webhookBenchmark.js
// =============================================================
// SIMULATED/LOCAL BENCHMARK -- NOT REAL BROKER LATENCY
// =============================================================
// Runs 2 warm-up + 20 measured iterations per client count.
// Each iteration starts a fresh server (fresh CopyEngine + clients),
// sends one POST webhook, waits for all acks, then shuts down.
// Reports: min / P50 / P95 / P99 / max for three metrics:
//   1. Webhook response  (req send -> HTTP response received)
//   2. First dispatch    (req send -> first broker order queued)
//   3. Last ACK          (req send -> last broker ack received)
// =============================================================
import 'dotenv/config';
import http from 'http';
import { startServer } from '../src/webhook/WebhookServer.js';

const BENCHMARK_PORT  = 3099;
const WARM_UP         = 2;
const ITERATIONS      = 20;
const CLIENT_COUNTS   = [25, 50, 100, 150, 200];
const DISPATCH_TIMEOUT_MS = 10_000; // max wait for all acks per iteration

// ─── helpers ────────────────────────────────────────────────────────────────

function sendWebhook(path, payload, secret) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const opts = {
      hostname: 'localhost',
      port: BENCHMARK_PORT,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'X-Webhook-Secret': secret,
      },
    };
    const reqStartNs = process.hrtime.bigint();
    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        const reqEndNs = process.hrtime.bigint();
        resolve({ status: res.statusCode, body, reqStartNs, reqEndNs });
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function waitForAck(metrics, signalId, maxMs = DISPATCH_TIMEOUT_MS) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const m = metrics.getEventMetrics(signalId);
    if (m && m.t6) return m;
    await new Promise((r) => setTimeout(r, 2));
  }
  return metrics.getEventMetrics(signalId) || {};
}

function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: sorted[0],
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1],
  };
}

function fmt(ms) {
  return ms != null && !isNaN(ms) ? ms.toFixed(2).padStart(8) : '     N/A';
}

function printRow(label, clientCount, s) {
  const pad = (str, n) => String(str).padEnd(n);
  console.log(
    `${pad(clientCount, 7)} | ${pad(label, 18)} |` +
    `${fmt(s.min)} | ${fmt(s.p50)} | ${fmt(s.p95)} | ${fmt(s.p99)} | ${fmt(s.max)}`
  );
}

// ─── single iteration ────────────────────────────────────────────────────────

let iterCounter = 0;

async function runIteration(clientCount) {
  process.env.WEBHOOK_ENABLED     = 'true';
  process.env.SIMULATED_CLIENTS   = String(clientCount);
  process.env.WEBHOOK_PORT        = String(BENCHMARK_PORT);

  const server = startServer();
  if (!server) throw new Error('startServer() returned null');

  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const signalId = `bench-${clientCount}-${++iterCounter}`;
  const payload  = {
    signalId,
    sourceTimestamp: Date.now(),
    symbol:    'NIFTY',
    exchange:  'NFO',
    side:      'BUY',
    quantity:  10,
    orderType: 'MARKET',
  };
  const secret = process.env.GOCHARTING_WEBHOOK_SECRET || '';

  const { body, reqStartNs, reqEndNs } = await sendWebhook(
    '/webhooks/gocharting', payload, secret
  );

  const webhookResponseMs = Number(reqEndNs - reqStartNs) / 1e6;

  let acceptedId = signalId;
  try {
    const parsed = JSON.parse(body);
    if (parsed.signalId) acceptedId = parsed.signalId;
  } catch (_) {}

  const m = await waitForAck(server.metrics, acceptedId);

  const ns = 1_000_000.0;
  const firstDispatchMs = m.t3 && m.t3 > reqStartNs ? Number(m.t3 - reqStartNs) / ns : null;
  const lastAckMs       = m.t6 && m.t6 > reqStartNs ? Number(m.t6 - reqStartNs) / ns : null;

  await new Promise((resolve) => server.close(resolve));
  await new Promise((r) => setTimeout(r, 30)); // let OS release port

  return { webhookResponseMs, firstDispatchMs, lastAckMs };
}

// ─── run one client-count group ──────────────────────────────────────────────

async function runGroup(clientCount) {
  const webhook = [];
  const first   = [];
  const lastAck = [];

  const total = WARM_UP + ITERATIONS;
  process.stdout.write(`  Running ${total} iterations (${WARM_UP} warm-up + ${ITERATIONS} measured)...`);

  for (let i = 0; i < total; i++) {
    const r = await runIteration(clientCount);
    if (i >= WARM_UP) {
      if (r.webhookResponseMs !== null) webhook.push(r.webhookResponseMs);
      if (r.firstDispatchMs   !== null) first.push(r.firstDispatchMs);
      if (r.lastAckMs         !== null) lastAck.push(r.lastAckMs);
    }
    process.stdout.write('.');
  }
  console.log(' done\n');

  return { webhook: stats(webhook), first: stats(first), lastAck: stats(lastAck) };
}

// ─── main ────────────────────────────────────────────────────────────────────

console.log('');
console.log('=============================================================');
console.log('  SIMULATED/LOCAL BENCHMARK -- NOT REAL BROKER LATENCY');
console.log('  Copy-Trading Webhook Latency Benchmark');
console.log('  Warm-up iterations:', WARM_UP, '| Measured iterations:', ITERATIONS);
console.log('=============================================================');
console.log('');

const header =
  'Clients | Metric             |     Min |     P50 |     P95 |     P99 |     Max';
const divider = '-'.repeat(header.length);

(async () => {
  for (const count of CLIENT_COUNTS) {
    console.log(`--- Clients: ${count} ---`);
    const g = await runGroup(count);

    console.log(header);
    console.log(divider);
    printRow('Webhook response',  count, g.webhook);
    printRow('First dispatch',    count, g.first);
    printRow('Last ACK',          count, g.lastAck);
    console.log('');
  }

  console.log('Benchmark complete.');
  console.log('NOTE: All timings are local/in-process. Does not reflect real exchange latency.');
})();
