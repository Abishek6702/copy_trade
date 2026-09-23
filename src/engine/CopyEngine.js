import { processHrtimeBigint } from "../metrics/LatencyMetrics.js";

export class CopyEngine {
  constructor(clients, orderDispatcher, metrics) {
    this.clients = clients;
    this.orderDispatcher = orderDispatcher;
    this.metrics = metrics;
    this.processedEvents = new Set();
  }

  /** Returns true if this eventId has already been processed. Does not mutate state. */
  isDuplicate(tradeSignal) {
    if (!tradeSignal || !tradeSignal.eventId) return false;
    return this.processedEvents.has(tradeSignal.eventId);
  }

  processSignal(tradeSignal) {
    // T2
    const copyEngineStart = processHrtimeBigint();
    
    if (!tradeSignal || !tradeSignal.eventId) {
      if (process.env.LOG_LEVEL === 'debug') {
        console.log("Rejecting invalid signal: missing eventId");
      }
      return;
    }
    
    if (tradeSignal.side !== "BUY" && tradeSignal.side !== "SELL") {
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`Rejecting invalid signal: invalid side ${tradeSignal.side}`);
      }
      return;
    }

    if (this.processedEvents.has(tradeSignal.eventId)) {
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`Ignoring duplicate event: ${tradeSignal.eventId}`);
      }
      return;
    }

    this.processedEvents.add(tradeSignal.eventId);
    
    // Prevent memory leak in POC
    if (this.processedEvents.size > 10000) {
      this.processedEvents.clear();
      this.processedEvents.add(tradeSignal.eventId);
    }
    
    if (this.metrics) {
      this.metrics.recordDetection(tradeSignal.eventId, tradeSignal.detectorReceivedAt, copyEngineStart);
    }
    
    const clientOrders = [];
    let orderSeq = 0;
    
    for (let i = 0; i < this.clients.length; i++) {
      const client = this.clients[i];
      
      if (!client.enabled) continue;
      if (client.quantity <= 0) continue;
      
      const order = {
        internalOrderId: `${tradeSignal.eventId}_${orderSeq++}`,
        clientId: client.clientId,
        brokerAccountId: client.brokerAccountId,
        symbol: tradeSignal.symbol,
        exchange: tradeSignal.exchange,
        side: tradeSignal.side,
        quantity: client.quantity,
        orderType: tradeSignal.orderType,
        masterEventId: tradeSignal.eventId
      };
      
      clientOrders.push({ client, order });
    }
    
    if (this.metrics) {
      this.metrics.recordProcessing(tradeSignal.eventId, copyEngineStart, processHrtimeBigint());
    }
    
    this.orderDispatcher.dispatchBatch(tradeSignal.eventId, clientOrders);
  }
}
