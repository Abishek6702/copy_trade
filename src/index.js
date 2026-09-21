// src/index.js
import "dotenv/config"; // Load .env variables
import { MockBroker } from "./brokers/MockBroker.js";
import { XTSAdapter } from "./brokers/XTSAdapter.js";
import { TradeDetector } from "./detector/TradeDetector.js";
import { CopyEngine } from "./engine/CopyEngine.js";
import { OrderDispatcher } from "./dispatcher/OrderDispatcher.js";
import { generateSimulatedClients } from "./clients/simulatedClients.js";
import { LatencyMetrics, processHrtimeBigint } from "./metrics/LatencyMetrics.js";

// Helper to parse command line args
function getArgValue(key) {
  const prefix = `--${key}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

async function runPoc() {
  console.log("Starting Low-Latency Copy-Trading POC");

  const brokerMode = process.env.BROKER_MODE || "mock"; // mock or xts
  let brokerAdapter;
  if (brokerMode === "xts") {
    brokerAdapter = new XTSAdapter();
  } else {
    brokerAdapter = new MockBroker();
  }
  await brokerAdapter.connect();

  const metrics = new LatencyMetrics();
  const clients = generateSimulatedClients(200);
  console.log(`Clients prepared: ${clients.length}`);

  const dispatcher = new OrderDispatcher(brokerAdapter, metrics);
  const copyEngine = new CopyEngine(clients, dispatcher, metrics);
  const detector = new TradeDetector(brokerAdapter, copyEngine);

  detector.start();

  // For mock mode we simulate a master order as before
  if (brokerMode === "mock") {
    console.log("Simulating master order...");
    const t0 = processHrtimeBigint();
    const event = brokerAdapter.simulateMasterOrder({
      symbol: "NIFTY",
      exchange: "NFO",
      side: "BUY",
      quantity: 50,
      orderType: "MARKET",
    });
    metrics.recordMasterEvent(event.eventId, t0);
    setTimeout(() => {
      const eventMetrics = metrics.getEventMetrics(event.eventId);
      console.log("Dispatch completed");
      console.log(`Successful: ${eventMetrics.successCount || 0}`);
      console.log(`Failed: ${eventMetrics.failCount || 0}`);
      console.log("\nMetrics (ms):");
      console.log(`Detection latency:       ${eventMetrics.detectionLatencyMs?.toFixed(4)}`);
      console.log(`Processing latency:      ${eventMetrics.processingLatencyMs?.toFixed(4)}`);
      console.log(`Dispatch window:         ${eventMetrics.dispatchWindowMs?.toFixed(4)}`);
      console.log(`Acknowledgement window:  ${eventMetrics.ackWindowMs?.toFixed(4)}`);
      console.log(`End-to-end first:        ${eventMetrics.e2eFirstMs?.toFixed(4)}`);
      console.log(`End-to-end last:         ${eventMetrics.e2eLastMs?.toFixed(4)}`);
      process.exit(0);
    }, 1000);
  }
}

// XTS detection‑only test mode – prints incoming events and waits
async function runXtsTestMode() {
  console.log("========================================");
  console.log("AETRAM XTS MASTER DETECTION TEST");
  console.log("========================================\n");
  console.log("Broker       : Aetram");
  console.log("Protocol     : Symphony XTS Interactive");
  console.log(`Mode         : ${process.env.XTS_DETECTION_ONLY === "true" ? "DETECTION ONLY" : "FULL"}`);
  const adapter = new XTSAdapter();
  await adapter.connect();
  console.log("Connection   : CONNECTED");
  console.log("WebSocket    : CONNECTED\n");
  console.log("Waiting for manual master order...\n");

  adapter.onMasterOrder((event) => {
    console.log("========================================");
    console.log("MASTER ORDER EVENT");
    console.log("========================================\n");
    console.log(`Event type: ${event.eventType}`);
    console.log(`Order ID: ${event.brokerOrderId}`);
    console.log(`Symbol: ${event.symbol}`);
    console.log(`Exchange: ${event.exchange}`);
    console.log(`Side: ${event.side}`);
    console.log(`Quantity: ${event.quantity}`);
    console.log(`Order Type: ${event.orderType}`);
    console.log(`Status: ${event.status || "N/A"}\n`);
    console.log(`Broker timestamp: ${event.brokerEventTimestamp}`);
    console.log(`Local received timestamp: ${event.socketReceivedTimestamp}`);
    console.log(`Raw event available: ${process.env.LOG_RAW_XTS_EVENTS === "true" ? "yes" : "no"}\n`);
    console.log("========================================\n");
    // Downstream processing continues as usual
  });

  // Keep the process alive
  process.stdin.resume();
}

const testMode = getArgValue("mode") === "xts-test";
if (testMode) {
  runXtsTestMode().catch(console.error);
} else {
  runPoc().catch(console.error);
}
