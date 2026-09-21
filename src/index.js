import { MockBroker } from "./brokers/MockBroker.js";
import { TradeDetector } from "./detector/TradeDetector.js";
import { CopyEngine } from "./engine/CopyEngine.js";
import { OrderDispatcher } from "./dispatcher/OrderDispatcher.js";
import { generateSimulatedClients } from "./clients/simulatedClients.js";
import { LatencyMetrics, processHrtimeBigint } from "./metrics/LatencyMetrics.js";

async function runPoc() {
  console.log("Starting Low-Latency Copy-Trading POC");
  
  const brokerAdapter = new MockBroker();
  await brokerAdapter.connect();
  
  const metrics = new LatencyMetrics();
  const clients = generateSimulatedClients(200);
  console.log(`Clients prepared: ${clients.length}`);
  
  const dispatcher = new OrderDispatcher(brokerAdapter, metrics);
  const copyEngine = new CopyEngine(clients, dispatcher, metrics);
  const detector = new TradeDetector(brokerAdapter, copyEngine);
  
  detector.start();
  
  console.log("Simulating master order...");
  const t0 = processHrtimeBigint();
  
  const event = brokerAdapter.simulateMasterOrder({
    symbol: "NIFTY",
    exchange: "NFO",
    side: "BUY",
    quantity: 50,
    orderType: "MARKET"
  });
  
  metrics.recordMasterEvent(event.eventId, t0);
  
  // Wait a bit for the async processing to finish
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

runPoc().catch(console.error);
