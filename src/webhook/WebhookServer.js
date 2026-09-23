// src/webhook/WebhookServer.js
import 'dotenv/config';
import http from 'http';
import crypto from 'crypto';
import { URL, fileURLToPath } from 'url';
import { MockBroker } from '../brokers/MockBroker.js';
import { generateSimulatedClients } from '../clients/simulatedClients.js';
import { OrderDispatcher } from '../dispatcher/OrderDispatcher.js';
import { CopyEngine } from '../engine/CopyEngine.js';
import { LatencyMetrics } from '../metrics/LatencyMetrics.js';
import GoChartingWebhook from '../sources/GoChartingWebhook.js';
import TradingViewWebhook from '../sources/TradingViewWebhook.js';
import { resolve } from 'path';

/** Safely parse JSON strings. */
function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch (_) {
    return null;
  }
}

/**
 * Timing-safe string comparison to prevent timing attacks on tokens/secrets.
 * Returns true only when both strings are identical and non-empty.
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  // Pad both to the same length so buffer sizes always match.
  // We deliberately compare the full expected length to avoid leaking
  // the expected value's length via timing.
  try {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) {
      // Still run a comparison of equal-length dummy buffers to avoid
      // short-circuiting at the length check.
      crypto.timingSafeEqual(Buffer.alloc(bufA.length), Buffer.alloc(bufA.length));
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch (_) {
    return false;
  }
}

/** Resolve server port: CLI '--port=' arg → WEBHOOK_PORT env → default 3000. */
function resolvePort() {
  const arg = process.argv.find((a) => a.startsWith('--port='));
  if (arg) {
    const p = parseInt(arg.split('=')[1], 10);
    if (!isNaN(p)) return p;
  }
  const env = process.env.WEBHOOK_PORT;
  if (env) return parseInt(env, 10) || 3000;
  return 3000;
}

/** Initialize core copy‑engine components for webhook handling. */
function initCopyEngine() {
  const metrics = new LatencyMetrics();
  const clientCount = Number(process.env.SIMULATED_CLIENTS) || 200;
  const clients = generateSimulatedClients(clientCount);
  const brokerAdapter = new MockBroker();
  const dispatcher = new OrderDispatcher(brokerAdapter, metrics);
  const copyEngine = new CopyEngine(clients, dispatcher, metrics);
  return { copyEngine, metrics };
}

/** Create HTTP server handling health check and webhook POSTs. */
function createServer() {
  const { copyEngine, metrics } = initCopyEngine();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // Health endpoint (lightweight)
    if (req.method === 'GET' && pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    // Only POST is allowed for webhooks
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
      return;
    }

    // Gather request body
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }

    // Determine which webhook source we are handling
    let sourceHandler;

    if (pathname === '/webhooks/gocharting') {
      // ── Header-secret auth (existing behaviour, kept for backward compat) ──
      sourceHandler = new GoChartingWebhook();
      const provided = req.headers['x-webhook-secret'];
      if (!provided || provided !== process.env.GOCHARTING_WEBHOOK_SECRET) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid webhook secret' }));
        return;
      }

    } else if (pathname.startsWith('/webhooks/gocharting/')) {
      // ── URL-token auth (GoCharting native: no custom header support) ────────
      // Route: POST /webhooks/gocharting/:token
      const routeToken = pathname.slice('/webhooks/gocharting/'.length);
      const expectedToken = process.env.GOCHARTING_WEBHOOK_TOKEN || '';
      if (!routeToken || !expectedToken || !timingSafeEqual(routeToken, expectedToken)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
      sourceHandler = new GoChartingWebhook();

    } else if (pathname === '/webhooks/tradingview') {
      // ── Header-secret auth (TradingView) ────────────────────────────────────
      sourceHandler = new TradingViewWebhook();
      const provided = req.headers['x-webhook-secret'];
      if (!provided || provided !== process.env.TRADINGVIEW_WEBHOOK_SECRET) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid webhook secret' }));
        return;
      }

    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
      return;
    }

    // t0 = time of HTTP request receipt (after body fully read, before auth)
    const t0 = process.hrtime.bigint();

    // Parse payload (accept JSON or raw)
    const raw = safeJsonParse(body) || body;

    // Timestamp receipt (T1) – normalization start
    const t1 = process.hrtime.bigint();

    // Normalization (T2)
    const normalized = sourceHandler.normalize(raw);
    const t2 = process.hrtime.bigint();

    // Hand off to copy engine
    const isDuplicate = copyEngine.isDuplicate(normalized);
    copyEngine.processSignal(normalized);

    // Immediate response — fire before waiting for dispatch
    const signalId = normalized.eventId;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ accepted: true, signalId, duplicate: isDuplicate }));

    // Structured production log — outside hot path, after response sent
    const recvToNormMs  = Number(t2 - t1) / 1e6;
    const normToHandoffMs = Number(t2 - t1) / 1e6; // same phase in webhook path
    console.log(
      `COPY SIGNAL | eventId=${signalId} | source=${normalized.source}` +
      ` | symbol=${normalized.symbol} | side=${normalized.side}` +
      ` | duplicate=${isDuplicate}` +
      ` | recvToNormMs=${recvToNormMs.toFixed(4)}` +
      ` | normToHandoffMs=${Number(t2 - t0) / 1e6 - recvToNormMs < 0 ? 0 : (Number(t2 - t0) / 1e6 - recvToNormMs).toFixed(4)}`
    );
  });

  return { server, metrics };
}

/** Validate required environment variables when webhook server is enabled. */
function validateEnv() {
  if (process.env.WEBHOOK_ENABLED === 'true') {
    if (!process.env.GOCHARTING_WEBHOOK_SECRET) {
      console.warn('Warning: GOCHARTING_WEBHOOK_SECRET is not set. Header-based GoCharting auth will fail.');
    }
    if (!process.env.GOCHARTING_WEBHOOK_TOKEN) {
      console.warn('Warning: GOCHARTING_WEBHOOK_TOKEN is not set. URL-token GoCharting route will reject all requests.');
    }
    if (!process.env.TRADINGVIEW_WEBHOOK_SECRET) {
      console.warn('Warning: TRADINGVIEW_WEBHOOK_SECRET is not set. Authentication for TradingView webhook will fail.');
    }
  }
}

/** Exported function to start the server when enabled. */
export function startServer() {
  if (process.env.WEBHOOK_ENABLED !== 'true') {
    console.log('Webhook server disabled (WEBHOOK_ENABLED != true)');
    return null;
  }
  // Validate secrets before starting
  validateEnv();

  const port = resolvePort();
  const { server, metrics } = createServer();
  server.listen(port, () => {
    console.log('========================================');
    console.log('COPY TRADING WEBHOOK TEST');
    console.log('========================================');
    console.log('GoCharting (header secret): POST /webhooks/gocharting');
    console.log('GoCharting (URL token):     POST /webhooks/gocharting/<token>');
    console.log('TradingView (header secret):POST /webhooks/tradingview');
    console.log('Status: READY');
    console.log(`Listening on port ${port}`);
    console.log('Waiting for signal...');
  });
  // Attach metrics for external inspection (e.g., benchmarks)
  server.metrics = metrics;
  return server;
}

// Auto‑start when run directly via node.
const currentFile = fileURLToPath(import.meta.url);
const executedFile = process.argv[1] ? resolve(process.argv[1]) : null;
if (executedFile && currentFile === executedFile) {
  startServer();
}
