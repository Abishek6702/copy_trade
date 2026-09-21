import { MockBroker } from "../src/brokers/MockBroker.js";
import { TradeDetector } from "../src/detector/TradeDetector.js";
import { CopyEngine } from "../src/engine/CopyEngine.js";
import { OrderDispatcher } from "../src/dispatcher/OrderDispatcher.js";
import { generateSimulatedClients } from "../src/clients/simulatedClients.js";
import { LatencyMetrics, processHrtimeBigint, calculateStats } from "../src/metrics/LatencyMetrics.js";

async function runScenario(clientCount, iterations) {
  const results = {
    detection: [],
    processing: [],
    dispatchWindow: [],
    e2eFirst: [],
    e2eLast: [],
    successTotal: 0,
    failedTotal: 0
  };

  const clients = generateSimulatedClients(clientCount);
  const brokerAdapter = new MockBroker();
  
  for (let i = 0; i < iterations; i++) {
    const metrics = new LatencyMetrics();
    const dispatcher = new OrderDispatcher(brokerAdapter, metrics);
    const copyEngine = new CopyEngine(clients, dispatcher, metrics);
    const detector = new TradeDetector(brokerAdapter, copyEngine);
    
    detector.start();
    
    const t0 = processHrtimeBigint();
    const event = brokerAdapter.simulateMasterOrder({
      symbol: "NIFTY",
      exchange: "NFO",
      side: "BUY",
      quantity: 50,
      orderType: "MARKET"
    });
    
    metrics.recordMasterEvent(event.eventId, t0);
    
    // Wait for dispatch to complete.
    // The exact wait time depends on MOCK_ORDER_LATENCY_MS and concurrency,
    // so we poll for completion.
    await new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const m = metrics.getEventMetrics(event.eventId);
        if (m && m.t6) {
          clearInterval(checkInterval);
          
          results.detection.push(m.detectionLatencyMs);
          results.processing.push(m.processingLatencyMs);
          results.dispatchWindow.push(m.dispatchWindowMs);
          results.e2eFirst.push(m.e2eFirstMs);
          results.e2eLast.push(m.e2eLastMs);
          
          results.successTotal += m.successCount;
          results.failedTotal += m.failCount;
          
          resolve();
        }
      }, 5);
    });
  }

  const formatOutput = (name, values) => {
    const stats = calculateStats(values);
    console.log(`${name}:`);
    console.log(`  P50: ${stats.p50}`);
    console.log(`  P95: ${stats.p95}`);
    console.log(`  P99: ${stats.p99}`);
    if (name === 'Detection') {
      console.log(`  Min: ${stats.min}`);
      console.log(`  Max: ${stats.max}`);
    }
    console.log("");
  };

  console.log("========================================");
  console.log("COPY TRADING BENCHMARK");
  console.log("========================================");
  console.log(`Clients: ${clientCount}`);
  console.log(`Iterations: ${iterations}\n`);
  
  formatOutput("Detection", results.detection);
  formatOutput("Processing", results.processing);
  formatOutput("Dispatch window", results.dispatchWindow);
  formatOutput("End-to-end first client", results.e2eFirst);
  formatOutput("End-to-end last client", results.e2eLast);
  
  console.log(`Success: ${results.successTotal}`);
  console.log(`Failed: ${results.failedTotal}`);
  console.log("========================================\n");
}

async function runAllBenchmarks() {
  const iterationsStr = process.env.BENCHMARK_ITERATIONS || "20";
  const iterations = parseInt(iterationsStr, 10);
  
  const scenarios = [25, 50, 100, 150, 200];
  
  for (const clientCount of scenarios) {
    await runScenario(clientCount, iterations);
  }
}

runAllBenchmarks().catch(console.error);
